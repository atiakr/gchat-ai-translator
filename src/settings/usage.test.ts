import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  addUsage,
  clearUsage,
  dayKey,
  estimateCost,
  getUsageStore,
  isDailyLimitReached,
  monthKey,
  normalizeUsageStore,
  pruneUsage,
  resolvePrice,
  rowCost,
  summarizeUsage,
  sumRows,
  totalCost,
  watchUsage,
} from './usage';

beforeEach(() => fakeBrowser.reset());

const DAY = 24 * 60 * 60 * 1000;
/** 2026-10-24 정오(현지). 자정 경계와 시간대에 흔들리지 않도록 정오를 쓴다. */
const NOW = new Date(2026, 9, 24, 12).getTime();

describe('날짜 키', () => {
  it('현지 날짜 YYYY-MM-DD 와 월 YYYY-MM', () => {
    expect(dayKey(NOW)).toBe('2026-10-24');
    expect(monthKey(NOW)).toBe('2026-10');
    expect(dayKey(new Date(2026, 0, 5, 12).getTime())).toBe('2026-01-05');
  });
});

describe('addUsage / getUsageStore', () => {
  it('같은 날·서비스·모델은 합치고 호출 수를 센다; 다른 모델·서비스·날은 따로 둔다', async () => {
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 100, outputTokens: 20 }, NOW);
    await addUsage('openai', ' gpt-5-mini ', { inputTokens: 50, outputTokens: 5 }, NOW);
    await addUsage('openai', 'gpt-5', { inputTokens: 9, outputTokens: 1 }, NOW);
    await addUsage('anthropic', 'claude-haiku-5-5', { inputTokens: 7, outputTokens: 3 }, NOW);
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 1 }, NOW + DAY);
    const store = await getUsageStore();
    expect(store.days['2026-10-24']).toEqual({
      openai: {
        'gpt-5-mini': { inputTokens: 150, outputTokens: 25, calls: 2 },
        'gpt-5': { inputTokens: 9, outputTokens: 1, calls: 1 },
      },
      anthropic: { 'claude-haiku-5-5': { inputTokens: 7, outputTokens: 3, calls: 1 } },
    });
    expect(store.days['2026-10-25']).toEqual({
      openai: { 'gpt-5-mini': { inputTokens: 1, outputTokens: 1, calls: 1 } },
    });
  });
  it('음수·NaN 토큰은 0 으로 세되 호출은 센다', async () => {
    await addUsage('openai', 'gpt-5-mini', { inputTokens: -5, outputTokens: Number.NaN }, NOW);
    expect((await getUsageStore()).days['2026-10-24']?.openai?.['gpt-5-mini']).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      calls: 1,
    });
  });
  it('보관 기간을 넘은 날짜는 쓸 때 지운다', async () => {
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 0 }, NOW - 61 * DAY);
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 0 }, NOW - 62 * DAY);
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 0 }, NOW, 62);
    const days = Object.keys((await getUsageStore()).days).sort();
    expect(days).toEqual([dayKey(NOW - 61 * DAY), '2026-10-24']);
  });
  it('동시에 여러 건을 써도 모두 반영된다(직렬화)', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 1 }, NOW),
      ),
    );
    expect((await getUsageStore()).days['2026-10-24']?.openai?.['gpt-5-mini']?.calls).toBe(10);
  });
  it('watchUsage 는 쓰기마다 정규화된 값을 알리고, clearUsage 는 비운다', async () => {
    const seen: number[] = [];
    const off = watchUsage((s) => seen.push(Object.keys(s.days).length));
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1, outputTokens: 1 }, NOW);
    await clearUsage();
    off();
    expect(seen).toEqual([1, 0]);
    expect(await getUsageStore()).toEqual({ days: {} });
  });
});

