import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createShadowHost, setHostTheme } from '../shadow';
import type { Theme } from '../theme';
import { IncomingView, type IncomingViewProps } from './IncomingView';
import stylesCss from './styles.css?inline';

/** content script 가 넘기는 표시 정보. 펼침 상태는 mount 가 내부에서 관리한다. */
export type IncomingProps = Omit<IncomingViewProps, 'originalVisible' | 'onToggleOriginal'>;

export interface IncomingHandle {
  readonly host: HTMLElement;
  /** 부분 갱신. 넘긴 필드만 바뀐다. */
  update(props: Partial<IncomingProps>): void;
  setTheme(theme: Theme): void;
  /** 호스트를 DOM 에서 제거하고 숨겼던 원문을 복구한다. */
  unmount(): void;
}

export const HOST_TAG = 'gat-incoming';
export const HOST_ATTR = 'data-gat-incoming';

interface Entry {
  container: HTMLElement;
  anchor: HTMLElement;
  host: HTMLElement;
  root: Root;
  handle: IncomingHandle;
  props: IncomingProps | null;
  originalVisible: boolean;
  /** 원문을 숨기기 전 inline display 값. null 이면 숨기지 않은 상태. */
  savedDisplay: string | null;
  alive: boolean;
}

const entries = new Map<HTMLElement, Entry>();

function shouldHideOriginal(entry: Entry): boolean {
  const p = entry.props;
  return p?.hideOriginal === true && p.status === 'translated' && !entry.originalVisible;
}

function syncAnchorVisibility(entry: Entry): void {
  const { anchor } = entry;
  if (shouldHideOriginal(entry)) {
    if (entry.savedDisplay === null) {
      entry.savedDisplay = anchor.style.display;
      anchor.style.display = 'none';
    }
  } else if (entry.savedDisplay !== null) {
    anchor.style.display = entry.savedDisplay;
    entry.savedDisplay = null;
  }
}

function render(entry: Entry): void {
  if (!entry.alive) return;
  const p = entry.props;
  if (p === null) {
    entry.root.render(null);
  } else {
    const interactive = p.hideOriginal && p.status === 'translated';
    entry.root.render(
      createElement(IncomingView, {
        ...p,
        originalVisible: entry.originalVisible,
        onToggleOriginal: interactive ? () => toggleOriginal(entry) : undefined,
      }),
    );
  }
  syncAnchorVisibility(entry);
}

function toggleOriginal(entry: Entry): void {
  entry.originalVisible = !entry.originalVisible;
  render(entry);
}

function placeAfter(anchor: HTMLElement, host: HTMLElement): boolean {
  try {
    if (!anchor.isConnected || !anchor.parentNode) return false;
    if (anchor.nextSibling !== host) anchor.after(host);
    return true;
  } catch {
    return false;
  }
}

function destroy(entry: Entry): void {
  if (!entry.alive) return;
  entry.alive = false;
  entries.delete(entry.container);
  if (entry.savedDisplay !== null) {
    entry.anchor.style.display = entry.savedDisplay;
    entry.savedDisplay = null;
  }
  try {
    entry.root.unmount();
  } catch {
    // React 가 이미 정리된 경우 등. 호스트 제거는 계속한다.
  }
  entry.host.remove();
}

/**
 * 메시지 컨테이너 하나에 번역 UI 호스트 하나를 anchor(본문) 바로 다음 형제로 끼운다.
 * 이미 있으면 재사용한다. anchor 가 없거나 문서에서 떨어져 있으면 null (invariant 6: 절대 throw 하지 않음).
 */
export function mountIncoming(
  container: HTMLElement | null | undefined,
  anchor: HTMLElement | null | undefined,
  theme: Theme,
  initial?: IncomingProps,
): IncomingHandle | null {
  try {
    if (!container || !anchor) return null;

    const existing = entries.get(container);
    if (existing) {
      if (existing.anchor !== anchor) {
        // 본문 요소가 바뀜(재렌더). 옛 본문은 복구하고 새 본문에 붙인다.
        if (existing.savedDisplay !== null) {
          existing.anchor.style.display = existing.savedDisplay;
          existing.savedDisplay = null;
        }
        existing.anchor = anchor;
      }
      if (!placeAfter(anchor, existing.host)) {
        destroy(existing);
        return null;
      }
      setHostTheme(existing.host, theme);
      if (initial) existing.handle.update(initial);
      else syncAnchorVisibility(existing);
      return existing.handle;
    }

    if (!anchor.isConnected || !anchor.parentNode) return null;

    const { host, root: shadowRoot } = createShadowHost(stylesCss, HOST_TAG);
    host.setAttribute(HOST_ATTR, '');
    setHostTheme(host, theme);
    const mountNode = document.createElement('div');
    shadowRoot.appendChild(mountNode);

    const handle: IncomingHandle = {
      host,
      update(props) {
        if (!entry.alive) return;
        const prev = entry.props;
        const next: IncomingProps = {
          status: props.status ?? prev?.status ?? 'pending',
          hideOriginal: props.hideOriginal ?? prev?.hideOriginal ?? false,
          onRetry: props.onRetry ?? prev?.onRetry ?? (() => {}),
          translation: 'translation' in props ? props.translation : prev?.translation,
          errorKind: 'errorKind' in props ? props.errorKind : prev?.errorKind,
        };
        // 원문 숨기기가 꺼지거나 번역 상태를 벗어나면 펼침 상태를 초기화한다.
        if (!next.hideOriginal || next.status !== 'translated') entry.originalVisible = false;
        entry.props = next;
        render(entry);
      },
      setTheme(t) {
        setHostTheme(host, t);
      },
      unmount() {
        destroy(entry);
      },
    };
    const entry: Entry = {
      container,
      anchor,
      host,
      root: createRoot(mountNode),
      handle,
      props: initial ?? null,
      originalVisible: false,
      savedDisplay: null,
      alive: true,
    };

    if (!placeAfter(anchor, host)) return null;
    entries.set(container, entry);
    render(entry);
    return entry.handle;
  } catch {
    return null;
  }
}

export function getMounted(container: HTMLElement | null | undefined): IncomingHandle | null {
  if (!container) return null;
  return entries.get(container)?.handle ?? null;
}

/** 전역 스위치 끔·방 끔: 모든 호스트를 즉시 제거하고 숨긴 원문을 복구한다. */
export function unmountAll(): void {
  for (const entry of Array.from(entries.values())) destroy(entry);
}

/** 테스트·디버그용. 현재 마운트된 컨테이너 수. */
export function mountedCount(): number {
  return entries.size;
}
