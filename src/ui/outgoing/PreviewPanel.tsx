import { useId } from 'react';
import type { LanguageCode } from '../../config/languages';
import type { ErrorKind } from '../../engine/types';
import type { RichContentReport } from '../../gchat/adapter';
import { type I18nKey, t } from '../../i18n/t';
import { LanguageSelect } from './LanguageSelect';

/** 번역 호출 실패 종류. 서비스 오류 분류 + 메시징 자체가 실패한 경우(`unknown`). */
export type OutgoingError = ErrorKind | 'unknown';

const ERROR_KEYS: Record<OutgoingError, I18nKey> = {
  auth: 'outgoing_error_auth',
  rate_limit: 'outgoing_error_rate_limit',
  server: 'outgoing_error_server',
  bad_request: 'outgoing_error_bad_request',
  parse: 'outgoing_error_parse',
  unknown: 'outgoing_error_unknown',
};

export interface PreviewPanelProps {
  original: string;
  translation: string;
  lang: LanguageCode;
  saveAsDefault: boolean;
  translating: boolean;
  error: OutgoingError | null;
  rich: RichContentReport;
  /** 보내기 동작이 실패해 번역문이 입력창에 남아 있는 상태. */
  sendFailed: boolean;
  onTranslationChange: (text: string) => void;
  onLanguageChange: (code: LanguageCode) => void;
  onSaveAsDefaultChange: (value: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

export function hasRichContent(rich: RichContentReport): boolean {
  return rich.mentions || rich.formatting || rich.attachments;
}

/** 입력창 위 미리보기 패널. 상태는 모두 props 로 받는다. */
export function PreviewPanel(props: PreviewPanelProps) {
  const {
    original,
    translation,
    lang,
    saveAsDefault,
    translating,
    error,
    rich,
    sendFailed,
    onTranslationChange,
    onLanguageChange,
    onSaveAsDefaultChange,
    onConfirm,
    onCancel,
    onRetry,
  } = props;
  const id = useId();
  const canConfirm = !translating && translation.trim().length > 0 && !sendFailed;

  return (
    <section
      className="gat-panel"
      aria-label={t('outgoing_panelTitle')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <header className="gat-panel__header">
        <h2 className="gat-panel__title">{t('outgoing_panelTitle')}</h2>
        {translating ? (
          <span className="gat-panel__status" role="status">
            <span className="gat-spinner" aria-hidden="true" />
            {t('outgoing_translating')}
          </span>
        ) : null}
      </header>

      {hasRichContent(rich) ? (
        <div className="gat-banner gat-banner--warn" role="note">
          {t('outgoing_richWarning')}
        </div>
      ) : null}

      {sendFailed ? (
        <div className="gat-banner gat-banner--danger" role="alert">
          {t('outgoing_sendFailed')}
        </div>
      ) : null}

      {error && !sendFailed ? (
        <div className="gat-banner gat-banner--danger" role="alert">
          <span>{t(ERROR_KEYS[error])}</span>
          <button
            type="button"
            className="gat-btn gat-btn--ghost gat-btn--sm"
            onClick={onRetry}
            disabled={translating}
          >
            {t('common_retry')}
          </button>
        </div>
      ) : null}

      <div className="gat-field">
        <span className="gat-field__label">{t('outgoing_original')}</span>
        <p className="gat-original">{original}</p>
      </div>

      <div className="gat-field">
        <label className="gat-field__label" htmlFor={`${id}-translation`}>
          {t('outgoing_translation')}
        </label>
        <textarea
          id={`${id}-translation`}
          className="gat-textarea"
          value={translation}
          placeholder={t('outgoing_translationPlaceholder')}
          disabled={translating || sendFailed}
          onChange={(e) => onTranslationChange(e.target.value)}
        />
      </div>

      <div className="gat-panel__row">
        <label className="gat-inline" htmlFor={`${id}-lang`}>
          {t('outgoing_language')}
          <LanguageSelect
            id={`${id}-lang`}
            aria-label={t('outgoing_language')}
            value={lang}
            onChange={onLanguageChange}
            disabled={sendFailed}
          />
        </label>
        <label className="gat-inline gat-checkbox">
          <input
            type="checkbox"
            checked={saveAsDefault}
            disabled={sendFailed}
            onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
          />
          {t('outgoing_saveAsDefault')}
        </label>
      </div>

      <div className="gat-panel__actions">
        {sendFailed ? (
          <button type="button" className="gat-btn gat-btn--ghost" onClick={onCancel}>
            {t('outgoing_close')}
          </button>
        ) : (
          <>
            <button type="button" className="gat-btn gat-btn--ghost" onClick={onCancel}>
              {t('common_cancel')}
            </button>
            <button
              type="button"
              className="gat-btn gat-btn--primary"
              onClick={onConfirm}
              disabled={!canConfirm}
            >
              {t('common_confirm')}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
