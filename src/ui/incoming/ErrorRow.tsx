import type { ErrorKind } from '../../engine/types';
import { type I18nKey, t } from '../../i18n/t';

export interface ErrorRowProps {
  errorKind?: ErrorKind;
  /** 이 메시지 한 건만 다시 호출한다. */
  onRetry: () => void;
}

const ERROR_KEYS: Record<ErrorKind, I18nKey> = {
  auth: 'incoming_errorAuth',
  rate_limit: 'incoming_errorRateLimit',
  server: 'incoming_errorServer',
  bad_request: 'incoming_errorBadRequest',
  parse: 'incoming_errorParse',
};

export function errorMessageKey(kind: ErrorKind | undefined): I18nKey {
  return kind ? ERROR_KEYS[kind] : 'incoming_errorUnknown';
}

/** error: 짧은 이유 + '재시도' 버튼. */
export function ErrorRow({ errorKind, onRetry }: ErrorRowProps) {
  return (
    <div className="gat-error" role="alert" data-gat="error">
      <span>{t(errorMessageKey(errorKind))}</span>
      <button type="button" className="gat-error__retry" onClick={onRetry} data-gat="retry">
        {t('incoming_retry')}
      </button>
    </div>
  );
}
