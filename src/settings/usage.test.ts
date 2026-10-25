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
  sumByProvider,
  summarizeUsage,
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
  it('같은 날·같은 서비스는 합치고 호출 수를 센다; 다른 서비스·다른 날은 따로 둔다', async () => {
    await addUsage('openai', { inputTokens: 100, outputTokens: 20 }, NOW);
    await addUsage('openai', { inputTokens: 50, outputTokens: 5 }, NOW);
    await addUsage('anthropic', { inputTokens: 7, outputTokens: 3 }, NOW);
    await addUsage('openai', { inputTokens: 1, outputTokens: 1 }, NOW + DAY);
    const store = await getUsageStore();
    expect(store.days['2026-10-24']).toEqual({
      openai: { inputTokens: 150, outputTokens: 25, calls: 2 },
      anthropic: { inputTokens: 7, outputTokens: 3, calls: 1 },
    });
    expect(store.days['2026-10-25']).toEqual({
      openai: { inputTokens: 1, outputTokens: 1, calls: 1 },
    });
  });
  it('음수·NaN 토큰은 0 으로 세되 호출은 센다', async () => {
    await addUsage('openai', { inputTokens: -5, outputTokens: Number.NaN }, NOW);
    expect((await getUsageStore()).days['2026-10-24']?.openai).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      calls: 1,
    });
  });
  it('보관 기간을 넘은 날짜는 쓸 때 지운다', async () => {
    await addUsage('openai', { inputTokens: 1, outputTokens: 0 }, NOW - 61 * DAY);
    await addUsage('openai', { inputTokens: 1, outputTokens: 0 }, NOW - 62 * DAY);
    await addUsage('openai', { inputTokens: 1, outputTokens: 0 }, NOW, 62);
    const days = Object.keys((await getUsageStore()).days).sort();
    expect(days).toEqual([dayKey(NOW - 61 * DAY), '2026-10-24']);
  });
  it('동시에 여러 건을 써도 모두 반영된다(직렬화)', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        addUsage('openai', { inputTokens: 1, outputTokens: 1 }, NOW),
      ),
    );
    expect((await getUsageStore()).days['2026-10-24']?.openai?.calls).toBe(10);
  });
  it('watchUsage 는 쓰기마다 정규화된 값을 알리고, clearUsage 는 비운다', async () => {
    const seen: number[] = [];
    const off = watchUsage((s) => seen.push(Object.keys(s.days).length));
    await addUsage('openai', { inputTokens: 1, outputTokens: 1 }, NOW);
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
        '2026-10-24': { openai: { inputTokens: '3', outputTokens: 2.9, calls: 1 }, bogus: {} },
        'not-a-date': { openai: { inputTokens: 1, outputTokens: 1, calls: 1 } },
        '2026-10-23': null,
      },
    });
    expect(out).toEqual({
      days: { '2026-10-24': { openai: { inputTokens: 0, outputTokens: 2, calls: 1 } } },
    });
    expect(normalizeUsageStore(null)).toEqual({ days: {} });
    expect(normalizeUsageStore({ days: 'x' })).toEqual({ days: {} });
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
  it('오늘과 이번 달을 현지 기준으로 나눠 합산한다', () => {
    const store = normalizeUsageStore({
      days: {
        '2026-10-24': { openai: { inputTokens: 10, outputTokens: 1, calls: 1 } },
        '2026-10-01': { openai: { inputTokens: 100, outputTokens: 10, calls: 2 } },
        '2026-09-30': { openai: { inputTokens: 1000, outputTokens: 100, calls: 3 } },
        '2026-10-25': { anthropic: { inputTokens: 5, outputTokens: 5, calls: 1 } },
      },
    });
    const s = summarizeUsage(store, NOW);
    expect(s.today.openai).toEqual({ inputTokens: 10, outputTokens: 1, calls: 1 });
    expect(s.today.anthropic).toEqual({ inputTokens: 0, outputTokens: 0, calls: 0 });
    expect(s.month.openai).toEqual({ inputTokens: 110, outputTokens: 11, calls: 3 });
    // 이번 달의 다른 날(미래 날짜 포함)은 월 합계에 들어가고 오늘에는 안 들어간다.
    expect(s.month.anthropic).toEqual({ inputTokens: 5, outputTokens: 5, calls: 1 });
    expect(sumByProvider(s.month)).toEqual({ inputTokens: 115, outputTokens: 16, calls: 4 });
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
