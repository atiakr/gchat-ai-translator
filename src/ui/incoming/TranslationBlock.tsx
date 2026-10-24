import { t } from '../../i18n/t';

export type TranslationBlockVariant = 'incoming' | 'sent';

const TOGGLE_LABELS = {
  incoming: { showGoogle: 'incoming_seeOriginal', showOurs: 'incoming_seeTranslation' },
  sent: { showGoogle: 'outgoing_seeSentTranslation', showOurs: 'outgoing_seeMyOriginal' },
} as const;

export interface TranslationBlockProps {
  translation: string;
  /** 원문을 보고 있는가. true 면 번역문을 숨기고 토글만 남긴다. */
  originalVisible?: boolean;
  onToggleOriginal?: () => void;
  /** `sent`: 번역해 보낸 내 메시지. 그린 글이 내 원문, 숨긴 글이 보낸 번역문이라 토글 문구만 다르다. */
  variant?: TranslationBlockVariant;
}

/**
 * translated: 원문 자리를 대신하는 번역문(원문과 같은 글자 크기·색) + 작은 [원문보기]/[번역 보기] 글자 버튼.
 * 원문은 mount 가 감싸 숨기거나 보인다.
 */
export function TranslationBlock({
  translation,
  originalVisible = false,
  onToggleOriginal,
  variant = 'incoming',
}: TranslationBlockProps) {
  const labels = TOGGLE_LABELS[variant];
  return (
    <div
      className={originalVisible ? 'gat-translated gat-translated--original' : 'gat-translated'}
      data-gat="block"
    >
      {originalVisible ? null : (
        <span className="gat-translated__text" data-gat="translation">
          {translation}
        </span>
      )}
      {onToggleOriginal ? (
        <button
          type="button"
          className="gat-toggle"
          data-gat="toggle"
          aria-pressed={originalVisible}
          onClick={onToggleOriginal}
        >
          {originalVisible ? t(labels.showOurs) : t(labels.showGoogle)}
        </button>
      ) : null}
    </div>
  );
}
