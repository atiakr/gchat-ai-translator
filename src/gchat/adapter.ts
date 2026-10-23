/**
 * Google Chat DOM 어댑터 — 확장의 나머지가 쓰는 안정 인터페이스.
 * DOM 셀렉터는 `./selectors` 에만 있고, 여기서는 그 값을 해석만 한다.
 *
 * 불변식: 어떤 셀렉터가 실패해도 예외 대신 null / [] / false 를 돌려주며,
 * Google Chat 의 기본 동작(입력·전송·스크롤)을 건드리지 않는다. 페이지 전역 객체는 만지지 않는다.
 */
import { type Theme, themeFromBackground } from '../ui/theme';
import {
  ATTR,
  COMPOSER_FORMATTING_TAGS,
  COMPOSER_PLAIN_TAGS,
  SELECTORS,
  safeAttr,
  safeClosest,
  safeMatches,
  safeQuery,
  safeQueryAll,
} from './selectors';
import { extractText } from './text';
import { parseRoomFromUrl } from './url';

export interface RoomInfo {
  /** `dm/<id>` · `space/<id>` (레거시 URL 의 `room/<id>` 는 `space/<id>` 로 정규화). */
  roomId: string;
  /** 사이드바에서 찾은 표시 이름. 못 찾으면 없음(호출자는 roomId 로 대체). */
  name?: string;
}

export interface MessageInfo {
  messageId: string;
  roomId: string;
  /** 발신자 id(`data-user-id`). 없으면 헤딩의 member id, 그것도 없으면 빈 문자열. */
  senderId: string;
  isOwn: boolean;
  /** 본문 평문. 본문 요소가 없으면 빈 문자열. */
  text: string;
  /** 본문 요소가 있는가(이미지·파일 전용 메시지는 false). */
  hasBody: boolean;
  timestampMs?: number;
  /** 시각 표시 텍스트(합성 id 재료). */
  timestampText?: string;
  /** 'dom' = data-id 를 그대로 씀, 'derived' = (방·발신자·시각·본문 해시)로 합성. */
  idSource: 'dom' | 'derived';
  /** 본문 요소. 번역 블록은 이 요소의 다음 형제로 넣는다. */
  bodyEl: HTMLElement | null;
}

export interface ComposerInfo {
  textbox: HTMLElement;
  sendButton: HTMLButtonElement | null;
  /** 작성 영역(`c-wiz[role=region]`). 못 찾으면 공통 조상, 그것도 없으면 textbox 자신. */
  region: HTMLElement;
}

export interface RichContentReport {
  /** @멘션 칩 등 순수 텍스트 래퍼가 아닌 요소. */
  mentions: boolean;
  /** 굵게·기울임·목록·코드 등 서식. */
  formatting: boolean;
  /** 첨부 칩(best effort). */
  attachments: boolean;
}

export type MessageObserverCallback = (
  added: HTMLElement[],
  removed: HTMLElement[],
  changed: HTMLElement[],
) => void;

/* ------------------------------------------------------------------ */
/* 방                                                                  */
/* ------------------------------------------------------------------ */

function normalizeRoomId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^\/+/, '');
  const m = trimmed.match(/^(dm|space|room)\/([^/\s]+)$/);
  if (!m) return null;
  const kind = m[1] === 'room' ? 'space' : m[1];
  return `${kind}/${m[2]}`;
}

function mainRoomId(): string | null {
  const main = safeQuery(document, SELECTORS.conversationRoot);
  const fromMain = normalizeRoomId(safeAttr(main, ATTR.groupId));
  if (fromMain) return fromMain;
  const soft = safeQuery(document, SELECTORS.softView);
  return normalizeRoomId(safeAttr(soft, ATTR.softViewId));
}

function urlRoomId(url: string | undefined): string | null {
  const href = url ?? (typeof location !== 'undefined' ? location.href : '');
  if (!href) return null;
  return normalizeRoomId(parseRoomFromUrl(href)?.roomId);
}

/** 현재 대화방 id. DOM(`[role=main]` → soft view) 을 먼저, 그 다음 URL. */
function currentRoomId(url?: string): string | null {
  return mainRoomId() ?? urlRoomId(url);
}

