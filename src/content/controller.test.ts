import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../config/defaults';
import { hashString } from '../engine/hash';
import type { MessageInfo, MessageObserverCallback, RoomInfo } from '../gchat/adapter';
import type { Handlers, MessageKind, MessageMap } from '../messaging/protocol';
import {
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  type RoomSettings,
} from '../settings/schema';
import type { IncomingHandle, IncomingProps } from '../ui/incoming/mount';
import type { Theme } from '../ui/theme';
import {
  type ContentAdapter,
  type ContentController,
  type ContentDeps,
  createContentController,
  type OutgoingLike,
  REPORT_THROTTLE_MS,
} from './controller';

const ROOM = 'dm/room1';
const ROOM_NAME = 'Alice';

/* ------------------------------------------------------------------ */
/* 가짜 어댑터                                                          */
/* ------------------------------------------------------------------ */

interface AddOptions {
  own?: boolean;
  hasBody?: boolean;
  roomId?: string;
}

interface FakeAdapter extends ContentAdapter {
  room: RoomInfo | null;
  inView: boolean;
  theme: Theme;
  containers: HTMLElement[];
  infos: Map<HTMLElement, MessageInfo>;
  observer: MessageObserverCallback | null;
  observeCount: number;
  disconnectCount: number;
  add(id: string, text: string, options?: AddOptions): HTMLElement;
  setText(container: HTMLElement, text: string): void;
  remove(container: HTMLElement): void;
  emit(added?: HTMLElement[], removed?: HTMLElement[], changed?: HTMLElement[]): void;
}

function makeAdapter(): FakeAdapter {
  const list = document.createElement('div');
  list.className = 'messages';
  document.body.append(list);
  const fake: FakeAdapter = {
    room: { roomId: ROOM, name: ROOM_NAME },
    inView: true,
    theme: 'light',
    containers: [],
    infos: new Map(),
    observer: null,
    observeCount: 0,
    disconnectCount: 0,
    getCurrentRoom: vi.fn(() => (fake.room ? { ...fake.room } : null)),
    isConversationView: vi.fn(() => fake.inView),
    listMessageContainers: vi.fn(() => [...fake.containers]),
    readMessage: vi.fn((c: HTMLElement | null | undefined) =>
      c ? (fake.infos.get(c) ?? null) : null,
    ),
    getTranslationAnchor: vi.fn(
      (c: HTMLElement | null | undefined) => c?.querySelector<HTMLElement>('.body') ?? null,
    ),
    observeMessages: vi.fn((cb: MessageObserverCallback) => {
      fake.observer = cb;
      fake.observeCount += 1;
      return () => {
        fake.disconnectCount += 1;
        if (fake.observer === cb) fake.observer = null;
      };
    }),
    getChatTheme: vi.fn(() => fake.theme),
    add(id, text, options = {}) {
      const c = document.createElement('div');
      c.setAttribute('role', 'group');
      c.dataset.id = id;
      const hasBody = options.hasBody ?? true;
      let body: HTMLElement | null = null;
      if (hasBody) {
        body = document.createElement('div');
        body.className = 'body';
        body.textContent = text;
        c.append(body);
      }
      list.append(c);
      fake.containers.push(c);
      fake.infos.set(c, {
        messageId: id,
        roomId: options.roomId ?? fake.room?.roomId ?? ROOM,
        senderId: options.own ? 'me' : 'other',
        isOwn: options.own ?? false,
        text: hasBody ? text : '',
        hasBody,
        idSource: 'dom',
        bodyEl: body,
      });
      return c;
    },
    setText(container, text) {
      const info = fake.infos.get(container);
      if (!info) throw new Error('unknown container');
      info.text = text;
      if (info.bodyEl) info.bodyEl.textContent = text;
    },
    remove(container) {
      fake.containers = fake.containers.filter((c) => c !== container);
      fake.infos.delete(container);
      container.remove();
    },
    emit(added = [], removed = [], changed = []) {
      fake.observer?.(added, removed, changed);
    },
  };
  return fake;
}

/* ------------------------------------------------------------------ */
/* 가짜 메시징                                                          */
/* ------------------------------------------------------------------ */

type Sent = { kind: MessageKind; payload: unknown };
type BatchRequest = MessageMap['translate.batch']['request'];
type BatchResponse = MessageMap['translate.batch']['response'];
type RetryRequest = MessageMap['translate.retry']['request'];
type RetryResponse = MessageMap['translate.retry']['response'];
type SettingsResponse = MessageMap['settings.get']['response'];

interface FakeMessaging {
  send: ContentDeps['sendMessage'];
  sent: Sent[];
  of<K extends MessageKind>(kind: K): MessageMap[K]['request'][];
  settings: SettingsResponse;
  batch: (payload: BatchRequest) => Promise<BatchResponse | undefined>;
  retry: (payload: RetryRequest) => Promise<RetryResponse | undefined>;
  handlers: Handlers | null;
  onMessage: ContentDeps['onMessage'];
  removeCount: number;
  invoke<K extends MessageKind>(
    kind: K,
    payload: MessageMap[K]['request'],
  ): Promise<MessageMap[K]['response']>;
}

function translatedItems(payload: BatchRequest): BatchResponse {
  return {
    items: payload.items.map((i) => ({
      messageId: i.messageId,
      status: 'translated' as const,
      translation: `[${payload.targetLang}] ${i.text}`,
      detectedLang: 'en',
    })),
  };
}

