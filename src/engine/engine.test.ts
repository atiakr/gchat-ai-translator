import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { TranslateBatchItem } from '../messaging/protocol';
import {
  getInvalidKeys,
  setApiKey,
  setGlobalSettings,
  setInvalidKey,
  setRoomSettings,
} from '../settings/storage';
import { addUsage } from '../settings/usage';
import * as cache from './cache';
import { combineInstructions, createEngine, type EngineDeps } from './engine';
import { hashString } from './hash';
import {
  type ProviderConfig,
  ProviderError,
  type TranslateItemResult,
  type TranslateRequest,
  type TranslationProvider,
} from './types';

beforeEach(async () => {
  fakeBrowser.reset();
  await setApiKey('openai', 'sk-test');
});

type TranslateFn = (req: TranslateRequest, cfg: ProviderConfig) => Promise<TranslateItemResult[]>;

function okResults(req: TranslateRequest, over: Partial<TranslateItemResult> = {}) {
  return req.items.map((i) => ({
    id: i.id,
    translation: `번역(${i.text})`,
    detectedLang: 'en',
    sameLanguage: false,
    ...over,
  }));
}

function fakeProvider(impl?: TranslateFn) {
  const translate = vi.fn<TranslateFn>(impl ?? (async (req) => okResults(req)));
  const provider: TranslationProvider = { id: 'openai', translate };
  const getProvider = vi.fn(() => provider);
  return { translate, getProvider };
}

function engineWith(translate?: TranslateFn, over: Partial<EngineDeps> = {}) {
  const fp = fakeProvider(translate);
  const sleep = vi.fn(async () => undefined);
  const engine = createEngine({
    getProvider: fp.getProvider,
    sleep,
    now: () => 1000,
    limits: { batchDelayMs: 0 },
    ...over,
  });
  return { engine, ...fp, sleep };
}

function item(id: string, text = `text-${id}`): TranslateBatchItem {
  return { messageId: id, text, textHash: hashString(text) };
}

