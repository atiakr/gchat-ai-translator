import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULTS } from '../../config/defaults';
import { isLanguageCode, type LanguageCode } from '../../config/languages';
import { normalizeSentText } from '../../engine/sentText';
import type { ComposerInfo, RichContentReport } from '../../gchat/adapter';
import * as gchat from '../../gchat/adapter';
import { sendMessage as runtimeSendMessage } from '../../messaging/protocol';
import {
  getGlobalSettings as storageGetGlobalSettings,
  getRoomSettings as storageGetRoomSettings,
  setRoomSettings as storageSetRoomSettings,
} from '../../settings/storage';
import { createIncomingMounts } from '../incoming/mount';
import { BlockedNotice } from './BlockedNotice';
import { HeaderToggle } from './HeaderToggle';
import { createShadowHost, type ShadowHost } from './host';
import { type OutgoingError, PreviewPanel } from './PreviewPanel';
import { TranslateButton } from './TranslateButton';

/**
 * 발신 번역("보내기 전 번역") 컨트롤러.
 *
 * 사용자가 확인을 누르기 전에는 아무것도 전송하지 않는다.
 * 키 핸들러는 입력창 요소에만 건다(문서 수준 핸들러 없음, 입력창에서는 캡처 단계로 받는다). 페이지 전역 객체는 만지지 않는다.
 */

export type OutgoingAdapter = Pick<
  typeof gchat,
  | 'getActiveComposer'
  | 'getRoomHeaderSlot'
  | 'getCurrentRoom'
  | 'readComposerText'
  | 'isComposerEmpty'
  | 'composerHasRichContent'
  | 'setComposerText'
  | 'clickSend'
  | 'getChatTheme'
  | 'listMessageContainers'
  | 'readMessage'
  | 'getTranslationAnchor'
  | 'observeMessages'
>;