function makeMessaging(settings: Partial<GlobalSettings> = {}, canTranslate = true): FakeMessaging {
  const m: FakeMessaging = {
    sent: [],
    settings: { settings: { ...DEFAULT_GLOBAL_SETTINGS, ...settings }, canTranslate },
    batch: async (payload) => translatedItems(payload),
    retry: async ({ item, targetLang }) => ({
      item: {
        messageId: item.messageId,
        status: 'translated',
        translation: `[retry ${targetLang}] ${item.text}`,
        detectedLang: 'en',
      },
    }),
    handlers: null,
    removeCount: 0,
    of: (kind) => m.sent.filter((s) => s.kind === kind).map((s) => s.payload as never),
    send: (async (kind: MessageKind, payload: unknown) => {
      m.sent.push({ kind, payload });
      switch (kind) {
        case 'settings.get':
          return m.settings;
        case 'translate.batch':
          return m.batch(payload as BatchRequest);
        case 'translate.retry':
          return m.retry(payload as RetryRequest);
        default:
          return undefined;
      }
    }) as ContentDeps['sendMessage'],
    onMessage: vi.fn((handlers: Handlers) => {
      m.handlers = handlers;
      return () => {
        m.removeCount += 1;
        if (m.handlers === handlers) m.handlers = null;
      };
    }),
    invoke: async (kind, payload) => {
      const handler = m.handlers?.[kind];
      if (!handler) throw new Error(`no handler for ${kind}`);
      return (handler as (p: unknown, s: { tabId?: number }) => unknown)(payload, {}) as never;
    },
  };
  return m;
}

/* ------------------------------------------------------------------ */
/* 가짜 마운트                                                          */
/* ------------------------------------------------------------------ */

interface FakeHandle extends IncomingHandle {
  container: HTMLElement;
  theme: Theme;
  props: Partial<IncomingProps>;
  updates: Partial<IncomingProps>[];
  themes: Theme[];
  unmounted: boolean;
  /** false 로 바꾸면 Google 이 본문을 다시 그려 호스트가 사라진 상황을 흉내 낸다. */
  attached: boolean;
}

interface FakeMounts {
  handles: Map<HTMLElement, FakeHandle>;
  all: FakeHandle[];
  mountIncoming: ContentDeps['mountIncoming'];
  getMounted: ContentDeps['getMounted'];
  unmountAll: ContentDeps['unmountAll'];
  unmountAllCount: number;
  handleOf(container: HTMLElement): FakeHandle;
  statusOf(container: HTMLElement): string | undefined;
}

function makeMounts(): FakeMounts {
  const mounts: FakeMounts = {
    handles: new Map(),
    all: [],
    unmountAllCount: 0,
    mountIncoming: vi.fn((container, anchor, theme, initial) => {
      if (!container || !anchor) return null;
      const existing = mounts.handles.get(container);
      if (existing) {
        existing.theme = theme;
        existing.attached = true;
        if (initial) existing.update(initial);
        return existing;
      }
      const handle: FakeHandle = {
        container,
        host: document.createElement('gat-incoming'),
        theme,
        props: { ...(initial ?? {}) },
        updates: [],
        themes: [],
        unmounted: false,
        attached: true,
        isAttached() {
          return handle.attached;
        },
        update(props) {
          handle.props = { ...handle.props, ...props };
          handle.updates.push(props);
        },
        setTheme(t) {
          handle.theme = t;
          handle.themes.push(t);
        },
        unmount() {
          handle.unmounted = true;
          mounts.handles.delete(container);
        },
      };
      mounts.handles.set(container, handle);
      mounts.all.push(handle);
      return handle;
    }),
    getMounted: vi.fn((container) => (container ? (mounts.handles.get(container) ?? null) : null)),
    unmountAll: vi.fn(() => {
      mounts.unmountAllCount += 1;
      for (const h of Array.from(mounts.handles.values())) h.unmount();
    }),
    handleOf(container) {
      const h = mounts.handles.get(container);
      if (!h) throw new Error('not mounted');
      return h;
    },
    statusOf(container) {
      return mounts.handles.get(container)?.props.status;
    },
  };
  return mounts;
}

/* ------------------------------------------------------------------ */
/* 가짜 발신 컨트롤러 · 방 설정                                           */
/* ------------------------------------------------------------------ */

interface FakeOutgoing extends OutgoingLike {
  mountCalls: { roomId: string; enabled: boolean }[];
  enabledCalls: boolean[];
}

function makeOutgoing(): FakeOutgoing {
  const o: FakeOutgoing = {
    mountCalls: [],
    enabledCalls: [],
    mount: vi.fn((roomId: string, enabled: boolean) => {
      o.mountCalls.push({ roomId, enabled });
    }),
    setEnabled: vi.fn((enabled: boolean) => {
      o.enabledCalls.push(enabled);
    }),
    onCommand: vi.fn(),
    restoreSentOriginals: vi.fn(async () => {}),
    destroy: vi.fn(),
  };
  return o;
}

interface FakeRooms {
  map: Map<string, RoomSettings>;
  watcher: (() => void) | null;
  unwatchCount: number;
  getRoomSettings: ContentDeps['getRoomSettings'];
  watchRoomSettings: ContentDeps['watchRoomSettings'];
  set(roomId: string, incomingDisabled: boolean): void;
}

function makeRooms(): FakeRooms {
  const r: FakeRooms = {
    map: new Map(),
    watcher: null,
    unwatchCount: 0,
    getRoomSettings: vi.fn(async (roomId: string) => r.map.get(roomId) ?? null),
    watchRoomSettings: vi.fn((cb: () => void) => {
      r.watcher = cb;
      return () => {
        r.unwatchCount += 1;
        if (r.watcher === cb) r.watcher = null;
      };
    }),
    set(roomId, incomingDisabled) {
      r.map.set(roomId, { roomId, incomingDisabled });
    },
  };
  return r;
}

/* ------------------------------------------------------------------ */
/* 조립                                                                */
/* ------------------------------------------------------------------ */