describe('translateBatch — 호출 조건', () => {
  it('꺼져 있으면 서비스를 호출하지 않고 모든 항목을 error/bad_request 로 돌려준다', async () => {
    await setGlobalSettings({ enabled: false });
    const { engine, translate } = engineWith();
    const out = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(out).toEqual([
      { messageId: 'a', status: 'error', errorKind: 'bad_request' },
      { messageId: 'b', status: 'error', errorKind: 'bad_request' },
    ]);
    expect(translate).not.toHaveBeenCalled();
  });
  it('키가 없으면 error/auth, 호출 없음', async () => {
    await setApiKey('openai', '');
    const { engine, translate } = engineWith();
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out).toEqual([{ messageId: 'a', status: 'error', errorKind: 'auth' }]);
    expect(translate).not.toHaveBeenCalled();
  });
  it('오늘 토큰 상한에 이르렀으면 error/bad_request, 호출 없음(수신·발신 모두)', async () => {
    await setGlobalSettings({ dailyTokenLimit: 10 });
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 10, outputTokens: 0 });
    const { engine, translate } = engineWith();
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out).toEqual([{ messageId: 'a', status: 'error', errorKind: 'bad_request' }]);
    expect(await engine.translateOutgoing('r', '안녕', 'en')).toEqual({
      ok: false,
      errorKind: 'bad_request',
    });
    expect(translate).not.toHaveBeenCalled();
  });
  it('틀린 키 상태면 error/auth, 호출 없음', async () => {
    await setInvalidKey('openai', 'auth');
    const { engine, translate } = engineWith();
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out[0]?.errorKind).toBe('auth');
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('translateBatch — 정상 경로와 기록', () => {
  it('번역 결과를 돌려주고 기록에 저장한다; 두 번째 요청은 기록 적중으로 호출하지 않는다', async () => {
    const { engine, translate } = engineWith();
    const first = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(first).toEqual([
      { messageId: 'a', status: 'translated', translation: '번역(text-a)', detectedLang: 'en' },
      { messageId: 'b', status: 'translated', translation: '번역(text-b)', detectedLang: 'en' },
    ]);
    expect(translate).toHaveBeenCalledTimes(1);
    const req = translate.mock.calls[0]?.[0];
    expect(req?.mode).toBe('incoming');
    expect(req?.targetLang).toBe('ko');
    expect(req?.items.map((i) => i.text)).toEqual(['text-a', 'text-b']);
    const cfg = translate.mock.calls[0]?.[1];
    expect(cfg).toEqual({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-5-mini' });
    expect(await cache.size()).toBe(2);

    const second = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(second).toEqual(first);
    expect(translate).toHaveBeenCalledTimes(1);
  });
  it('기록에 일부만 있으면 없는 것만 호출한다', async () => {
    const { engine, translate } = engineWith();
    await engine.translateBatch('r', 'ko', [item('a')]);
    const out = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(out.map((o) => o.status)).toEqual(['translated', 'translated']);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1]?.[0].items.map((i) => i.text)).toEqual(['text-b']);
  });
  it('본문이 바뀌면(textHash 다름) 기록을 쓰지 않고 다시 호출한다', async () => {
    const { engine, translate } = engineWith();
    await engine.translateBatch('r', 'ko', [item('a', 'hello')]);
    await engine.translateBatch('r', 'ko', [item('a', 'hello edited')]);
    expect(translate).toHaveBeenCalledTimes(2);
  });
  it('same_language 는 상태로 돌려주고 기록에도 저장한다', async () => {
    const { engine, translate } = engineWith(async (req) =>
      okResults(req, { sameLanguage: true, translation: '', detectedLang: 'ko' }),
    );
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out).toEqual([{ messageId: 'a', status: 'same_language', detectedLang: 'ko' }]);
    const again = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(again).toEqual(out);
    expect(translate).toHaveBeenCalledTimes(1);
  });
  it('번역문이 원문과 같으면(코드만 있는 메시지 등) same_language 로 돌려주고 그렇게 기록한다', async () => {
    const code = '```\nconst x = 1;\n```';
    const { engine, translate } = engineWith(async (req) =>
      req.items.map((i) => ({
        id: i.id,
        translation: ` ${i.text}\n`,
        detectedLang: 'und',
        sameLanguage: false,
      })),
    );
    const out = await engine.translateBatch('r', 'ko', [item('a', code)]);
    expect(out).toEqual([{ messageId: 'a', status: 'same_language', detectedLang: 'und' }]);
    const again = await engine.translateBatch('r', 'ko', [item('a', code)]);
    expect(again).toEqual(out);
    expect(translate).toHaveBeenCalledTimes(1);
  });
  it('발신 번역은 번역문이 원문과 같아도 그대로 돌려준다', async () => {
    const { engine } = engineWith(async (req) =>
      req.items.map((i) => ({
        id: i.id,
        translation: i.text,
        detectedLang: 'en',
        sameLanguage: false,
      })),
    );
    const out = await engine.translateOutgoing('r', 'https://x.example', 'en');
    expect(out).toEqual({ ok: true, translation: 'https://x.example', detectedLang: 'en' });
  });
  it('기록 저장이 실패해도 묶음 결과는 정상으로 돌려준다', async () => {
    const spy = vi.spyOn(cache, 'setMany').mockRejectedValue(new Error('QUOTA_BYTES exceeded'));
    try {
      const { engine } = engineWith();
      const out = await engine.translateBatch('r', 'ko', [item('a')]);
      expect(out).toEqual([
        { messageId: 'a', status: 'translated', translation: '번역(text-a)', detectedLang: 'en' },
      ]);
    } finally {
      spy.mockRestore();
    }
  });
  it('항목 단위 실패(failed)는 error/parse 이며 기록하지 않는다', async () => {
    const { engine, translate } = engineWith(async (req) =>
      req.items.map((i, idx) =>
        idx === 0
          ? { id: i.id, translation: '', detectedLang: 'und', sameLanguage: false, failed: true }
          : { id: i.id, translation: 'ok', detectedLang: 'en', sameLanguage: false },
      ),
    );
    const out = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(out[0]).toEqual({ messageId: 'a', status: 'error', errorKind: 'parse' });
    expect(out[1]?.status).toBe('translated');
    expect(await cache.size()).toBe(1);
    await engine.translateBatch('r', 'ko', [item('a')]);
    expect(translate).toHaveBeenCalledTimes(2);
  });
  it('force 는 기록을 무시하고 호출하되 결과를 기록에 쓴다(translate.retry)', async () => {
    const { engine, translate } = engineWith();
    await engine.translateBatch('r', 'ko', [item('a')]);
    const out = await engine.retryOne('r', 'ko', item('a'));
    expect(out.status).toBe('translated');
    expect(translate).toHaveBeenCalledTimes(2);
    expect(await cache.size()).toBe(1);
  });
  it('openai_compatible 은 baseUrl 을 설정으로 넘기고 빈 키를 허용한다', async () => {
    await setGlobalSettings({
      activeProvider: 'openai_compatible',
      customBaseUrl: 'https://host/v1',
      models: { openai: 'x', anthropic: 'y', openai_compatible: 'local-model' },
    });
    const { engine, translate, getProvider } = engineWith();
    await engine.translateBatch('r', 'ko', [item('a')]);
    expect(getProvider).toHaveBeenCalledWith('openai_compatible');
    expect(translate.mock.calls[0]?.[1]).toEqual({
      provider: 'openai_compatible',
      apiKey: '',
      model: 'local-model',
      baseUrl: 'https://host/v1',
    });
  });
});

