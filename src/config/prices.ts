import type { ProviderId } from './defaults';

/** USD / 100만 토큰. */
export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

/** 아래 단가를 각 서비스 공개 요금표에서 확인한 날짜. 옵션 화면에 함께 보인다. */
export const BUILTIN_PRICES_CHECKED_AT = '2026-10-26';

/**
 * 모델별 기본 단가(표준 등급, 캐시·배치 할인 제외). 요금이 바뀌면 여기만 고친다.
 * OpenAI 호환 서비스는 주소마다 요금이 달라(로컬 서버는 무료) 기본 단가를 두지 않는다.
 * - OpenAI: developers.openai.com/api/docs/pricing. gpt-5.4·5.5 는 272K 미만 문맥 단가.
 * - Anthropic: Claude API 요금표. Haiku 5.5 는 10만 토큰 이하 요청 단가.
 */
export const BUILTIN_PRICES: Readonly<
  Partial<Record<ProviderId, Readonly<Record<string, ModelPrice>>>>
> = {
  openai: {
    'gpt-5.6-sol': { input: 4, output: 20 },
    'gpt-5.6-terra': { input: 2, output: 12 },
    'gpt-5.6-luna': { input: 0.2, output: 1.2 },
    'gpt-5.5': { input: 5, output: 30 },
    'gpt-5.4': { input: 2.5, output: 15 },
    'gpt-5.4-mini': { input: 0.75, output: 4.5 },
    'gpt-5.4-nano': { input: 0.2, output: 1.25 },
    'gpt-5.2': { input: 1.75, output: 14 },
    'gpt-5.1': { input: 1.25, output: 10 },
    'gpt-5': { input: 1.25, output: 10 },
    'gpt-5-mini': { input: 0.25, output: 2 },
    'gpt-5-nano': { input: 0.05, output: 0.4 },
  },
  anthropic: {
    'claude-fable-5-1': { input: 10, output: 50 },
    'claude-fable-5': { input: 10, output: 50 },
    'claude-opus-5-5': { input: 4, output: 20 },
    'claude-opus-5': { input: 5, output: 25 },
    'claude-opus-4-8': { input: 5, output: 25 },
    'claude-opus-4-7': { input: 5, output: 25 },
    'claude-opus-4-6': { input: 5, output: 25 },
    'claude-sonnet-5-5': { input: 2, output: 10 },
    'claude-sonnet-5': { input: 2, output: 10 },
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-haiku-5-5': { input: 0.1, output: 0.5 },
    'claude-haiku-4-5': { input: 1, output: 5 },
  },
};

/** 날짜가 붙은 스냅샷 이름(`-20251001`, `-2025-08-07`)은 날짜를 뗀 이름의 단가를 쓴다. */
const DATE_SUFFIX = /-(?:\d{8}|\d{4}-\d{2}-\d{2})$/;

/** 서비스·모델의 기본 단가. 모르는 모델이면 null. 대소문자와 앞뒤 공백은 무시한다. */
export function builtinPrice(provider: ProviderId, model: string): ModelPrice | null {
  const table = BUILTIN_PRICES[provider];
  if (!table) return null;
  const name = model.trim().toLowerCase();
  if (!name) return null;
  return table[name] ?? table[name.replace(DATE_SUFFIX, '')] ?? null;
}
