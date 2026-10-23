import { ProviderError, type TranslateItemResult, type TranslateRequest } from '../engine/types';
import { errorFromFetchFailure, errorFromStatus, isStructuredOutputRejection } from './errors';
import { parseTranslationOutput } from './parse';
import { buildPrompt } from './prompt';

/** OpenAI Chat Completions 와 같은 wire format 을 쓰는 서비스의 공통 호출부. */
export interface ChatCompletionsCall {
  url: string;
  /** 비어 있으면 Authorization 헤더를 보내지 않는다. */
  apiKey: string;
  model: string;
  request: TranslateRequest;
  /** 서비스별 폴백 기억 상태(세션 동안 유지). */
  state: { structuredOutputRejected: boolean };
}

export async function translateViaChatCompletions(
  call: ChatCompletionsCall,
): Promise<TranslateItemResult[]> {
  if (!call.state.structuredOutputRejected) {
    const first = await send(call, true);
    if (first.kind === 'ok') return first.result;
    if (!first.structuredOutputRejected) throw first.error;
    call.state.structuredOutputRejected = true;
  }
  const second = await send(call, false);
  if (second.kind === 'ok') return second.result;
  throw second.error;
}

type SendResult =
  | { kind: 'ok'; result: TranslateItemResult[] }
  | { kind: 'error'; error: ProviderError; structuredOutputRejected: boolean };

async function send(call: ChatCompletionsCall, structured: boolean): Promise<SendResult> {
  const prompt = buildPrompt(call.request, { jsonInPrompt: !structured });
  const body: Record<string, unknown> = {
    model: call.model,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user },
    ],
  };
  if (structured) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: 'translations', strict: true, schema: prompt.schema },
    };
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (call.apiKey) headers.Authorization = `Bearer ${call.apiKey}`;

  let status: number;
  let text: string;
  try {
    const res = await fetch(call.url, { method: 'POST', headers, body: JSON.stringify(body) });
    status = res.status;
    text = await res.text();
  } catch (err) {
    return { kind: 'error', error: errorFromFetchFailure(err), structuredOutputRejected: false };
  }
  if (status < 200 || status >= 300) {
    return {
      kind: 'error',
      error: errorFromStatus(status, text, call.apiKey),
      structuredOutputRejected: structured && isStructuredOutputRejection(status, text),
    };
  }
  try {
    return { kind: 'ok', result: parseTranslationOutput(extractContent(text), call.request.items) };
  } catch (err) {
    return { kind: 'error', error: errorFromFetchFailure(err), structuredOutputRejected: false };
  }
}

/** `choices[0].message.content` 를 꺼낸다. 잘림·거부는 분류된 오류로. */
function extractContent(bodyText: string): string {
  let data: unknown;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new ProviderError('parse', 'Response body is not JSON');
  }
  const choices = (data as { choices?: unknown })?.choices;
  const choice = Array.isArray(choices) ? (choices[0] as Record<string, unknown>) : undefined;
  if (!choice || typeof choice !== 'object') {
    throw new ProviderError('parse', 'Response has no choices');
  }
  if (choice.finish_reason === 'length') {
    throw new ProviderError('parse', 'Response truncated (finish_reason=length)');
  }
  const message = choice.message as Record<string, unknown> | undefined;
  if (typeof message?.refusal === 'string' && message.refusal) {
    throw new ProviderError('bad_request', `Model refused: ${message.refusal}`);
  }
  if (choice.finish_reason === 'content_filter') {
    throw new ProviderError('bad_request', 'Response blocked by content filter');
  }
  const content = message?.content;
  if (typeof content === 'string') return content;
  // 일부 호환 서비스는 content 를 파트 배열로 돌려준다.
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' ? (p as { text?: unknown }).text : undefined))
      .filter((t): t is string => typeof t === 'string')
      .join('');
  }
  throw new ProviderError('parse', 'Response message has no text content');
}
