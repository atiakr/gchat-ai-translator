import { t } from '../../i18n/t';

/** pending: 메시지 바로 아래 작은 로딩 플레이스홀더. */
export function Placeholder() {
  return (
    <div className="gat-placeholder" role="status" aria-live="polite" data-gat="placeholder">
      <span className="gat-placeholder__dot" aria-hidden="true" />
      <span>{t('incoming_loading')}</span>
    </div>
  );
}
