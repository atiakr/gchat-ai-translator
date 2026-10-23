import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { clearTranslationHistory, isHistoryKey } from './clearHistory';

beforeEach(() => fakeBrowser.reset());

describe('clearTranslationHistory', () => {
  it('cache / sentOriginal 접두사 키만 local 에서 지운다', async () => {
    await fakeBrowser.storage.local.set({
      cache: { a: 1 },
      'cache:abc': { key: 'abc' },
      sentOriginal: [{ roomId: 'r' }],
      'sentOriginal:r:hash': { original: '원문' },
      apiKeys: { openai: 'sk-keep' },
      invalidKeys: {},
      cacheless: 'keep',
    });
    await fakeBrowser.storage.sync.set({ settings: { enabled: true } });
    const removed = await clearTranslationHistory();
    expect(removed).toBe(4);
    const local = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(local).sort()).toEqual(['apiKeys', 'cacheless', 'invalidKeys']);
    expect(await fakeBrowser.storage.sync.get(null)).toEqual({ settings: { enabled: true } });
  });

  it('지울 것이 없으면 0', async () => {
    expect(await clearTranslationHistory()).toBe(0);
  });

  it('isHistoryKey', () => {
    expect(isHistoryKey('cache')).toBe(true);
    expect(isHistoryKey('cache:x')).toBe(true);
    expect(isHistoryKey('sentOriginal:x')).toBe(true);
    expect(isHistoryKey('apiKeys')).toBe(false);
    expect(isHistoryKey('cacheless')).toBe(false);
  });
});
