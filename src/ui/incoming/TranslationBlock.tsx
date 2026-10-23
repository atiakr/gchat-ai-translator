import { t } from '../../i18n/t';

export interface TranslationBlockProps {
  translation: string;
  /** '원문 숨기기' 가 켜진 상태. 블록 클릭으로 원문을 펼치고 접는다. */
  hideOriginal: boolean;
  /** hideOriginal 일 때 원문이 현재 펼쳐져 있는가. */
  originalVisible?: boolean;
  onToggleOriginal?: () => void;
}

/** translated: 원문과 구분되는 한 단계 낮은 톤의 번역 블록 + 작은 '번역됨' 라벨. */
export function TranslationBlock({
  translation,
  hideOriginal,
  originalVisible = false,
  onToggleOriginal,
}: TranslationBlockProps) {
  const text = <span className="gat-block__text">{translation}</span>;
  const label = <span className="gat-block__label">{t('incoming_translatedLabel')}</span>;

  if (hideOriginal && onToggleOriginal) {
    // 원문이 숨겨진 동안 블록 전체가 펼침/접기 버튼이 된다.
    return (
      <button
        type="button"
        className="gat-block gat-block--toggle"
        data-gat="block"
        aria-expanded={originalVisible}
        onClick={onToggleOriginal}
      >
        <span className="gat-block__head">
          {label}
          <span className="gat-block__toggle" data-gat="toggle">
            {originalVisible ? t('incoming_hideOriginal') : t('incoming_showOriginal')}
          </span>
        </span>
        {text}
      </button>
    );
  }

  return (
    <div className="gat-block" data-gat="block">
      <span className="gat-block__head">{label}</span>
      {text}
    </div>
  );
}