interface Rig {
  adapter: FakeAdapter;
  messaging: FakeMessaging;
  mounts: FakeMounts;
  outgoing: FakeOutgoing;
  rooms: FakeRooms;
  controller: ContentController;
}

interface RigParts {
  adapter?: FakeAdapter;
  messaging?: FakeMessaging;
  mounts?: FakeMounts;
}

function buildRig(parts: RigParts): Rig {
  const adapter = parts.adapter ?? makeAdapter();
  const messaging = parts.messaging ?? makeMessaging();
  const mounts = parts.mounts ?? makeMounts();
  const outgoing = makeOutgoing();
  const rooms = makeRooms();
  const controller = createContentController({
    adapter,
    sendMessage: messaging.send,
    onMessage: messaging.onMessage,
    getRoomSettings: rooms.getRoomSettings,
    watchRoomSettings: rooms.watchRoomSettings,
    mountIncoming: mounts.mountIncoming,
    getMounted: mounts.getMounted,
    unmountAll: mounts.unmountAll,
    createOutgoingController: () => outgoing,
    now: () => Date.now(),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
  });
  return { adapter, messaging, mounts, outgoing, rooms, controller };
}

function makeRig(settings: Partial<GlobalSettings> = {}, canTranslate = true): Rig {
  return buildRig({ messaging: makeMessaging(settings, canTranslate) });
}

const flush = () => vi.advanceTimersByTimeAsync(0);
/** 로딩 표시 유예 시간을 넘긴다. */
const pastPlaceholderDelay = () => vi.advanceTimersByTimeAsync(DEFAULTS.placeholderDelayMs);

let rig: Rig | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-theme');
});

afterEach(() => {
  rig?.controller.stop();
  rig = null;
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/* 시작·수신 파이프라인                                                  */
/* ------------------------------------------------------------------ */

describe('start', () => {
  it('settings.get 을 받고, 상태 보고를 보내고, 수신 텍스트 메시지만 한 묶음으로 요청한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, outgoing } = rig;
    const a = adapter.add('a', 'hello');
    const own = adapter.add('b', 'my own', { own: true });
    const noText = adapter.add('c', '', { hasBody: false });
    const d = adapter.add('d', 'world');

    await rig.controller.start();
    await flush();

    expect(messaging.of('settings.get')).toHaveLength(1);

    const reports = messaging.of('status.report');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual({
      roomId: ROOM,
      roomName: ROOM_NAME,
      roomDetected: true,
      messagesFound: 4,
    });

    const batches = messaging.of('translate.batch');
    expect(batches).toHaveLength(1);
    expect(batches[0]?.roomId).toBe(ROOM);
    expect(batches[0]?.targetLang).toBe(DEFAULT_GLOBAL_SETTINGS.targetLang);
    expect(batches[0]?.items).toEqual([
      { messageId: 'a', text: 'hello', textHash: hashString('hello') },
      { messageId: 'd', text: 'world', textHash: hashString('world') },
    ]);

    expect(mounts.handles.has(own)).toBe(false);
    expect(mounts.handles.has(noText)).toBe(false);
    expect(mounts.handleOf(a).props.status).toBe('translated');
    expect(mounts.handleOf(a).props.translation).toBe('[ko] hello');
    expect(mounts.handleOf(d).props.status).toBe('translated');

    expect(outgoing.mountCalls).toContainEqual({ roomId: ROOM, enabled: true });
    expect(outgoing.restoreSentOriginals).toHaveBeenCalledWith([own]);
  });

  it('응답이 늦으면 유예 뒤 pending 을 붙이고, 응답에 따라 translated / error / same_language 로 바꾼다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const ok = adapter.add('ok', 'translate me');
    const bad = adapter.add('bad', 'broken');
    // 문자로는 언어를 가를 수 없어 서비스가 같은 언어로 판정하는 경우(예: 코드만 있는 메시지)
    const same = adapter.add('same', 'npm run build');

    let resolveBatch: ((v: BatchResponse) => void) | null = null;
    messaging.batch = () =>
      new Promise<BatchResponse>((resolve) => {
        resolveBatch = resolve;
      });

    await rig.controller.start();
    await flush();
    // 유예 시간 안에는 아직 아무것도 붙이지 않는다.
    expect(mounts.handles.size).toBe(0);
    await pastPlaceholderDelay();

    expect(mounts.statusOf(ok)).toBe('pending');
    expect(mounts.statusOf(bad)).toBe('pending');
    expect(mounts.statusOf(same)).toBe('pending');
    expect(mounts.mountIncoming).toHaveBeenCalledWith(ok, ok.querySelector('.body'), 'light', {
      status: 'pending',
      onRetry: expect.any(Function),
    });

    if (!resolveBatch) throw new Error('batch not sent');
    (resolveBatch as (v: BatchResponse) => void)({
      items: [
        { messageId: 'ok', status: 'translated', translation: 'OK', detectedLang: 'en' },
        { messageId: 'bad', status: 'error', errorKind: 'rate_limit' },
        { messageId: 'same', status: 'same_language', detectedLang: 'ko' },
      ],
    });
    await flush();

    expect(mounts.handleOf(ok).props).toMatchObject({ status: 'translated', translation: 'OK' });
    expect(mounts.handleOf(bad).props).toMatchObject({ status: 'error', errorKind: 'rate_limit' });
    expect(mounts.handles.has(same)).toBe(false);
  });

  it('새로 추가된 메시지는 다음 틱에 묶어서 요청하고 내 메시지는 복원 대상으로 넘긴다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, outgoing } = rig;
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);

    const n1 = adapter.add('n1', 'first');
    const n2 = adapter.add('n2', 'second');
    const mine = adapter.add('mine', 'sent by me', { own: true });
    adapter.emit([n1, n2, mine]);
    await flush();

    const batches = messaging.of('translate.batch');
    expect(batches).toHaveLength(1);
    expect(batches[0]?.items.map((i) => i.messageId)).toEqual(['n1', 'n2']);
    expect(mounts.statusOf(n1)).toBe('translated');
    expect(mounts.statusOf(n2)).toBe('translated');
    expect(mounts.handles.has(mine)).toBe(false);
    expect(outgoing.restoreSentOriginals).toHaveBeenLastCalledWith([mine]);
  });
});

