import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reportUsage,
  setUsageListener,
  usageFromAnthropic,
  usageFromChatCompletions,
} from './usage';

afterEach(() => setUsageListener(null));

describe('usageFrom*', () => {
  it('Chat Completions: prompt/completion 토큰, usage 없으면 null', () => {
    expect(
      usageFromChatCompletions({ usage: { prompt_tokens: 12, completion_tokens: 3 } }),
    ).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(usageFromChatCompletions({ usage: { prompt_tokens: 'x' } })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(usageFromChatCompletions({ choices: [] })).toBeNull();
    expect(usageFromChatCompletions(null)).toBeNull();
  });
  it('Anthropic: input/output 토큰, 캐시 토큰은 입력에 더한다', () => {
    expect(
      usageFromAnthropic({
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 1,
        },
      }),
    ).toEqual({ inputTokens: 16, outputTokens: 4 });
    expect(usageFromAnthropic({ usage: { input_tokens: 10, output_tokens: 4 } })).toEqual({
      inputTokens: 10,
      outputTokens: 4,
    });
    expect(usageFromAnthropic({})).toBeNull();
  });
});

describe('reportUsage', () => {
  it('리스너가 있으면 그대로 전달하고, 없으면 버리며, 리스너 예외는 삼킨다', () => {
    const event = {
      provider: 'openai' as const,
      model: 'm',
      usage: { inputTokens: 1, outputTokens: 2 },
    };
    expect(() => reportUsage(event)).not.toThrow();
    const listener = vi.fn(() => {
      throw new Error('boom');
    });
    setUsageListener(listener);
    expect(() => reportUsage(event)).not.toThrow();
    expect(listener).toHaveBeenCalledWith(event);
  });
});