describe('translateBatch — 묶음·합치기·동시 제한', () => {
  it('같은 키의 동시 요청은 서비스 호출을 하나만 만든다', async () => {
    const { engine, translate } = engineWith();
    const [a, b] = await Promise.all([
      engine.translateBatch('r', 'ko', [item('a')]),
      engine.translateBatch('r', 'ko', [item('a')]),
    ]);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });
  it('짧은 시간에 들어온 같은 방·언어 요청은 한 묶음으로 간다', async () => {
    const { engine, translate } = engineWith();
    const [a, b] = await Promise.all([
      engine.translateBatch('r', 'ko', [item('a')]),
      engine.translateBatch('r', 'ko', [item('b')]),
    ]);
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0]?.[0].items).toHaveLength(2);
    expect(a[0]?.status).toBe('translated');
    expect(b[0]?.status).toBe('translated');
  });
  it('batchSize 를 넘는 항목은 여러 호출로 나뉜다', async () => {
    const { engine, translate } = engineWith(undefined, {
      limits: { batchDelayMs: 0, batchSize: 2 },
    });
    const out = await engine.translateBatch(
      'r',
      'ko',
      ['a', 'b', 'c', 'd', 'e'].map((id) => item(id)),
    );
    expect(out.map((o) => o.status)).toEqual(Array(5).fill('translated'));
    expect(translate).toHaveBeenCalledTimes(3);
    expect(translate.mock.calls.map((c) => c[0].items.length)).toEqual([2, 2, 1]);
  });
  it('서비스당 동시 호출은 concurrency 를 넘지 않는다', async () => {
    let active = 0;
    let peak = 0;
    const { engine } = engineWith(
      async (req) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
        return okResults(req);
      },
      { limits: { batchDelayMs: 0, batchSize: 1, concurrency: 2 } },
    );
    await engine.translateBatch(
      'r',
      'ko',
      ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => item(id)),
    );
    expect(peak).toBe(2);
  });
});