describe('로딩 표시 유예', () => {
  it('응답이 유예 시간 안에 오면 로딩 표시 없이 바로 번역 블록을 붙인다', async () => {
    rig = makeRig();
    const { adapter, mounts } = rig;
    const a = adapter.add('a', 'cached hello');
    await rig.controller.start();
    await flush();
    expect(mounts.statusOf(a)).toBe('translated');
    await pastPlaceholderDelay();
    const calls = (mounts.mountIncoming as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[3]).toMatchObject({ status: 'translated', translation: '[ko] cached hello' });
    const handle = mounts.handleOf(a);
    expect(handle.updates.some((u) => u.status === 'pending')).toBe(false);
    expect(mounts.statusOf(a)).toBe('translated');
  });

  it('같은 언어 결과가 유예 시간 안에 오면 아무것도 붙이지 않는다(깜빡임 없음)', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    messaging.batch = async (payload) => ({
      items: payload.items.map((i) => ({
        messageId: i.messageId,
        status: 'same_language' as const,
        detectedLang: 'ko',
      })),
    });
    const a = adapter.add('a', '안녕하세요');
    await rig.controller.start();
    await flush();
    await pastPlaceholderDelay();
    expect(mounts.mountIncoming).not.toHaveBeenCalled();
    expect(mounts.handles.has(a)).toBe(false);
  });

  it('응답이 늦으면 유예 뒤 로딩 표시를 붙이고 결과가 오면 최종 상태로 바꾼다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    let resolveBatch: ((v: BatchResponse) => void) | null = null;
    messaging.batch = () =>
      new Promise<BatchResponse>((resolve) => {
        resolveBatch = resolve;
      });
    const a = adapter.add('a', 'slow');
    await rig.controller.start();
    await vi.advanceTimersByTimeAsync(DEFAULTS.placeholderDelayMs - 1);
    expect(mounts.handles.has(a)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(mounts.statusOf(a)).toBe('pending');
    (resolveBatch as unknown as (v: BatchResponse) => void)({
      items: [{ messageId: 'a', status: 'translated', translation: 'SLOW', detectedLang: 'en' }],
    });
    await flush();
    expect(mounts.handleOf(a).props).toMatchObject({ status: 'translated', translation: 'SLOW' });
  });

  it('방이 바뀌거나 정지하면 대기 중인 로딩 표시 타이머를 취소한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    messaging.batch = () => new Promise<BatchResponse>(() => {});
    adapter.add('a', 'pending forever');
    await rig.controller.start();
    await flush();
    adapter.room = { roomId: 'space/room2' };
    adapter.emit();
    await pastPlaceholderDelay();
    expect(mounts.mountIncoming).not.toHaveBeenCalled();

    const rig2 = makeRig();
    rig2.messaging.batch = () => new Promise<BatchResponse>(() => {});
    rig2.adapter.add('b', 'pending forever');
    await rig2.controller.start();
    await flush();
    rig2.controller.stop();
    await pastPlaceholderDelay();
    expect(rig2.mounts.mountIncoming).not.toHaveBeenCalled();
  });
});

