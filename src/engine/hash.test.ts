import { describe, expect, it } from 'vitest';
import { hashString, hashStringLong } from './hash';

describe('hashString', () => {
  it('같은 입력은 항상 같은 8자리 16진수를 돌려준다', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toMatch(/^[0-9a-f]{8}$/);
    // FNV-1a 32bit 표준 벡터
    expect(hashString('')).toBe('811c9dc5');
    expect(hashString('a')).toBe('e40c292c');
  });
  it('입력이 다르면 값이 다르다(공백·대소문자 포함)', () => {
    expect(hashString('hello')).not.toBe(hashString('Hello'));
    expect(hashString('hello')).not.toBe(hashString('hello '));
    expect(hashString('안녕하세요')).not.toBe(hashString('안녕하세요!'));
  });
  it('hashStringLong 은 16자리이고 앞 8자리는 hashString 과 같다', () => {
    const long = hashStringLong('some text');
    expect(long).toMatch(/^[0-9a-f]{16}$/);
    expect(long.slice(0, 8)).toBe(hashString('some text'));
    expect(hashStringLong('a')).not.toBe(hashStringLong('b'));
  });
});
