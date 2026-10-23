import { describe, expect, it, vi } from 'vitest';
import { createInflight } from './inflight';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createInflight', () => {
  it('같은 키가 진행 중이면 호출을 만들지 않고 결과를 공유한다', async () => {
    const inflight = createInflight<string>();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const p1 = inflight.run('k', fn);
    const p2 = inflight.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(inflight.has('k')).toBe(true);
    d.resolve('done');
    expect(await p1).toBe('done');
    expect(await p2).toBe('done');
    expect(inflight.has('k')).toBe(false);
    expect(inflight.size).toBe(0);
  });
  it('완료된 뒤의 같은 키는 다시 호출한다', async () => {
    const inflight = createInflight<number>();
    const fn = vi.fn(async () => 1);
    await inflight.run('k', fn);
    await inflight.run('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('다른 키는 서로 영향이 없고, 거부도 공유된 뒤 정리된다', async () => {
    const inflight = createInflight<number>();
    const fail = vi.fn(async () => {
      throw new Error('x');
    });
    const ok = vi.fn(async () => 2);
    const a = inflight.run('a', fail);
    const a2 = inflight.run('a', fail);
    const b = inflight.run('b', ok);
    await expect(a).rejects.toThrow('x');
    await expect(a2).rejects.toThrow('x');
    expect(await b).toBe(2);
    expect(fail).toHaveBeenCalledTimes(1);
    expect(inflight.size).toBe(0);
  });
});
