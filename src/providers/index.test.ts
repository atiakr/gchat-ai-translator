import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProvider, resetProviderState, testConnection } from './index';
import { anthropicBody, lastRequest, makeConfig, openaiBody, stubFetch } from './testUtils';

describe('getProvider', () => {
  it('id 별 서비스를 돌려준다', () => {
    expect(getProvider('openai').id).toBe('openai');
    expect(getProvider('anthropic').id).toBe('anthropic');
    expect(getProvider('openai_compatible').id).toBe('openai_compatible');
  });
  it('모르는 id → 예외', () => {
    expect(() => getProvider('nope' as never)).toThrow();
  });
});

describe('testConnection', () => {
  beforeEach(() => resetProviderState());
  afterEach(() => vi.unstubAllGlobals());

  it('성공: hello 1건을 ko 로 발신 모드 번역하고 sample 을 돌려준다', async () => {
    const fetchFn = stubFetch({
      body: openaiBody(
        JSON.stringify({
          items: [{ id: 'test', detected_lang: 'en', same_language: false, translation: '안녕' }],
        }),
      ),
    });
    const res = await testConnection(makeConfig());
    expect(res).toEqual({ ok: true, sample: '안녕' });
    const req = lastRequest(fetchFn);
    expect(req.body.messages[1].content).toContain('hello');
    expect(req.body.messages[0].content).toContain('Korean');
  });

  it('anthropic 도 같은 경로', async () => {
    stubFetch({
      body: anthropicBody([
        JSON.stringify({
          items: [{ id: 'test', detected_lang: 'en', same_language: false, translation: '안녕' }],
        }),
      ]),
    });
    const res = await testConnection(makeConfig({ provider: 'anthropic', model: '' }));
    expect(res).toEqual({ ok: true, sample: '안녕' });
  });

  it('실패: 401 → { ok:false, errorKind:auth } 이고 던지지 않는다', async () => {
    stubFetch({ status: 401, body: { error: { message: 'bad key' } } });
    const res = await testConnection(makeConfig());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errorKind).toBe('auth');
      expect(res.message).toContain('bad key');
    }
  });

  it('실패: 네트워크 → server', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const res = await testConnection(makeConfig());
    expect(res).toMatchObject({ ok: false, errorKind: 'server' });
  });

  it('번역문이 비어 돌아오면 parse 실패로 본다', async () => {
    stubFetch({
      body: openaiBody(
        JSON.stringify({
          items: [{ id: 'test', detected_lang: 'en', same_language: false, translation: 42 }],
        }),
      ),
    });
    const res = await testConnection(makeConfig());
    expect(res).toMatchObject({ ok: false, errorKind: 'parse' });
  });

  it('예상치 못한 예외도 server 로 감싼다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('weird')));
    const res = await testConnection(makeConfig());
    expect(res).toMatchObject({ ok: false, errorKind: 'server' });
  });
});
