import { useState } from 'react';
import { t } from '../../i18n/t';

export interface SentOriginalProps {
  original: string;
}

/**
 * 번역해 보낸 내 메시지 아래에 붙는 작은 [원문보기] 글자 버튼. 누르면 그 아래로 원문이 펼쳐진다.
 * 상대가 받은 글(보낸 메시지)은 그대로 두고, 평소에는 접어 둔다.
 */
export function SentOriginal({ original }: SentOriginalProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="gat-sent-original">
      <button
        type="button"
        className="gat-sent-original__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t('outgoing_hideMyOriginal') : t('outgoing_showMyOriginal')}
      </button>
      {open ? <div className="gat-sent-original__text">{original}</div> : null}
    </div>
  );
}
