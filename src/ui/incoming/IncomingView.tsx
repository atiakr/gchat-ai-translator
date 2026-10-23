import type { ReactNode } from 'react';
import type { ErrorKind, TranslationStatus } from '../../engine/types';
import { ErrorRow } from './ErrorRow';
import { Placeholder } from './Placeholder';
import { SkippedRow } from './SkippedRow';
import { TranslationBlock } from './TranslationBlock';

export interface IncomingViewProps {
  status: TranslationStatus;
  translation?: string;
  errorKind?: ErrorKind;
  onRetry: () => void;
  /** translated 일 때 원문을 보고 있는가(번역문은 숨김). mount 가 관리한다. */
  originalVisible?: boolean;
  onToggleOriginal?: () => void;
}

/** 상태 하나 → 하위 컴포넌트 하나. same_language / no_text 는 아무것도 그리지 않는다. */
export function IncomingView({
  status,
  translation,
  errorKind,
  onRetry,
  originalVisible,
  onToggleOriginal,
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