describe('상한 판정', () => {
  it('긴 메시지는 skipped_long, 방당 상한 밖은 skipped_limit 으로 붙이고 요청하지 않는다', async () => {
    rig = makeRig({ maxMessageChars: 5, maxAutoPerRoom: 2 });
    const { adapter, messaging, mounts } = rig;
    const oldest = adapter.add('oldest', 'old');
    const long = adapter.add('long', 'this is too long');
    const mid = adapter.add('mid', 'mid');
    const newest = adapter.add('newest', 'new');

    await rig.controller.start();
    await flush();

    expect(mounts.statusOf(long)).toBe('skipped_long');
    expect(mounts.statusOf(oldest)).toBe('skipped_limit');
    expect(mounts.statusOf(mid)).toBe('translated');
    expect(mounts.statusOf(newest)).toBe('translated');
    expect(messaging.of('translate.batch')[0]?.items.map((i) => i.messageId)).toEqual([
      'mid',
      'newest',
    ]);
  });

  it('대상 언어(한국어)로 쓰인 메시지는 영어 용어가 섞여도 요청하지 않고 아무것도 붙이지 않는다', async () => {
    rig = makeRig({ targetLang: 'ko' });
    const { adapter, messaging, mounts } = rig;
    const korean = adapter.add(
      'ko',
      'Producer, talent, staff 계정을 새로 다 만들어서 다시 테스트 할 계획이야',
    );
    const english = adapter.add('en', 'Please check the invoice page');

    await rig.controller.start();
    await flush();

    expect(mounts.statusOf(korean)).toBeUndefined();
    expect(mounts.statusOf(english)).toBe('translated');
    expect(messaging.of('translate.batch')[0]?.items.map((i) => i.messageId)).toEqual(['en']);
  });

  it('순번은 본문 있는 수신 메시지만 세고 내 메시지·본문 없음은 건너뛴다', async () => {
    rig = makeRig({ maxAutoPerRoom: 2 });
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'A');
    adapter.add('own', 'mine', { own: true });
    adapter.add('nobody', '', { hasBody: false });
    const d = adapter.add('d', 'D');
    const e = adapter.add('e', 'E');

    await rig.controller.start();
    await flush();

    expect(mounts.statusOf(a)).toBe('skipped_limit');
    expect(mounts.statusOf(d)).toBe('translated');
    expect(mounts.statusOf(e)).toBe('translated');
    expect(messaging.of('translate.batch')[0]?.items.map((i) => i.messageId)).toEqual(['d', 'e']);
  });

  it('새로 도착한 메시지는 항상 상한 안이다', async () => {
    rig = makeRig({ maxAutoPerRoom: 1 });
    const { adapter, messaging, mounts } = rig;
    const first = adapter.add('first', 'one');
    await rig.controller.start();
    await flush();
    expect(mounts.statusOf(first)).toBe('translated');

    const second = adapter.add('second', 'two');
    adapter.emit([second]);
    await flush();
    expect(mounts.statusOf(second)).toBe('translated');
    // 이미 붙은 번역문은 그대로 둔다.
    expect(mounts.statusOf(first)).toBe('translated');
    expect(messaging.of('translate.batch')).toHaveLength(2);
  });

  it('화면에서 빠진 메시지도 방당 상한 순번에 계속 센다(가상 스크롤로 위로 불러오기)', async () => {
    rig = makeRig({ maxAutoPerRoom: 200 });
    const { adapter, mounts } = rig;
    const all: HTMLElement[] = [];
    for (let i = 1; i <= 250; i++)
      all.push(adapter.add(`m${String(i).padStart(3, '0')}`, `msg ${i}`));
    /** 화면에는 한 번에 100개만 있다(from..to, 1부터). */
    const window = (from: number, to: number) => all.slice(from - 1, to);

    adapter.containers = window(151, 250);
    await rig.controller.start();
    await flush();

    for (const [from, to] of [
      [101, 200],
      [51, 150],
      [1, 100],
    ] as const) {
      const prev = adapter.containers;
      const next = window(from, to);
      const removed = prev.filter((c) => !next.includes(c));
      const added = next.filter((c) => !prev.includes(c));
      adapter.containers = next;
      adapter.emit(added, removed);
      await flush();
    }

    const statuses = all.map((c) => mounts.statusOf(c));
    expect(statuses.slice(0, 50).every((st) => st === 'skipped_limit')).toBe(true);
    expect(statuses.slice(50).every((st) => st === 'translated')).toBe(true);

    // 새로 도착한 메시지는 여전히 순번 1 이다.
    const fresh = adapter.add('m251', 'fresh');
    adapter.containers = [...window(1, 100), fresh];
    adapter.emit([fresh]);
    await flush();
    expect(mounts.statusOf(fresh)).toBe('translated');
  });

  it('방이 바뀌면 누적 순번을 새로 센다', async () => {
    rig = makeRig({ maxAutoPerRoom: 2 });
    const { adapter, mounts } = rig;
    const a = adapter.add('a', 'A');
    const b = adapter.add('b', 'B');
    await rig.controller.start();
    await flush();
    adapter.room = { roomId: 'space/room2' };
    adapter.containers = [];
    adapter.emit([], [a, b]);
    await flush();
    const c = adapter.add('c', 'C', { roomId: 'space/room2' });
    const d = adapter.add('d', 'D', { roomId: 'space/room2' });
    adapter.emit([c, d]);
    await flush();
    expect(mounts.statusOf(c)).toBe('translated');
    expect(mounts.statusOf(d)).toBe('translated');
  });
});

describe('수정 감지', () => {
  it('본문 해시가 바뀐 changed 는 pending 으로 되돌리고 다시 요청하며, 같은 해시는 요청하지 않는다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const m = adapter.add('m', 'before');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);

    adapter.emit([], [], [m]);
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);

    let resolveBatch: ((v: BatchResponse) => void) | null = null;
    messaging.batch = (payload) =>
      new Promise<BatchResponse>((resolve) => {
        resolveBatch = (v) => resolve(v ?? translatedItems(payload));
      });
    adapter.setText(m, 'after');
    adapter.emit([], [], [m]);
    await flush();

    const batches = messaging.of('translate.batch');
    expect(batches).toHaveLength(2);
    expect(batches[1]?.items).toEqual([
      { messageId: 'm', text: 'after', textHash: hashString('after') },
    ]);
    expect(mounts.statusOf(m)).toBe('pending');

    if (!resolveBatch) throw new Error('batch not sent');
    (resolveBatch as (v: BatchResponse) => void)({
      items: [{ messageId: 'm', status: 'translated', translation: 'AFTER', detectedLang: 'en' }],
    });
    await flush();
    expect(mounts.handleOf(m).props).toMatchObject({ status: 'translated', translation: 'AFTER' });
  });

  it('제거된 뒤 다시 추가된 컨테이너는 새 메시지처럼 처리한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const m = adapter.add('m', 'text');
    await rig.controller.start();
    await flush();

    adapter.remove(m);
    adapter.emit([], [m]);
    await flush();

    const again = adapter.add('m', 'text');
    adapter.emit([again]);
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(2);
    expect(mounts.statusOf(again)).toBe('translated');
  });
});

/* ------------------------------------------------------------------ */
/* 전역·방별 스위치, 키                                                  */
/* ------------------------------------------------------------------ */

