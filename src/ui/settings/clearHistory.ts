import { browser } from 'wxt/browser';

/**
 * 번역 기록·내 원문 기록을 local 저장소에서 지운다.
 *
 * 키 접두사 가정: 엔진은 기록을 `local:cache…`, 내 원문을 `local:sentOriginal…` 아래 둔다
 * (wxt storage 의 `local:` 접두사는 실제 키에선 빠지므로 raw 키는 `cache…` / `sentOriginal…`).
 * 항목이 한 덩어리(`cache`)든 건별(`cache:<hash>`)이든 모두 잡히도록 접두사 일치로 고른다.
 * 엔진이 다른 키를 쓰게 되면 HISTORY_KEY_PREFIXES 만 맞추면 된다.
 */
export const HISTORY_KEY_PREFIXES = ['cache', 'sentOriginal'] as const;

export function isHistoryKey(key: string): boolean {
  return HISTORY_KEY_PREFIXES.some((p) => key === p || key.startsWith(`${p}:`));
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
