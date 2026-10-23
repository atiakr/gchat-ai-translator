import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatchQueue, groupKeyOf } from './queue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function makeQueue(batchSize = 3, delayMs = 150) {
  const flush = vi.fn(async (_key: string, items: string[]) => items.map((s) => s.toUpperCase()));
  const queue = createBatchQueue<string, string>({ batchSize, delayMs, flush });
  return { queue, flush };
}

describe('groupKeyOf', () => {
  it('방·언어·서비스·모델·지시문이 모두 같아야 같은 키', () => {
    const base = {
      roomId: 'r',
      targetLang: 'ko',
      provider: 'openai',
      model: 'm',
      instructions: '',
    };
    expect(groupKeyOf(base)).toBe(groupKeyOf({ ...base }));
    expect(groupKeyOf({ ...base, roomId: 'r2' })).not.toBe(groupKeyOf(base));
    expect(groupKeyOf({ ...base, targetLang: 'ja' })).not.toBe(groupKeyOf(base));
    expect(groupKeyOf({ ...base, model: 'm2' })).not.toBe(groupKeyOf(base));
    expect(groupKeyOf({ ...base, instructions: 'x' })).not.toBe(groupKeyOf(base));
  });
});

describe('createBatchQueue', () => {
  it('batchSize 에 닿으면 즉시 한 번에 보낸다', async () => {
    const { queue, flush } = makeQueue(3);
    const ps = [queue.enqueue('g', 'a'), queue.enqueue('g', 'b'), queue.enqueue('g', 'c')];
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('g', ['a', 'b', 'c']);
    expect(await Promise.all(ps)).toEqual(['A', 'B', 'C']);
    expect(queue.pending).toBe(0);
  });
  it('단건은 delayMs 안에 추가가 없으면 단독으로 보낸다', async () => {
    const { queue, flush } = makeQueue(3, 150);
    const p = queue.enqueue('g', 'a');
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(149);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledWith('g', ['a']);
    expect(await p).toBe('A');
  });
  it('지연은 첫 항목 기준이며 나중 항목이 타이머를 늘리지 않는다', async () => {
    const { queue, flush } = makeQueue(10, 150);
    queue.enqueue('g', 'a');
    await vi.advanceTimersByTimeAsync(100);
    queue.enqueue('g', 'b');
    await vi.advanceTimersByTimeAsync(50);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('g', ['a', 'b']);
  });
  it('그룹이 다르면 따로 보낸다', async () => {
    const { queue, flush } = makeQueue(10, 150);
    const k1 = groupKeyOf({
      roomId: 'r1',
      targetLang: 'ko',
      provider: 'p',
      model: 'm',
      instructions: '',
    });
    const k2 = groupKeyOf({
      roomId: 'r1',
      targetLang: 'ja',
      provider: 'p',
      model: 'm',
      instructions: '',
    });
    const k3 = groupKeyOf({
      roomId: 'r1',
      targetLang: 'ko',
      provider: 'p',
      model: 'm2',
      instructions: '',
    });
    queue.enqueue(k1, 'a');
    queue.enqueue(k2, 'b');
    queue.enqueue(k3, 'c');
    queue.enqueue(k1, 'd');
    await vi.advanceTimersByTimeAsync(150);
    expect(flush).toHaveBeenCalledTimes(3);
    expect(flush).toHaveBeenCalledWith(k1, ['a', 'd']);
    expect(flush).toHaveBeenCalledWith(k2, ['b']);
    expect(flush).toHaveBeenCalledWith(k3, ['c']);
  });
  it('batchSize 를 넘는 항목은 조각으로 나뉘고 나머지는 지연 후 간다', async () => {
    const { queue, flush } = makeQueue(2, 150);
    const ps = ['a', 'b', 'c'].map((s) => queue.enqueue('g', s));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith('g', ['a', 'b']);
    await vi.advanceTimersByTimeAsync(150);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith('g', ['c']);
    expect(await Promise.all(ps)).toEqual(['A', 'B', 'C']);
  });
  it('flush 가 거부하면 묶음의 모든 항목이 거부된다', async () => {
    const flush = vi.fn(async () => {
      throw new Error('boom');
    });
    const queue = createBatchQueue<string, string>({ batchSize: 2, delayMs: 10, flush });
    const a = queue.enqueue('g', 'a');
    const b = queue.enqueue('g', 'b');
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
  });
  it('flush 결과 개수가 다르면 오류(불변식 8)', async () => {
    const flush = vi.fn(async () => ['only-one']);
    const queue = createBatchQueue<string, string>({ batchSize: 2, delayMs: 10, flush });
    const a = queue.enqueue('g', 'a');
    const b = queue.enqueue('g', 'b');
    await expect(a).rejects.toThrow(/count mismatch/);
    await expect(b).rejects.toThrow(/count mismatch/);
  });
  it('dispose 는 타이머를 취소하고 대기 항목을 거부한다', async () => {
    const { queue, flush } = makeQueue(10, 150);
    const p = queue.enqueue('g', 'a');
    queue.dispose();
    await expect(p).rejects.toThrow(/disposed/);
    await vi.advanceTimersByTimeAsync(200);
    expect(flush).not.toHaveBeenCalled();
  });
});
