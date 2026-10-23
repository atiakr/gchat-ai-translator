/**
 * 확장이 Google Chat 본문 안에 끼우는 요소의 표식. React 를 import 하지 않아 어댑터도 쓸 수 있다.
 * - 원문 감싸개: 번역 중 메시지 자체의 글(인용 블록 제외)을 감싸 숨기는 `<span data-gat-original>`.
 * - 수신 호스트: 번역문·상태 줄을 그리는 Shadow DOM 호스트 `<gat-incoming data-gat-incoming>`.
 */
export const HOST_TAG = 'gat-incoming';
export const HOST_ATTR = 'data-gat-incoming';
export const ORIGINAL_ATTR = 'data-gat-original';

function asElement(node: Node | null | undefined): Element | null {
  return node && node.nodeType === Node.ELEMENT_NODE ? (node as Element) : null;
}

/** 수신 호스트인가. */
export function isIncomingHost(node: Node | null | undefined): boolean {
  const el = asElement(node);
  return el?.hasAttribute(HOST_ATTR) === true;
}

/** 원문 감싸개인가. */
export function isOriginalWrapper(node: Node | null | undefined): boolean {
  const el = asElement(node);
  return el?.hasAttribute(ORIGINAL_ATTR) === true;
}

/** 확장이 끼운 요소(호스트·원문 감싸개)인가. */
export function isInjected(node: Node | null | undefined): boolean {
  return isIncomingHost(node) || isOriginalWrapper(node);
}
