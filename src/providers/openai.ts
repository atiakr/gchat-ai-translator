import { DEFAULTS } from '../config/defaults';
import type { ProviderConfig, TranslateRequest, TranslationProvider } from '../engine/types';
import { translateViaChatCompletions } from './chatCompletions';

export const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

/** 세션 동안 기억하는 폴백 상태: 구조화 출력이 거부되면 이후 호출은 처음부터 생략한다. */
const state = { structuredOutputRejected: false };

export function _resetOpenAiState(): void {
  state.structuredOutputRejected = false;
}

export const openaiProvider: TranslationProvider = {
  id: 'openai',
  translate(request: TranslateRequest, config: ProviderConfig) {
    return translateViaChatCompletions({
      provider: 'openai',
      url: OPENAI_CHAT_COMPLETIONS_URL,
      apiKey: config.apiKey,
      model: config.model.trim() || DEFAULTS.models.openai,
      request,
      state,
    });
  },
};
