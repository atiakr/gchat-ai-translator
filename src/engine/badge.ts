import { browser } from 'wxt/browser';
import { t } from '../i18n/t';
import { getApiKeys, getBrokenState, getGlobalSettings, getInvalidKeys } from '../settings/storage';

/**
 * 확장 아이콘 배지: 키 없음 / 틀린 키 / 화면 깨짐이면 `!` 경고, 아니면 지운다.
 * 어떤 상태를 띄울지는 저장소를 읽어 정한다. action API 가 없어도 실패하지 않는다.
 */
export type BadgeReason = 'no_key' | 'invalid_key' | 'broken';

export const BADGE_WARNING_TEXT = '!';
export const BADGE_WARNING_COLOR = '#d93025';

export async function computeBadgeReason(): Promise<BadgeReason | null> {
  const [settings, keys, invalid, broken] = await Promise.all([
    getGlobalSettings(),
    getApiKeys(),
    getInvalidKeys(),
    getBrokenState(),
  ]);
  const provider = settings.activeProvider;
  if (invalid[provider]) return 'invalid_key';
  if (provider !== 'openai_compatible' && !keys[provider]) return 'no_key';
  if (broken) return 'broken';
  return null;
}

function titleFor(reason: BadgeReason | null): string {
  switch (reason) {
    case 'no_key':
      return t('bg_badgeNoKey');
    case 'invalid_key':
      return t('bg_badgeInvalidKey');
    case 'broken':
      return t('bg_badgeBroken');
    default:
      return t('extName');
  }
}

/** 배지를 실제로 그린다. action API 가 없거나 실패해도 조용히 넘어간다. */
export async function applyBadge(reason: BadgeReason | null): Promise<void> {
  const action = browser.action;
  try {
    await action?.setBadgeText?.({ text: reason ? BADGE_WARNING_TEXT : '' });
    if (reason) await action?.setBadgeBackgroundColor?.({ color: BADGE_WARNING_COLOR });
    await action?.setTitle?.({ title: titleFor(reason) });
  } catch {
    // action API 미지원(예: 테스트 환경) — 배지는 보조 표시일 뿐이다.
  }
}

/** 저장소를 읽어 배지를 다시 그린다. 결정한 이유를 돌려준다. */
export async function refreshBadge(): Promise<BadgeReason | null> {
  const reason = await computeBadgeReason();
  await applyBadge(reason);
  return reason;
}
