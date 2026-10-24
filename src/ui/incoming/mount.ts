import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { getOwnContentNodes, mutateUnobserved } from '../../gchat/adapter';
import { createShadowHost, setHostTheme } from '../shadow';
import type { Theme } from '../theme';
import { IncomingView, type IncomingViewProps } from './IncomingView';
import { HOST_ATTR, HOST_TAG, ORIGINAL_ATTR } from './markers';
import stylesCss from './styles.css?inline';

export { HOST_ATTR, HOST_TAG, ORIGINAL_ATTR } from './markers';

/** content script 가 넘기는 표시 정보. 원문/번역 토글 상태는 mount 가 내부에서 관리한다. */
export type IncomingProps = Omit<IncomingViewProps, 'originalVisible' | 'onToggleOriginal'>;

export interface IncomingHandle {
  readonly host: HTMLElement;
  /** 부분 갱신. 넘긴 필드만 바뀐다. */
  update(props: Partial<IncomingProps>): void;
  setTheme(theme: Theme): void;
  /**
   * 호스트(번역 상태면 원문 감싸개까지)가 아직 본문 안 제자리에 있는가. Google Chat 이 본문을 다시 그려
   * 지웠으면 false — 호출자는 `mountIncoming` 을 다시 불러 복구한다.
   */
  isAttached(): boolean;
  /** 원문을 제자리로 되돌리고 감싸개·호스트를 DOM 에서 제거한다. */
  unmount(): void;
}

/** 원문 감싸기 상태. */
interface Wrap {
  span: HTMLElement;
  /** 감싼 노드 → 감싸기 전 그 노드 뒤의 첫 "감싸지 않은" 형제(없으면 null = 끝). */
  next: Map<Node, Node | null>;
}

interface Entry {
  /** 이 항목을 가진 묶음. 제거할 때 여기서 지운다. */
  entries: Map<HTMLElement, Entry>;
  container: HTMLElement;
  /** 본문 요소. 호스트와 원문 감싸개는 이 안에 있다. */
  anchor: HTMLElement;
  host: HTMLElement;
  root: Root;
  handle: IncomingHandle;
  props: IncomingProps | null;
  /** translated 상태에서 원문을 펼쳐 보고 있는가(번역문은 숨김). */
  originalVisible: boolean;
  wrap: Wrap | null;
  alive: boolean;
}

/* ------------------------------------------------------------------ */
/* 원문 감싸기 · 되돌리기                                                */
/* ------------------------------------------------------------------ */

/** 메시지 자체의 글을 `<span data-gat-original>` 하나로 감싼다(첫 노드 자리에). 감쌀 것이 없으면 null. */
function wrapOwn(anchor: HTMLElement): Wrap | null {
  const nodes = getOwnContentNodes(anchor);
  if (nodes.length === 0) return null;
  const own = new Set(nodes);
  const next = new Map<Node, Node | null>();
  for (const node of nodes) {
    let sibling = node.nextSibling;
    while (sibling && own.has(sibling)) sibling = sibling.nextSibling;
    next.set(node, sibling);
  }
  const span = anchor.ownerDocument.createElement('span');
  span.setAttribute(ORIGINAL_ATTR, '');
  anchor.insertBefore(span, nodes[0] ?? null);
  for (const node of nodes) span.appendChild(node);
  return { span, next };
}

/** 감쌌던 노드를 감싸기 전 자리로 옮기고 감싸개를 지운다. 감싸개가 이미 떨어져 나갔으면 그냥 잊는다. */
function unwrapOwn(wrap: Wrap, host: HTMLElement): void {
  const { span, next } = wrap;
  const parent = span.parentNode;
  if (!parent) return;
  for (const node of Array.from(span.childNodes)) {
    const ref = next.get(node);
    if (ref === undefined) {
      // 감싼 뒤 감싸개 안에 새로 생긴 노드: 감싸개 자리에 둔다.
      parent.insertBefore(node, span);
    } else if (ref === null) {
      // 원래 끝에 있던 노드: 확장 호스트 앞(= Google 노드 중 마지막).
      parent.insertBefore(node, host.parentNode === parent ? host : null);
    } else if (ref.parentNode === parent) {
      parent.insertBefore(node, ref);
    } else {
      parent.insertBefore(node, span);
    }
  }
  span.remove();
}