describe('normalizeUsageStore / pruneUsage', () => {
  it('손상된 값은 걸러내고 알려진 서비스만 남긴다', () => {
    const out = normalizeUsageStore({
      days: {
        '2026-10-24': {
          openai: { 'gpt-5': { inputTokens: '3', outputTokens: 2.9, calls: 1 }, bad: 5 },
          bogus: {},
        },
        'not-a-date': { openai: { 'gpt-5': { inputTokens: 1, outputTokens: 1, calls: 1 } } },
        '2026-10-23': null,
      },
    });
    expect(out).toEqual({
      days: {
        '2026-10-24': { openai: { 'gpt-5': { inputTokens: 0, outputTokens: 2, calls: 1 } } },
      },
    });
    expect(normalizeUsageStore(null)).toEqual({ days: {} });
    expect(normalizeUsageStore({ days: 'x' })).toEqual({ days: {} });
  });
  it('모델별로 나누기 전의 기록(서비스 값이 곧 합계)은 모델 이름 없음으로 읽는다', () => {
    const out = normalizeUsageStore({
      days: {
        '2026-10-24': {
          openai: { inputTokens: 10, outputTokens: 2, calls: 1 },
          anthropic: { ' m ': { inputTokens: 1, outputTokens: 0, calls: 1 }, m: { calls: 1 } },
        },
      },
    });
    expect(out.days['2026-10-24']).toEqual({
      openai: { '': { inputTokens: 10, outputTokens: 2, calls: 1 } },
      // 다듬은 뒤 같은 이름이 된 모델은 합친다.
      anthropic: { m: { inputTokens: 1, outputTokens: 0, calls: 2 } },
    });
  });
  it('pruneUsage 는 오늘 포함 N 일만 남긴다', () => {
    const store = normalizeUsageStore({
      days: {
        [dayKey(NOW)]: { openai: { inputTokens: 1, outputTokens: 0, calls: 1 } },
        [dayKey(NOW - 2 * DAY)]: { openai: { inputTokens: 1, outputTokens: 0, calls: 1 } },
        [dayKey(NOW - 3 * DAY)]: { openai: { inputTokens: 1, outputTokens: 0, calls: 1 } },
      },
    });
    expect(Object.keys(pruneUsage(store, NOW, 3).days).sort()).toEqual([
      dayKey(NOW - 2 * DAY),
      dayKey(NOW),
    ]);
  });
});

