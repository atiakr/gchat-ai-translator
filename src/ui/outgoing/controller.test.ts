import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../../config/defaults';
import type { ComposerInfo, MessageInfo, MessageObserverCallback } from '../../gchat/adapter';
import type { MessageKind, MessageMap } from '../../messaging/protocol';
import { DEFAULT_GLOBAL_SETTINGS, type RoomSettings } from '../../settings/schema';
import {
  createOutgoingController,
  type OutgoingAdapter,
  type OutgoingController,
  type OutgoingDeps,
} from './controller';

const ROOM = 'dm/room1';

/* ------------------------------------------------------------------ */
/* 가짜 어댑터·메시징                                                   */
/* ------------------------------------------------------------------ */

interface FakeAdapter extends OutgoingAdapter {
  room: { roomId: string; name?: string } | null;
  composer: ComposerInfo | null;
  text: string;
  rich: { mentions: boolean; formatting: boolean; attachments: boolean };
  sendOk: boolean;
  containers: HTMLElement[];
  infos: Map<HTMLElement, MessageInfo>;
  observer: MessageObserverCallback | null;
  observeCount: number;
  disconnectCount: number;
  addOwnMessage(id: string, text: string, isOwn?: boolean): HTMLElement;
  emitAdded(containers: HTMLElement[]): void;
}

function buildComposer(): ComposerInfo {
  const region = document.createElement('div');
  region.className = 'region';
  const wrapper = document.createElement('div');
  const textbox = document.createElement('div');
  textbox.setAttribute('role', 'textbox');
  textbox.setAttribute('contenteditable', 'true');
  const sendButton = document.createElement('button');
  sendButton.className = 'send';
  // 실제 화면처럼 보내기 버튼은 폭이 고정된 묶음 안에 있다
  const sendGroup = document.createElement('div');
  sendGroup.append(sendButton);
  wrapper.append(textbox, sendGroup);
  region.append(wrapper);
  document.body.append(region);
  return { textbox, sendButton, sendGroup, region };
}

function makeAdapter(): FakeAdapter {
  const list = document.createElement('div');
  list.className = 'messages';
  document.body.append(list);
  const fake: FakeAdapter = {
    composer: buildComposer(),
    text: '',
    rich: { mentions: false, formatting: false, attachments: false },
    sendOk: true,
    containers: [],
    infos: new Map(),
    observer: null,
    observeCount: 0,
    disconnectCount: 0,
    room: { roomId: ROOM, name: 'Alice' },
    getActiveComposer: vi.fn(() => fake.composer),
    getCurrentRoom: vi.fn(() => (fake.room ? { ...fake.room } : null)),
    readComposerText: vi.fn(() => fake.text),
    isComposerEmpty: vi.fn(() => fake.text.trim().length === 0),
    composerHasRichContent: vi.fn(() => ({ ...fake.rich })),
    setComposerText: vi.fn((_tb, text: string) => {
      fake.text = text;
    }),
    clickSend: vi.fn(() => fake.sendOk),
    getChatTheme: vi.fn(() => 'light' as const),
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
    addOwnMessage(id, text, isOwn = true) {
      const c = document.createElement('div');
      c.setAttribute('role', 'group');
      c.dataset.id = id;
      const body = document.createElement('div');
      body.className = 'body';
      body.textContent = text;
      c.append(body);
      list.append(c);
      fake.containers.push(c);
      fake.infos.set(c, {
        messageId: id,
        roomId: ROOM,
        senderId: isOwn ? 'me' : 'other',
        isOwn,
        idSource: 'dom',
        text,
        hasBody: true,
        bodyEl: body,
      });
      return c;
    },
    emitAdded(containers) {
      fake.observer?.(containers, [], []);
    },
  };
  return fake;
}

type Sent = { kind: MessageKind; payload: unknown };

