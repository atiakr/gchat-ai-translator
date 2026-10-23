import { browser } from 'wxt/browser';

/** _locales 아래 messages.json 의 키. WXT 가 생성한 타입으로 오타를 막는다. */
export type I18nKey = Parameters<typeof browser.i18n.getMessage>[0];

/** `_locales` 문구 접근. 키가 없으면 키 이름을 그대로 돌려줘 누락을 눈에 띄게 한다. */
export function t(key: I18nKey, substitutions?: string | string[]): string {
  try {
    const msg =
      substitutions === undefined
        ? browser.i18n.getMessage(key)
        : browser.i18n.getMessage(key, substitutions);
    return msg || key;
  } catch {
    return key;
  }
}

export function uiLanguage(): string {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return 'en';
  }
}
