import { t } from '../../i18n/t';

export type SkippedReason = 'skipped_long' | 'skipped_limit';

export interface SkippedRowProps {
  reason: SkippedReason;
}

/** skipped_long / skipped_limit: 작은 회색 안내 한 줄. (나중에 수동 번역 버튼이 붙을 자리.) */
export function SkippedRow({ reason }: SkippedRowProps) {
  return (
    <div className="gat-skipped" data-gat="skipped" data-reason={reason}>
      {reason === 'skipped_long' ? t('incoming_skippedLong') : t('incoming_skippedLimit')}
    </div>
  );
}
