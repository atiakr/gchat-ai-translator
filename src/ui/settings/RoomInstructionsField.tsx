import { useEffect, useId } from 'react';
import { DEFAULTS } from '../../config/defaults';
import { t } from '../../i18n/t';
import { Field } from '../common/Field';
import { useDraft } from './useDraft';

export interface RoomInstructionsFieldProps {
  value: string;
  onSave: (next: string) => void;
  /**
   * 입력이 멈춘 뒤 이 시간(ms)이 지나면 blur 없이도 저장한다. 팝업은 바깥 클릭으로 닫히면
   * blur 저장이 끝나지 않을 수 있어 이 값을 준다.
   */
  autoSaveMs?: number;
}

/** 대화방 추가 지시문 입력칸. sync 쓰기 한도 때문에 blur(또는 입력이 멈춘 뒤)에만 저장한다. */
export function RoomInstructionsField({ value, onSave, autoSaveMs }: RoomInstructionsFieldProps) {
  const id = useId();
  const draft = useDraft(value, onSave);
  const { commit } = draft;

  useEffect(() => {
    if (autoSaveMs === undefined || !draft.dirty) return;
    // commit 은 렌더마다 새로 만들어지므로 입력할 때마다 타이머가 다시 시작된다.
    const timer = setTimeout(commit, autoSaveMs);
    return () => clearTimeout(timer);
  }, [draft.dirty, autoSaveMs, commit]);

  return (
    <Field
      htmlFor={id}
      label={t('options_roomInstructions')}
      help={t('options_roomInstructionsHelp')}
    >
      <textarea
        id={id}
        className="gat-textarea"
        rows={2}
        maxLength={DEFAULTS.maxRoomInstructionsChars}
        value={draft.draft}
        onChange={(e) => draft.setDraft(e.target.value)}
        onBlur={commit}
        placeholder={t('options_roomInstructionsPlaceholder')}
      />
    </Field>
  );
}
