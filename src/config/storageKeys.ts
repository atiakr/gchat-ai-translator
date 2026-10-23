/**
 * `chrome.storage.local` 의 기록 항목 이름(wxt storage 의 `local:` 접두사를 뺀 raw 키).
 * 엔진의 기록 저장(`src/engine/cache.ts`)과 옵션 페이지의 기록 지우기가 같은 상수를 본다.
 */
export const HISTORY_KEYS = {
  translationCache: 'translationCache',
  sentOriginals: 'sentOriginals',
} as const;

export const HISTORY_KEY_NAMES = [
  HISTORY_KEYS.translationCache,
  HISTORY_KEYS.sentOriginals,
] as const;
