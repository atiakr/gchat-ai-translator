import { useEffect, useRef, useState } from 'react';

/**
 * 텍스트 입력용 초안 상태. 글자마다 sync 에 쓰면 Chrome 의 분당 쓰기 한도를 넘길 수 있으므로
 * 입력 중엔 로컬에 두고 `commit()`(blur/Enter) 때만 저장한다. 바깥 값이 바뀌면(다른 기기 동기화 등)
 * 편집 중이 아닐 때 초안을 따라 맞춘다.
 */
export function useDraft(
  value: string,
  onCommit: (next: string) => void,
): {
  draft: string;
  setDraft: (next: string) => void;
  commit: () => void;
  dirty: boolean;
} {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(value);
  }, [value]);

  return {
    draft,
    setDraft: (next) => {
      dirty.current = true;
      setDraft(next);
    },
    commit: () => {
      if (!dirty.current) return;
      dirty.current = false;
      if (draft !== value) onCommit(draft);
    },
    dirty: dirty.current,
  };
}
