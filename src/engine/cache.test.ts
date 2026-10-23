import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { CacheEntry } from '../settings/schema';
import {
  type CacheKeyParts,
  cacheKey,
  clear,
  clearAll,
  get,
  getMany,
  lookupSentOriginal,
  saveSentOriginal,
  sentOriginalSize,
  set,
  setMany,
  size,
} from './cache';
import { normalizeSentText } from './sentText';

beforeEach(() => fakeBrowser.reset());

const base: CacheKeyParts = {
  messageId: 'm1',
  textHash: 'abcd1234',
  targetLang: 'ko',
  provider: 'openai',
  model: 'gpt-5-mini',
  instructionsHash: '00000000',
};

function entry(key: string, savedAt: number, over: Partial<CacheEntry> = {}): CacheEntry {
  return {
    key,
    status: 'translated',
    translation: `t-${key}`,
    detectedLang: 'en',
    savedAt,
    ...over,
  };
}

describe('cacheKey', () => {
  it('같은 구성 요소면 같은 키', () => {
    expect(cacheKey(base)).toBe(cacheKey({ ...base }));
    expect(cacheKey(base)).toMatch(/^[0-9a-f]{16}$/);
  });
  it('메시지 id·본문 해시·대상 언어·서비스·모델·지시문 해시 중 하나라도 다르면 다른 키', () => {
    const k = cacheKey(base);
    expect(cacheKey({ ...base, messageId: 'm2' })).not.toBe(k);
    expect(cacheKey({ ...base, textHash: 'ffff0000' })).not.toBe(k);
    expect(cacheKey({ ...base, targetLang: 'ja' })).not.toBe(k);
    expect(cacheKey({ ...base, provider: 'anthropic' })).not.toBe(k);
    expect(cacheKey({ ...base, model: 'gpt-5' })).not.toBe(k);
    expect(cacheKey({ ...base, instructionsHash: '11111111' })).not.toBe(k);
  });
  it('openai_compatible 은 baseUrl 까지 키에 포함하고, 다른 서비스는 무시한다', () => {
    const compat: CacheKeyParts = { ...base, provider: 'openai_compatible', model: 'x' };
    expect(cacheKey({ ...compat, baseUrl: 'https://a/v1' })).not.toBe(
      cacheKey({ ...compat, baseUrl: 'https://b/v1' }),
    );
    expect(cacheKey({ ...base, baseUrl: 'https://a/v1' })).toBe(
      cacheKey({ ...base, baseUrl: 'https://b/v1' }),
    );
  });
});

describe('번역 기록', () => {
  it('set → get 왕복, 없는 키는 null', async () => {
    expect(await get('nope')).toBeNull();
    await set(entry('k1', 10));
    expect(await get('k1')).toEqual(entry('k1', 10));
    await set(entry('k2', 11, { status: 'same_language', translation: undefined }));
    const many = await getMany(['k1', 'k2', 'k3']);
    expect([...many.keys()].sort()).toEqual(['k1', 'k2']);
    expect(many.get('k2')?.status).toBe('same_language');
  });
  it('local 저장소에만 쓰이고 sync 에는 없다', async () => {
    await set(entry('k1', 10));
    expect(JSON.stringify(await fakeBrowser.storage.sync.get(null))).not.toContain('t-k1');
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).toContain('t-k1');
  });
  it('상한을 넘으면 savedAt 이 오래된 것부터 삭제한다', async () => {
    await setMany([entry('old', 1), entry('mid', 2), entry('new', 3)], 3);
    expect(await size()).toBe(3);
    await set(entry('newest', 4), 3);
    expect(await size()).toBe(3);
    expect(await get('old')).toBeNull();
    expect(await get('mid')).not.toBeNull();
    expect(await get('newest')).not.toBeNull();
  });
  it('같은 키를 다시 쓰면 덮어쓰고 개수는 늘지 않는다', async () => {
    await set(entry('k1', 1));
    await set(entry('k1', 2, { translation: 'again' }));
    expect(await size()).toBe(1);
    expect((await get('k1'))?.translation).toBe('again');
  });
  it('동시 쓰기가 서로를 덮어쓰지 않는다', async () => {
    await Promise.all([set(entry('a', 1)), set(entry('b', 2)), set(entry('c', 3))]);
    expect(await size()).toBe(3);
  });
  it('clear 는 번역 기록만 지운다', async () => {
    await set(entry('k1', 1));
    await saveSentOriginal('room/1', 'Hello', '안녕');
    await clear();
    expect(await size()).toBe(0);
    expect(await lookupSentOriginal('room/1', 'Hello')).toBe('안녕');
  });
});

describe('내 원문 기록', () => {
  it('방 id + 보낸 텍스트로 저장·조회한다(앞뒤 공백 무시)', async () => {
    await saveSentOriginal('room/1', 'Hello there', '안녕하세요');
    expect(await lookupSentOriginal('room/1', 'Hello there')).toBe('안녕하세요');
    expect(await lookupSentOriginal('room/1', '  Hello there \n')).toBe('안녕하세요');
    expect(await lookupSentOriginal('room/2', 'Hello there')).toBeNull();
    expect(await lookupSentOriginal('room/1', 'Hello')).toBeNull();
  });
  it('저장·조회는 전송 매칭과 같은 정규화(연속 공백 축약)를 쓴다', async () => {
    await saveSentOriginal('room/1', 'Hello\n\n  there', '안녕하세요');
    expect(await lookupSentOriginal('room/1', 'Hello there')).toBe('안녕하세요');
    expect(await lookupSentOriginal('room/1', normalizeSentText(' Hello \t there '))).toBe(
      '안녕하세요',
    );
  });
  it('상한을 넘으면 오래된 것부터 삭제한다', async () => {
    await saveSentOriginal('r', 'a', 'A', 1, 2);
    await saveSentOriginal('r', 'b', 'B', 2, 2);
    await saveSentOriginal('r', 'c', 'C', 3, 2);
    expect(await sentOriginalSize()).toBe(2);
    expect(await lookupSentOriginal('r', 'a')).toBeNull();
    expect(await lookupSentOriginal('r', 'c')).toBe('C');
  });
  it('clearAll 은 둘 다 지운다', async () => {
    await set(entry('k1', 1));
    await saveSentOriginal('r', 'a', 'A');
    await clearAll();
    expect(await size()).toBe(0);
    expect(await sentOriginalSize()).toBe(0);
  });
});