describe('summarizeUsage / isDailyLimitReached / estimateCost', () => {
  it('오늘과 이번 달을 현지 기준으로 서비스·모델별 행으로 나눠 합산한다', () => {
    const store = normalizeUsageStore({
      days: {
        '2026-10-24': {
          openai: {
            'gpt-5-mini': { inputTokens: 10, outputTokens: 1, calls: 1 },
            'gpt-5': { inputTokens: 1, outputTokens: 0, calls: 1 },
          },
        },
        '2026-10-01': {
          openai: { 'gpt-5-mini': { inputTokens: 100, outputTokens: 10, calls: 2 } },
        },
        '2026-09-30': {
          openai: { 'gpt-5-mini': { inputTokens: 1000, outputTokens: 100, calls: 3 } },
        },
        '2026-10-25': { anthropic: { m: { inputTokens: 5, outputTokens: 5, calls: 1 } } },
      },
    });
    const s = summarizeUsage(store, NOW);
    // 서비스 순서, 그 안에서 토큰 많은 순.
    expect(s.today).toEqual([
      {
        provider: 'openai',
        model: 'gpt-5-mini',
        totals: { inputTokens: 10, outputTokens: 1, calls: 1 },
      },
      { provider: 'openai', model: 'gpt-5', totals: { inputTokens: 1, outputTokens: 0, calls: 1 } },
    ]);
    // 이번 달의 다른 날(미래 날짜 포함)은 월 합계에 들어가고 오늘에는 안 들어간다.
    expect(s.month).toEqual([
      {
        provider: 'openai',
        model: 'gpt-5-mini',
        totals: { inputTokens: 110, outputTokens: 11, calls: 3 },
      },
      { provider: 'openai', model: 'gpt-5', totals: { inputTokens: 1, outputTokens: 0, calls: 1 } },
      { provider: 'anthropic', model: 'm', totals: { inputTokens: 5, outputTokens: 5, calls: 1 } },
    ]);
    expect(sumRows(s.month)).toEqual({ inputTokens: 116, outputTokens: 16, calls: 5 });
  });
  it('상한은 오늘의 모든 서비스 합(입력+출력)이 상한 이상일 때 도달이고 0 이면 없음', () => {
    const store = normalizeUsageStore({
      days: {
        '2026-10-24': {
          openai: { inputTokens: 600, outputTokens: 0, calls: 1 },
          anthropic: { inputTokens: 0, outputTokens: 400, calls: 1 },
        },
      },
    });
    expect(isDailyLimitReached(1000, store, NOW)).toBe(true);
    expect(isDailyLimitReached(1001, store, NOW)).toBe(false);
    expect(isDailyLimitReached(0, store, NOW)).toBe(false);
    expect(isDailyLimitReached(1, store, NOW + DAY)).toBe(false);
  });
  it('금액은 100만 토큰당 단가로 어림하고 단가가 모두 0 이면 null', () => {
    const totals = { inputTokens: 2_000_000, outputTokens: 500_000, calls: 1 };
    expect(estimateCost(totals, { input: 0.15, output: 0.6 })).toBeCloseTo(0.6, 10);
    expect(estimateCost(totals, { input: 0, output: 2 })).toBeCloseTo(1, 10);
    expect(estimateCost(totals, { input: 0, output: 0 })).toBeNull();
  });
});

describe('resolvePrice / rowCost / totalCost', () => {
  const noCustom = { openai: {}, anthropic: {}, openai_compatible: {} };
  const row = (provider: 'openai' | 'anthropic' | 'openai_compatible', model: string) => ({
    provider,
    model,
    totals: { inputTokens: 1_000_000, outputTokens: 1_000_000, calls: 1 },
  });

  it('직접 입력한 단가가 먼저, 없으면 내장 단가, 둘 다 없으면 null', () => {
    const prices = { ...noCustom, openai: { 'gpt-5-mini': { input: 1, output: 3 } } };
    expect(resolvePrice('openai', 'gpt-5-mini', prices)).toEqual({
      price: { input: 1, output: 3 },
      custom: true,
    });
    expect(resolvePrice('openai', 'gpt-5-nano', prices)).toEqual({
      price: { input: 0.05, output: 0.4 },
      custom: false,
    });
    expect(resolvePrice('openai', 'my-model', prices)).toBeNull();
    expect(resolvePrice('openai_compatible', 'gpt-5-mini', prices)).toBeNull();
    expect(resolvePrice('openai', '', prices)).toBeNull();
  });
  it('행 금액은 그 행 모델의 단가로, 합계는 금액을 아는 행만 더한다', () => {
    expect(rowCost(row('anthropic', 'claude-haiku-5-5'), noCustom)).toBeCloseTo(0.6, 10);
    expect(rowCost(row('openai', ''), noCustom)).toBeNull();
    const rows = [
      row('openai', 'gpt-5-mini'),
      row('anthropic', 'claude-haiku-5-5'),
      row('openai', ''),
    ];
    expect(totalCost(rows, noCustom)).toBeCloseTo(2.25 + 0.6, 10);
    expect(totalCost([row('openai', '')], noCustom)).toBeNull();
    expect(totalCost([], noCustom)).toBeNull();
  });
  it('직접 입력한 단가가 0·0 이면 금액을 표시하지 않는다', () => {
    const prices = { ...noCustom, openai: { 'gpt-5-mini': { input: 0, output: 0 } } };
    expect(rowCost(row('openai', 'gpt-5-mini'), prices)).toBeNull();
  });
});
