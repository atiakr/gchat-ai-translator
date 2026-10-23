import { browser } from 'wxt/browser';

/**
 * 번역 기록·내 원문 기록을 local 저장소에서 지운다.
 *
 * 엔진(`src/engine/cache.ts`)은 기록을 `local:translationCache`, 내 원문을 `local:sentOriginals` 에 둔다
 * (wxt storage 의 `local:` 접두사는 raw 키에서 빠진다). 두 모듈이 같은 상수를 보도록 여기서 export 한다.
 */
export const HISTORY_KEYS = ['translationCache', 'sentOriginals'] as const;

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
