import { t } from '../../i18n/t';

export interface TranslationBlockProps {
  translation: string;
  /** 원문을 보고 있는가. true 면 번역문을 숨기고 토글만 남긴다. */
  originalVisible?: boolean;
  onToggleOriginal?: () => void;
}

/**
 * translated: 원문 자리를 대신하는 번역문(원문과 같은 글자 크기·색) + 작은 [원문보기]/[번역 보기] 글자 버튼.
 * 원문은 mount 가 감싸 숨기거나 보인다.
 */
export function TranslationBlock({
  translation,
  originalVisible = false,
  onToggleOriginal,
}: TranslationBlockProps) {
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
          {originalVisible ? t('incoming_seeTranslation') : t('incoming_seeOriginal')}
        </button>
      ) : null}
    </div>
  );
}
