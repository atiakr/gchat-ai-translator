import { describe, expect, it } from 'vitest';
import { formatInteger, formatUsd, parseNonNegativeInt, parsePrice } from './usageFormat';

describe('usageFormat', () => {
  it('formatInteger 는 자릿수 구분 기호를 넣고 음수·소수는 0 이상 정수로', () => {
    expect(formatInteger(1234567)).toBe('1,234,567');
    expect(formatInteger(-3)).toBe('0');
    expect(formatInteger(2.9)).toBe('2');
  });
  it('formatUsd 는 1달러 미만은 네 자리, 그 이상은 두 자리', () => {
    expect(formatUsd(0.01234)).toBe('$0.0123');
    expect(formatUsd(0.5)).toBe('$0.50');
    expect(formatUsd(12.345)).toBe('$12.35');
    expect(formatUsd(Number.NaN)).toBe('$0.00');
  });
  it('parsePrice 는 0 이상의 소수만, 빈 값은 0', () => {
    expect(parsePrice('')).toBe(0);
    expect(parsePrice(' 0.15 ')).toBe(0.15);
    expect(parsePrice('2')).toBe(2);
    expect(parsePrice('-1')).toBeNull();
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('1e3')).toBeNull();
  });
  it('parseNonNegativeInt 는 0 을 허용하고 소수·음수는 거부', () => {
    expect(parseNonNegativeInt('0')).toBe(0);
    expect(parseNonNegativeInt('100000')).toBe(100000);
    expect(parseNonNegativeInt('1.5')).toBeNull();
    expect(parseNonNegativeInt('-1')).toBeNull();
    expect(parseNonNegativeInt('')).toBeNull();
  });
});
