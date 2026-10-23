import { describe, expect, it } from 'vitest';
import { judgeLimits, rankFromNewest } from './limits';

describe('judgeLimits', () => {
  it('본문이 없으면 no_text', () => {
    expect(judgeLimits('', 1)).toBe('no_text');
    expect(judgeLimits('   \n', 1)).toBe('no_text');
  });
  it('길이 상한을 넘으면 skipped_long (상한과 같으면 통과)', () => {
    expect(judgeLimits('a'.repeat(2000), 1)).toBe('ok');
    expect(judgeLimits('a'.repeat(2001), 1)).toBe('skipped_long');
    expect(judgeLimits('abc', 1, { maxMessageChars: 2 })).toBe('skipped_long');
  });
  it('건수 상한을 넘는 오래된 메시지는 skipped_limit', () => {
    expect(judgeLimits('hi', 200)).toBe('ok');
    expect(judgeLimits('hi', 201)).toBe('skipped_limit');
    expect(judgeLimits('hi', 3, { maxAutoPerRoom: 2 })).toBe('skipped_limit');
  });
  it('길이 초과가 건수 초과보다 먼저 판정된다', () => {
    expect(judgeLimits('a'.repeat(3000), 999)).toBe('skipped_long');
  });
});

describe('rankFromNewest', () => {
  it('본문 있는 메시지만 최신순으로 센다', () => {
    expect(rankFromNewest(['a', '', 'b', '  ', 'c'])).toEqual([3, 0, 2, 0, 1]);
  });
  it('빈 목록', () => {
    expect(rankFromNewest([])).toEqual([]);
  });
});
