/**
 * 진행 중 요청 합치기: 같은 키의 호출이 진행 중이면 새 호출을 만들지 않고
 * 그 Promise 를 공유한다. service worker 메모리에만 두며 복구하지 않는다.
 */
export interface Inflight<T> {
  run(key: string, fn: () => Promise<T>): Promise<T>;
  has(key: string): boolean;
  readonly size: number;
}

export function createInflight<T>(): Inflight<T> {
  const pending = new Map<string, Promise<T>>();
  return {
    run(key, fn) {
      const existing = pending.get(key);
      if (existing) return existing;
      let started: Promise<T>;
      try {
        started = fn();
      } catch (err) {
        return Promise.reject(err);
      }
      const p = started.finally(() => {
        if (pending.get(key) === p) pending.delete(key);
      });
      pending.set(key, p);
      return p;
    },
    has: (key) => pending.has(key),
    get size() {
      return pending.size;
    },
  };
}
