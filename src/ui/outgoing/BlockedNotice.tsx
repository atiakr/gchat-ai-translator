import { t } from '../../i18n/t';

export interface BlockedNoticeProps {
  onClose: () => void;
  /** 이 방의 Enter 번역을 끈다. */
  onTurnOff: () => void;
}

/** Enter 번역이 켜진 방에서 번역할 수 없어 전송을 막았을 때 입력창 위에 띄우는 안내. */
export function BlockedNotice({ onClose, onTurnOff }: BlockedNoticeProps) {
  return (
    <section
      className="gat-panel"
      aria-label={t('outgoing_panelTitle')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="gat-banner gat-banner--danger" role="alert">
        {t('outgoing_enterBlocked')}
      </div>
      <div className="gat-panel__actions">
        <button type="button" className="gat-btn gat-btn--ghost" onClick={onTurnOff}>
          {t('outgoing_enterTurnOff')}
        </button>
        <button type="button" className="gat-btn gat-btn--primary" onClick={onClose}>
          {t('outgoing_close')}
        </button>
      </div>
    </section>
  );
}
