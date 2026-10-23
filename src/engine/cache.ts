import { storage } from 'wxt/utils/storage';
import { DEFAULTS, type ProviderId } from '../config/defaults';
import { HISTORY_KEYS } from '../config/storageKeys';
import type { CacheEntry, SentOriginalEntry } from '../settings/schema';
import { hashStringLong } from './hash';
import { normalizeSentText } from './sentText';

/**
 * 번역 기록(캐시)과 내 원문 기록. 둘 다 `chrome.storage.local` 의 항목 하나씩에 맵 + 순서 배열로 둔다.
 * 상한을 넘으면 savedAt 이 오래된 것부터 지운다. 쓰기는 모듈 안에서 직렬화해 읽기-수정-쓰기 경쟁을 막는다.
 */

interface Store<T> {
  entries: Record<string, T>;
  /** 오래된 것 → 최신 순. 삭제 순서를 빠르게 정하기 위한 보조 배열. */
  order: string[];
}

const EMPTY_CACHE: Store<CacheEntry> = { entries: {}, order: [] };
const EMPTY_SENT: Store<SentOriginalEntry> = { entries: {}, order: [] };

const cacheItem = storage.defineItem<Store<CacheEntry>>(`local:${HISTORY_KEYS.translationCache}`, {
  fallback: EMPTY_CACHE,
});
const sentItem = storage.defineItem<Store<SentOriginalEntry>>(
  `local:${HISTORY_KEYS.sentOriginals}`,
  {
    fallback: EMPTY_SENT,
  },
);

const SEP = '\u001f';

export interface CacheKeyParts {
  messageId: string;
  textHash: string;
  targetLang: string;
  provider: ProviderId;
  model: string;
  instructionsHash: string;
  /** provider 가 openai_compatible 일 때만 키에 포함된다. */
  baseUrl?: string;
}

/** 기록 키. 서비스가 openai_compatible 이면 커스텀 주소까지 포함한다. */
export function cacheKey(parts: CacheKeyParts): string {
  const fields = [
    parts.messageId,
    parts.textHash,
    parts.targetLang,
    parts.provider,
    parts.model,
    parts.instructionsHash,
  ];
  if (parts.provider === 'openai_compatible') fields.push(parts.baseUrl ?? '');
  return hashStringLong(fields.join(SEP));
}

// ---- 쓰기 직렬화 ----
let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

/** 저장값을 복사해 돌려준다(fallback 객체나 저장소 안의 참조를 직접 고치지 않기 위해). */
function normalize<T>(raw: Store<T> | null | undefined): Store<T> {
  const entries: Record<string, T> =
    raw && typeof raw === 'object' && raw.entries && typeof raw.entries === 'object'
      ? { ...raw.entries }
      : {};
  const order = raw && Array.isArray(raw.order) ? raw.order.filter((k) => k in entries) : [];
  if (order.length !== Object.keys(entries).length) {
    const seen = new Set(order);
    for (const k of Object.keys(entries)) if (!seen.has(k)) order.push(k);
  }
  return { entries, order };
}

function upsert<T>(store: Store<T>, key: string, value: T): void {
  if (key in store.entries) {
    const i = store.order.indexOf(key);
    if (i >= 0) store.order.splice(i, 1);
  }
  store.entries[key] = value;
  store.order.push(key);
}

function evict<T extends { savedAt: number }>(store: Store<T>, max: number): void {
  const excess = store.order.length - max;
  if (excess <= 0) return;
  const sorted = [...store.order].sort(
    (a, b) => (store.entries[a]?.savedAt ?? 0) - (store.entries[b]?.savedAt ?? 0),
  );
  const drop = new Set(sorted.slice(0, excess));
  for (const k of drop) delete store.entries[k];
  store.order = store.order.filter((k) => !drop.has(k));
}

// ---- 번역 기록 ----
export async function get(key: string): Promise<CacheEntry | null> {
  const store = normalize(await cacheItem.getValue());
  return store.entries[key] ?? null;
}

export async function getMany(keys: readonly string[]): Promise<Map<string, CacheEntry>> {
  const store = normalize(await cacheItem.getValue());
  const out = new Map<string, CacheEntry>();
  for (const k of keys) {
    const e = store.entries[k];
    if (e) out.set(k, e);
  }
  return out;
}

export function setMany(
  entries: readonly CacheEntry[],
  maxEntries: number = DEFAULTS.cacheMaxEntries,
): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return serialized(async () => {
    const store = normalize(await cacheItem.getValue());
    for (const e of entries) upsert(store, e.key, e);
    evict(store, maxEntries);
    await cacheItem.setValue(store);
  });
}

export function set(entry: CacheEntry, maxEntries?: number): Promise<void> {
  return setMany([entry], maxEntries);
}

export async function size(): Promise<number> {
  return normalize(await cacheItem.getValue()).order.length;
}

export function clear(): Promise<void> {
  return serialized(() => cacheItem.setValue({ entries: {}, order: [] }));
}

// ---- 내 원문 기록 ----
function sentKey(roomId: string, sentText: string): string {
  return `${roomId}${SEP}${hashStringLong(normalizeSentText(sentText))}`;
}

export function saveSentOriginal(
  roomId: string,
  sentText: string,
  original: string,
  savedAt: number = Date.now(),
  maxEntries: number = DEFAULTS.sentOriginalMaxEntries,
): Promise<void> {
  return serialized(async () => {
    const store = normalize(await sentItem.getValue());
    const key = sentKey(roomId, sentText);
    upsert(store, key, { roomId, sentTextHash: key.split(SEP)[1] ?? '', original, savedAt });
    evict(store, maxEntries);
    await sentItem.setValue(store);
  });
}

export async function lookupSentOriginal(roomId: string, sentText: string): Promise<string | null> {
  const store = normalize(await sentItem.getValue());
  return store.entries[sentKey(roomId, sentText)]?.original ?? null;
}

export async function sentOriginalSize(): Promise<number> {
  return normalize(await sentItem.getValue()).order.length;
}

/** 번역 기록과 내 원문 기록을 모두 지운다("번역 기록 지우기"). */
export function clearAll(): Promise<void> {
  return serialized(async () => {
    await cacheItem.setValue({ entries: {}, order: [] });
    await sentItem.setValue({ entries: {}, order: [] });
  });
}