describe('전역 스위치·키 상태', () => {
  it('settings.changed 로 꺼지면 모두 제거하고 요청하지 않으며 발신 버튼도 끈다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, outgoing } = rig;
    adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(mounts.handles.size).toBe(1);

    await messaging.invoke('settings.changed', {
      settings: { ...DEFAULT_GLOBAL_SETTINGS, enabled: false },
      canTranslate: false,
      reason: 'disabled',
    });
    await flush();
    expect(mounts.unmountAll).toHaveBeenCalled();
    expect(mounts.handles.size).toBe(0);
    expect(outgoing.enabledCalls.at(-1)).toBe(false);

    const n = adapter.add('n', 'new one');
    adapter.emit([n]);
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(mounts.handles.has(n)).toBe(false);
  });

  it('다시 켜면 화면의 수신 메시지를 다시 처리한다', async () => {
    rig = makeRig({ enabled: false }, false);
    const { adapter, messaging, mounts, outgoing } = rig;
    const a = adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: ROOM, enabled: false });

    await messaging.invoke('settings.changed', {
      settings: { ...DEFAULT_GLOBAL_SETTINGS, enabled: true },
      canTranslate: true,
    });
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(mounts.statusOf(a)).toBe('translated');
    expect(outgoing.enabledCalls.at(-1)).toBe(true);
  });

  it('canTranslate 가 false 면(키 없음) 요청하지 않고 발신 버튼도 꺼진다', async () => {
    rig = makeRig({}, false);
    const { adapter, messaging, mounts, outgoing } = rig;
    adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);
    expect(mounts.handles.size).toBe(0);
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: ROOM, enabled: false });
  });

  it('settings.get 이 실패하면 꺼진 것처럼 동작한다', async () => {
    const messaging = makeMessaging();
    const original = messaging.send;
    messaging.send = (async (kind: MessageKind, payload: unknown) => {
      if (kind === 'settings.get') throw new Error('disconnected');
      return (original as (k: MessageKind, p: unknown) => Promise<unknown>)(kind, payload);
    }) as ContentDeps['sendMessage'];
    rig = buildRig({ messaging });
    const { adapter, mounts } = rig;
    adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);
    expect(mounts.handles.size).toBe(0);
  });

  it('settings.get 이 한 번 실패하면 잠시 뒤 다시 물어 복구한다', async () => {
    const messaging = makeMessaging();
    const original = messaging.send;
    let failures = 1;
    messaging.send = (async (kind: MessageKind, payload: unknown) => {
      if (kind === 'settings.get' && failures > 0) {
        failures -= 1;
        throw new Error('disconnected');
      }
      return (original as (k: MessageKind, p: unknown) => Promise<unknown>)(kind, payload);
    }) as ContentDeps['sendMessage'];
    rig = buildRig({ messaging });
    rig.adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(messaging.of('translate.batch').length).toBeGreaterThan(0);
  });

  it('본문이 다시 그려져 호스트가 사라지면 해시가 같아도 요청 없이 마지막 결과를 다시 붙인다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(mounts.handleOf(a).props).toMatchObject({
      status: 'translated',
      translation: '[ko] hello',
    });
    const mountCalls = (mounts.mountIncoming as ReturnType<typeof vi.fn>).mock.calls.length;

    // 호스트가 제자리에 있으면 changed 틱에도 아무것도 하지 않는다.
    adapter.emit([], [], [a]);
    await flush();
    expect((mounts.mountIncoming as ReturnType<typeof vi.fn>).mock.calls.length).toBe(mountCalls);

    // Google 이 본문을 다시 그려 호스트·감싸개를 지움 → 같은 해시 → 요청 없이 다시 붙인다.
    mounts.handleOf(a).attached = false;
    adapter.emit([], [], [a]);
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(messaging.of('translate.retry')).toHaveLength(0);
    expect((mounts.mountIncoming as ReturnType<typeof vi.fn>).mock.calls.length).toBe(
      mountCalls + 1,
    );
    expect(mounts.handleOf(a).attached).toBe(true);
    expect(mounts.handleOf(a).props).toMatchObject({
      status: 'translated',
      translation: '[ko] hello',
    });
  });

  it('대상 언어를 바꿔도 붙어 있는 번역문은 그대로 두고 새 메시지부터 새 언어로 요청한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();

    await messaging.invoke('settings.changed', {
      settings: { ...DEFAULT_GLOBAL_SETTINGS, targetLang: 'ja' },
      canTranslate: true,
    });
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(mounts.handleOf(a).props.translation).toBe('[ko] hello');

    const n = adapter.add('n', 'later');
    adapter.emit([n]);
    await flush();
    expect(messaging.of('translate.batch')[1]?.targetLang).toBe('ja');
  });
});

describe('대화방별 끄기', () => {
  it('꺼진 방에서는 요청하지 않지만 발신 버튼은 켜진 채로 둔다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, outgoing, rooms } = rig;
    rooms.set(ROOM, true);
    adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();

    expect(rooms.getRoomSettings).toHaveBeenCalledWith(ROOM);
    expect(messaging.of('translate.batch')).toHaveLength(0);
    expect(mounts.handles.size).toBe(0);
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: ROOM, enabled: true });

    const n = adapter.add('n', 'new');
    adapter.emit([n]);
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(0);
  });

  it('방 설정이 바뀌면 다시 읽어 끄면 제거하고 켜면 다시 처리한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, rooms } = rig;
    const a = adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(mounts.handles.size).toBe(1);

    rooms.set(ROOM, true);
    rooms.watcher?.();
    await flush();
    expect(mounts.unmountAll).toHaveBeenCalled();
    expect(mounts.handles.size).toBe(0);

    rooms.set(ROOM, false);
    rooms.watcher?.();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(2);
    expect(mounts.statusOf(a)).toBe('translated');
  });
});

/* ------------------------------------------------------------------ */
/* 재시도·연결 끊김                                                      */
/* ------------------------------------------------------------------ */

