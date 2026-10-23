import { t } from '../../i18n/t';

export interface SentOriginalProps {
  original: string;
}

/** 번역해 보낸 내 메시지 아래에 흐리게 붙는 원문 한 줄. */
export function SentOriginal({ original }: SentOriginalProps) {
  return (
    <div className="gat-sent-original">
      <span className="gat-sent-original__label">{t('outgoing_myOriginal')}</span>
      <span className="gat-sent-original__text">{original}</span>
    </div>
  );
}