/** 감싸개가 아직 이 본문 안에 있는가. */
function wrapIntact(entry: Entry): boolean {
  return entry.wrap !== null && entry.wrap.span.parentNode === entry.anchor;
}

/**
 * 상태에 맞게 본문 DOM 을 맞춘다: translated 면 원문을 감싸 숨기고(펼침 중이면 보이고) 호스트를 감싸개 바로 뒤에,
 * 그 밖의 상태면 원문을 되돌리고 호스트를 본문 끝에 둔다. 본문이 문서에서 떨어졌으면 false.
 */
function syncDom(entry: Entry): boolean {
  const { anchor, host } = entry;
  if (!anchor.isConnected) return false;
  let ok = true;
  mutateUnobserved(() => {
    // 본문이 바뀌었거나 Google 이 감싸개를 지웠으면 옛 감싸기는 정리(가능하면 되돌림)하고 새로 감싼다.
    if (entry.wrap && !wrapIntact(entry)) {
      unwrapOwn(entry.wrap, host);
      entry.wrap = null;
    }
    const translated = entry.props?.status === 'translated';
    if (translated && !entry.wrap) entry.wrap = wrapOwn(anchor);
    if (!translated && entry.wrap) {
      unwrapOwn(entry.wrap, host);
      entry.wrap = null;
    }
    if (entry.wrap) {
      const { span } = entry.wrap;
      const hide = !entry.originalVisible;
      span.hidden = hide;
      span.style.display = hide ? 'none' : '';
      if (span.nextSibling !== host) span.after(host);
    } else if (host.parentNode !== anchor || anchor.lastChild !== host) {
      anchor.appendChild(host);
    }
    ok = host.parentNode === anchor;
  });
  return ok;
}

/* ------------------------------------------------------------------ */
/* 렌더                                                                 */
/* ------------------------------------------------------------------ */

function render(entry: Entry): void {
  if (!entry.alive) return;
  const p = entry.props;
  if (p === null) {
    entry.root.render(null);
  } else {
    entry.root.render(
      createElement(IncomingView, {
        ...p,
        originalVisible: entry.originalVisible,
        onToggleOriginal: p.status === 'translated' ? () => toggleOriginal(entry) : undefined,
      }),
    );
  }
  syncDom(entry);
}

function toggleOriginal(entry: Entry): void {
  entry.originalVisible = !entry.originalVisible;
  render(entry);
}

function destroy(entry: Entry): void {
  if (!entry.alive) return;
  entry.alive = false;
  entry.entries.delete(entry.container);
  try {
    entry.root.unmount();
  } catch {
    // React 가 이미 정리된 경우 등. 원문 복구는 계속한다.
  }
  mutateUnobserved(() => {
    if (entry.wrap) unwrapOwn(entry.wrap, entry.host);
    entry.wrap = null;
    entry.host.remove();
  });
}

function isAttached(entry: Entry): boolean {
  if (!entry.alive || !entry.anchor.isConnected || entry.host.parentNode !== entry.anchor) {
    return false;
  }
  if (entry.props?.status === 'translated') return wrapIntact(entry) || entry.wrap === null;
  return true;
}