interface FakeMessaging {
  send: OutgoingDeps['sendMessage'];
  sent: Sent[];
  of<K extends MessageKind>(kind: K): MessageMap[K]['request'][];
  outgoing: (
    payload: MessageMap['translate.outgoing']['request'],
  ) => Promise<MessageMap['translate.outgoing']['response']>;
  lookup: (
    payload: MessageMap['sentOriginal.lookup']['request'],
  ) => Promise<MessageMap['sentOriginal.lookup']['response']>;
}

function makeMessaging(): FakeMessaging {
  const m: FakeMessaging = {
    sent: [],
    outgoing: async ({ text, targetLang }) => ({
      ok: true,
      translation: `[${targetLang}] ${text}`,
      detectedLang: 'ko',
    }),
    lookup: async () => null,
    of: (kind) => m.sent.filter((s) => s.kind === kind).map((s) => s.payload as never),
    send: (async (kind: MessageKind, payload: unknown) => {
      m.sent.push({ kind, payload });
      if (kind === 'translate.outgoing') {
        return m.outgoing(payload as MessageMap['translate.outgoing']['request']);
      }
      if (kind === 'sentOriginal.lookup') {
        return m.lookup(payload as MessageMap['sentOriginal.lookup']['request']);
      }
      return undefined;
    }) as OutgoingDeps['sendMessage'],
  };
  return m;
}

interface Harness {
  adapter: FakeAdapter;
  msg: FakeMessaging;
  rooms: Map<string, RoomSettings>;
  setRoomSettings: ReturnType<typeof vi.fn>;
  controller: OutgoingController;
  now: { value: number };
}

function setup(opts: { room?: Partial<RoomSettings>; outgoingLang?: string } = {}): Harness {
  const adapter = makeAdapter();
  const msg = makeMessaging();
  const rooms = new Map<string, RoomSettings>();
  if (opts.room) rooms.set(ROOM, { roomId: ROOM, incomingDisabled: false, ...opts.room });
  const now = { value: 1_000_000 };
  const setRoomSettings = vi.fn(async (roomId: string, patch: Partial<RoomSettings>) => {
    const next = { roomId, incomingDisabled: false, ...rooms.get(roomId), ...patch };
    rooms.set(roomId, next);
    return next;
  });
  const controller = createOutgoingController({
    adapter,
    sendMessage: msg.send,
    getRoomSettings: async (roomId) => rooms.get(roomId) ?? null,
    setRoomSettings,
    getGlobalSettings: async () => ({
      ...DEFAULT_GLOBAL_SETTINGS,
      outgoingLang: opts.outgoingLang ?? DEFAULT_GLOBAL_SETTINGS.outgoingLang,
    }),
    now: () => now.value,
  });
  return { adapter, msg, rooms, setRoomSettings, controller, now };
}

const buttonHost = () => document.querySelector<HTMLElement>('[data-gat-outgoing="button"]');
const panelHost = () => document.querySelector<HTMLElement>('[data-gat-outgoing="panel"]');
const sentHosts = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-gat-outgoing="sent-original"]'));

