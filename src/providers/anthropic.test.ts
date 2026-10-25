import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../engine/types';
import { _resetAnthropicState, anthropicProvider } from './anthropic';
import {
  anthropicBody,
  lastRequest,
  makeConfig,
  makeRequest,
  okOutput,
  stubFetch,
} from './testUtils';
import { setUsageListener } from './usage';

async function kindOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ProviderError) return e.kind;
    throw e;
  }
  return undefined;
}

const config = () => makeConfig({ provider: 'anthropic', apiKey: 'sk-ant-test', model: '' });

describe('anthropicProvider', () => {
  beforeEach(() => _resetAnthropicState());
  afterEach(() => {
    vi.unstubAllGlobals();
    setUsageListener(null);
  });

  it('응답의 usage 를 anthropic·실제 모델명과 함께 보고한다(잘린 응답도 보고)', async () => {
    const listener = vi.fn();
    setUsageListener(listener);
    stubFetch({
      body: {
        ...anthropicBody([okOutput(['a', 'b'])]),
        usage: { input_tokens: 30, output_tokens: 8 },
      },
    });
    await anthropicProvider.translate(makeRequest(), config());
    expect(listener).toHaveBeenCalledWith({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      usage: { inputTokens: 30, outputTokens: 8 },
    });
    listener.mockClear();
    stubFetch({
      body: {
        ...anthropicBody(['{'], 'max_tokens'),
        usage: { input_tokens: 3, output_tokens: 2048 },
      },
    });
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe('parse');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { inputTokens: 3, outputTokens: 2048 } }),
    );
  });

  it('요청: 헤더, system, messages, output_config(effort low + json_schema), thinking/temperature 없음', async () => {
    const fetchFn = stubFetch({ body: anthropicBody([okOutput(['a', 'b'])]) });
    const out = await anthropicProvider.translate(makeRequest(), config());
    const req = lastRequest(fetchFn);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.method).toBe('POST');
    expect(req.headers['x-api-key']).toBe('sk-ant-test');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.headers['content-type']).toBe('application/json');
    expect(req.headers.Authorization).toBeUndefined();
    expect(req.body.model).toBe('claude-opus-5-5');
    expect(typeof req.body.system).toBe('string');
    expect(req.body.system).toContain('Korean');
    expect(req.body.messages).toEqual([
      { role: 'user', content: expect.stringContaining('Hello') },
    ]);
    expect(req.body.max_tokens).toBeGreaterThanOrEqual(1024);
    expect(req.body.output_config.effort).toBe('low');
    expect(req.body.output_config.format.type).toBe('json_schema');
    expect(req.body.output_config.format.schema.type).toBe('object');
    expect(req.body.thinking).toBeUndefined();
    expect(req.body.temperature).toBeUndefined();
    expect(req.body.top_p).toBeUndefined();
    expect(out[0]?.translation).toBe('번역-a');
  });

  it('max_tokens 는 입력 길이에 따라 커진다', async () => {
    const fetchFn = stubFetch(
      { body: anthropicBody([okOutput(['a'])]) },
      { body: anthropicBody([okOutput(['a'])]) },
    );
    await anthropicProvider.translate(makeRequest({ items: [{ id: 'a', text: 'hi' }] }), config());
    await anthropicProvider.translate(
      makeRequest({ items: [{ id: 'a', text: 'x'.repeat(5000) }] }),
      config(),
    );
    const small = lastRequest(fetchFn, 0).body.max_tokens;
    const big = lastRequest(fetchFn, 1).body.max_tokens;
    expect(big).toBeGreaterThan(small);
  });

  it('text 블록 여러 개는 이어 붙여 파싱한다', async () => {
    const json = okOutput(['a', 'b']);
    const half = Math.floor(json.length / 2);
    stubFetch({ body: anthropicBody([json.slice(0, half), json.slice(half)]) });
    const out = await anthropicProvider.translate(makeRequest(), config());
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [500, 'server'],
    [529, 'server'],
    [404, 'bad_request'],
    [400, 'bad_request'],
  ])('HTTP %i → %s', async (status, kind) => {
    stubFetch({ status, body: { type: 'error', error: { type: 'x', message: 'nope' } } });
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe(kind);
  });

  it('네트워크 실패 → server', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe('server');
  });

  it('stop_reason max_tokens → parse', async () => {
    stubFetch({ body: anthropicBody(['{"items":['], 'max_tokens') });
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe('parse');
  });

  it('stop_reason refusal → bad_request', async () => {
    stubFetch({ body: anthropicBody([''], 'refusal') });
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe('bad_request');
  });

  it('400 + output_config 언급 → format 없이 재시도, 폴백 기억', async () => {
    const fetchFn = stubFetch(
      {
        status: 400,
        body: {
          type: 'error',
          error: { type: 'invalid_request_error', message: 'output_config.format: unexpected' },
        },
      },
      { body: anthropicBody([okOutput(['a', 'b'])]) },
      { body: anthropicBody([okOutput(['a', 'b'])]) },
    );
    const out = await anthropicProvider.translate(makeRequest(), config());
    expect(out).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const second = lastRequest(fetchFn, 1);
    expect(second.body.output_config.format).toBeUndefined();
    expect(second.body.output_config.effort).toBe('low');
    expect(second.body.system).toMatch(/only.*JSON/i);

    await anthropicProvider.translate(makeRequest(), config());
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(lastRequest(fetchFn, 2).body.output_config.format).toBeUndefined();
  });

  it('항목 수 불일치 → parse', async () => {
    stubFetch({ body: anthropicBody([okOutput(['a'])]) });
    expect(await kindOf(anthropicProvider.translate(makeRequest(), config()))).toBe('parse');
  });

  it('설정 모델이 있으면 그것을 쓴다', async () => {
    const fetchFn = stubFetch({ body: anthropicBody([okOutput(['a', 'b'])]) });
    await anthropicProvider.translate(makeRequest(), { ...config(), model: 'claude-haiku-5-5' });
    expect(lastRequest(fetchFn).body.model).toBe('claude-haiku-5-5');
  });
});
