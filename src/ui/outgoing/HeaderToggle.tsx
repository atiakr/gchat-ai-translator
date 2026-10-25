import { t } from '../../i18n/t';

export interface HeaderToggleProps {
  on: boolean;
  onToggle: () => void;
}

/** 방 머리글의 Enter 번역 스위치. 켜지면 이 방에서 그냥 Enter 도 미리보기를 거친다. */
export function HeaderToggle({ on, onToggle }: HeaderToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      className="gat-switch"
      aria-checked={on}
      title={t(on ? 'outgoing_enterToggleOn' : 'outgoing_enterToggleOff')}
      onClick={onToggle}
    >
      <span>{t('outgoing_enterToggleLabel')}</span>
      <span className="gat-switch__track" aria-hidden="true">
        <span className="gat-switch__thumb" />
      </span>
    </button>
  );
}
