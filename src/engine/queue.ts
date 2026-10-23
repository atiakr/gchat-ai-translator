import { DEFAULTS } from '../config/defaults';

/**
 * 묶음 대기열: 방·대상 언어·서비스·모델·지시문이 같은 요청끼리 묶어 한 번에 보낸다.
 * 묶음이 batchSize 에 닿으면 즉시, 아니면 첫 항목이 들어온 뒤 delayMs 가 지나면 보낸다.
 * 메모리에만 두며 service worker 가 죽으면 복구하지 않는다.
 */
export interface GroupKeyParts {
  roomId: string;
  targetLang: string;
  provider: string;
  model: string;
  instructions: string;
}

export function groupKeyOf(parts: GroupKeyParts): string {
  return JSON.stringify([
    parts.roomId,
    parts.targetLang,
    parts.provider,
    parts.model,
    parts.instructions,
  ]);
}

export interface BatchQueueOptions<TIn, TOut> {
  batchSize?: number;
  delayMs?: number;
  /** 한 묶음을 처리한다. 입력 순서대로 같은 길이의 결과를 돌려줘야 한다. */
  flush: (groupKey: string, items: TIn[]) => Promise<TOut[]>;
}

export interface BatchQueue<TIn, TOut> {
  enqueue(groupKey: string, item: TIn): Promise<TOut>;
  /** 아직 보내지 않은 항목 수. */
  readonly pending: number;
  /** 타이머를 모두 취소하고 대기 중인 항목을 거부한다. */
  dispose(): void;
}

interface Waiting<TIn, TOut> {
  item: TIn;
  resolve: (v: TOut) => void;
  reject: (e: unknown) => void;
}

interface Group<TIn, TOut> {
  items: Waiting<TIn, TOut>[];
  timer: ReturnType<typeof setTimeout> | null;
}

export function createBatchQueue<TIn, TOut>(
  options: BatchQueueOptions<TIn, TOut>,
): BatchQueue<TIn, TOut> {
  const batchSize = options.batchSize ?? DEFAULTS.batchSize;
  const delayMs = options.delayMs ?? DEFAULTS.batchDelayMs;
  const groups = new Map<string, Group<TIn, TOut>>();

  function flushGroup(key: string): void {
    const group = groups.get(key);
    if (!group) return;
    groups.delete(key);
    if (group.timer !== null) clearTimeout(group.timer);
    const batch = group.items;
    options
      .flush(
        key,
        batch.map((w) => w.item),
      )
      .then(
        (results) => {
          if (results.length !== batch.length) {
            const err = new Error(
              `Batch result count mismatch: expected ${batch.length}, got ${results.length}`,
            );
            for (const w of batch) w.reject(err);
            return;
          }
          batch.forEach((w, i) => {
            w.resolve(results[i] as TOut);
          });
        },
        (err: unknown) => {
          for (const w of batch) w.reject(err);
        },
      );
  }

  return {
    enqueue(groupKey, item) {
      return new Promise<TOut>((resolve, reject) => {
        let group = groups.get(groupKey);
        if (!group) {
          group = { items: [], timer: null };
          groups.set(groupKey, group);
        }
        group.items.push({ item, resolve, reject });
        if (group.items.length >= batchSize) {
          flushGroup(groupKey);
          return;
        }
        if (group.timer === null) {
          group.timer = setTimeout(() => flushGroup(groupKey), delayMs);
        }
      });
    },
    get pending() {
      let n = 0;
      for (const g of groups.values()) n += g.items.length;
      return n;
    },
    dispose() {
      const err = new Error('Queue disposed');
      for (const [key, g] of groups) {
        if (g.timer !== null) clearTimeout(g.timer);
        for (const w of g.items) w.reject(err);
        groups.delete(key);
      }
    },
  };
}
