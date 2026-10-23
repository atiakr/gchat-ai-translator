import { type InputHTMLAttributes, useState } from 'react';
import { t } from '../../i18n/t';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** `type="password"` 일 때 값 보기/숨기기 버튼을 붙인다. */
  revealable?: boolean;
}

export function TextField({
  value,
  onChange,
  type = 'text',
  revealable = type === 'password',
  className,
  ...rest
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const showReveal = type === 'password' && revealable;
  const wrapperClass = showReveal ? 'gat-textfield gat-textfield--reveal' : 'gat-textfield';
  return (
    <span className={wrapperClass}>
      <input
        className={className ? `gat-input ${className}` : 'gat-input'}
        type={showReveal && revealed ? 'text' : type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={type === 'password' ? 'off' : rest.autoComplete}
        spellCheck={false}
        {...rest}
      />
      {showReveal && (
        <button
          type="button"
          className="gat-textfield__reveal"
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
        >
          {revealed ? t('options_hideValue') : t('options_showValue')}
        </button>
      )}
    </span>
  );
}