let active: OutgoingController[] = [];
function track(h: Harness): Harness {
  active.push(h.controller);
  return h;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  for (const c of active) c.destroy();
  active = [];
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/* ------------------------------------------------------------------ */

describe('mount / setEnabled', () => {
  it('mount 는 보내기 버튼 묶음 앞(묶음 바깥)에 Shadow DOM 호스트를 넣고 입력창에 키 핸들러를 건다', () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    const host = buttonHost();
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).not.toBeNull();
    expect(host?.nextElementSibling).toBe(h.adapter.composer?.sendGroup);
    expect(h.adapter.composer?.sendGroup?.contains(host ?? null)).toBe(false);
    expect(host?.hidden).toBe(false);
    // 문서 수준 핸들러는 없다: 입력창 바깥에서 누른 키는 무시된다
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, bubbles: true }),
    );
    expect(h.controller.getState().open).toBe(false);
  });

  it('같은 입력창에 다시 mount 하면 호스트는 하나만 남는다', () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.controller.mount(ROOM, true);
    expect(document.querySelectorAll('[data-gat-outgoing="button"]')).toHaveLength(1);
  });

  it('setEnabled(false) 는 버튼을 숨기고 열린 패널을 닫는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    expect(h.controller.getState().open).toBe(true);
    h.controller.setEnabled(false);
    expect(buttonHost()?.hidden).toBe(true);
    expect(buttonHost()?.style.display).toBe('none');
    expect(h.controller.getState().open).toBe(false);
    h.controller.setEnabled(true);
    expect(buttonHost()?.hidden).toBe(false);
  });

  it('destroy 는 호스트와 패널을 모두 제거한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    expect(panelHost()).not.toBeNull();
    h.controller.destroy();
    expect(buttonHost()).toBeNull();
    expect(panelHost()).toBeNull();
  });
});

describe('trigger', () => {
  it('입력창이 비어 있으면 아무 일도 하지 않는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '   ';
    await h.controller.trigger();
    expect(h.controller.getState().open).toBe(false);
    expect(h.msg.of('translate.outgoing')).toHaveLength(0);
    expect(panelHost()).toBeNull();
  });

  it('꺼져 있으면 아무 일도 하지 않는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, false);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    expect(h.controller.getState().open).toBe(false);
    expect(h.msg.of('translate.outgoing')).toHaveLength(0);
  });

  it('mount 전에는 아무 일도 하지 않는다', async () => {
    const h = track(setup());
    h.adapter.text = '안녕';
    await h.controller.trigger();
    expect(h.msg.of('translate.outgoing')).toHaveLength(0);
  });

  it('텍스트를 읽어 방의 발신 언어로 번역을 요청하고 패널을 연다', async () => {
    const h = track(setup({ room: { outgoingLang: 'ja' } }));
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    expect(h.msg.of('translate.outgoing')).toEqual([
      { roomId: ROOM, text: '안녕', targetLang: 'ja' },
    ]);
    const s = h.controller.getState();
    expect(s).toMatchObject({
      open: true,
      original: '안녕',
      translation: '[ja] 안녕',
      lang: 'ja',
      translating: false,
      error: null,
      saveAsDefault: false,
    });
    expect(panelHost()).not.toBeNull();
    expect(panelHost()?.shadowRoot).not.toBeNull();
  });

  it('방 설정에 발신 언어가 없으면 전역 기본값을 쓴다', async () => {
    const h = track(setup({ room: { incomingDisabled: true }, outgoingLang: 'de' }));
    h.controller.mount(ROOM, true);
    h.adapter.text = 'hi';
    await h.controller.trigger();
    expect(h.msg.of('translate.outgoing')[0]?.targetLang).toBe('de');
    expect(h.controller.getState().lang).toBe('de');
  });

  it('전역 값도 유효하지 않으면 DEFAULTS.outgoingLang 으로 떨어진다', async () => {
    const h = track(setup({ outgoingLang: 'xx' }));
    h.controller.mount(ROOM, true);
    h.adapter.text = 'hi';
    await h.controller.trigger();
    expect(h.controller.getState().lang).toBe(DEFAULTS.outgoingLang);
  });

  it('서식·멘션이 감지되면 상태에 남는다(번역은 순수 텍스트만)', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '@Bob hi';
    h.adapter.rich = { mentions: true, formatting: false, attachments: false };
    await h.controller.trigger();
    expect(h.controller.getState().rich.mentions).toBe(true);
    expect(h.msg.of('translate.outgoing')[0]?.text).toBe('@Bob hi');
  });

  it('번역 실패는 오류 종류로 남고 재시도하면 다시 요청한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    h.msg.outgoing = async () => ({ ok: false, errorKind: 'rate_limit' });
    await h.controller.trigger();
    expect(h.controller.getState()).toMatchObject({
      open: true,
      error: 'rate_limit',
      translating: false,
      translation: '',
    });
    h.msg.outgoing = async () => ({ ok: true, translation: 'Hello', detectedLang: 'ko' });
    await h.controller.retry();
    expect(h.msg.of('translate.outgoing')).toHaveLength(2);
    expect(h.controller.getState()).toMatchObject({ error: null, translation: 'Hello' });
  });

  it('메시징이 던지면 unknown 오류로 남는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    h.msg.outgoing = async () => {
      throw new Error('disconnected');
    };
    await h.controller.trigger();
    expect(h.controller.getState().error).toBe('unknown');
  });

  it('패널이 열린 채 다시 trigger 하면 입력창의 현재 텍스트로 새로 시작한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '하나';
    await h.controller.trigger();
    h.adapter.text = '둘';
    await h.controller.trigger();
    expect(h.controller.getState().original).toBe('둘');
    expect(document.querySelectorAll('[data-gat-outgoing="panel"]')).toHaveLength(1);
  });
});

