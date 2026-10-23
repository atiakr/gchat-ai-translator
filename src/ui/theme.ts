export type Theme = 'light' | 'dark';

/** 옵션·팝업: 시스템 테마. */
export function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function watchSystemTheme(cb: (t: Theme) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e: MediaQueryListEvent) => cb(e.matches ? 'dark' : 'light');
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}

/**
 * 채팅 화면 위 UI: Google Chat 의 현재 테마. 배경 밝기로 판정한다(셀렉터 의존 없음).
 * 어댑터가 더 정확한 신호를 알면 그쪽을 우선 쓴다.
 */
export function themeFromBackground(el: Element | null): Theme {
  if (!el || typeof getComputedStyle === 'undefined') return 'light';
  const bg = getComputedStyle(el).backgroundColor;
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return 'light';
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 128 ? 'dark' : 'light';
}

/** 호스트 요소에 테마 속성을 건다. 토큰 CSS 는 `[data-theme]` 로 분기한다. */
export function applyTheme(host: HTMLElement, theme: Theme): void {
  host.dataset.theme = theme;
}
