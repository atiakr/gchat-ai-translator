import { useEffect } from 'react';
import { applyTheme, systemTheme, watchSystemTheme } from '../theme';

/** 옵션·팝업: 문서 루트에 시스템 테마를 걸고 변화를 따라간다. */
export function useSystemTheme(): void {
  useEffect(() => {
    const root = document.documentElement;
    applyTheme(root, systemTheme());
    return watchSystemTheme((theme) => applyTheme(root, theme));
  }, []);
}