describe('shortcut / command dedupe', () => {
  const combo = (init: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    });

  it('입력창에서 Ctrl+Shift+Enter 는 기본 동작을 막고 발동한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    const e = combo();
    h.adapter.composer?.textbox.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(h.msg.of('translate.outgoing')).toHaveLength(1));
  });

  it('단축키는 캡처 단계에서 받아 Google Chat 편집기의 keydown 처리보다 먼저 막는다', async () => {
    const h = track(setup());
    const textbox = h.adapter.composer?.textbox as HTMLElement;
    const editorOnTextbox = vi.fn();
    const editorOnAncestor = vi.fn();
    // 페이지 편집기가 먼저 등록한 리스너(대상·버블 단계)
    textbox.addEventListener('keydown', editorOnTextbox);
    textbox.parentElement?.addEventListener('keydown', editorOnAncestor);
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    const e = combo();
    textbox.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(editorOnTextbox).not.toHaveBeenCalled();
    expect(editorOnAncestor).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(h.msg.of('translate.outgoing')).toHaveLength(1));
    // 그냥 Enter 는 편집기로 그대로 간다
    const plain = combo({ ctrlKey: false, shiftKey: false });
    textbox.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(editorOnTextbox).toHaveBeenCalledTimes(1);
    expect(editorOnAncestor).toHaveBeenCalledTimes(1);
  });

  it('destroy 뒤에는 캡처 핸들러가 해제되어 단축키를 막지 않는다', () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    h.controller.destroy();
    const e = combo();
    h.adapter.composer?.textbox.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('macOS Cmd+Shift+Enter 도 같다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    const e = combo({ ctrlKey: false, metaKey: true });
    h.adapter.composer?.textbox.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(h.msg.of('translate.outgoing')).toHaveLength(1));
  });

  it('그냥 Enter / Shift+Enter 는 건드리지 않는다', () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    const plain = combo({ ctrlKey: false, shiftKey: false });
    const shift = combo({ ctrlKey: false });
    h.adapter.composer?.textbox.dispatchEvent(plain);
    h.adapter.composer?.textbox.dispatchEvent(shift);
    expect(plain.defaultPrevented).toBe(false);
    expect(shift.defaultPrevented).toBe(false);
    expect(h.msg.of('translate.outgoing')).toHaveLength(0);
  });

  it('꺼져 있으면 단축키도 기본 동작을 막지 않는다', () => {
    const h = track(setup());
    h.controller.mount(ROOM, false);
    h.adapter.text = '안녕';
    const e = combo();
    h.adapter.composer?.textbox.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it('단축키와 command 가 dedupe 창 안에 겹치면 한 번만 발동한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    h.controller.onShortcutKey(combo());
    h.now.value += DEFAULTS.shortcutDedupeMs - 1;
    h.controller.onCommand();
    await vi.waitFor(() => expect(h.msg.of('translate.outgoing')).toHaveLength(1));
    h.now.value += DEFAULTS.shortcutDedupeMs;
    h.controller.onCommand();
    await vi.waitFor(() => expect(h.msg.of('translate.outgoing')).toHaveLength(2));
  });
});

