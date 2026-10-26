import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './defaults';
import { BUILTIN_PRICES, builtinPrice } from './prices';

describe('builtinPrice', () => {
  it('알려진 모델의 단가를 돌려주고 모르는 모델·호환 서비스는 null', () => {
    expect(builtinPrice('openai', 'gpt-5-mini')).toEqual({ input: 0.25, output: 2 });
    expect(builtinPrice('anthropic', 'claude-opus-5-5')).toEqual({ input: 4, output: 20 });
    expect(builtinPrice('openai', 'gpt-unknown')).toBeNull();
    expect(builtinPrice('anthropic', 'gpt-5-mini')).toBeNull();
    expect(builtinPrice('openai_compatible', 'gpt-5-mini')).toBeNull();
    expect(builtinPrice('openai', '')).toBeNull();
  });
  it('대소문자·앞뒤 공백을 무시하고 날짜 스냅샷은 날짜를 뗀 이름으로 찾는다', () => {
    expect(builtinPrice('openai', ' GPT-5-Mini ')).toEqual({ input: 0.25, output: 2 });
    expect(builtinPrice('openai', 'gpt-5-mini-2025-08-07')).toEqual({ input: 0.25, output: 2 });
    expect(builtinPrice('anthropic', 'claude-haiku-4-5-20251001')).toEqual({ input: 1, output: 5 });
    // 날짜가 아닌 접미사는 다른 모델이다(gpt-5 단가로 어림하지 않는다).
    expect(builtinPrice('openai', 'gpt-5-codex')).toBeNull();
  });
  it('기본 모델과 Claude 추천 모델은 모두 기본 단가가 있다', () => {
    expect(builtinPrice('openai', DEFAULTS.models.openai)).not.toBeNull();
    for (const model of DEFAULTS.anthropicModelChoices) {
      expect(builtinPrice('anthropic', model)).not.toBeNull();
    }
  });
  it('표의 단가는 모두 0 보다 큰 유한한 수이고 모델 이름은 소문자다', () => {
    for (const table of Object.values(BUILTIN_PRICES)) {
      for (const [name, price] of Object.entries(table ?? {})) {
        expect(name).toBe(name.toLowerCase());
        expect(Number.isFinite(price.input) && price.input > 0).toBe(true);
        expect(Number.isFinite(price.output) && price.output > 0).toBe(true);
      }
    }
  });
});
