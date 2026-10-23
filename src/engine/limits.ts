import { DEFAULTS } from '../config/defaults';

export interface LimitOptions {
  maxMessageChars?: number;
  maxAutoPerRoom?: number;
}

export type LimitVerdict = 'ok' | 'no_text' | 'skipped_long' | 'skipped_limit';

/** 본문 텍스트가 있는지(공백만 있으면 없음). */
export function hasText(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * 호출 전 판정. `rankFromNewest` 는 그 방 화면에서 본문 텍스트가 있는 수신 메시지만
 * 최신순으로 센 순번(최신 = 1). 새로 도착한 메시지는 항상 1 이다.
 */
export function judgeLimits(
  text: string,
  rankFromNewest: number,
  options: LimitOptions = {},
): LimitVerdict {
  const maxChars = options.maxMessageChars ?? DEFAULTS.maxMessageChars;
  const maxPerRoom = options.maxAutoPerRoom ?? DEFAULTS.maxAutoPerRoom;
  if (!hasText(text)) return 'no_text';
  if (text.length > maxChars) return 'skipped_long';
  if (rankFromNewest > maxPerRoom) return 'skipped_limit';
  return 'ok';
}

/**
 * 화면의 수신 메시지 목록(오래된 것 → 최신 순)에서 본문 있는 것만 세어 최신순 순번을 매긴다.
 * 본문 없는 메시지는 순번을 차지하지 않으며 결과에서 0 으로 표시된다.
 */
export function rankFromNewest(textsOldestFirst: readonly string[]): number[] {
  const ranks = new Array<number>(textsOldestFirst.length).fill(0);
  let rank = 0;
  for (let i = textsOldestFirst.length - 1; i >= 0; i--) {
    const text = textsOldestFirst[i] ?? '';
    if (hasText(text)) {
      rank += 1;
      ranks[i] = rank;
    }
  }
  return ranks;
}