describe('confirm / cancel', () => {
  it('확인: 입력창을 번역문으로 바꾸고 보내기를 누르며 원문을 저장한다(방 기본값은 저장 안 함)', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    h.controller.editTranslation('Hello there');
    await h.controller.confirm();
    expect(h.adapter.setComposerText).toHaveBeenCalledWith(
      h.adapter.composer?.textbox,
      'Hello there',
    );
    expect(h.adapter.clickSend).toHaveBeenCalledWith(h.adapter.composer?.sendButton);
    expect(h.setRoomSettings).not.toHaveBeenCalled();
    expect(h.msg.of('sentOriginal.save')).toEqual([
      { roomId: ROOM, sentText: 'Hello there', original: '안녕' },
    ]);
    expect(h.controller.getState().open).toBe(false);
  });

  it('확인 전에는 아무것도 보내지 않는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    h.controller.changeLanguage('ja');
    await vi.waitFor(() => expect(h.controller.getState().translating).toBe(false));
    expect(h.adapter.clickSend).not.toHaveBeenCalled();
    expect(h.adapter.setComposerText).not.toHaveBeenCalled();
  });

  it('"이 방의 기본 언어로 저장" 이 켜져 있으면 전송 후 방 설정을 갱신한다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    h.controller.setSaveAsDefault(true);
    await h.controller.changeLanguage('fr');
    await h.controller.confirm();
    expect(h.setRoomSettings).toHaveBeenCalledWith(ROOM, { outgoingLang: 'fr', name: 'Alice' });
    expect(h.rooms.get(ROOM)?.outgoingLang).toBe('fr');
  });

  it('방 이름을 모르거나 화면의 방이 다르면 이름 없이 저장한다', async () => {
    const h = track(setup());
    h.adapter.room = { roomId: 'dm/other', name: 'Bob' };
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    h.controller.setSaveAsDefault(true);
    await h.controller.changeLanguage('fr');
    await h.controller.confirm();
    expect(h.setRoomSettings).toHaveBeenCalledWith(ROOM, { outgoingLang: 'fr' });
  });

  it('번역 중이거나 번역문이 비면 확인은 무시된다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    let resolve: ((v: MessageMap['translate.outgoing']['response']) => void) | undefined;
    h.msg.outgoing = () =>
      new Promise((r) => {
        resolve = r;
      });
    const pending = h.controller.trigger();
    await vi.waitFor(() => expect(h.controller.getState().translating).toBe(true));
    await h.controller.confirm();
    expect(h.adapter.clickSend).not.toHaveBeenCalled();
    resolve?.({ ok: true, translation: '', detectedLang: 'ko' });
    await pending;
    await h.controller.confirm();
    expect(h.adapter.clickSend).not.toHaveBeenCalled();
  });

  it('전송 실패: 번역문을 입력창에 남기고 안내 상태로 바뀐다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    h.adapter.sendOk = false;
    await h.controller.trigger();
    await h.controller.confirm();
    expect(h.adapter.text).toBe('[en] 안녕');
    expect(h.controller.getState()).toMatchObject({ open: true, sendFailed: true });
    expect(h.msg.of('sentOriginal.save')).toHaveLength(0);
    expect(h.setRoomSettings).not.toHaveBeenCalled();
    // 닫아도 입력창은 그대로
    h.controller.cancel();
    expect(h.adapter.text).toBe('[en] 안녕');
    expect(h.controller.getState().open).toBe(false);
  });

  it('취소: 패널을 닫고 입력창 원문을 그대로 둔다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    h.controller.cancel();
    expect(h.adapter.setComposerText).not.toHaveBeenCalled();
    expect(h.adapter.text).toBe('안녕');
    expect(h.controller.getState().open).toBe(false);
    expect(h.adapter.clickSend).not.toHaveBeenCalled();
  });

  it('언어를 바꾸면 그 언어로 다시 번역한다(늦게 온 이전 응답은 버린다)', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    const pendings: Array<(v: MessageMap['translate.outgoing']['response']) => void> = [];
    h.msg.outgoing = () =>
      new Promise((r) => {
        pendings.push(r);
      });
    const first = h.controller.trigger();
    await vi.waitFor(() => expect(pendings).toHaveLength(1));
    const second = h.controller.changeLanguage('ja');
    await vi.waitFor(() => expect(pendings).toHaveLength(2));
    expect(h.msg.of('translate.outgoing').map((p) => p.targetLang)).toEqual(['en', 'ja']);
    pendings[1]?.({ ok: true, translation: 'こんにちは', detectedLang: 'ko' });
    await second;
    pendings[0]?.({ ok: true, translation: 'Hello', detectedLang: 'ko' });
    await first;
    expect(h.controller.getState()).toMatchObject({ lang: 'ja', translation: 'こんにちは' });
  });
});

