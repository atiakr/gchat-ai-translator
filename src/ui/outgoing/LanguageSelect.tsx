import {
  isLanguageCode,
  LANGUAGES,
  type LanguageCode,
  languageMessageKey,
} from '../../config/languages';
import { type I18nKey, t } from '../../i18n/t';

export interface LanguageSelectProps {
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

/** `LANGUAGES` 선택지. 표시 이름은 `_locales` 의 `lang_<code>`. */
export function LanguageSelect({ value, onChange, disabled, id, ...rest }: LanguageSelectProps) {
  return (
    <select
      id={id}
      className="gat-select"
      value={value}
      disabled={disabled}
      aria-label={rest['aria-label']}
      onChange={(e) => {
        const next = e.target.value;
        if (isLanguageCode(next)) onChange(next);
      }}
    >
      {LANGUAGES.map((code) => (
        <option key={code} value={code}>
          {t(languageMessageKey(code) as I18nKey)}
        </option>
      ))}
    </select>
  );
}
