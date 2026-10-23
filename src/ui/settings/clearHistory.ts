import { browser } from 'wxt/browser';

import { HISTORY_KEY_NAMES } from '../../config/storageKeys';

/** 옵션 페이지 "번역 기록 지우기": 번역 기록·내 원문 기록을 local 저장소에서 지운다. */
export const HISTORY_KEYS = HISTORY_KEY_NAMES;

export function isHistoryKey(key: string): boolean {
  return HISTORY_KEYS.some((p) => key === p || key.startsWith(`${p}:`));
}

/** 지운 키 수를 돌려준다. 던지지 않는다. */
export async function clearTranslationHistory(): Promise<number> {
  try {
    const all = (await browser.storage.local.get(null)) as Record<string, unknown>;
    const keys = Object.keys(all).filter(isHistoryKey);
    if (keys.length > 0) await browser.storage.local.remove(keys);
    return keys.length;
  } catch {
    return 0;
  }
}