describe('재시도·연결 끊김', () => {
  it('onRetry 는 translate.retry 로 그 항목만 다시 요청하고 결과를 반영한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    messaging.batch = async (payload) => ({
      items: payload.items.map((i) => ({
        messageId: i.messageId,
        status: 'error' as const,
        errorKind: 'server' as const,
      })),
    });
    await rig.controller.start();
    await flush();
    expect(mounts.statusOf(a)).toBe('error');

    const handle = mounts.handleOf(a);
    const onRetry = handle.props.onRetry;
    if (!onRetry) throw new Error('no onRetry');
    onRetry();
    expect(mounts.statusOf(a)).toBe('pending');
    await flush();

    const retries = messaging.of('translate.retry');
    expect(retries).toHaveLength(1);
    expect(retries[0]).toEqual({
      roomId: ROOM,
      targetLang: 'ko',
      item: { messageId: 'a', text: 'hello', textHash: hashString('hello') },
    });
    expect(handle.props).toMatchObject({ status: 'translated', translation: '[retry ko] hello' });
  });

  it('sendMessage 가 한 번 거부되면 같은 묶음을 한 번 더 보낸다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    let calls = 0;
    messaging.batch = async (payload) => {
      calls += 1;
      if (calls === 1) throw new Error('Receiving end does not exist');
      return translatedItems(payload);
    };
    await rig.controller.start();
    await flush();

    expect(messaging.of('translate.batch')).toHaveLength(1 + DEFAULTS.reRequestOnDisconnect);
    expect(mounts.statusOf(a)).toBe('translated');
  });

  it('재요청도 실패하면(응답 없음 포함) error/server 로 표시한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    messaging.batch = async () => undefined;
    await rig.controller.start();
    await flush();

    expect(messaging.of('translate.batch')).toHaveLength(1 + DEFAULTS.reRequestOnDisconnect);
    expect(mounts.handleOf(a).props).toMatchObject({ status: 'error', errorKind: 'server' });
  });
});

/* ------------------------------------------------------------------ */
/* 깨짐 감지·상태 보고                                                   */
/* ------------------------------------------------------------------ */

