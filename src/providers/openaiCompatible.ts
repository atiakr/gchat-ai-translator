import {
  type ProviderConfig,
  ProviderError,
  type TranslateRequest,
  type TranslationProvider,
} from '../engine/types';
import { translateViaChatCompletions } from './chatCompletions';

const state = { structuredOutputRejected: false };

export function _resetOpenAiCompatibleState(): void {
  state.structuredOutputRejected = false;
}

/**
 * base URL → chat/completions 엔드포인트.
 * 끝 슬래시는 제거하고, 이미 `/chat/completions` 로 끝나지 않으면 덧붙인다.
 */
export function buildChatCompletionsUrl(baseUrl: string | undefined): string {
  const trimmed = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new ProviderError('bad_request', 'Base URL is not set');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

export const openaiCompatibleProvider: TranslationProvider = {
  id: 'openai_compatible',
  async translate(request: TranslateRequest, config: ProviderConfig) {
    const url = buildChatCompletionsUrl(config.baseUrl);
    return translateViaChatCompletions({
      provider: 'openai_compatible',
      url,
      apiKey: config.apiKey.trim(),
      model: config.model.trim(),
      request,
      state,
    });
  },
};
