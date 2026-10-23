/** 대상 언어·발신 언어 선택지. 표시 이름은 `_locales` 의 `lang_<code>` 키. */
export const LANGUAGES = [
  'ko',
  'en',
  'ja',
  'zh-CN',
  'zh-TW',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ru',
  'vi',
  'th',
  'id',
] as const;

export type LanguageCode = (typeof LANGUAGES)[number];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/** `_locales` 메시지 키. 코드의 `-` 는 키에 쓸 수 없어 `_` 로 바꾼다. */
export function languageMessageKey(code: LanguageCode): string {
  return `lang_${code.replace('-', '_')}`;
}
