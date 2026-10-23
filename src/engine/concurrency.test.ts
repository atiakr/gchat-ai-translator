import { describe, expect, it } from 'vitest';
import { createSemaphore, createSemaphorePool } from './concurrency';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('createSemaphore', () => {
  it('동시에 최대 N개만 실행하고 나머지는 기다린다', async () => {
    const sem = createSemaphore(3);
    const gates = Array.from({ length: 5 }, () => deferred());
    let running = 0;
    let peak = 0;
    const tasks = gates.map((g) =>
      sem.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await g.promise;
        running -= 1;
      }),
    );
    await Promise.resolve();
    expect(sem.active).toBe(3);
    expect(sem.waiting).toBe(2);
    gates[0]?.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sem.active).toBe(3);
    expect(sem.waiting).toBe(1);
    for (const g of gates) g.resolve();
    await Promise.all(tasks);
    expect(peak).toBe(3);
    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);
  });
  it('실패해도 자리를 돌려준다', async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(sem.active).toBe(0);
    expect(await sem.run(async () => 1)).toBe(1);
  });
  it('max 가 1 미만이면 거부한다', () => {
    expect(() => createSemaphore(0)).toThrow();
  });
});

describe('createSemaphorePool', () => {
  it('키마다 별도 세마포어를 돌려주고 같은 키는 재사용한다', () => {
    const pool = createSemaphorePool(2);
    expect(pool.get('openai')).toBe(pool.get('openai'));
    expect(pool.get('openai')).not.toBe(pool.get('anthropic'));
  });
});
