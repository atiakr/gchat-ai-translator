import { t } from '../../i18n/t';
import { ERROR_KEYS, type OutgoingError } from './PreviewPanel';

export interface QuickStatusProps {
  error: OutgoingError | null;
  translating: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onOpenPreview: () => void;
}

/** 바로 번역: 번역이 끝나면 확인 없이 보낸다. 기다리는 동안과 실패했을 때 입력창 위에 띄우는 작은 줄. */
export function QuickStatus({
  error,
  translating,
  onCancel,
  onRetry,
  onOpenPreview,
}: QuickStatusProps) {
  return (
    <section
      className="gat-panel gat-panel--compact"
      aria-label={t('outgoing_panelTitle')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      {error ? (
        <>
          <div className="gat-banner gat-banner--danger" role="alert">
            {t('outgoing_quickNotSent')} {t(ERROR_KEYS[error])}
          </div>
          <div className="gat-panel__actions">
            <button type="button" className="gat-btn gat-btn--ghost" onClick={onCancel}>
              {t('common_cancel')}
            </button>
            <button type="button" className="gat-btn gat-btn--ghost" onClick={onOpenPreview}>
              {t('outgoing_quickOpenPreview')}
            </button>
            <button
              type="button"
              className="gat-btn gat-btn--primary"
              onClick={onRetry}
              disabled={translating}
            >
              {t('common_retry')}
            </button>
          </div>
        </>
      ) : (
        <div className="gat-quick">
          <span className="gat-panel__status" role="status">
            <span className="gat-spinner" aria-hidden="true" />
            {t('outgoing_quickWaiting')}
          </span>
          <button type="button" className="gat-btn gat-btn--ghost gat-btn--sm" onClick={onCancel}>
            {t('common_cancel')}
          </button>
        </div>
      )}
    </section>
  );
}