export interface OutgoingDeps {
  adapter: OutgoingAdapter;
  sendMessage: typeof runtimeSendMessage;
  getRoomSettings: typeof storageGetRoomSettings;
  setRoomSettings: typeof storageSetRoomSettings;
  getGlobalSettings: typeof storageGetGlobalSettings;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface OutgoingState {
  open: boolean;
  original: string;
  translation: string;
  lang: LanguageCode;
  saveAsDefault: boolean;
  translating: boolean;
  error: OutgoingError | null;
  rich: RichContentReport;
  sendFailed: boolean;
  /** Enter 번역이 켜진 방에서 번역할 수 없어 전송을 막았다는 안내만 띄운 상태. */
  blocked: boolean;
}

export interface OutgoingController {
  /** 활성 입력창 옆에 버튼을 넣고 입력창에 단축키 핸들러를 건다. 같은 입력창이면 상태만 갱신. */
  mount(roomId: string, enabled: boolean): void;
  /** 전역 스위치·키 유효성 결과. 끄면 버튼을 숨기고 열린 패널을 닫는다. */
  setEnabled(enabled: boolean): void;
  /** 버튼·단축키·command 공통 진입. 꺼져 있거나 입력창이 비면 아무 일도 하지 않는다. */
  trigger(): Promise<void>;
  /** 방 설정의 Enter 번역. 켜면 그냥 Enter 도 바로 보내지 않고 미리보기를 연다. */
  setEnterTranslate(on: boolean): void;
  /** 입력창의 keydown. Ctrl/Cmd+Shift+Enter 와, Enter 번역이 켜졌을 때의 그냥 Enter 만 가로챈다. */
  onShortcutKey(e: KeyboardEvent): void;
  /** background 의 `command.translateOutgoing`. */
  onCommand(): void;
  confirm(): Promise<void>;
  cancel(): void;
  retry(): Promise<void>;
  changeLanguage(code: LanguageCode): Promise<void>;
  editTranslation(text: string): void;
  setSaveAsDefault(value: boolean): void;
  /** 화면에 있는 내 메시지 중 기록된 원문이 있으면 그 아래에 단다(로드·재렌더 시). */
  restoreSentOriginals(containers: HTMLElement[]): Promise<void>;
  getState(): Readonly<OutgoingState>;
  destroy(): void;
}

const NO_RICH: RichContentReport = { mentions: false, formatting: false, attachments: false };
const PANEL_GAP_PX = 8;
const PANEL_MIN_WIDTH_PX = 320;
const PANEL_MAX_WIDTH_PX = 720;
const PANEL_Z_INDEX = '2147483000';
/**
 * 입력창 keydown 은 캡처 단계에서 받는다. Google Chat 편집기가 같은 요소·조상에서 Enter 를 먼저 처리해
 * 원문을 보내기 전에 단축키를 가로채기 위해서다. 해제도 같은 옵션으로 한다.
 */
const KEY_LISTENER: AddEventListenerOptions = { capture: true };

function defaultDeps(): OutgoingDeps {
  return {
    adapter: gchat,
    sendMessage: runtimeSendMessage,
    getRoomSettings: storageGetRoomSettings,
    setRoomSettings: storageSetRoomSettings,
    getGlobalSettings: storageGetGlobalSettings,
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

function initialState(): OutgoingState {
  return {
    open: false,
    original: '',
    translation: '',
    lang: DEFAULTS.outgoingLang,
    saveAsDefault: false,
    translating: false,
    error: null,
    rich: NO_RICH,
    sendFailed: false,
    blocked: false,
  };
}

function isShortcutCombo(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey;
}

/** 수식키 없는 Enter. 한글 등 IME 조합을 끝내는 Enter(`isComposing`, keyCode 229)는 뺀다. */
function isPlainEnter(e: KeyboardEvent): boolean {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false;
  return !e.isComposing && e.keyCode !== 229;
}

interface Mounted {
  roomId: string;
  composer: ComposerInfo;
  host: ShadowHost;
  root: Root;
  keyHandler: (e: KeyboardEvent) => void;
}

interface HeaderMount {
  host: ShadowHost;
  root: Root;
}

interface PanelMount {
  host: ShadowHost;
  root: Root;
  region: HTMLElement;
  reposition: () => void;
}

interface SentWatch {
  stop: () => void;
}

export function createOutgoingController(
  overrides: Partial<OutgoingDeps> = {},
): OutgoingController {
  const deps: OutgoingDeps = { ...defaultDeps(), ...overrides };
  const { adapter } = deps;

  let state: OutgoingState = initialState();
  let enabled = false;
  let enterTranslates = false;
  let mounted: Mounted | null = null;
  let panel: PanelMount | null = null;
  let header: HeaderMount | null = null;
  let activeComposer: ComposerInfo | null = null;
  let translateSeq = 0;
  let lastFireAt: number | null = null;
  let sentWatch: SentWatch | null = null;
  /** 번역해 보낸 내 메시지: 본문(보낸 번역문)을 숨기고 그 자리에 내 원문을 그린다. 수신 쪽과 묶음을 나눈다. */
  const sentViews = createIncomingMounts();
  /**
   * messageId → 보낸 글(정규화)과 내 원문. Google 이 본문을 다시 그려 표시가 지워지면 조회 없이 다시 붙인다.
   * 메시지를 고쳐 보낸 글이 달라졌으면 쓰지 않는다.
   */
  const sentOriginals = new Map<string, { sentText: string; original: string }>();
  let destroyed = false;

  const roomId = () => mounted?.roomId ?? '';

  /* ---------------- 버튼 호스트 ---------------- */

  function unmountButton(): void {
    if (!mounted) return;
    try {
      mounted.composer.textbox.removeEventListener('keydown', mounted.keyHandler, KEY_LISTENER);
    } catch {
      // 이미 떨어진 요소
    }
    mounted.root.unmount();
    mounted.host.remove();
    mounted = null;
  }

  function mountButton(nextRoomId: string, composer: ComposerInfo): void {
    unmountButton();
    const host = createShadowHost('button', adapter.getChatTheme());
    const { sendButton, sendGroup, region } = composer;
    if (sendGroup?.parentElement) sendGroup.insertAdjacentElement('beforebegin', host.el);
    else if (sendButton?.parentElement) sendButton.insertAdjacentElement('beforebegin', host.el);
    else region.append(host.el);
    const root = createRoot(host.mount);
    root.render(createElement(TranslateButton, { onClick: () => void trigger() }));
    const keyHandler = (e: KeyboardEvent) => onShortcutKey(e);
    composer.textbox.addEventListener('keydown', keyHandler, KEY_LISTENER);
    mounted = { roomId: nextRoomId, composer, host, root, keyHandler };
    host.setHidden(!enabled);
  }

  /* ---------------- 방 머리글 스위치 ---------------- */

  function unmountHeader(): void {
    if (!header) return;
    header.root.unmount();
    header.host.remove();
    header = null;
  }

  /** 현재 방 머리글에 Enter 번역 스위치를 둔다. Google 이 머리글을 다시 그려 떨어졌으면 다시 넣는다. */
  function syncHeader(): void {
    if (destroyed) return;
    const slot = adapter.getRoomHeaderSlot();
    if (!slot) {
      unmountHeader();
      return;
    }
    if (!header?.host.el.isConnected || header.host.el.parentElement !== slot.parent) {
      unmountHeader();
      const host = createShadowHost('header', adapter.getChatTheme());
      try {
        slot.parent.insertBefore(host.el, slot.before);
      } catch {
        return;
      }
      header = { host, root: createRoot(host.mount) };
      renderHeader();
    }
    header.host.setTheme(adapter.getChatTheme());
    header.host.setHidden(!enabled);
  }

  function renderHeader(): void {
    if (!header || destroyed) return;
    header.root.render(
      createElement(HeaderToggle, {
        on: enterTranslates,
        onToggle: () => void toggleEnterTranslate(),
      }),
    );
  }

  /* ---------------- 패널 호스트 ---------------- */

  function positionPanel(host: ShadowHost, region: HTMLElement): void {
    const el = host.el;
    el.style.position = 'fixed';
    el.style.zIndex = PANEL_Z_INDEX;
    el.style.boxSizing = 'border-box';
    let rect: DOMRect | null = null;
    try {
      rect = region.getBoundingClientRect();
    } catch {
      rect = null;
    }
    const viewportWidth = window.innerWidth || PANEL_MAX_WIDTH_PX;
    const viewportHeight = window.innerHeight || 0;
    const available = rect?.width ? rect.width : viewportWidth;
    const width = Math.min(Math.max(available, PANEL_MIN_WIDTH_PX), PANEL_MAX_WIDTH_PX);
    const left = rect ? Math.max(0, Math.min(rect.left, viewportWidth - width)) : 0;
    const top = rect?.top ?? viewportHeight;
    el.style.left = `${left}px`;
    el.style.width = `${width}px`;
    el.style.bottom = `${Math.max(0, viewportHeight - top + PANEL_GAP_PX)}px`;
  }

  function ensurePanel(region: HTMLElement): PanelMount {
    if (panel?.host.el.isConnected && panel.region === region) return panel;
    closePanelHost();
    const host = createShadowHost('panel', adapter.getChatTheme());
    document.body.append(host.el);
    const root = createRoot(host.mount);
    const reposition = () => positionPanel(host, region);
    window.addEventListener('resize', reposition);
    panel = { host, root, region, reposition };
    reposition();
    return panel;
  }

  function closePanelHost(): void {
    if (!panel) return;
    window.removeEventListener('resize', panel.reposition);
    panel.root.unmount();
    panel.host.remove();
    panel = null;
  }

  function render(): void {
    if (destroyed) return;
    if (!state.open) {
      closePanelHost();
      return;
    }
    const region = activeComposer?.region ?? mounted?.composer.region;
    if (!region) return;
    const p = ensurePanel(region);
    p.host.setTheme(adapter.getChatTheme());
    p.reposition();
    if (state.blocked) {
      p.root.render(
        createElement(BlockedNotice, {
          onClose: cancel,
          onTurnOff: () => void toggleEnterTranslate(),
        }),
      );
      return;
    }
    p.root.render(
      createElement(PreviewPanel, {
        original: state.original,
        translation: state.translation,
        lang: state.lang,
        saveAsDefault: state.saveAsDefault,
        translating: state.translating,
        error: state.error,
        rich: state.rich,
        sendFailed: state.sendFailed,
        onTranslationChange: editTranslation,
        onLanguageChange: (code) => void changeLanguage(code),
        onSaveAsDefaultChange: setSaveAsDefault,
        onConfirm: () => void confirm(),
        onCancel: cancel,
        onRetry: () => void retry(),
      }),
    );
  }

  function closePanel(): void {
    translateSeq += 1; // 진행 중인 번역 응답은 버린다
    state = { ...initialState(), lang: state.lang };
    render();
    try {
      activeComposer?.textbox.focus();
    } catch {
      // 포커스 복귀 실패는 무시
    }
  }

  /* ---------------- 언어·번역 ---------------- */

  /** 방 설정 항목을 처음 만들 때 함께 저장할 방 이름. 화면의 방이 같은 방일 때만. */
  function currentRoomName(id: string): string | undefined {
    try {
      const room = adapter.getCurrentRoom();
      return room && room.roomId === id && room.name ? room.name : undefined;
    } catch {
      return undefined;
    }
  }

  async function resolveLang(): Promise<LanguageCode> {
    try {
      const room = await deps.getRoomSettings(roomId());
      if (isLanguageCode(room?.outgoingLang)) return room.outgoingLang;
    } catch {
      // 방 설정을 못 읽으면 전역으로
    }
    try {
      const global = await deps.getGlobalSettings();
      if (isLanguageCode(global.outgoingLang)) return global.outgoingLang;
    } catch {
      // 전역도 못 읽으면 기본값
    }
    return DEFAULTS.outgoingLang;
  }

  async function translate(): Promise<void> {
    if (!state.open) return;
    const seq = ++translateSeq;
    state = { ...state, translating: true, error: null };
    render();
    let next: Pick<OutgoingState, 'translation' | 'error'>;
    try {
      const result = await deps.sendMessage('translate.outgoing', {
        roomId: roomId(),
        text: state.original,
        targetLang: state.lang,
      });
      next = result.ok
        ? { translation: result.translation, error: null }
        : { translation: '', error: result.errorKind };
    } catch {
      next = { translation: '', error: 'unknown' };
    }
    // 늦게 온 이전 요청의 응답이나 닫힌 패널의 응답은 버린다.
    if (seq !== translateSeq || !state.open) return;
    state = { ...state, ...next, translating: false };
    render();
  }

  /* ---------------- 내 원문 ---------------- */

  function sentViewAttached(container: HTMLElement): boolean {
    return sentViews.getMounted(container)?.isAttached() === true;
  }

  function mountSentOriginal(container: HTMLElement, original: string): void {
    const info = adapter.readMessage(container);
    if (!info) return;
    const anchor = adapter.getTranslationAnchor(container) ?? info.bodyEl;
    if (!anchor) return;
    sentOriginals.set(info.messageId, { sentText: normalizeSentText(info.text), original });
    if (sentViewAttached(container)) return;
    sentViews.mount(container, anchor, adapter.getChatTheme(), {
      status: 'translated',
      translation: original,
      variant: 'sent',
      onRetry: () => {},
    });
  }

  function stopSentWatch(): void {
    sentWatch?.stop();
    sentWatch = null;
  }

  function startSentWatch(sentText: string, original: string, before: Set<HTMLElement>): void {
    stopSentWatch();
    const wanted = normalizeSentText(sentText);
    const matches = (containers: HTMLElement[]): boolean => {
      for (const c of containers) {
        const info = adapter.readMessage(c);
        if (!info?.isOwn || normalizeSentText(info.text) !== wanted) continue;
        mountSentOriginal(c, original);
        return true;
      }
      return false;
    };
    if (matches(adapter.listMessageContainers().filter((c) => !before.has(c)))) return;
    let stopped = false;
    const unobserve = adapter.observeMessages((added) => {
      if (stopped) return;
      if (matches(added)) stop();
    });
    const timer = deps.setTimeout(() => stop(), DEFAULTS.sentMatchTimeoutMs);
    function stop(): void {
      if (stopped) return;
      stopped = true;
      deps.clearTimeout(timer);
      unobserve();
      if (sentWatch?.stop === stop) sentWatch = null;
    }
    sentWatch = { stop };
  }

  /* ---------------- 공개 API ---------------- */

  function mount(nextRoomId: string, nextEnabled: boolean): void {
    if (destroyed) return;
    enabled = nextEnabled;
    syncHeader();
    const composer = adapter.getActiveComposer();
    if (!composer) {
      unmountButton();
      return;
    }
    if (mounted && mounted.composer.textbox === composer.textbox && mounted.host.el.isConnected) {
      mounted.roomId = nextRoomId;
      mounted.composer = composer;
      mounted.host.setHidden(!enabled);
      mounted.host.setTheme(adapter.getChatTheme());
      if (enabled ? state.blocked : !state.blocked) closePanel();
      return;
    }
    if (state.open) closePanel();
    mountButton(nextRoomId, composer);
  }

  function setEnabled(next: boolean): void {
    enabled = next;
    if (mounted) mounted.host.setHidden(!next);
    header?.host.setHidden(!next);
    // 꺼지면 미리보기를 닫는다. 차단 안내는 꺼진 동안 띄우는 것이라 다시 켜질 때 닫는다.
    if (state.open && (next ? state.blocked : !state.blocked)) closePanel();
  }

  function setEnterTranslate(on: boolean): void {
    if (on !== enterTranslates) {
      enterTranslates = on;
      renderHeader();
    }
    if (!on && state.blocked) closePanel();
  }

  /** 입력창 옆 토글·차단 안내에서 이 방의 Enter 번역을 바꾼다. 저장에 실패하면 되돌린다. */
  async function toggleEnterTranslate(): Promise<void> {
    const room = roomId();
    if (destroyed || !room) return;
    const next = !enterTranslates;
    const roomName = currentRoomName(room);
    setEnterTranslate(next);
    try {
      await deps.setRoomSettings(room, {
        enterTranslates: next,
        ...(roomName ? { name: roomName } : {}),
      });
    } catch {
      if (roomId() === room && enterTranslates === next) setEnterTranslate(!next);
    }
  }

  function showBlocked(): void {
    if (destroyed || !mounted) return;
    translateSeq += 1;
    activeComposer = mounted.composer;
    state = { ...initialState(), lang: state.lang, open: true, blocked: true };
    render();
  }

  async function trigger(): Promise<void> {
    if (destroyed || !enabled || !mounted) return;
    const composer = adapter.getActiveComposer();
    if (!composer) return;
    const { textbox } = composer;
    if (adapter.isComposerEmpty(textbox)) return;
    const original = adapter.readComposerText(textbox);
    const rich = adapter.composerHasRichContent(textbox);
    const lang = await resolveLang();
    if (destroyed || !enabled) return;
    activeComposer = composer;
    state = { ...initialState(), open: true, original, rich, lang };
    render();
    await translate();
  }

  function fire(): void {
    const at = deps.now();
    if (lastFireAt !== null && at - lastFireAt < DEFAULTS.shortcutDedupeMs) return;
    lastFireAt = at;
    void trigger();
  }

  function onShortcutKey(e: KeyboardEvent): void {
    if (isShortcutCombo(e)) {
      if (!enabled) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fire();
      return;
    }
    // 그 밖의 키는 Google Chat 으로 그대로 흘려보낸다. 그냥 Enter 는 이 방에서 Enter 번역을 켰을 때만 막는다.
    if (!enterTranslates || !isPlainEnter(e) || !mounted) return;
    // 글이 없으면(첨부만 있는 메시지 등) Google Chat 이 평소대로 보낸다.
    if (adapter.isComposerEmpty(mounted.composer.textbox)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // 번역할 수 없으면 원문이 그대로 나가지 않게 막고 안내만 띄운다.
    if (enabled) fire();
    else showBlocked();
  }

  function onCommand(): void {
    if (!enabled) return;
    fire();
  }

  async function confirm(): Promise<void> {
    if (!state.open || state.translating || state.sendFailed) return;
    const sentText = state.translation;
    if (sentText.trim().length === 0) return;
    let composer = activeComposer;
    if (!composer?.textbox.isConnected) composer = adapter.getActiveComposer();
    if (!composer) {
      state = { ...state, sendFailed: true };
      render();
      return;
    }
    const before = new Set(adapter.listMessageContainers());
    adapter.setComposerText(composer.textbox, sentText);
    const sent = adapter.clickSend(composer.sendButton);
    if (!sent) {
      // 번역문은 입력창에 남겨 두고 직접 Enter 로 보내라고 안내한다.
      state = { ...state, sendFailed: true };
      render();
      return;
    }
    const { original, lang, saveAsDefault } = state;
    const room = roomId();
    const roomName = currentRoomName(room);
    closePanel();
    startSentWatch(sentText, original, before);
    if (saveAsDefault) {
      try {
        await deps.setRoomSettings(room, {
          outgoingLang: lang,
          ...(roomName ? { name: roomName } : {}),
        });
      } catch {
        // 방 설정 저장 실패는 전송 결과에 영향을 주지 않는다.
      }
    }
    try {
      await deps.sendMessage('sentOriginal.save', { roomId: room, sentText, original });
    } catch {
      // 원문 기록 실패는 조용히 넘긴다(이 기기 표시 전용).
    }
  }

  function cancel(): void {
    if (!state.open) return;
    closePanel();
  }

  async function retry(): Promise<void> {
    if (!state.open || state.translating) return;
    await translate();
  }

  async function changeLanguage(code: LanguageCode): Promise<void> {
    if (!state.open || !isLanguageCode(code)) return;
    if (state.lang === code && !state.error) return;
    state = { ...state, lang: code, translation: '' };
    await translate();
  }

  function editTranslation(text: string): void {
    if (!state.open) return;
    state = { ...state, translation: text };
    render();
  }

  function setSaveAsDefault(value: boolean): void {
    if (!state.open) return;
    state = { ...state, saveAsDefault: value };
    render();
  }

  async function restoreSentOriginals(containers: HTMLElement[]): Promise<void> {
    for (const container of containers) {
      if (destroyed) return;
      const info = adapter.readMessage(container);
      if (!info?.isOwn || !info.hasBody || !info.text.trim()) continue;
      const known = sentOriginals.get(info.messageId);
      const same = known !== undefined && known.sentText === normalizeSentText(info.text);
      if (same && sentViewAttached(container)) continue;
      // 다시 그려졌거나 고쳐진 메시지의 옛 표시는 걷어낸다(원래 본문으로 되돌림).
      sentViews.getMounted(container)?.unmount();
      if (same) {
        mountSentOriginal(container, known.original);
        continue;
      }
      try {
        const found = await deps.sendMessage('sentOriginal.lookup', {
          roomId: info.roomId || roomId(),
          sentText: info.text,
        });
        if (found && container.isConnected && !destroyed) {
          mountSentOriginal(container, found.original);
        }
      } catch {
        // 조회 실패는 표시만 건너뛴다.
      }
    }
  }

  function getState(): Readonly<OutgoingState> {
    return state;
  }

  function destroy(): void {
    if (destroyed) return;
    stopSentWatch();
    translateSeq += 1;
    state = initialState();
    closePanelHost();
    unmountButton();
    unmountHeader();
    sentViews.unmountAll();
    sentOriginals.clear();
    activeComposer = null;
    destroyed = true;
  }

  return {
    mount,
    setEnabled,
    setEnterTranslate,
    trigger,
    onShortcutKey,
    onCommand,
    confirm,
    cancel,
    retry,
    changeLanguage,
    editTranslation,
    setSaveAsDefault,
    restoreSentOriginals,
    getState,
    destroy,
  };
}
