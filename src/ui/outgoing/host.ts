import { applyTheme, type Theme } from '../theme';
import tokensCss from '../tokens.css?inline';
import stylesCss from './styles.css?inline';

/**
 * 발신 번역 UI 전용 최소 Shadow DOM 호스트. 공용 shadow 도우미가 생기면 그쪽으로 옮긴다.
 * 페이지 스타일과 격리하려고 open shadow root 에 토큰 + 컴포넌트 CSS 를 함께 넣는다.
 */
export type OutgoingHostKind = 'button' | 'panel' | 'sent-original';

export interface ShadowHost {
  /** 페이지 DOM 에 삽입되는 호스트 요소(`data-gat-outgoing="<kind>"`). */
  el: HTMLElement;
  root: ShadowRoot;
  /** React 루트를 붙이는 컨테이너. */
  mount: HTMLElement;
  setTheme(theme: Theme): void;
  remove(): void;
}

export function createShadowHost(kind: OutgoingHostKind, theme: Theme): ShadowHost {
  const el = document.createElement('div');
  el.dataset.gatOutgoing = kind;
  el.style.display = kind === 'button' ? 'inline-flex' : 'block';
  if (kind === 'button') el.style.verticalAlign = 'middle';
  const root = el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `${tokensCss}\n${stylesCss}`;
  const mount = document.createElement('div');
  mount.className = 'gat-root';
  root.append(style, mount);
  applyTheme(el, theme);
  return {
    el,
    root,
    mount,
    setTheme: (next) => applyTheme(el, next),
    remove: () => el.remove(),
  };
}
