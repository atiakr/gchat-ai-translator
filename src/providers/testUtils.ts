import { vi } from 'vitest';
import type { ProviderConfig, TranslateRequest } from '../engine/types';

/** fetch 모킹 도우미. 서비스 코드는 `status` 와 `text()` 만 사용한다. */
export interface FakeResponseInit {
  status?: number;
  body?: unknown;
  text?: string;
}

export function fakeResponse(init: FakeResponseInit = {}) {
  const status = init.status ?? 200;
  const text = init.text ?? (init.body === undefined ? '' : JSON.stringify(init.body));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

export function stubFetch(...responses: (FakeResponseInit | Error)[]) {
  const fn = vi.fn();
  for (const r of responses) {
    if (r instanceof Error) fn.mockRejectedValueOnce(r);
    else fn.mockResolvedValueOnce(fakeResponse(r));
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function lastRequest(fn: ReturnType<typeof vi.fn>, call = 0) {
  const args = fn.mock.calls[call] as [string, RequestInit] | undefined;
  if (!args) throw new Error(`fetch call #${call} not found`);
  const [url, init] = args;
  const headers = (init.headers ?? {}) as Record<string, string>;
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  return { url, method: init.method, headers, body };
}

export function makeRequest(over: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    items: [
      { id: 'a', text: 'Hello there' },
      { id: 'b', text: 'How are you?' },
    ],
    targetLang: 'ko',
    instructions: '',
    mode: 'incoming',
    ...over,
  };
}

export function makeConfig(over: Partial<ProviderConfig> = {}): ProviderConfig {
  return { provider: 'openai', apiKey: 'sk-test-key', model: 'gpt-5-mini', ...over };
}

/** 모델이 돌려줄 정상 출력(JSON 문자열). */
export function okOutput(ids: string[], over: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    items: ids.map((id) => ({
      id,
      detected_lang: 'en',
      same_language: false,
      translation: `번역-${id}`,
      ...over,
    })),
  });
}

export function openaiBody(content: string | null, finishReason = 'stop') {
  return {
    id: 'chatcmpl-1',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finishReason }],
  };
}

export function anthropicBody(texts: string[], stopReason = 'end_turn') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    content: texts.map((text) => ({ type: 'text', text })),
    stop_reason: stopReason,
  };
}
