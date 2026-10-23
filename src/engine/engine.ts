import { DEFAULTS, type ProviderId } from '../config/defaults';
import type {
  MessageMap,
  TranslateBatchItem,
  TranslateBatchResultItem,
} from '../messaging/protocol';
import { getProvider as defaultGetProvider } from '../providers/index';
import type { CacheEntry } from '../settings/schema';
import { canTranslate, getApiKeys, getGlobalSettings, setInvalidKey } from '../settings/storage';
import { refreshBadge } from './badge';
import * as cache from './cache';
import { createSemaphorePool } from './concurrency';
import { hashString } from './hash';
import { createInflight } from './inflight';
import { createBatchQueue, groupKeyOf } from './queue';
import { withRetry } from './retry';
import {
  type ErrorKind,
  type ProviderConfig,
  ProviderError,
  type TranslateItemResult,
  type TranslationProvider,
} from './types';

/**
 * 번역 엔진. background service worker 에서만 만들어 쓴다.
 * - 호출 전 canTranslate() 확인, 기록 적중 시 호출 없음
 * - 수신: 기록 조회 → 진행 중 합치기 → 묶음 대기열 → 서비스당 동시 제한 → 재시도
 * - 발신: 대기열을 거치지 않고 즉시 단독 호출
 * - 인증 오류 → 틀린 키 상태 기록 + 배지 갱신
 */

export type OutgoingResult = MessageMap['translate.outgoing']['response'];

export interface EngineLimits {
  batchSize: number;
  batchDelayMs: number;
  concurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  cacheMaxEntries: number;
}

export interface EngineDeps {
  getProvider?: (id: ProviderId) => TranslationProvider;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  limits?: Partial<EngineLimits>;
}

export interface TranslateBatchOptions {
  /** 기록을 무시하고 호출한다(결과는 기록에 쓴다). translate.retry 용. */
  force?: boolean;
}

export interface Engine {
  translateBatch(
    roomId: string,
    targetLang: string,
    items: TranslateBatchItem[],
    options?: TranslateBatchOptions,
  ): Promise<TranslateBatchResultItem[]>;
  translateOutgoing(roomId: string, text: string, targetLang: string): Promise<OutgoingResult>;
  retryOne(
    roomId: string,
    targetLang: string,
    item: TranslateBatchItem,
  ): Promise<TranslateBatchResultItem>;
  dispose(): void;
}

/** 요청 시점의 설정 스냅샷. 키는 여기(background 메모리)를 벗어나지 않는다. */
interface CallContext {
  config: ProviderConfig;
  instructions: string;
  instructionsHash: string;
}

interface QueuedEntry {
  key: string;
  item: TranslateBatchItem;
  targetLang: string;
  ctx: CallContext;
}

function errorItem(messageId: string, errorKind: ErrorKind): TranslateBatchResultItem {
  return { messageId, status: 'error', errorKind };
}

function gateErrorKind(reason: 'disabled' | 'no_key' | 'invalid_key' | undefined): ErrorKind {
  return reason === 'disabled' ? 'bad_request' : 'auth';
}

function errorKindOf(err: unknown): ErrorKind {
  return err instanceof ProviderError ? err.kind : 'server';
}

async function loadContext(): Promise<CallContext> {
  const [settings, keys] = await Promise.all([getGlobalSettings(), getApiKeys()]);
  const provider = settings.activeProvider;
  const config: ProviderConfig = {
    provider,
    apiKey: keys[provider],
    model: settings.models[provider],
  };
  if (provider === 'openai_compatible') config.baseUrl = settings.customBaseUrl;
  return {
    config,
    instructions: settings.instructions,
    instructionsHash: hashString(settings.instructions),
  };
}

