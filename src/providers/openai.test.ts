import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../engine/types';
import { _resetOpenAiState, openaiProvider } from './openai';
import { lastRequest, makeConfig, makeRequest, okOutput, openaiBody, stubFetch } from './testUtils';
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

describe('openaiProvider', () => {
  beforeEach(() => _resetOpenAiState());
  afterEach(() => {
    vi.unstubAllGlobals();
    setUsageListener(null);
  });

  it('응답의 usage 를 서비스 id·모델과 함께 보고한다; 파싱에 실패해도 보고한다', async () => {
    const listener = vi.fn();
    setUsageListener(listener);
    stubFetch({
      body: {
        ...openaiBody(okOutput(['a', 'b'])),
        usage: { prompt_tokens: 40, completion_tokens: 9 },
      },
    });
    await openaiProvider.translate(makeRequest(), makeConfig());
    expect(listener).toHaveBeenCalledWith({
      provider: 'openai',
      model: 'gpt-5-mini',
      usage: { inputTokens: 40, outputTokens: 9 },
    });
    listener.mockClear();
    stubFetch({
      body: { ...openaiBody('not json at all'), usage: { prompt_tokens: 5, completion_tokens: 1 } },
    });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('parse');
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { inputTokens: 5, outputTokens: 1 } }),
    );
  });

  it('usage 가 없는 응답은 보고하지 않는다', async () => {
    const listener = vi.fn();
    setUsageListener(listener);
    stubFetch({ body: openaiBody(okOutput(['a', 'b'])) });
    await openaiProvider.translate(makeRequest(), makeConfig());
    expect(listener).not.toHaveBeenCalled();
  });

  it('요청 본문: model, messages, response_format(json_schema strict) + 헤더', async () => {
    const fetchFn = stubFetch({ body: openaiBody(okOutput(['a', 'b'])) });
    const out = await openaiProvider.translate(makeRequest(), makeConfig());
    const req = lastRequest(fetchFn);
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.method).toBe('POST');
    expect(req.headers.Authorization).toBe('Bearer sk-test-key');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(req.body.model).toBe('gpt-5-mini');
    expect(req.body.messages[0].role).toBe('system');
    expect(req.body.messages[0].content).toContain('Korean');
    expect(req.body.messages[1].role).toBe('user');
    expect(req.body.messages[1].content).toContain('Hello there');
    expect(req.body.response_format.type).toBe('json_schema');
    expect(req.body.response_format.json_schema.name).toBe('translations');
    expect(req.body.response_format.json_schema.strict).toBe(true);
    expect(req.body.response_format.json_schema.schema.type).toBe('object');
    expect(req.body.temperature).toBeUndefined();
    expect(out).toEqual([
      { id: 'a', translation: '번역-a', detectedLang: 'en', sameLanguage: false },
      { id: 'b', translation: '번역-b', detectedLang: 'en', sameLanguage: false },
    ]);
  });

  it('모델이 비어 있으면 기본 모델', async () => {
    const fetchFn = stubFetch({ body: openaiBody(okOutput(['a', 'b'])) });
    await openaiProvider.translate(makeRequest(), makeConfig({ model: '' }));
    expect(lastRequest(fetchFn).body.model).toBe('gpt-5-mini');
  });

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [500, 'server'],
    [502, 'server'],
    [404, 'bad_request'],
    [400, 'bad_request'],
  ])('HTTP %i → %s', async (status, kind) => {
    stubFetch({ status, body: { error: { message: 'nope' } } });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe(kind);
  });

  it('네트워크 실패(TypeError) → server', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('server');
  });

  it('오류 메시지에 API 키가 들어가지 않는다', async () => {
    stubFetch({ status: 401, body: { error: { message: 'Incorrect API key: sk-test-key' } } });
    try {
      await openaiProvider.translate(makeRequest(), makeConfig());
      throw new Error('should throw');
    } catch (e) {
      expect((e as Error).message).not.toContain('sk-test-key');
    }
  });

  it('구조화 출력 거부(400 + response_format) → 재시도는 response_format 없이, 폴백 기억', async () => {
    const fetchFn = stubFetch(
      { status: 400, body: { error: { message: "Invalid parameter: 'response_format'" } } },
      { body: openaiBody(okOutput(['a', 'b'])) },
      { body: openaiBody(okOutput(['a', 'b'])) },
    );
    const out = await openaiProvider.translate(makeRequest(), makeConfig());
    expect(out).toHaveLength(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(lastRequest(fetchFn, 0).body.response_format).toBeDefined();
    const second = lastRequest(fetchFn, 1);
    expect(second.body.response_format).toBeUndefined();
    expect(second.body.messages[0].content).toMatch(/only.*JSON/i);

    await openaiProvider.translate(makeRequest(), makeConfig());
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(lastRequest(fetchFn, 2).body.response_format).toBeUndefined();
  });

  it('폴백 상태는 reset 으로 되돌린다', async () => {
    const fetchFn = stubFetch(
      { status: 400, body: { error: { message: 'json_schema unsupported' } } },
      { body: openaiBody(okOutput(['a', 'b'])) },
      { body: openaiBody(okOutput(['a', 'b'])) },
    );
    await openaiProvider.translate(makeRequest(), makeConfig());
    _resetOpenAiState();
    await openaiProvider.translate(makeRequest(), makeConfig());
    expect(lastRequest(fetchFn, 2).body.response_format).toBeDefined();
  });

  it('폴백 재시도도 실패하면 그 오류를 그대로 낸다(두 번만 호출)', async () => {
    const fetchFn = stubFetch(
      { status: 400, body: { error: { message: 'response_format unsupported' } } },
      { status: 400, body: { error: { message: 'model not found' } } },
    );
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('bad_request');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('폴백 모드에서는 코드펜스로 감싼 JSON 도 파싱한다', async () => {
    stubFetch(
      { status: 400, body: { error: { message: 'response_format' } } },
      { body: openaiBody(`\`\`\`json\n${okOutput(['a', 'b'])}\n\`\`\``) },
    );
    const out = await openaiProvider.translate(makeRequest(), makeConfig());
    expect(out[1]?.translation).toBe('번역-b');
  });

  it('항목 수 불일치 → parse', async () => {
    stubFetch({ body: openaiBody(okOutput(['a'])) });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('parse');
  });

  it('JSON 아님 → parse', async () => {
    stubFetch({ body: openaiBody('sorry, no') });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('parse');
  });

  it('응답 본문 자체가 JSON 이 아님 → parse', async () => {
    stubFetch({ text: '<html>oops</html>' });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('parse');
  });

  it('finish_reason length(잘림) → parse', async () => {
    stubFetch({ body: openaiBody('{"items":[{"id":"a"', 'length') });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('parse');
  });

  it('refusal 응답 → bad_request', async () => {
    stubFetch({
      body: {
        choices: [{ message: { role: 'assistant', content: null, refusal: 'I cannot' } }],
      },
    });
    expect(await kindOf(openaiProvider.translate(makeRequest(), makeConfig()))).toBe('bad_request');
  });

  it('항목 하나가 잘못되면 그 항목만 빈 번역', async () => {
    const text = JSON.stringify({
      items: [
        { id: 'a', detected_lang: 'en', same_language: false, translation: null },
        { id: 'b', detected_lang: 'en', same_language: false, translation: '좋아' },
      ],
    });
    stubFetch({ body: openaiBody(text) });
    const out = await openaiProvider.translate(makeRequest(), makeConfig());
    expect(out[0]).toEqual({
      id: 'a',
      translation: '',
      detectedLang: 'und',
      sameLanguage: false,
      failed: true,
    });
    expect(out[1]?.translation).toBe('좋아');
  });
});
