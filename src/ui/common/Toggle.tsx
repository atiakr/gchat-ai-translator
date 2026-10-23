import type { ReactNode } from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  /** 라벨이 없을 때 접근성 이름. */
  ariaLabel?: string;
  id?: string;
}

/** 스위치. `role="switch"` 버튼으로 구현해 키보드·보조기기 모두에서 쓸 수 있다. */
export function Toggle({ checked, onChange, label, disabled, ariaLabel, id }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      className="gat-toggle"
      aria-checked={checked}
      aria-label={label === undefined ? ariaLabel : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="gat-toggle__track" aria-hidden="true">
        <span className="gat-toggle__thumb" />
      </span>
      {label !== undefined && <span className="gat-toggle__label">{label}</span>}
    </button>
  );
}
