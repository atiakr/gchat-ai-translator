import { DEFAULTS } from '../config/defaults';

/** 동시 호출 제한: 서비스당 동시 호출 N개. 메모리에만 두며 복구하지 않는다. */
export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly waiting: number;
}

export function createSemaphore(max: number): Semaphore {
  if (!Number.isInteger(max) || max < 1) throw new Error(`Semaphore max must be >= 1: ${max}`);
  let active = 0;
  const queue: (() => void)[] = [];

  function acquire(): Promise<void> {
    if (active < max) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      queue.push(() => {
        active += 1;
        resolve();
      });
    });
  }
  function release(): void {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  }

  return {
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
  };
}

/** 키(서비스 id)별 세마포어 모음. */
export interface SemaphorePool {
  get(key: string): Semaphore;
}

export function createSemaphorePool(max: number = DEFAULTS.concurrency): SemaphorePool {
  const pool = new Map<string, Semaphore>();
  return {
    get(key) {
      let s = pool.get(key);
      if (!s) {
        s = createSemaphore(max);
        pool.set(key, s);
      }
      return s;
    },
  };
}
