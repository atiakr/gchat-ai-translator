import { applyTheme, type Theme } from './theme';
import tokensCss from './tokens.css?inline';

export interface ShadowHost {
  host: HTMLElement;
  root: ShadowRoot;
}

/**
 * 채팅 화면 위 UI 용 Shadow DOM 호스트. 토큰 CSS 와 컴포넌트 CSS 를 shadow root 안에만
 * 주입해 Google Chat 스타일과 섞이지 않게 한다. 호스트는 block 이며 자기 높이 외에는 바깥 레이아웃에
 * 영향을 주지 않는다(`contain: content`).
 */
export function createShadowHost(componentCss = '', tagName = 'gat-host'): ShadowHost {
  const host = document.createElement(tagName);
  host.style.display = 'block';
  host.style.contain = 'content';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = componentCss ? `${tokensCss}\n${componentCss}` : tokensCss;
  root.appendChild(style);
  return { host, root };
}

/** 호스트에 data-theme 을 건다. 토큰 CSS 가 `:host([data-theme="dark"])` 로 분기한다. */
export function setHostTheme(host: HTMLElement, theme: Theme): void {
  applyTheme(host, theme);
}
