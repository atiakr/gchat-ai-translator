import { createShadowHost as createBaseShadowHost, setHostTheme } from '../shadow';
import type { Theme } from '../theme';
import stylesCss from './styles.css?inline';

/**
 * 발신 번역 UI 의 Shadow DOM 호스트. 격리·토큰 주입은 공용 `src/ui/shadow.ts` 가 하고,
 * 여기서는 발신 UI 표식(`data-gat-outgoing`)과 React 를 붙일 컨테이너만 더한다.
 */
export type OutgoingHostKind = 'button' | 'panel' | 'sent-original';

export interface ShadowHost {
  /** 페이지 DOM 에 삽입되는 호스트 요소(`data-gat-outgoing="<kind>"`). */
  el: HTMLElement;
  root: ShadowRoot;
  /** React 루트를 붙이는 컨테이너. */
  mount: HTMLElement;
  setTheme(theme: Theme): void;
  /** 인라인 `display` 가 `[hidden]` 기본 스타일을 이기므로 `display` 도 함께 바꾼다. */
  setHidden(hidden: boolean): void;
  remove(): void;
}

export function createShadowHost(kind: OutgoingHostKind, theme: Theme): ShadowHost {
  const { host: el, root } = createBaseShadowHost(stylesCss, 'div');
  el.dataset.gatOutgoing = kind;
  if (kind === 'button') {
    // 버튼 호스트만 예외로 inline 이다: 보내기 버튼과 같은 줄(입력창 툴바)에 나란히 놓여야 하기 때문.
    // `contain: content` 는 그대로 두어 바깥 레이아웃에는 자기 크기만큼만 영향을 준다.
    el.style.display = 'inline-flex';
    el.style.verticalAlign = 'middle';
  }
  const shownDisplay = el.style.display;
  const mount = document.createElement('div');
  mount.className = 'gat-root';
  root.append(mount);
  setHostTheme(el, theme);
  return {
    el,
    root,
    mount,
    setTheme: (next) => setHostTheme(el, next),
    setHidden: (hidden) => {
      el.hidden = hidden;
      el.style.display = hidden ? 'none' : shownDisplay;
    },
    remove: () => el.remove(),
  };
}