/** 대화방 화면인가(방 id 를 어디서든 얻을 수 있으면 true). */
export function isConversationView(url?: string): boolean {
  try {
    return currentRoomId(url) !== null;
  } catch {
    return false;
  }
}

/** 현재 대화방. `url` 은 테스트용 주입값(기본 location.href). */
export function getCurrentRoom(url?: string): RoomInfo | null {
  try {
    const roomId = currentRoomId(url);
    if (!roomId) return null;
    const name = findRoomName(roomId);
    return name ? { roomId, name } : { roomId };
  } catch {
    return null;
  }
}

/** 사이드바 항목에서 방 이름을 찾는다(best effort). */
function findRoomName(roomId: string): string | undefined {
  for (const item of safeQueryAll(document, SELECTORS.sidebarRoomItem)) {
    if (normalizeRoomId(safeAttr(item, ATTR.groupId)) !== roomId) continue;
    const named = safeMatches(item, SELECTORS.displayName)
      ? item
      : safeQuery(item, SELECTORS.displayName);
    const fromAttr = safeAttr(named, ATTR.name)?.trim();
    if (fromAttr) return fromAttr;
  }
  return undefined;
}

/** 메시지 컨테이너의 소속 방: 가장 가까운 `[data-group-id]` 조상 → 메인 → URL. */
export function getMessageRoomId(container: HTMLElement | null | undefined): string | null {
  try {
    if (!container) return null;
    const owner = safeClosest(container, SELECTORS.anyGroupId);
    return normalizeRoomId(safeAttr(owner, ATTR.groupId)) ?? currentRoomId();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 메시지                                                              */
/* ------------------------------------------------------------------ */

let selfUserId: string | null = null;

/** "나" 로 판별된 컨테이너의 `data-user-id` 를 기억한다. */
export function rememberSelfUserId(id: string | null | undefined): void {
  if (typeof id === 'string' && id.trim()) selfUserId = id.trim();
}

export function getSelfUserId(): string | null {
  return selfUserId;
}

export function forgetSelfUserId(): void {
  selfUserId = null;
}

/** 문서(또는 `root`) 안의 모든 메시지 컨테이너(메인·스레드 패널 모두), 문서 순서. */
export function listMessageContainers(root?: ParentNode | null): HTMLElement[] {
  try {
    const base = root ?? (typeof document !== 'undefined' ? document : null);
    return safeQueryAll(base, SELECTORS.messageContainer);
  } catch {
    return [];
  }
}

export function isMessageContainer(el: Element | null | undefined): el is HTMLElement {
  return safeMatches(el, SELECTORS.messageContainer);
}

/** 이모지·기호·공백만으로 된 텍스트인가(본문 없음으로 본다, spec 4.1). */
const EMOJI_ONLY_RE =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|\u200d|\ufe0f|\s)*$/u;

/** FNV-1a 32bit — 합성 메시지 id 용 작은 해시. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 컨테이너 1건을 읽는다. 컨테이너가 아니면 null.
 * - 메시지 id: `data-id` 우선, 없으면 (방 id + 발신자 + 시각 텍스트 + 본문 해시)로 합성(`idSource: 'derived'`).
 * - 내 메시지: 헤딩 표시 텍스트가 `data-name` 과 다르면(= "나"/"You" 로 바뀜) 내 메시지. 단, 표시 텍스트가
 *   실제 이름으로 시작하면(봇/앱 배지 등 꼬리가 붙은 경우) 내 메시지가 아니다 — UNVERIFIED 보수 조건.
 * - 본문 없음: 본문 요소가 없거나, 이모지·공백뿐이거나, 헤딩·발신자 id 가 모두 없는(시스템 알림으로 추정,
 *   UNVERIFIED 휴리스틱) 경우 `hasBody=false`, `text=''`.
 */
export function readMessage(container: HTMLElement | null | undefined): MessageInfo | null {
  try {
    if (!container || !isMessageContainer(container)) return null;

    const heading = safeQuery(container, SELECTORS.senderHeading);
    const userId = safeAttr(container, ATTR.userId)?.trim() ?? '';
    const senderId = userId || (safeAttr(heading, ATTR.memberId)?.trim() ?? '');

    let isOwn = false;
    if (heading) {
      const displayed = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
      const realName = (safeAttr(heading, ATTR.name) ?? '').replace(/\s+/g, ' ').trim();
      if (displayed && realName && displayed !== realName && !displayed.startsWith(realName)) {
        isOwn = true;
        rememberSelfUserId(userId);
      }
    }
    if (!isOwn && selfUserId !== null && userId && userId === selfUserId) isOwn = true;

    const bodyEl = safeQuery(container, SELECTORS.messageBody);
    let text = bodyEl ? extractText(bodyEl) : '';
    let hasBody = bodyEl !== null;
    if (hasBody && (EMOJI_ONLY_RE.test(text) || (!heading && !senderId))) {
      text = '';
      hasBody = false;
    }

    const tsEl = safeQuery(container, SELECTORS.timestamp);
    const tsRaw = safeAttr(tsEl, ATTR.absoluteTimestamp);
    const ts = tsRaw && /^\d+$/.test(tsRaw.trim()) ? Number(tsRaw) : Number.NaN;
    const timestampText = (tsEl?.textContent ?? '').replace(/\s+/g, ' ').trim();

    const roomId = getMessageRoomId(container) ?? '';
    const domId = safeAttr(container, ATTR.messageId)?.trim() ?? '';
    const messageId =
      domId || `derived:${fnv1a([roomId, senderId, timestampText, text].join('\u0001'))}`;

    const info: MessageInfo = {
      messageId,
      roomId,
      senderId,
      isOwn,
      text,
      hasBody,
      idSource: domId ? 'dom' : 'derived',
      bodyEl,
    };
    if (Number.isFinite(ts)) info.timestampMs = ts;
    if (timestampText) info.timestampText = timestampText;
    return info;
  } catch {
    return null;
  }
}

/** 번역 블록을 넣을 기준 요소(본문). 호출자는 이 요소 **뒤**에 삽입한다. */
export function getTranslationAnchor(
  container: HTMLElement | null | undefined,
): HTMLElement | null {
  try {
    if (!container) return null;
    return safeQuery(container, SELECTORS.messageBody);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 변경 관찰                                                           */
/* ------------------------------------------------------------------ */

function containerOf(node: Node | null | undefined): HTMLElement | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  return safeClosest(el, SELECTORS.messageContainer);
}

/** 노드가 본문 안(본문 자신 포함)에 있을 때 그 컨테이너. */
function containerOfBodyNode(node: Node | null | undefined): HTMLElement | null {
  const el = node?.nodeType === Node.ELEMENT_NODE ? (node as Element) : node?.parentElement;
  const body = safeClosest(el, SELECTORS.messageBody);
  return body ? containerOf(body) : null;
}

/** 추가/제거된 노드가 컨테이너이거나 컨테이너를 품으면 그 목록. */
function containersWithin(node: Node): HTMLElement[] {
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  if (isMessageContainer(el)) return [el];
  return safeQueryAll(el, SELECTORS.messageContainer);
}

/**
 * `document.body`(또는 `root`) 에 MutationObserver 하나를 달아 컨테이너 추가·제거와
 * 본문 서브트리 변경(수정 감지용)을 묶어서 알린다. 반환값은 해제 함수.
 * 같은 틱의 변경은 한 번에 전달되고, 본문 바깥(번역 블록 삽입 위치 등) 변경은 무시한다.
 */
export function observeMessages(cb: MessageObserverCallback, root?: Node | null): () => void {
  const target = root ?? (typeof document !== 'undefined' ? document.body : null);
  if (!target || typeof MutationObserver === 'undefined') return () => {};

  const added = new Set<HTMLElement>();
  const removed = new Set<HTMLElement>();
  const changed = new Set<HTMLElement>();
  let scheduled = false;
  let active = true;

  const flush = () => {
    scheduled = false;
    if (!active) return;
    const addedList = Array.from(added).filter((c) => c.isConnected);
    const removedList = Array.from(removed).filter((c) => !c.isConnected && !added.has(c));
    const changedList = Array.from(changed).filter((c) => c.isConnected && !added.has(c));
    added.clear();
    removed.clear();
    changed.clear();
    if (addedList.length === 0 && removedList.length === 0 && changedList.length === 0) return;
    try {
      cb(addedList, removedList, changedList);
    } catch (error) {
      // 호출자 오류가 관찰을 멈추거나 Google Chat 화면에 번지지 않게 한다.
      console.error('[gchat-adapter] observer callback failed', error);
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  const handle = (records: MutationRecord[]) => {
    try {
      for (const record of records) {
        if (record.type === 'characterData') {
          const c = containerOfBodyNode(record.target);
          if (c) changed.add(c);
          continue;
        }
        if (record.type !== 'childList') continue;
        for (const node of Array.from(record.addedNodes)) {
          const found = containersWithin(node);
          if (found.length > 0) {
            for (const c of found) added.add(c);
            continue;
          }
          const c = containerOfBodyNode(node) ?? bodyOwnerOfSubtree(node);
          if (c) changed.add(c);
        }
        for (const node of Array.from(record.removedNodes)) {
          for (const c of containersWithin(node)) removed.add(c);
        }
        const targetContainer = containerOfBodyNode(record.target);
        if (targetContainer) changed.add(targetContainer);
      }
    } catch {
      // 레코드 해석 실패는 무시한다.
    }
    schedule();
  };

  let observer: MutationObserver;
  try {
    observer = new MutationObserver(handle);
    observer.observe(target, { subtree: true, childList: true, characterData: true });
  } catch {
    return () => {};
  }
  return () => {
    active = false;
    try {
      observer.disconnect();
    } catch {
      // 이미 해제됨
    }
  };
}

/** 추가된 노드가 본문 요소를 품을 때(본문 교체 재렌더) 그 컨테이너. */
function bodyOwnerOfSubtree(node: Node): HTMLElement | null {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const body = safeQuery(node as Element, SELECTORS.messageBody);
  return body ? containerOf(body) : null;
}

/* ------------------------------------------------------------------ */
/* 입력창                                                              */
/* ------------------------------------------------------------------ */

function composerFromTextbox(textbox: HTMLElement): ComposerInfo {
  const region =
    safeClosest(textbox, SELECTORS.composerRegion) ??
    safeClosest(textbox, SELECTORS.composerWrapper) ??
    textbox;
  const sendButton = safeQuery<HTMLButtonElement>(region, SELECTORS.sendButton);
  return { textbox, sendButton, region };
}

/** 문서 안의 모든 작성 영역(메인 + 스레드 패널), 문서 순서. */
export function listComposers(): ComposerInfo[] {
  try {
    return safeQueryAll(document, SELECTORS.composerTextbox).map(composerFromTextbox);
  } catch {
    return [];
  }
}

/** 활성 작성 영역: 포커스를 품은 것 → `[role=main]` 안의 것 → 첫 번째. */
export function getActiveComposer(): ComposerInfo | null {
  try {
    const composers = listComposers();
    if (composers.length === 0) return null;
    const focused = document.activeElement;
    if (focused && focused !== document.body) {
      const hit = composers.find((c) => c.textbox.contains(focused) || c.region.contains(focused));
      if (hit) return hit;
    }
    const inMain = composers.find((c) => safeClosest(c.textbox, SELECTORS.conversationRoot));
    return inMain ?? composers[0] ?? null;
  } catch {
    return null;
  }
}

/** 입력창의 평문(줄마다 `<div>` → 줄바꿈). */
export function readComposerText(textbox: HTMLElement | null | undefined): string {
  return extractText(textbox);
}

export function isComposerEmpty(textbox: HTMLElement | null | undefined): boolean {
  return readComposerText(textbox).trim().length === 0;
}

/** 입력창에 순수 텍스트가 아닌 내용이 있는지(멘션 칩·서식·첨부). */
export function composerHasRichContent(textbox: HTMLElement | null | undefined): RichContentReport {
  const report: RichContentReport = { mentions: false, formatting: false, attachments: false };
  try {
    if (!textbox) return report;
    for (const el of safeQueryAll<Element>(textbox, '*')) {
      const tag = el.tagName.toUpperCase();
      if (COMPOSER_FORMATTING_TAGS.has(tag)) {
        report.formatting = true;
        continue;
      }
      if (!COMPOSER_PLAIN_TAGS.has(tag) || !isPlainWrapper(el)) report.mentions = true;
    }
    const region = safeClosest(textbox, SELECTORS.composerRegion);
    if (region) {
      report.attachments = safeQueryAll(region, SELECTORS.composerAttachment).some(
        (chip) => !textbox.contains(chip),
      );
    }
  } catch {
    // 판정 실패 시 지금까지의 결과를 그대로 돌려준다.
  }
  return report;
}

/** div/br/span 이라도 data-* 속성이나 contenteditable=false 가 있으면 칩으로 본다. */
function isPlainWrapper(el: Element): boolean {
  if (safeAttr(el, 'contenteditable')?.toLowerCase() === 'false') return false;
  for (const name of el.getAttributeNames()) {
    if (name.startsWith('data-')) return false;
  }
  return true;
}

/**
 * 입력창 내용을 평문으로 교체한다(줄마다 `<div>`). 가능하면 `execCommand('insertText')` 로
 * Google 편집기의 입력 경로를 타고, 안 되면 DOM 을 직접 바꾼 뒤 `input` 이벤트를 발행한다.
 */
export function setComposerText(textbox: HTMLElement | null | undefined, text: string): void {
  try {
    if (!textbox) return;
    const value = typeof text === 'string' ? text : '';
    if (tryInsertText(textbox, value) && readComposerText(textbox) === value.trim()) return;
    replaceContent(textbox, value);
    placeCaretAtEnd(textbox);
    dispatchInput(textbox, value);
  } catch {
    // 입력창 교체 실패는 조용히 끝낸다(호출자는 readComposerText 로 결과를 확인한다).
  }
}

function tryInsertText(textbox: HTMLElement, value: string): boolean {
  try {
    const doc = textbox.ownerDocument;
    const exec = (doc as Document & { execCommand?: unknown }).execCommand;
    if (typeof exec !== 'function') return false;
    textbox.focus();
    const selection = doc.getSelection();
    if (!selection) return false;
    const range = doc.createRange();
    range.selectNodeContents(textbox);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!value) return doc.execCommand('delete', false) === true;
    return doc.execCommand('insertText', false, value) === true;
  } catch {
    return false;
  }
}

function replaceContent(textbox: HTMLElement, value: string): void {
  const doc = textbox.ownerDocument;
  const lines = value === '' ? [''] : value.split(/\r?\n/);
  const frag = doc.createDocumentFragment();
  for (const line of lines) {
    const div = doc.createElement('div');
    if (line === '') div.appendChild(doc.createElement('br'));
    else div.textContent = line;
    frag.appendChild(div);
  }
  textbox.replaceChildren(frag);
}

function placeCaretAtEnd(textbox: HTMLElement): void {
  try {
    const doc = textbox.ownerDocument;
    const selection = doc.getSelection();
    if (!selection) return;
    const range = doc.createRange();
    range.selectNodeContents(textbox);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // 캐럿 이동 실패는 무시
  }
}

function dispatchInput(textbox: HTMLElement, value: string): void {
  let event: Event;
  try {
    event = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value });
  } catch {
    event = new Event('input', { bubbles: true });
  }
  textbox.dispatchEvent(event);
}

/** 보내기 버튼을 누른다. 없거나 비활성이면 false(호출자는 입력창에 번역문을 남긴다). */
export function clickSend(button: HTMLButtonElement | HTMLElement | null | undefined): boolean {
  try {
    if (!button?.isConnected) return false;
    if ((button as HTMLButtonElement).disabled === true) return false;
    if (safeAttr(button, 'aria-disabled')?.toLowerCase() === 'true') return false;
    if (safeAttr(button, 'disabled') !== null) return false;
    button.click();
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* 테마                                                                */
/* ------------------------------------------------------------------ */

/** Google Chat 의 현재 테마: `body[data-theme]` → 배경색 판정. */
export function getChatTheme(): Theme {
  try {
    const value = safeAttr(document.body, ATTR.theme)?.toLowerCase();
    if (value === 'light' || value === 'dark') return value;
    return themeFromBackground(document.body);
  } catch {
    return 'light';
  }
}
