import { DEFAULTS } from '../config/defaults';
import { hashString } from '../engine/hash';
import { judgeLimits, rankFromNewest } from '../engine/limits';
import type { ErrorKind, TranslationStatus } from '../engine/types';
import type { MessageInfo, RoomInfo } from '../gchat/adapter';
import * as gchat from '../gchat/adapter';
import {
  type MessageKind,
  type MessageMap,
  onMessage as runtimeOnMessage,
  sendMessage as runtimeSendMessage,
  type TranslateBatchItem,
  type TranslateBatchResultItem,
} from '../messaging/protocol';
import type { GlobalSettings } from '../settings/schema';
import {
  getRoomSettings as storageGetRoomSettings,
  watchRoomSettings as storageWatchRoomSettings,
} from '../settings/storage';
import {
  type IncomingHandle,
  type IncomingProps,
  getMounted as uiGetMounted,
  mountIncoming as uiMountIncoming,
  unmountAll as uiUnmountAll,
} from '../ui/incoming/mount';
import {
  type OutgoingController,
  createOutgoingController as uiCreateOutgoingController,
} from '../ui/outgoing/controller';
import type { Theme } from '../ui/theme';

/**
 * content script 조립 컨트롤러 — 어댑터·엔진 판정·메시징·UI 를 묶는다.
 *
 * - 수신 자동 번역: 화면의 수신 메시지를 읽어 상한을 판정하고, 틱마다 한 묶음으로
 *   background 에 요청해 결과를 블록에 반영한다. 내 메시지는 어떤 경우에도 요청하지 않는다(불변식 1).
 * - 전역 스위치·키·방별 끄기가 하나라도 막으면 요청조차 보내지 않는다(불변식 5).
 * - 어떤 메시지에서 예외가 나도 나머지 처리와 Google Chat 화면은 멈추지 않는다(불변식 6).
 * - 깨짐 감지·상태 보고, 방 전환(SPA), 테마 추적, 발신 번역 컨트롤러 연결.
 */

export type ContentAdapter = Pick<
  typeof gchat,
  | 'getCurrentRoom'
  | 'isConversationView'
  | 'listMessageContainers'
  | 'readMessage'
  | 'getTranslationAnchor'
  | 'observeMessages'
  | 'getChatTheme'
>;

/** 이 컨트롤러가 쓰는 발신 컨트롤러 표면. */
export type OutgoingLike = Pick<
  OutgoingController,
  'mount' | 'setEnabled' | 'onCommand' | 'restoreSentOriginals' | 'destroy'
>;

export interface ContentDeps {
  adapter: ContentAdapter;
  sendMessage: typeof runtimeSendMessage;
  onMessage: typeof runtimeOnMessage;
  getRoomSettings: typeof storageGetRoomSettings;
  watchRoomSettings: typeof storageWatchRoomSettings;
  mountIncoming: typeof uiMountIncoming;
  getMounted: typeof uiGetMounted;
  unmountAll: typeof uiUnmountAll;
  createOutgoingController: () => OutgoingLike;
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** 테마 속성(`data-theme`)을 관찰할 요소. 기본 document.body. */
  themeTarget: () => HTMLElement | null;
}

export interface ContentState {
  roomId: string | null;
  incomingActive: boolean;
  outgoingEnabled: boolean;
  tracked: number;
}

export interface ContentController {
  /** 핸들러·관찰을 걸고 설정을 받아 첫 처리를 마친 뒤 resolve 한다(요청 응답은 기다리지 않음). */
  start(): Promise<void>;
  stop(): void;
  getState(): Readonly<ContentState>;
}

/** 메시지 발견 보고를 묶는 최소 간격(ms). 발견 ↔ 미발견이 뒤집히면 즉시 보낸다. */
export const REPORT_THROTTLE_MS = 10_000;

type ResultStatus = TranslateBatchResultItem['status'];

interface Tracked {
  messageId: string;
  text: string;
  textHash: string;
  status: TranslationStatus;
  translation?: string;
  errorKind?: ErrorKind;
  container: HTMLElement;
}