/** `mountIncoming` 의 본체. 넘긴 묶음에 항목을 둔다. */
function mountIn(
  entries: Map<HTMLElement, Entry>,
  container: HTMLElement | null | undefined,
  anchor: HTMLElement | null | undefined,
  theme: Theme,
  initial?: IncomingProps,
): IncomingHandle | null {
  try {
    if (!container || !anchor) return null;

    const existing = entries.get(container);
    if (existing) {
      if (!anchor.isConnected) {
        destroy(existing);
        return null;
      }
      existing.anchor = anchor;
      setHostTheme(existing.host, theme);
      if (initial) existing.handle.update(initial);
      else syncDom(existing);
      if (!isAttached(existing)) {
        destroy(existing);
        return null;
      }
      return existing.handle;
    }

    if (!anchor.isConnected) return null;

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
          onRetry: props.onRetry ?? prev?.onRetry ?? (() => {}),
          translation: 'translation' in props ? props.translation : prev?.translation,
          errorKind: 'errorKind' in props ? props.errorKind : prev?.errorKind,
          variant: props.variant ?? prev?.variant,
        };
        // 번역 상태를 벗어나거나 번역문이 바뀌면 다시 번역문을 보이는 쪽으로 돌린다.
        if (next.status !== 'translated' || next.translation !== prev?.translation) {
          entry.originalVisible = false;
        }
        entry.props = next;
        render(entry);
      },
      setTheme(t) {
        setHostTheme(host, t);
      },
      isAttached() {
        return isAttached(entry);
      },
      unmount() {
        destroy(entry);
      },
    };
    const entry: Entry = {
      entries,
      container,
      anchor,
      host,
      root: createRoot(mountNode),
      handle,
      props: initial ?? null,
      originalVisible: false,
      wrap: null,
      alive: true,
    };

    entries.set(container, entry);
    render(entry);
    if (!isAttached(entry)) {
      destroy(entry);
      return null;
    }
    return entry.handle;
  } catch {
    return null;
  }
}

export interface IncomingMounts {
  mount: typeof mountIncoming;
  getMounted: typeof getMounted;
  unmountAll: typeof unmountAll;
  mountedCount: typeof mountedCount;
}

/**
 * 호스트 묶음 하나를 만든다. 수신 번역은 아래 기본 묶음을 쓰고, 번역해 보낸 내 메시지(원문을 그 자리에 보임)는
 * 발신 UI 가 따로 만든 묶음을 써서 수신 쪽 `unmountAll` 에 휩쓸리지 않는다.
 */
export function createIncomingMounts(): IncomingMounts {
  const entries = new Map<HTMLElement, Entry>();
  return {
    mount: (container, anchor, theme, initial) =>
      mountIn(entries, container, anchor, theme, initial),
    getMounted: (container) => (container ? (entries.get(container)?.handle ?? null) : null),
    unmountAll: () => {
      for (const entry of Array.from(entries.values())) destroy(entry);
    },
    mountedCount: () => entries.size,
  };
}

const defaultMounts = createIncomingMounts();

/**
 * 메시지 컨테이너 하나에 번역 UI 호스트 하나를 anchor(본문) **안**에 둔다. translated 면 메시지 자체의 글(인용 블록
 * 제외)을 감싸 숨기고 그 자리 바로 뒤에 번역문을 그린다. 이미 있으면 재사용하며, 본문이 다시 그려져 감싸개·호스트가
 * 지워졌으면 복구한다. anchor 가 없거나 문서에서 떨어져 있으면 null (절대 throw 하지 않음).
 */
export function mountIncoming(
  container: HTMLElement | null | undefined,
  anchor: HTMLElement | null | undefined,
  theme: Theme,
  initial?: IncomingProps,
): IncomingHandle | null {
  return defaultMounts.mount(container, anchor, theme, initial);
}

export function getMounted(container: HTMLElement | null | undefined): IncomingHandle | null {
  return defaultMounts.getMounted(container);
}

/** 전역 스위치 끔·방 끔: 모든 호스트를 즉시 제거하고 감쌌던 원문을 제자리로 되돌린다. */
export function unmountAll(): void {
  defaultMounts.unmountAll();
}

/** 테스트·디버그용. 현재 마운트된 컨테이너 수. */
export function mountedCount(): number {
  return defaultMounts.mountedCount();
}