export function createEngine(deps: EngineDeps = {}): Engine {
  const getProvider = deps.getProvider ?? defaultGetProvider;
  const now = deps.now ?? (() => Date.now());
  const limits: EngineLimits = {
    batchSize: DEFAULTS.batchSize,
    batchDelayMs: DEFAULTS.batchDelayMs,
    concurrency: DEFAULTS.concurrency,
    maxRetries: DEFAULTS.maxRetries,
    retryBaseDelayMs: DEFAULTS.retryBaseDelayMs,
    cacheMaxEntries: DEFAULTS.cacheMaxEntries,
    ...deps.limits,
  };
  const semaphores = createSemaphorePool(limits.concurrency);
  const inflight = createInflight<TranslateBatchResultItem>();

  async function callProvider(
    ctx: CallContext,
    request: Parameters<TranslationProvider['translate']>[0],
  ) {
    const provider = getProvider(ctx.config.provider);
    const sem = semaphores.get(ctx.config.provider);
    try {
      return await withRetry(() => sem.run(() => provider.translate(request, ctx.config)), {
        maxRetries: limits.maxRetries,
        baseDelayMs: limits.retryBaseDelayMs,
        sleep: deps.sleep,
      });
    } catch (err) {
      if (err instanceof ProviderError && err.kind === 'auth') {
        await setInvalidKey(ctx.config.provider, 'auth');
        await refreshBadge();
      }
      throw err;
    }
  }

  function mapIncoming(
    entry: QueuedEntry,
    result: TranslateItemResult | undefined,
    savedAt: number,
  ): { item: TranslateBatchResultItem; cacheEntry: CacheEntry | null } {
    const { messageId } = entry.item;
    if (!result || result.failed) return { item: errorItem(messageId, 'parse'), cacheEntry: null };
    // 코드·URL·멘션만 있는 메시지처럼 번역문이 원문과 같으면 보일 것이 없으므로 same_language 로 본다.
    const unchanged = result.translation.trim() === entry.item.text.trim();
    if (result.sameLanguage || unchanged) {
      return {
        item: { messageId, status: 'same_language', detectedLang: result.detectedLang },
        cacheEntry: {
          key: entry.key,
          status: 'same_language',
          detectedLang: result.detectedLang,
          savedAt,
        },
      };
    }
    if (!result.translation.trim())
      return { item: errorItem(messageId, 'parse'), cacheEntry: null };
    return {
      item: {
        messageId,
        status: 'translated',
        translation: result.translation,
        detectedLang: result.detectedLang,
      },
      cacheEntry: {
        key: entry.key,
        status: 'translated',
        translation: result.translation,
        detectedLang: result.detectedLang,
        savedAt,
      },
    };
  }

  async function flushBatch(_groupKey: string, entries: QueuedEntry[]) {
    const first = entries[0];
    if (!first) return [];
    const ctx = first.ctx;
    // 서비스에 보내는 항목 id 는 기록 키다: 한 묶음 안에서 유일하고(진행 중 합치기), 결과 역매핑이 단순하다.
    let results: TranslateItemResult[];
    try {
      results = await callProvider(ctx, {
        items: entries.map((e) => ({ id: e.key, text: e.item.text })),
        targetLang: first.targetLang,
        instructions: ctx.instructions,
        mode: 'incoming',
      });
    } catch (err) {
      const kind = errorKindOf(err);
      return entries.map((e) => errorItem(e.item.messageId, kind));
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    const savedAt = now();
    const mapped = entries.map((e) => mapIncoming(e, byId.get(e.key), savedAt));
    const toCache = mapped.flatMap((m) => (m.cacheEntry ? [m.cacheEntry] : []));
    try {
      await cache.setMany(toCache, limits.cacheMaxEntries);
    } catch {
      // 기록 저장 실패(용량 등)는 이번 결과 표시를 막지 않는다. 다음에 다시 호출될 뿐이다.
    }
    return mapped.map((m) => m.item);
  }

  const queue = createBatchQueue<QueuedEntry, TranslateBatchResultItem>({
    batchSize: limits.batchSize,
    delayMs: limits.batchDelayMs,
    flush: flushBatch,
  });

  function fromCache(messageId: string, hit: CacheEntry): TranslateBatchResultItem {
    if (hit.status === 'same_language') {
      return { messageId, status: 'same_language', detectedLang: hit.detectedLang };
    }
    return {
      messageId,
      status: 'translated',
      translation: hit.translation ?? '',
      detectedLang: hit.detectedLang,
    };
  }

  async function translateBatch(
    roomId: string,
    targetLang: string,
    items: TranslateBatchItem[],
    options: TranslateBatchOptions = {},
  ): Promise<TranslateBatchResultItem[]> {
    if (items.length === 0) return [];
    const gate = await canTranslate();
    if (!gate.ok) {
      const kind = gateErrorKind(gate.reason);
      return items.map((i) => errorItem(i.messageId, kind));
    }
    const ctx = await loadContext();
    const { config } = ctx;
    const keys = items.map((i) =>
      cache.cacheKey({
        messageId: i.messageId,
        textHash: i.textHash,
        targetLang,
        provider: config.provider,
        model: config.model,
        instructionsHash: ctx.instructionsHash,
        baseUrl: config.baseUrl,
      }),
    );
    const results: (TranslateBatchResultItem | undefined)[] = new Array(items.length);
    if (!options.force) {
      const hits = await cache.getMany(keys);
      items.forEach((item, i) => {
        const key = keys[i];
        const hit = key ? hits.get(key) : undefined;
        if (hit) results[i] = fromCache(item.messageId, hit);
      });
    }
    const groupKey = groupKeyOf({
      roomId,
      targetLang,
      provider: config.provider,
      model: config.model,
      instructions: ctx.instructions,
    });
    await Promise.all(
      items.map(async (item, i) => {
        if (results[i]) return;
        const key = keys[i] ?? '';
        try {
          results[i] = await inflight.run(key, () =>
            queue.enqueue(groupKey, { key, item, targetLang, ctx }),
          );
        } catch (err) {
          results[i] = errorItem(item.messageId, errorKindOf(err));
        }
      }),
    );
    return results.map((r, i) => r ?? errorItem(items[i]?.messageId ?? '', 'server'));
  }

  async function translateOutgoing(
    _roomId: string,
    text: string,
    targetLang: string,
  ): Promise<OutgoingResult> {
    const gate = await canTranslate();
    if (!gate.ok) return { ok: false, errorKind: gateErrorKind(gate.reason) };
    const ctx = await loadContext();
    try {
      const results = await callProvider(ctx, {
        items: [{ id: 'out', text }],
        targetLang,
        instructions: ctx.instructions,
        mode: 'outgoing',
      });
      const r = results[0];
      if (!r || r.failed) return { ok: false, errorKind: 'parse' };
      const translation = r.translation.trim() ? r.translation : r.sameLanguage ? text : '';
      if (!translation) return { ok: false, errorKind: 'parse' };
      return { ok: true, translation, detectedLang: r.detectedLang };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, errorKind: errorKindOf(err), message };
    }
  }

  async function retryOne(
    roomId: string,
    targetLang: string,
    item: TranslateBatchItem,
  ): Promise<TranslateBatchResultItem> {
    const [result] = await translateBatch(roomId, targetLang, [item], { force: true });
    return result ?? errorItem(item.messageId, 'server');
  }

  return { translateBatch, translateOutgoing, retryOne, dispose: () => queue.dispose() };
}
