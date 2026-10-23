import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, withRetry } from './retry';
import { ProviderError } from './types';

const sleep = () => vi.fn(async (_ms: number) => undefined);

describe('withRetry', () => {
  it('성공하면 그대로 돌려주고 재시도하지 않는다', async () => {
    const s = sleep();
    const fn = vi.fn(async () => 'ok');
    expect(await withRetry(fn, { sleep: s })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s).not.toHaveBeenCalled();
  });
  it('재시도 대상 오류는 최대 maxRetries 회 지수 백오프로 재시도하고 소진하면 던진다', async () => {
    const s = sleep();
    const fn = vi.fn(async () => {
      throw new ProviderError('server', 'HTTP 500', 500);
    });
    await expect(withRetry(fn, { maxRetries: 2, baseDelayMs: 100, sleep: s })).rejects.toThrow(
      'HTTP 500',
    );
    expect(fn).toHaveBeenCalledTimes(3);
    expect(s.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });
  it('중간에 성공하면 멈춘다', async () => {
    const s = sleep();
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new ProviderError('rate_limit', '429', 429))
      .mockResolvedValueOnce('ok');
    expect(await withRetry(fn, { sleep: s })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(1);
  });
  it.each(['auth', 'bad_request'] as const)('%s 오류는 재시도하지 않는다', async (kind) => {
    const s = sleep();
    const fn = vi.fn(async () => {
      throw new ProviderError(kind, kind);
    });
    await expect(withRetry(fn, { sleep: s })).rejects.toBeInstanceOf(ProviderError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s).not.toHaveBeenCalled();
  });
  it('ProviderError 가 아닌 오류는 재시도하지 않는다', async () => {
    const fn = vi.fn(async () => {
      throw new TypeError('bug');
    });
    await expect(withRetry(fn, { sleep: sleep() })).rejects.toThrow('bug');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('parse 오류는 재시도 대상이다', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ProviderError('parse', 'bad json'))
      .mockResolvedValueOnce('ok');
    expect(await withRetry(fn, { sleep: sleep() })).toBe('ok');
  });
  it('backoffDelay 는 base × 2^n', () => {
    expect(backoffDelay(0, 800)).toBe(800);
    expect(backoffDelay(1, 800)).toBe(1600);
    expect(backoffDelay(2, 800)).toBe(3200);
  });
});
