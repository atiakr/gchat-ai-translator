import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { HISTORY_KEY_NAMES } from '../../config/storageKeys';
import * as cache from '../../engine/cache';
import { clearTranslationHistory, HISTORY_KEYS } from './clearHistory';

beforeEach(() => fakeBrowser.reset());

describe('clearTranslationHistory ↔ engine cache 키 정합', () => {
  it('엔진이 실제로 저장한 기록을 지운다', async () => {
    await cache.set({
      key: 'k1',
      status: 'translated',
      translation: 't',
      detectedLang: 'en',
      savedAt: 1,
    });
    await cache.saveSentOriginal('dm/x', 'sent text', 'original');
    expect(await cache.size()).toBe(1);
    const removed = await clearTranslationHistory();
    expect(removed).toBeGreaterThanOrEqual(2);
    expect(await cache.size()).toBe(0);
    expect(await cache.lookupSentOriginal('dm/x', 'sent text')).toBeNull();
  });

  it('엔진이 쓰는 raw 키 이름은 공용 상수와 같다', async () => {
    expect(HISTORY_KEYS).toBe(HISTORY_KEY_NAMES);
    await cache.set({ key: 'k', status: 'same_language', detectedLang: 'ko', savedAt: 1 });
    await cache.saveSentOriginal('dm/x', 'a', 'b');
    const keys = Object.keys(await fakeBrowser.storage.local.get(null)).sort();
    expect(keys).toEqual([...HISTORY_KEY_NAMES].sort());
  });
});
