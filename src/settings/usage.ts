import { storage } from 'wxt/utils/storage';
import { DEFAULTS, type ProviderId } from '../config/defaults';
import { builtinPrice } from '../config/prices';
import { USAGE_KEY } from '../config/storageKeys';
import {
  type GlobalSettings,
  normalizeModelName,
  PROVIDER_IDS,
  type TokenPrice,
  type UsageStore,
  type UsageTotals,
} from './schema';

/**
 * 토큰 사용량 기록. `chrome.storage.local` 의 항목 하나에 날짜별·서비스별·모델별 합계로 둔다.
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

const TOTALS_FIELDS = ['inputTokens', 'outputTokens', 'calls'] as const;

/** 모델별로 나누기 전의 기록(서비스 값이 곧 합계)인지. 합계 필드가 객체가 아닌 값으로 있으면 참. */
function isLegacyTotals(v: Record<string, unknown>): boolean {
  return TOTALS_FIELDS.some((k) => k in v && (v[k] === null || typeof v[k] !== 'object'));
}

/** 서비스 하나의 모델별 합계. 예전 기록은 모델 `''` 로 옮기고, 같은 이름이 된 모델은 합친다. */
function normalizePerModel(raw: Record<string, unknown>): Record<string, UsageTotals> {
  if (isLegacyTotals(raw)) return { '': normalizeTotals(raw) };
  const out: Record<string, UsageTotals> = {};
  for (const [rawName, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    const name = normalizeModelName(rawName);
    out[name] = addTotals(out[name] ?? EMPTY_TOTALS, normalizeTotals(v));
  }
  return out;
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
      const entry: UsageStore['days'][string] = {};
      for (const id of PROVIDER_IDS) {
        const v = (perProvider as Record<string, unknown>)[id];
        if (v && typeof v === 'object') entry[id] = normalizePerModel(v as Record<string, unknown>);
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
  model: string,
  usage: TokenUsage,
  now: number = Date.now(),
  retentionDays: number = DEFAULTS.usageRetentionDays,
): Promise<void> {
  return serialized(async () => {
    const store = pruneUsage(normalizeUsageStore(await usageItem.getValue()), now, retentionDays);
    const day = dayKey(now);
    const name = normalizeModelName(model);
    const entry = store.days[day] ?? {};
    const perModel = entry[provider] ?? {};
    perModel[name] = addTotals(perModel[name] ?? EMPTY_TOTALS, {
      inputTokens: toCount(usage.inputTokens),
      outputTokens: toCount(usage.outputTokens),
      calls: 1,
    });
    entry[provider] = perModel;
    store.days[day] = entry;
    await usageItem.setValue(store);
  });
}

export function clearUsage(): Promise<void> {
  return serialized(() => usageItem.setValue({ days: {} }));
}

// ---- 집계 ----
/** 한 기간의 서비스·모델 하나의 합계. 모델 `''` 은 모델별로 나누기 전의 기록이다. */
export interface UsageRow {
  provider: ProviderId;
  model: string;
  totals: UsageTotals;
}

export interface UsageSummary {
  today: UsageRow[];
  month: UsageRow[];
}

/** 서비스 순서(`PROVIDER_IDS`) 다음 토큰 많은 순, 같으면 모델 이름순. */
function toRows(acc: Map<string, UsageRow>): UsageRow[] {
  return [...acc.values()].sort(
    (a, b) =>
      PROVIDER_IDS.indexOf(a.provider) - PROVIDER_IDS.indexOf(b.provider) ||
      totalTokens(b.totals) - totalTokens(a.totals) ||
      a.model.localeCompare(b.model),
  );
}

function addRow(acc: Map<string, UsageRow>, provider: ProviderId, model: string, t: UsageTotals) {
  const key = `${provider}\n${model}`;
  const prev = acc.get(key);
  acc.set(key, { provider, model, totals: addTotals(prev?.totals ?? EMPTY_TOTALS, t) });
}

/** 오늘과 이번 달(현지 기준)의 서비스·모델별 합계. 쓴 적 없는 서비스·모델은 행이 없다. */
export function summarizeUsage(store: UsageStore, now: number): UsageSummary {
  const today = new Map<string, UsageRow>();
  const month = new Map<string, UsageRow>();
  const todayKey = dayKey(now);
  const monthPrefix = monthKey(now);
  for (const [day, entry] of Object.entries(store.days)) {
    const inMonth = day.startsWith(monthPrefix);
    const isToday = day === todayKey;
    if (!inMonth && !isToday) continue;
    for (const id of PROVIDER_IDS) {
      for (const [model, t] of Object.entries(entry[id] ?? {})) {
        if (inMonth) addRow(month, id, model, t);
        if (isToday) addRow(today, id, model, t);
      }
    }
  }
  return { today: toRows(today), month: toRows(month) };
}

export function sumRows(rows: readonly UsageRow[]): UsageTotals {
  return rows.reduce((acc, row) => addTotals(acc, row.totals), { ...EMPTY_TOTALS });
}

/** 오늘 쓴 토큰(모든 서비스·모델 합)이 상한 이상이면 참. 상한 0 은 없음. */
export function isDailyLimitReached(limit: number, store: UsageStore, now: number): boolean {
  if (!(limit > 0)) return false;
  return totalTokens(sumRows(summarizeUsage(store, now).today)) >= limit;
}

/** 단가(USD / 100만 토큰)로 어림한 금액. 단가가 모두 0 이면 null(표시하지 않음). */
export function estimateCost(totals: UsageTotals, price: TokenPrice): number | null {
  if (!(price.input > 0) && !(price.output > 0)) return null;
  return (totals.inputTokens * price.input + totals.outputTokens * price.output) / 1_000_000;
}

export interface ResolvedPrice {
  price: TokenPrice;
  /** 사용자가 직접 입력한 단가면 참, 내장 단가면 거짓. */
  custom: boolean;
}

/** 모델의 단가: 직접 입력한 값이 먼저, 없으면 내장 단가. 둘 다 없으면 null. */
export function resolvePrice(
  provider: ProviderId,
  model: string,
  prices: GlobalSettings['prices'],
): ResolvedPrice | null {
  const name = normalizeModelName(model);
  if (!name) return null;
  const custom = prices[provider]?.[name];
  if (custom) return { price: custom, custom: true };
  const builtin = builtinPrice(provider, name);
  return builtin ? { price: { ...builtin }, custom: false } : null;
}

/** 행 하나의 어림 금액. 단가를 모르면 null. */
export function rowCost(row: UsageRow, prices: GlobalSettings['prices']): number | null {
  const resolved = resolvePrice(row.provider, row.model, prices);
  return resolved ? estimateCost(row.totals, resolved.price) : null;
}

/** 금액을 아는 행들의 합. 아는 행이 하나도 없으면 null. */
export function totalCost(
  rows: readonly UsageRow[],
  prices: GlobalSettings['prices'],
): number | null {
  return rows.reduce<number | null>((acc, row) => {
    const c = rowCost(row, prices);
    return c === null ? acc : (acc ?? 0) + c;
  }, null);
}