describe('깨짐 감지·상태 보고', () => {
  it('대화방 화면에서 메시지를 계속 못 찾으면 brokenDetectMs 뒤에 messagesFound 0 을 보고한다', async () => {
    rig = makeRig();
    const { adapter, messaging } = rig;
    await rig.controller.start();
    await flush();
    expect(messaging.of('status.report')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(DEFAULTS.brokenDetectMs - 1);
    expect(messaging.of('status.report')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(messaging.of('status.report')).toEqual([
      { roomId: ROOM, roomName: ROOM_NAME, roomDetected: true, messagesFound: 0 },
    ]);

    // 다시 찾으면 바로 해제 보고
    const a = adapter.add('a', 'hello');
    adapter.emit([a]);
    await flush();
    expect(messaging.of('status.report').at(-1)).toEqual({
      roomId: ROOM,
      roomName: ROOM_NAME,
      roomDetected: true,
      messagesFound: 1,
    });
  });

  it('메시지가 나타나면 깨짐 타이머를 취소하고, 발견 보고는 10초에 한 번으로 묶는다', async () => {
    rig = makeRig();
    const { adapter, messaging } = rig;
    await rig.controller.start();
    await flush();

    await vi.advanceTimersByTimeAsync(DEFAULTS.brokenDetectMs / 2);
    const a = adapter.add('a', 'hello');
    adapter.emit([a]);
    await flush();
    expect(messaging.of('status.report')).toHaveLength(1);

    const b = adapter.add('b', 'again');
    adapter.emit([b]);
    await flush();
    expect(messaging.of('status.report')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(REPORT_THROTTLE_MS - 1);
    const c = adapter.add('c', 'still throttled');
    adapter.emit([c]);
    await flush();
    expect(messaging.of('status.report')).toHaveLength(1);

    // 타이머가 취소됐으므로 60초가 지나도 깨짐 보고는 없다.
    await vi.advanceTimersByTimeAsync(DEFAULTS.brokenDetectMs);
    expect(messaging.of('status.report').filter((r) => r.messagesFound === 0)).toHaveLength(0);

    const d = adapter.add('d', 'later');
    adapter.emit([d]);
    await flush();
    expect(messaging.of('status.report')).toHaveLength(2);
    expect(messaging.of('status.report').at(-1)?.messagesFound).toBe(4);
  });

  it('대화방 화면이 아니면 깨짐으로 보지 않는다', async () => {
    rig = makeRig();
    const { adapter, messaging } = rig;
    adapter.room = null;
    adapter.inView = false;
    await rig.controller.start();
    await vi.advanceTimersByTimeAsync(DEFAULTS.brokenDetectMs * 2);
    expect(messaging.of('status.report').filter((r) => r.roomDetected)).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* 방 전환·room.current·단축키 command                                   */
/* ------------------------------------------------------------------ */

describe('방 전환', () => {
  it('방이 바뀌면 모두 제거하고 순번을 새로 세며 발신 버튼을 새 방으로 다시 붙인다', async () => {
    rig = makeRig({ maxAutoPerRoom: 1 });
    const { adapter, messaging, mounts, outgoing, rooms } = rig;
    adapter.add('r1-a', 'one');
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')).toHaveLength(1);

    rooms.set('space/room2', false);
    adapter.room = { roomId: 'space/room2', name: 'Team' };
    for (const c of [...adapter.containers]) adapter.remove(c);
    const older = adapter.add('r2-a', 'alpha', { roomId: 'space/room2' });
    const newest = adapter.add('r2-b', 'beta', { roomId: 'space/room2' });
    adapter.emit([older, newest]);
    await flush();

    expect(mounts.unmountAll).toHaveBeenCalled();
    expect(rooms.getRoomSettings).toHaveBeenCalledWith('space/room2');
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: 'space/room2', enabled: true });
    const batches = messaging.of('translate.batch');
    expect(batches).toHaveLength(2);
    expect(batches[1]?.roomId).toBe('space/room2');
    expect(batches[1]?.items.map((i) => i.messageId)).toEqual(['r2-b']);
    expect(mounts.statusOf(older)).toBe('skipped_limit');
    expect(mounts.statusOf(newest)).toBe('translated');
    expect(messaging.of('status.report').at(-1)).toMatchObject({
      roomId: 'space/room2',
      roomName: 'Team',
    });
  });

  it('방을 바꾸는 사이 도착한 이전 방의 응답은 버린다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts } = rig;
    const a = adapter.add('a', 'hello');
    let resolveBatch: ((v: BatchResponse) => void) | null = null;
    messaging.batch = (payload) =>
      new Promise<BatchResponse>((resolve) => {
        resolveBatch = () => resolve(translatedItems(payload));
      });
    await rig.controller.start();
    await pastPlaceholderDelay();
    expect(mounts.statusOf(a)).toBe('pending');

    adapter.room = { roomId: 'space/room2' };
    adapter.remove(a);
    adapter.emit([], [a]);
    await flush();
    if (!resolveBatch) throw new Error('batch not sent');
    (resolveBatch as () => void)();
    await flush();
    expect(mounts.handles.size).toBe(0);
  });
});

describe('메시지 핸들러', () => {
  it('room.current 는 현재 방을 돌려주고, 방 밖에서는 null 을 돌려준다', async () => {
    rig = makeRig();
    const { adapter, messaging } = rig;
    await rig.controller.start();
    expect(await messaging.invoke('room.current', {})).toEqual({ roomId: ROOM, name: ROOM_NAME });
    adapter.room = null;
    expect(await messaging.invoke('room.current', {})).toBeNull();
  });

  it('command.translateOutgoing 은 발신 컨트롤러의 onCommand 로 넘긴다', async () => {
    rig = makeRig();
    const { messaging, outgoing } = rig;
    await rig.controller.start();
    await messaging.invoke('command.translateOutgoing', {});
    expect(outgoing.onCommand).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* 테마·정리                                                            */
/* ------------------------------------------------------------------ */

describe('테마', () => {
  it('body 의 data-theme 이 바뀌면 붙어 있는 블록과 발신 버튼에 반영한다', async () => {
    rig = makeRig();
    const { adapter, mounts, outgoing } = rig;
    const a = adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    expect(mounts.handleOf(a).theme).toBe('light');

    const mountCalls = outgoing.mountCalls.length;
    adapter.theme = 'dark';
    document.body.setAttribute('data-theme', 'dark');
    await flush();
    expect(mounts.handleOf(a).themes).toEqual(['dark']);
    expect(outgoing.mountCalls.length).toBeGreaterThan(mountCalls);
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: ROOM, enabled: true });
  });
});

describe('stop', () => {
  it('관찰·핸들러·블록·발신 컨트롤러를 모두 정리하고 이후 틱을 무시한다', async () => {
    rig = makeRig();
    const { adapter, messaging, mounts, outgoing, rooms } = rig;
    adapter.add('a', 'hello');
    await rig.controller.start();
    await flush();
    const observer = adapter.observer;

    rig.controller.stop();
    expect(adapter.disconnectCount).toBe(1);
    expect(messaging.removeCount).toBe(1);
    expect(rooms.unwatchCount).toBe(1);
    expect(mounts.unmountAll).toHaveBeenCalled();
    expect(mounts.handles.size).toBe(0);
    expect(outgoing.destroy).toHaveBeenCalledTimes(1);

    const n = adapter.add('n', 'after stop');
    observer?.([n], [], []);
    await flush();
    await vi.advanceTimersByTimeAsync(DEFAULTS.brokenDetectMs * 2);
    expect(messaging.of('translate.batch')).toHaveLength(1);
    expect(messaging.of('status.report')).toHaveLength(1);
    rig = null;
  });

  it('한 메시지에서 예외가 나도 나머지는 계속 처리한다', async () => {
    const adapter = makeAdapter();
    const bad = adapter.add('bad', 'boom');
    const good = adapter.add('good', 'fine');
    const readMessage = adapter.readMessage;
    adapter.readMessage = vi.fn((c: HTMLElement | null | undefined) => {
      if (c === bad) throw new Error('selector exploded');
      return readMessage(c);
    });
    rig = buildRig({ adapter });
    const { messaging, mounts } = rig;
    await rig.controller.start();
    await flush();
    expect(messaging.of('translate.batch')[0]?.items.map((i) => i.messageId)).toEqual(['good']);
    expect(mounts.statusOf(good)).toBe('translated');
  });
});

describe('주기 점검', () => {
  it('메시지 변화 없이 방이 바뀌어도(빈 방) 다음 점검에서 방을 맞추고 발신 버튼을 다시 붙인다', async () => {
    rig = makeRig();
    const { adapter, outgoing } = rig;
    await rig.controller.start();
    await flush();
    const before = outgoing.mountCalls.length;
    adapter.room = { roomId: 'dm/empty' };
    await vi.advanceTimersByTimeAsync(DEFAULTS.uiCheckMs);
    await flush();
    expect(rig.controller.getState().roomId).toBe('dm/empty');
    expect(outgoing.mountCalls.length).toBeGreaterThan(before);
    expect(outgoing.mountCalls.at(-1)).toEqual({ roomId: 'dm/empty', enabled: true });
  });

  it('같은 방이면 점검마다 발신 버튼 확인만 하고, 정지 후에는 점검하지 않는다', async () => {
    rig = makeRig();
    const { outgoing, messaging } = rig;
    await rig.controller.start();
    await flush();
    const batches = messaging.of('translate.batch').length;
    await vi.advanceTimersByTimeAsync(DEFAULTS.uiCheckMs * 3);
    expect(messaging.of('translate.batch').length).toBe(batches);
    rig.controller.stop();
    const calls = outgoing.mountCalls.length;
    await vi.advanceTimersByTimeAsync(DEFAULTS.uiCheckMs * 3);
    expect(outgoing.mountCalls.length).toBe(calls);
  });
});
