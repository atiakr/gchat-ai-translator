import type { ProviderId } from '../../config/defaults';
import { LANGUAGES, languageMessageKey } from '../../config/languages';
import { type I18nKey, t } from '../../i18n/t';
import { PROVIDER_IDS } from '../../settings/schema';
import type { SelectOption } from '../common/Select';

/** 언어 선택지(이름은 `lang_*` 문구). */
export function languageOptions(): SelectOption[] {
  return LANGUAGES.map((code) => ({
    value: code,
    label: t(languageMessageKey(code) as I18nKey),
  }));
}

/** 방별 발신 언어 선택지: 맨 앞에 "기본값 사용"(빈 값). */
export function roomOutgoingOptions(): SelectOption[] {
  return [{ value: '', label: t('options_roomOutgoingDefault') }, ...languageOptions()];
}

export function providerLabel(id: ProviderId): string {
  return t(`options_provider_${id}` as I18nKey);
}

export function providerOptions(): SelectOption[] {
  return PROVIDER_IDS.map((id) => ({ value: id, label: providerLabel(id) }));
}
