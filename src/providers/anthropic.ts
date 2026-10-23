import { DEFAULTS } from '../config/defaults';
import {
  type ProviderConfig,
  ProviderError,
  type TranslateItemResult,
  type TranslateRequest,
  type TranslationProvider,
} from '../engine/types';
import { errorFromFetchFailure, errorFromStatus, isStructuredOutputRejection } from './errors';
import { parseTranslationOutput } from './parse';
import { buildPrompt } from './prompt';

export const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** 출력 토큰 상한: 입력 길이에 비례하되 바닥값·천장값을 둔다. */
const MIN_MAX_TOKENS = 2048;
const MAX_MAX_TOKENS = 16000;
const PER_ITEM_OVERHEAD_TOKENS = 64;

export function computeMaxTokens(request: TranslateRequest): number {
  const chars = request.items.reduce((sum, item) => sum + item.text.length, 0);
  const estimate = Math.ceil(chars * 2) + request.items.length * PER_ITEM_OVERHEAD_TOKENS + 256;
  return Math.min(MAX_MAX_TOKENS, Math.max(MIN_MAX_TOKENS, estimate));
}

const state = { structuredOutputRejected: false };

export function _resetAnthropicState(): void {
  state.structuredOutputRejected = false;
}

type SendResult =
  | { kind: 'ok'; result: TranslateItemResult[] }
  | { kind: 'error'; error: ProviderError; structuredOutputRejected: boolean };

async function send(
  request: TranslateRequest,
  config: ProviderConfig,
  structured: boolean,
): Promise<SendResult> {
  const prompt = buildPrompt(request, { jsonInPrompt: !structured });
  const outputConfig: Record<string, unknown> = { effort: DEFAULTS.anthropicEffort };
  if (structured) outputConfig.format = { type: 'json_schema', schema: prompt.schema };
  const body = {
    model: config.model.trim() || DEFAULTS.models.anthropic,
    max_tokens: computeMaxTokens(request),
    system: prompt.system,
    messages: [{ role: 'user', content: prompt.user }],
    output_config: outputConfig,
  };
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': DEFAULTS.anthropicVersion,
    'anthropic-dangerous-direct-browser-access': 'true',
  };

  let status: number;
  let text: string;
  try {
    const res = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    status = res.status;
    text = await res.text();
  } catch (err) {
    return { kind: 'error', error: errorFromFetchFailure(err), structuredOutputRejected: false };
  }
  if (status < 200 || status >= 300) {
    return {
      kind: 'error',
      error: errorFromStatus(status, text, config.apiKey),
      structuredOutputRejected: structured && isStructuredOutputRejection(status, text),
    };
  }
  try {
    return { kind: 'ok', result: parseTranslationOutput(extractText(text), request.items) };
  } catch (err) {
    return { kind: 'error', error: errorFromFetchFailure(err), structuredOutputRejected: false };
  }
}

/** `content[].text` 를 이어 붙인다. stop_reason 이 max_tokens 면 잘림(parse), refusal 이면 bad_request. */
function extractText(bodyText: string): string {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    throw new ProviderError('parse', 'Response body is not JSON');
  }
  if (!data || typeof data !== 'object') {
    throw new ProviderError('parse', 'Response body is not an object');
  }
  if (data.stop_reason === 'max_tokens') {
    throw new ProviderError('parse', 'Response truncated (stop_reason=max_tokens)');
  }
  if (data.stop_reason === 'refusal') {
    const details = data.stop_details as { explanation?: unknown } | undefined;
    const why = typeof details?.explanation === 'string' ? `: ${details.explanation}` : '';
    throw new ProviderError('bad_request', `Model refused the request${why}`);
  }
  if (!Array.isArray(data.content)) {
    throw new ProviderError('parse', 'Response has no content blocks');
  }
  const text = data.content
    .filter(
      (block): block is { type: 'text'; text: string } =>
        !!block &&
        typeof block === 'object' &&
        (block as { type?: unknown }).type === 'text' &&
        typeof (block as { text?: unknown }).text === 'string',
    )
    .map((block) => block.text)
    .join('');
  if (!text.trim()) throw new ProviderError('parse', 'Response has no text content');
  return text;
}

export const anthropicProvider: TranslationProvider = {
  id: 'anthropic',
  async translate(request: TranslateRequest, config: ProviderConfig) {
    if (!state.structuredOutputRejected) {
      const first = await send(request, config, true);
      if (first.kind === 'ok') return first.result;
      if (!first.structuredOutputRejected) throw first.error;
      state.structuredOutputRejected = true;
    }
    const second = await send(request, config, false);
    if (second.kind === 'ok') return second.result;
    throw second.error;
  },
};
