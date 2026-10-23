import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../engine/types';
import {
  _resetOpenAiCompatibleState,
  buildChatCompletionsUrl,
  openaiCompatibleProvider,
} from './openaiCompatible';
import { lastRequest, makeConfig, makeRequest, okOutput, openaiBody, stubFetch } from './testUtils';

const config = (over: Partial<Parameters<typeof makeConfig>[0]> = {}) =>
  makeConfig({
    provider: 'openai_compatible',
    apiKey: 'local-key',
    model: 'llama',
    baseUrl: 'http://localhost:11434/v1',
    ...over,
  });

describe('buildChatCompletionsUrl', () => {
  it.each([
    ['http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/v1/', 'http://localhost:11434/v1/chat/completions'],
    ['https://host.example/api', 'https://host.example/api/chat/completions'],
    ['https://host.example/api///', 'https://host.example/api/chat/completions'],
    ['https://host.example/v1/chat/completions', 'https://host.example/v1/chat/completions'],
    ['https://host.example/v1/chat/completions/', 'https://host.example/v1/chat/completions'],
    ['  https://host.example/v1  ', 'https://host.example/v1/chat/completions'],
  ])('%s → %s', (input, expected) => {
    expect(buildChatCompletionsUrl(input)).toBe(expected);
  });
  it('빈 baseUrl → bad_request', () => {
    expect(() => buildChatCompletionsUrl('')).toThrow(ProviderError);
    expect(() => buildChatCompletionsUrl(undefined)).toThrow(ProviderError);
    try {
      buildChatCompletionsUrl('   ');
    } catch (e) {
      expect((e as ProviderError).kind).toBe('bad_request');
    }
  });
});

describe('openaiCompatibleProvider', () => {
  beforeEach(() => _resetOpenAiCompatibleState());
  afterEach(() => vi.unstubAllGlobals());

  it('baseUrl 로 요청하고 키가 있으면 Authorization 을 붙인다', async () => {
    const fetchFn = stubFetch({ body: openaiBody(okOutput(['a', 'b'])) });
    const out = await openaiCompatibleProvider.translate(makeRequest(), config());
    const req = lastRequest(fetchFn);
    expect(req.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer local-key');
    expect(req.body.model).toBe('llama');
    expect(req.body.response_format.type).toBe('json_schema');
    expect(out).toHaveLength(2);
  });

  it('키가 비어 있으면 Authorization 헤더를 보내지 않는다', async () => {
    const fetchFn = stubFetch({ body: openaiBody(okOutput(['a', 'b'])) });
    await openaiCompatibleProvider.translate(makeRequest(), config({ apiKey: '' }));
    expect('Authorization' in lastRequest(fetchFn).headers).toBe(false);
  });

  it('구조화 출력 거부 → 폴백 재시도, 이후 호출도 생략', async () => {
    const fetchFn = stubFetch(
      { status: 400, body: { error: { message: 'response_format not supported' } } },
      { body: openaiBody(okOutput(['a', 'b'])) },
      { body: openaiBody(okOutput(['a', 'b'])) },
    );
    await openaiCompatibleProvider.translate(makeRequest(), config());
    await openaiCompatibleProvider.translate(makeRequest(), config());
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(lastRequest(fetchFn, 1).body.response_format).toBeUndefined();
    expect(lastRequest(fetchFn, 2).body.response_format).toBeUndefined();
  });

  it('baseUrl 없음 → bad_request (fetch 호출 없음)', async () => {
    const fetchFn = stubFetch();
    await expect(
      openaiCompatibleProvider.translate(makeRequest(), config({ baseUrl: '' })),
    ).rejects.toMatchObject({ kind: 'bad_request' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('openai 폴백 상태와 독립이다', async () => {
    const { _resetOpenAiState, openaiProvider } = await import('./openai');
    _resetOpenAiState();
    const fetchFn = stubFetch(
      { status: 400, body: { error: { message: 'response_format not supported' } } },
      { body: openaiBody(okOutput(['a', 'b'])) },
      { body: openaiBody(okOutput(['a', 'b'])) },
    );
    await openaiCompatibleProvider.translate(makeRequest(), config());
    await openaiProvider.translate(makeRequest(), makeConfig());
    expect(lastRequest(fetchFn, 2).body.response_format).toBeDefined();
  });
});