describe('sent original', () => {
  it('전송 직후 같은 본문의 내 메시지가 나타나면 그 아래에 원문을 단다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    await h.controller.confirm();
    expect(h.adapter.observeMessages).toHaveBeenCalledTimes(1);
    const other = h.adapter.addOwnMessage('m1', '[en] 안녕', false);
    const mine = h.adapter.addOwnMessage('m2', '[en] 안녕');
    h.adapter.emitAdded([other, mine]);
    const hosts = sentHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.previousElementSibling).toBe(mine.querySelector('.body'));
    expect(hosts[0]?.shadowRoot).not.toBeNull();
    expect(h.adapter.disconnectCount).toBe(1);
    // 같은 메시지에 두 번 달지 않는다
    await h.controller.restoreSentOriginals([mine]);
    expect(sentHosts()).toHaveLength(1);
  });

  it('제한 시간이 지나면 더 이상 찾지 않는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    await h.controller.confirm();
    vi.advanceTimersByTime(DEFAULTS.sentMatchTimeoutMs + 1);
    expect(h.adapter.disconnectCount).toBe(1);
    const mine = h.adapter.addOwnMessage('m2', '[en] 안녕');
    h.adapter.emitAdded([mine]);
    expect(sentHosts()).toHaveLength(0);
  });

  it('본문이 다르거나 내 메시지가 아니면 달지 않는다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.adapter.text = '안녕';
    await h.controller.trigger();
    await h.controller.confirm();
    const diff = h.adapter.addOwnMessage('m1', 'something else');
    h.adapter.emitAdded([diff]);
    expect(sentHosts()).toHaveLength(0);
    expect(h.adapter.disconnectCount).toBe(0);
  });

  it('restoreSentOriginals: 내 메시지는 lookup 해서 기록이 있으면 원문을 단다', async () => {
    const h = track(setup());
    h.controller.mount(ROOM, true);
    h.msg.lookup = async ({ sentText }) =>
      sentText === 'Hello' ? { original: '안녕하세요' } : null;
    const mine = h.adapter.addOwnMessage('a', 'Hello');
    const mineNoRecord = h.adapter.addOwnMessage('b', 'Bye');
    const theirs = h.adapter.addOwnMessage('c', 'Hello', false);
    await h.controller.restoreSentOriginals([mine, mineNoRecord, theirs]);
    expect(h.msg.of('sentOriginal.lookup')).toEqual([
      { roomId: ROOM, sentText: 'Hello' },
      { roomId: ROOM, sentText: 'Bye' },
    ]);
    const hosts = sentHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]?.previousElementSibling).toBe(mine.querySelector('.body'));
  });
});
