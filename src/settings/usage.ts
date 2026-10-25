import { storage } from 'wxt/utils/storage';
import { DEFAULTS, type ProviderId } from '../config/defaults';
import { USAGE_KEY } from '../config/storageKeys';
import { PROVIDER_IDS, type TokenPrice, type UsageStore, type UsageTotals } from './schema';

/**
 * 토큰 사용량 기록. `chrome.storage.local` 의 항목 하나에 날짜별·서비스별 합계로 둔다.
 * - 날짜는 이 기기의 현지 날짜(`YYYY-MM-DD`)다. 자정이 지나면 "오늘" 이 새로 시작된다.
 * - 보관 기간(`DEFAULTS.usageRetentionDays`)을 넘은 날짜는 쓸 때 지운다.
 * - 쓰기는 모듈 안에서 직렬화한다(읽기-수정-쓰기 경쟁 방지).
 * 쓰는 쪽은 background(서비스 응답의 usage)뿐이고, 팝업·옵션은 읽기만 한다.
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

const EMPTY_STORE: UsageStore = { days: {} };

const usageItem = storage.defineItem<UsageStore>(`local:${USAGE_KEY}`, { fallback: EMPTY_STORE });

let writeChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => undefined);
  return next;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 현지 날짜 키 `YYYY-MM-DD`. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 현지 월 접두어 `YYYY-MM`. */
export function monthKey(now: number): string {
  return dayKey(now).slice(0, 7);
}

export const EMPTY_TOTALS: UsageTotals = { inputTokens: 0, outputTokens: 0, calls: 0 };

function toCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeTotals(raw: unknown): UsageTotals {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    inputTokens: toCount(r.inputTokens),
    outputTokens: toCount(r.outputTokens),
    calls: toCount(r.calls),
  };
}

/** 저장값을 복사하고 손상된 항목을 걸러 돌려준다. */
export function normalizeUsageStore(raw: unknown): UsageStore {
  const days: UsageStore['days'] = {};
  const src = raw && typeof raw === 'object' ? (raw as { days?: unknown }).days : undefined;
  if (src && typeof src === 'object') {
    for (const [day, perProvider] of Object.entries(src as Record<string, unknown>)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !perProvider || typeof perProvider !== 'object') {
        continue;
      }
      const entry: Partial<Record<ProviderId, UsageTotals>> = {};
      for (const id of PROVIDER_IDS) {
        const v = (perProvider as Record<string, unknown>)[id];
        if (v) entry[id] = normalizeTotals(v);
      }
      days[day] = entry;
    }
  }
  return { days };
}

export function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    calls: a.calls + b.calls,
  };
}

export function totalTokens(t: UsageTotals): number {
  return t.inputTokens + t.outputTokens;
}

/** 보관 기간보다 오래된 날짜를 지운다(오늘 포함 `retentionDays` 일만 남긴다). */
export function pruneUsage(store: UsageStore, now: number, retentionDays: number): UsageStore {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (retentionDays - 1));
  const minKey = dayKey(cutoff.getTime());
  const days: UsageStore['days'] = {};
  for (const [day, entry] of Object.entries(store.days)) if (day >= minKey) days[day] = entry;
  return { days };
}

// ---- 읽기 ----
export async function getUsageStore(): Promise<UsageStore> {
  return normalizeUsageStore(await usageItem.getValue());
}

export function watchUsage(cb: (store: UsageStore) => void): () => void {
  return usageItem.watch((v) => cb(normalizeUsageStore(v)));
}

// ---- 쓰기 (background 전용) ----
export function addUsage(
  provider: ProviderId,
  usage: TokenUsage,
  now: number = Date.now(),
  retentionDays: number = DEFAULTS.usageRetentionDays,
): Promise<void> {
  return serialized(async () => {
    const store = pruneUsage(normalizeUsageStore(await usageItem.getValue()), now, retentionDays);
    const day = dayKey(now);
    const entry = store.days[day] ?? {};
    entry[provider] = addTotals(entry[provider] ?? EMPTY_TOTALS, {
      inputTokens: toCount(usage.inputTokens),
      outputTokens: toCount(usage.outputTokens),
      calls: 1,
    });
    store.days[day] = entry;
    await usageItem.setValue(store);
  });
}

export function clearUsage(): Promise<void> {
  return serialized(() => usageItem.setValue({ days: {} }));
}

// ---- 집계 ----
export type UsageByProvider = Record<ProviderId, UsageTotals>;

function emptyByProvider(): UsageByProvider {
  return {
    openai: { ...EMPTY_TOTALS },
    anthropic: { ...EMPTY_TOTALS },
    openai_compatible: { ...EMPTY_TOTALS },
  };
}

export interface UsageSummary {
  today: UsageByProvider;
  month: UsageByProvider;
}

/** 오늘과 이번 달(현지 기준)의 서비스별 합계. */
export function summarizeUsage(store: UsageStore, now: number): UsageSummary {
  const today = emptyByProvider();
  const month = emptyByProvider();
  const todayKey = dayKey(now);
  const monthPrefix = monthKey(now);
  for (const [day, entry] of Object.entries(store.days)) {
    const inMonth = day.startsWith(monthPrefix);
    const isToday = day === todayKey;
    if (!inMonth && !isToday) continue;
    for (const id of PROVIDER_IDS) {
      const t = entry[id];
      if (!t) continue;
      if (inMonth) month[id] = addTotals(month[id], t);
      if (isToday) today[id] = addTotals(today[id], t);
    }
  }
  return { today, month };
}

export function sumByProvider(by: UsageByProvider): UsageTotals {
  return PROVIDER_IDS.reduce((acc, id) => addTotals(acc, by[id]), { ...EMPTY_TOTALS });
}

/** 오늘 쓴 토큰(모든 서비스 합)이 상한 이상이면 참. 상한 0 은 없음. */
export function isDailyLimitReached(limit: number, store: UsageStore, now: number): boolean {
  if (!(limit > 0)) return false;
  return totalTokens(sumByProvider(summarizeUsage(store, now).today)) >= limit;
}

/** 단가(USD / 100만 토큰)로 어림한 금액. 단가가 모두 0 이면 null(표시하지 않음). */
export function estimateCost(totals: UsageTotals, price: TokenPrice): number | null {
  if (!(price.input > 0) && !(price.output > 0)) return null;
  return (totals.inputTokens * price.input + totals.outputTokens * price.output) / 1_000_000;
}
