import type { ReactNode } from 'react';
import type { ErrorKind, TranslationStatus } from '../../engine/types';
import { ErrorRow } from './ErrorRow';
import { Placeholder } from './Placeholder';
import { SkippedRow } from './SkippedRow';
import { TranslationBlock, type TranslationBlockVariant } from './TranslationBlock';

export interface IncomingViewProps {
  status: TranslationStatus;
  translation?: string;
  errorKind?: ErrorKind;
  onRetry: () => void;
  /** translated 일 때 원문을 보고 있는가(번역문은 숨김). mount 가 관리한다. */
  originalVisible?: boolean;
  onToggleOriginal?: () => void;
  /**
   * 토글 문구. 기본은 받은 메시지용. `sent` 는 번역해 보낸 내 메시지로, `translation` 자리에 내 원문을 그리고
   * 숨긴 Google 본문이 상대가 받은 번역문이다.
   */
  variant?: TranslationBlockVariant;
}

/** 상태 하나 → 하위 컴포넌트 하나. same_language / no_text 는 아무것도 그리지 않는다. */
export function IncomingView({
  status,
  translation,
  errorKind,
  onRetry,
  originalVisible,
  onToggleOriginal,
  variant,
}: IncomingViewProps) {
  let body: ReactNode = null;
  switch (status) {
    case 'pending':
      body = <Placeholder />;
      break;
    case 'translated':
      body = (
        <TranslationBlock
          translation={translation ?? ''}
          originalVisible={originalVisible}
          onToggleOriginal={onToggleOriginal}
          variant={variant}
        />
      );
      break;
    case 'error':
      body = <ErrorRow errorKind={errorKind} onRetry={onRetry} />;
      break;
    case 'skipped_long':
    case 'skipped_limit':
      body = <SkippedRow reason={status} />;
      break;
    case 'same_language':
    case 'no_text':
      return null;
  }
  return (
    <div className="gat-incoming" data-gat="incoming" data-status={status}>
      {body}
    </div>
  );
}