function defaultDeps(): ContentDeps {
  return {
    adapter: gchat,
    sendMessage: runtimeSendMessage,
    onMessage: runtimeOnMessage,
    getRoomSettings: storageGetRoomSettings,
    watchRoomSettings: storageWatchRoomSettings,
    mountIncoming: uiMountIncoming,
    getMounted: uiGetMounted,
    unmountAll: uiUnmountAll,
    createOutgoingController: () => uiCreateOutgoingController(),
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    themeTarget: () => (typeof document === 'undefined' ? null : document.body),
  };
}

function warn(where: string, error: unknown): void {
  try {
    console.warn(`[gchat-ai-translator] ${where}`, error);
  } catch {
    // console 이 막힌 환경
  }
}

/** 한 단계가 던져도 파이프라인이 멈추지 않게 감싼다(불변식 6). */
function guard<T>(where: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    warn(where, error);
    return fallback;
  }
}

export function createContentController(overrides: Partial<ContentDeps> = {}): ContentController {
  const deps: ContentDeps = { ...defaultDeps(), ...overrides };
  const { adapter } = deps;

  let started = false;
  let stopped = false;

  // ---- 세션 상태 ----
  let settings: GlobalSettings | null = null;
  let canTranslate = false;
  let roomId: string | null = null;
  let roomIncomingDisabled = false;
  /** 방 설정을 읽는 동안에는 요청을 보내지 않는다(꺼진 방에 요청이 새지 않게). */
  let roomReady = false;
  /** 지금 방 설정을 읽는 중인 방 id(중복 읽기 방지). */
  let roomLoading: string | null = null;
  /** 방이 바뀌면 올라간다. 이전 방의 늦은 응답을 버리는 데 쓴다. */
  let epoch = 0;
  let lastIncomingActive = false;
  let theme: Theme = 'light';

  const tracked = new Map<string, Tracked>();
  const byContainer = new WeakMap<HTMLElement, string>();

  // ---- 자원 ----
  let outgoing: OutgoingLike | null = null;
  const disposers: (() => void)[] = [];
  let themeObserver: MutationObserver | null = null;

  // ---- 깨짐 감지·보고 ----
  let brokenTimer: unknown = null;
  let lastReport: { found: boolean; at: number } | null = null;

  /* ---------------------------------------------------------------- */
  /* 파생 상태                                                         */
  /* ---------------------------------------------------------------- */

  const globalOn = () => settings?.enabled === true && canTranslate;
  const outgoingEnabled = () => globalOn();
  const incomingActive = () => globalOn() && roomReady && !roomIncomingDisabled;

  function limitOptions() {
    return {
      maxMessageChars: settings?.maxMessageChars,
      maxAutoPerRoom: settings?.maxAutoPerRoom,
    };
  }

  function targetLang(): string {
    return settings?.targetLang ?? DEFAULTS.targetLang;
  }

  /* ---------------------------------------------------------------- */
  /* 메시징                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * background 에 보낸다. 응답 없이 끊기면(service worker 재시작 등) 정해진 횟수만큼 다시 보내고,
   * 그래도 없으면 undefined.
   */
  async function request<K extends MessageKind>(
    kind: K,
    payload: MessageMap[K]['request'],
  ): Promise<MessageMap[K]['response'] | undefined> {
    const attempts = 1 + DEFAULTS.reRequestOnDisconnect;
    for (let i = 0; i < attempts; i++) {
      if (stopped) return undefined;
      try {
        const response = await deps.sendMessage(kind, payload);
        if (response !== undefined && response !== null) return response;
      } catch (error) {
        warn(`sendMessage(${kind}) failed`, error);
      }
    }
    return undefined;
  }

  function fireAndForget<K extends MessageKind>(kind: K, payload: MessageMap[K]['request']): void {
    deps.sendMessage(kind, payload).catch((error: unknown) => warn(`sendMessage(${kind})`, error));
  }

  /* ---------------------------------------------------------------- */
  /* 수신 블록                                                          */
  /* ---------------------------------------------------------------- */

  function propsFor(entry: Tracked): IncomingProps {
    const props: IncomingProps = {
      status: entry.status,
      hideOriginal: settings?.hideOriginal === true,
      onRetry: () => retry(entry.messageId),
    };
    if (entry.translation !== undefined) props.translation = entry.translation;
    if (entry.errorKind !== undefined) props.errorKind = entry.errorKind;
    return props;
  }

  function mountEntry(entry: Tracked): IncomingHandle | null {
    const anchor = adapter.getTranslationAnchor(entry.container);
    return deps.mountIncoming(entry.container, anchor, theme, propsFor(entry));
  }

  /** 상태를 기록하고 화면에 반영한다. same_language / no_text 는 블록을 없앤다. */
  function applyStatus(
    entry: Tracked,
    status: TranslationStatus,
    extra: { translation?: string; errorKind?: ErrorKind } = {},
  ): void {
    entry.status = status;
    entry.translation = extra.translation;
    entry.errorKind = extra.errorKind;
    guard(
      'applyStatus',
      () => {
        if (status === 'same_language' || status === 'no_text') {
          deps.getMounted(entry.container)?.unmount();
          return;
        }
        const handle = deps.getMounted(entry.container);
        if (handle) {
          handle.update({
            status,
            hideOriginal: settings?.hideOriginal === true,
            translation: extra.translation,
            errorKind: extra.errorKind,
          });
        } else {
          mountEntry(entry);
        }
      },
      undefined,
    );
  }

  function applyResult(entry: Tracked, result: TranslateBatchResultItem | undefined): void {
    if (!result) {
      applyStatus(entry, 'error', { errorKind: 'server' });
      return;
    }
    const status: ResultStatus = result.status;
    switch (status) {
      case 'translated':
        applyStatus(entry, 'translated', { translation: result.translation ?? '' });
        break;
      case 'same_language':
        applyStatus(entry, 'same_language');
        break;
      case 'error':
        applyStatus(entry, 'error', { errorKind: result.errorKind ?? 'server' });
        break;
    }
  }

  function forget(container: HTMLElement): void {
    const id = byContainer.get(container);
    if (id === undefined) return;
    byContainer.delete(container);
    if (tracked.get(id)?.container === container) tracked.delete(id);
  }

  function clearTracking(): void {
    tracked.clear();
    epoch += 1;
  }

  /* ---------------------------------------------------------------- */
  /* 수신 파이프라인                                                     */
  /* ---------------------------------------------------------------- */

  /** 방에 속한 수신 메시지인가(방 id 가 없으면 현재 방으로 본다). */
  function inRoom(info: MessageInfo): boolean {
    return !info.roomId || info.roomId === roomId;
  }

  /** 화면의 수신 메시지(문서 순)로 최신순 순번을 매긴다. 본문 없음·내 메시지는 순번을 차지하지 않는다. */
  function computeRanks(containers: HTMLElement[]): Map<string, number> {
    const ids: string[] = [];
    const texts: string[] = [];
    for (const container of containers) {
      const info = guard('readMessage', () => adapter.readMessage(container), null);
      if (!info || info.isOwn || !inRoom(info)) continue;
      ids.push(info.messageId);
      texts.push(info.hasBody ? info.text : '');
    }
    const ranks = rankFromNewest(texts);
    const map = new Map<string, number>();
    ids.forEach((id, i) => {
      map.set(id, ranks[i] ?? 0);
    });
    return map;
  }

  /**
   * 컨테이너들을 처리한다. 판정이 ok 인 것만 한 묶음으로 요청한다.
   * `changed` 는 수정 감지 틱: 해시가 같으면 아무것도 하지 않고, 다르면 새 본문으로 다시 번역한다.
   */
  function process(targets: HTMLElement[], options: { changed?: boolean } = {}): void {
    if (stopped || !incomingActive() || targets.length === 0) return;
    const all = guard('listMessageContainers', () => adapter.listMessageContainers(), []);
    const ranks = computeRanks(all);
    const batch = new Map<string, Tracked>();

    for (const container of targets) {
      guard(
        'process message',
        () => processOne(container, ranks, batch, options.changed === true),
        undefined,
      );
    }

    if (batch.size > 0) void sendBatch(Array.from(batch.values()));
  }

  function processOne(
    container: HTMLElement,
    ranks: Map<string, number>,
    batch: Map<string, Tracked>,
    changed: boolean,
  ): void {
    const info = adapter.readMessage(container);
    if (!info || info.isOwn || !inRoom(info)) return;

    const previousId = byContainer.get(container);
    if (previousId !== undefined && previousId !== info.messageId) forget(container);

    const text = info.hasBody ? info.text : '';
    const textHash = hashString(text);
    const existing = tracked.get(info.messageId);

    if (existing && existing.textHash === textHash) {
      existing.container = container;
      byContainer.set(container, info.messageId);
      if (changed) return;
      // 같은 메시지가 재렌더로 다시 추가됨 → 요청 없이 알던 상태를 다시 붙인다.
      if (
        existing.status !== 'pending' &&
        existing.status !== 'same_language' &&
        existing.status !== 'no_text' &&
        !deps.getMounted(container)
      ) {
        mountEntry(existing);
      }
      return;
    }

    const entry: Tracked = {
      messageId: info.messageId,
      text,
      textHash,
      status: 'pending',
      container,
    };
    tracked.set(info.messageId, entry);
    byContainer.set(container, info.messageId);

    const verdict = judgeLimits(text, ranks.get(info.messageId) ?? 1, limitOptions());
    if (verdict === 'no_text') {
      applyStatus(entry, 'no_text');
      return;
    }
    if (verdict === 'skipped_long' || verdict === 'skipped_limit') {
      applyStatus(entry, verdict);
      return;
    }
    applyStatus(entry, 'pending');
    batch.set(entry.messageId, entry);
  }

  async function sendBatch(entries: Tracked[]): Promise<void> {
    const sentEpoch = epoch;
    const room = roomId ?? '';
    const items: TranslateBatchItem[] = entries.map((e) => ({
      messageId: e.messageId,
      text: e.text,
      textHash: e.textHash,
    }));
    const response = await request('translate.batch', {
      roomId: room,
      targetLang: targetLang(),
      items,
    });
    if (stopped || sentEpoch !== epoch) return;
    const byId = new Map<string, TranslateBatchResultItem>();
    for (const item of response?.items ?? []) byId.set(item.messageId, item);
    for (const sent of entries) {
      const entry = tracked.get(sent.messageId);
      // 그 사이 수정되어 다른 요청이 나갔거나 사라진 메시지는 건너뛴다.
      if (!entry || entry.textHash !== sent.textHash || entry.status !== 'pending') continue;
      applyResult(entry, byId.get(sent.messageId));
    }
  }

  async function retry(messageId: string): Promise<void> {
    const entry = tracked.get(messageId);
    if (!entry || stopped || !incomingActive()) return;
    const sentEpoch = epoch;
    const { textHash } = entry;
    applyStatus(entry, 'pending');
    const response = await request('translate.retry', {
      roomId: roomId ?? '',
      targetLang: targetLang(),
      item: { messageId: entry.messageId, text: entry.text, textHash },
    });
    if (stopped || sentEpoch !== epoch) return;
    const current = tracked.get(messageId);
    if (!current || current.textHash !== textHash || current.status !== 'pending') return;
    applyResult(current, response?.item);
  }

  function processAll(): void {
    const all = guard('listMessageContainers', () => adapter.listMessageContainers(), []);
    process(all);
  }

  /** 켜짐 ↔ 꺼짐 전환(전역·키·방별). 꺼지면 즉시 제거, 켜지면 화면 전체를 다시 처리한다. */
  function refreshIncoming(): void {
    const active = incomingActive();
    if (active === lastIncomingActive) return;
    lastIncomingActive = active;
    if (active) {
      processAll();
    } else {
      clearTracking();
      guard('unmountAll', () => deps.unmountAll(), undefined);
    }
  }

  function refreshOutgoing(): void {
    guard('outgoing.setEnabled', () => outgoing?.setEnabled(outgoingEnabled()), undefined);
  }

  function updateHideOriginal(): void {
    const hideOriginal = settings?.hideOriginal === true;
    for (const entry of tracked.values()) {
      guard(
        'hideOriginal update',
        () => deps.getMounted(entry.container)?.update({ hideOriginal }),
        undefined,
      );
    }
  }

  function restoreOwn(containers: HTMLElement[]): void {
    if (!outgoing) return;
    const own = containers.filter((c) =>
      guard('readMessage', () => adapter.readMessage(c)?.isOwn === true, false),
    );
    if (own.length === 0) return;
    outgoing
      .restoreSentOriginals(own)
      .catch((error: unknown) => warn('restoreSentOriginals', error));
  }

  /* ---------------------------------------------------------------- */
  /* 방                                                                */
  /* ---------------------------------------------------------------- */

  function currentRoom(): RoomInfo | null {
    return guard('getCurrentRoom', () => adapter.getCurrentRoom(), null);
  }

  async function readRoomSettings(id: string): Promise<boolean> {
    try {
      const roomSettings = await deps.getRoomSettings(id);
      return roomSettings?.incomingDisabled === true;
    } catch (error) {
      warn('getRoomSettings', error);
      return false;
    }
  }

  /** 현재 방을 다시 보고, 바뀌었으면 방 상태를 초기화한 뒤 방 설정을 읽어 다시 처리한다. */
  async function syncRoom(): Promise<void> {
    const nextId = currentRoom()?.roomId ?? null;
    if (nextId !== roomId) {
      roomId = nextId;
      roomReady = false;
      roomLoading = null;
      lastReport = null;
      clearTracking();
      lastIncomingActive = false;
      guard('unmountAll', () => deps.unmountAll(), undefined);
    }
    if (roomId === null) {
      roomIncomingDisabled = false;
      return;
    }
    if (roomReady || roomLoading === roomId) return;
    const loadingFor = roomId;
    const loadEpoch = epoch;
    roomLoading = loadingFor;
    const disabled = await readRoomSettings(loadingFor);
    if (stopped || loadingFor !== roomId || loadEpoch !== epoch) return;
    roomLoading = null;
    roomIncomingDisabled = disabled;
    roomReady = true;
    mountOutgoing();
    refreshIncoming();
    restoreOwn(guard('listMessageContainers', () => adapter.listMessageContainers(), []));
  }

  async function reloadRoomSettings(): Promise<void> {
    if (roomId === null) return;
    const loadingFor = roomId;
    const disabled = await readRoomSettings(loadingFor);
    if (stopped || loadingFor !== roomId || !roomReady) return;
    roomIncomingDisabled = disabled;
    refreshIncoming();
  }

  function mountOutgoing(): void {
    if (!outgoing || roomId === null) return;
    const id = roomId;
    guard('outgoing.mount', () => outgoing?.mount(id, outgoingEnabled()), undefined);
  }

  /* ---------------------------------------------------------------- */
  /* 깨짐 감지·상태 보고                                                 */
  /* ---------------------------------------------------------------- */

  function clearBrokenTimer(): void {
    if (brokenTimer === null) return;
    deps.clearTimeout(brokenTimer);
    brokenTimer = null;
  }

  function report(found: boolean, messagesFound: number, roomDetected: boolean): void {
    const room = currentRoom();
    const payload: MessageMap['status.report']['request'] = { roomDetected, messagesFound };
    if (room) {
      payload.roomId = room.roomId;
      if (room.name) payload.roomName = room.name;
    }
    lastReport = { found, at: deps.now() };
    fireAndForget('status.report', payload);
  }

  /** 메시지 발견 여부를 보고한다. 발견 상태는 10초에 한 번, 상태가 뒤집히면 즉시. */
  function checkPresence(messagesFound: number): void {
    if (stopped) return;
    const inView = guard('isConversationView', () => adapter.isConversationView(), false);
    if (!inView) {
      clearBrokenTimer();
      if (lastReport === null) report(false, 0, false);
      return;
    }
    if (messagesFound > 0) {
      clearBrokenTimer();
      const flipped = lastReport === null || !lastReport.found;
      if (flipped || deps.now() - (lastReport?.at ?? 0) >= REPORT_THROTTLE_MS) {
        report(true, messagesFound, true);
      }
      return;
    }
    if (brokenTimer !== null) return;
    brokenTimer = deps.setTimeout(() => {
      brokenTimer = null;
      if (stopped) return;
      const stillInView = guard('isConversationView', () => adapter.isConversationView(), false);
      const count = guard(
        'listMessageContainers',
        () => adapter.listMessageContainers(),
        [],
      ).length;
      if (stillInView && count === 0) report(false, 0, true);
    }, DEFAULTS.brokenDetectMs);
  }

  /* ---------------------------------------------------------------- */
  /* 관찰 틱                                                            */
  /* ---------------------------------------------------------------- */

  function onTick(added: HTMLElement[], removed: HTMLElement[], changed: HTMLElement[]): void {
    if (stopped) return;
    for (const container of removed) guard('forget', () => forget(container), undefined);
    const roomChanged = (currentRoom()?.roomId ?? null) !== roomId;
    if (roomChanged || !roomReady) void syncRoom();
    const count = guard('listMessageContainers', () => adapter.listMessageContainers(), []).length;
    checkPresence(count);
    if (roomChanged || !roomReady) return;
    if (added.length > 0) {
      process(added);
      restoreOwn(added);
      mountOutgoing();
    }
    if (changed.length > 0) process(changed, { changed: true });
  }

  /* ---------------------------------------------------------------- */
  /* 테마                                                               */
  /* ---------------------------------------------------------------- */

  function applyTheme(): void {
    const next = guard('getChatTheme', () => adapter.getChatTheme(), theme);
    if (next === theme) return;
    theme = next;
    for (const entry of tracked.values()) {
      guard('setTheme', () => deps.getMounted(entry.container)?.setTheme(next), undefined);
    }
    // 발신 컨트롤러는 setTheme 이 없어 다시 mount 해 테마를 맞춘다(같은 입력창이면 상태만 갱신).
    mountOutgoing();
  }

  function observeTheme(): void {
    const target = deps.themeTarget();
    if (!target || typeof MutationObserver === 'undefined') return;
    try {
      themeObserver = new MutationObserver(() => applyTheme());
      themeObserver.observe(target, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (error) {
      warn('theme observer', error);
      themeObserver = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 설정                                                               */
  /* ---------------------------------------------------------------- */

  function applySettings(next: GlobalSettings, nextCanTranslate: boolean): void {
    const prevHide = settings?.hideOriginal === true;
    settings = next;
    canTranslate = nextCanTranslate;
    refreshOutgoing();
    refreshIncoming();
    if (prevHide !== (next.hideOriginal === true)) updateHideOriginal();
  }

  async function loadSettings(): Promise<void> {
    try {
      const response = await deps.sendMessage('settings.get', {});
      if (stopped) return;
      if (response?.settings) {
        applySettings(response.settings, response.canTranslate === true);
        return;
      }
    } catch (error) {
      warn('settings.get', error);
    }
    // 설정을 못 받으면 꺼진 것으로 둔다. settings.changed 브로드캐스트가 오면 복구된다.
    settings = null;
    canTranslate = false;
  }

  /* ---------------------------------------------------------------- */
  /* 공개 API                                                           */
  /* ---------------------------------------------------------------- */

  async function start(): Promise<void> {
    if (started || stopped) return;
    started = true;

    theme = guard('getChatTheme', () => adapter.getChatTheme(), 'light');
    outgoing = guard('createOutgoingController', () => deps.createOutgoingController(), null);

    disposers.push(
      deps.onMessage({
        'settings.changed': (payload) => {
          guard(
            'settings.changed',
            () => applySettings(payload.settings, payload.canTranslate === true),
            undefined,
          );
          return undefined;
        },
        'command.translateOutgoing': () => {
          guard('command.translateOutgoing', () => outgoing?.onCommand(), undefined);
          return undefined;
        },
        'room.current': () => {
          const room = currentRoom();
          return room ? { roomId: room.roomId, ...(room.name ? { name: room.name } : {}) } : null;
        },
      }),
    );
    disposers.push(
      deps.watchRoomSettings(() => {
        void reloadRoomSettings();
      }),
    );
    disposers.push(adapter.observeMessages(onTick));
    observeTheme();

    await loadSettings();
    if (stopped) return;
    await syncRoom();
    if (stopped) return;
    checkPresence(guard('listMessageContainers', () => adapter.listMessageContainers(), []).length);
  }

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearBrokenTimer();
    for (const dispose of disposers.splice(0)) guard('dispose', dispose, undefined);
    try {
      themeObserver?.disconnect();
    } catch {
      // 이미 해제됨
    }
    themeObserver = null;
    clearTracking();
    guard('unmountAll', () => deps.unmountAll(), undefined);
    guard('outgoing.destroy', () => outgoing?.destroy(), undefined);
    outgoing = null;
  }

  function getState(): Readonly<ContentState> {
    return {
      roomId,
      incomingActive: incomingActive(),
      outgoingEnabled: outgoingEnabled(),
      tracked: tracked.size,
    };
  }

  return { start, stop, getState };
}