describe('translateBatch — 오류', () => {
  it('재시도 대상 오류는 재시도 후 성공하면 정상 결과', async () => {
    const { engine, translate, sleep } = engineWith(
      vi
        .fn<TranslateFn>()
        .mockRejectedValueOnce(new ProviderError('server', 'HTTP 500', 500))
        .mockImplementation(async (req) => okResults(req)),
    );
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out[0]?.status).toBe('translated');
    expect(translate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
  it('재시도를 소진하면 묶음 전체가 error 이고 기록하지 않는다', async () => {
    const { engine, translate } = engineWith(async () => {
      throw new ProviderError('rate_limit', 'HTTP 429', 429);
    });
    const out = await engine.translateBatch('r', 'ko', [item('a'), item('b')]);
    expect(out).toEqual([
      { messageId: 'a', status: 'error', errorKind: 'rate_limit' },
      { messageId: 'b', status: 'error', errorKind: 'rate_limit' },
    ]);
    expect(translate).toHaveBeenCalledTimes(3);
    expect(await cache.size()).toBe(0);
  });
  it('인증 오류 → 틀린 키 상태 저장 + 경고 배지, 이후 요청은 호출하지 않는다', async () => {
    const { engine, translate } = engineWith(async () => {
      throw new ProviderError('auth', 'HTTP 401', 401);
    });
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out).toEqual([{ messageId: 'a', status: 'error', errorKind: 'auth' }]);
    expect(translate).toHaveBeenCalledTimes(1);
    expect((await getInvalidKeys()).openai?.kind).toBe('auth');
    expect(await fakeBrowser.action.getBadgeText({})).toBe('!');
    await engine.translateBatch('r', 'ko', [item('b')]);
    expect(translate).toHaveBeenCalledTimes(1);
  });
  it('묶음 전체 parse 오류는 재시도 후 error/parse', async () => {
    const { engine, translate } = engineWith(async () => {
      throw new ProviderError('parse', 'bad json');
    });
    const out = await engine.translateBatch('r', 'ko', [item('a')]);
    expect(out[0]).toEqual({ messageId: 'a', status: 'error', errorKind: 'parse' });
    expect(translate).toHaveBeenCalledTimes(3);
  });
});

describe('translateOutgoing', () => {
  it('대기열 없이 즉시 발신 모드로 호출하고 기록하지 않는다', async () => {
    const { engine, translate } = engineWith();
    const out = await engine.translateOutgoing('r', '안녕', 'en');
    expect(out).toEqual({ ok: true, translation: '번역(안녕)', detectedLang: 'en' });
    expect(translate.mock.calls[0]?.[0]).toMatchObject({ mode: 'outgoing', targetLang: 'en' });
    expect(await cache.size()).toBe(0);
  });
  it('꺼짐/키 없음이면 호출하지 않는다', async () => {
    await setApiKey('openai', '');
    const { engine, translate } = engineWith();
    expect(await engine.translateOutgoing('r', 'hi', 'en')).toEqual({
      ok: false,
      errorKind: 'auth',
    });
    expect(translate).not.toHaveBeenCalled();
  });
  it('이미 대상 언어면 원문을 그대로 돌려준다', async () => {
    const { engine } = engineWith(async (req) =>
      okResults(req, { sameLanguage: true, translation: '', detectedLang: 'en' }),
    );
    expect(await engine.translateOutgoing('r', 'hello', 'en')).toEqual({
      ok: true,
      translation: 'hello',
      detectedLang: 'en',
    });
  });
  it('서비스 오류는 ok:false 와 오류 분류로 돌려주고, 인증 오류면 틀린 키 상태를 기록한다', async () => {
    const { engine } = engineWith(async () => {
      throw new ProviderError('auth', 'HTTP 403', 403);
    });
    const out = await engine.translateOutgoing('r', 'hi', 'en');
    expect(out).toMatchObject({ ok: false, errorKind: 'auth' });
    expect((await getInvalidKeys()).openai?.kind).toBe('auth');
  });
  it('항목 실패는 parse', async () => {
    const { engine } = engineWith(async (req) => okResults(req, { translation: '', failed: true }));
    expect(await engine.translateOutgoing('r', 'hi', 'en')).toEqual({
      ok: false,
      errorKind: 'parse',
    });
  });
});

describe('대화방별 추가 지시문', () => {
  it('combineInstructions: 전역 뒤에 방을 붙이고 빈 쪽은 뺀다', () => {
    expect(combineInstructions(' 전역 ', ' 방 ')).toBe('전역\n\n방');
    expect(combineInstructions('', '방')).toBe('방');
    expect(combineInstructions('전역', '  ')).toBe('전역');
    expect(combineInstructions('', '')).toBe('');
  });

  it('방 지시문은 그 방의 요청에만 전역 지시문 뒤에 붙는다', async () => {
    await setGlobalSettings({ instructions: '전역' });
    await setRoomSettings('r1', { instructions: '방1' });
    const { engine, translate } = engineWith();
    await engine.translateBatch('r1', 'ko', [item('a')]);
    await engine.translateBatch('r2', 'ko', [item('b')]);
    const byText = new Map(
      translate.mock.calls.map(([req]) => [req.items[0]?.text, req.instructions]),
    );
    expect(byText.get('text-a')).toBe('전역\n\n방1');
    expect(byText.get('text-b')).toBe('전역');
  });

  it('방 지시문을 바꾸면 같은 메시지도 기록에 적중하지 않고 다시 호출한다', async () => {
    await setRoomSettings('r1', { instructions: '존댓말' });
    const { engine, translate } = engineWith();
    await engine.translateBatch('r1', 'ko', [item('a')]);
    await engine.translateBatch('r1', 'ko', [item('a')]);
    expect(translate).toHaveBeenCalledTimes(1);
    await setRoomSettings('r1', { instructions: '반말' });
    await engine.translateBatch('r1', 'ko', [item('a')]);
    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate.mock.calls[1]?.[0].instructions).toBe('반말');
  });

  it('발신 번역에도 방 지시문이 들어간다', async () => {
    await setRoomSettings('r1', { instructions: '격식체' });
    const { engine, translate } = engineWith();
    await engine.translateOutgoing('r1', '안녕', 'en');
    expect(translate.mock.calls[0]?.[0]).toMatchObject({
      mode: 'outgoing',
      instructions: '격식체',
    });
  });
});
