import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { sendMessage, type TranslateBatchItem } from '../messaging/protocol';
import {
  getBrokenState,
  getInvalidKeys,
  getRoomSettings,
  isOnboarded,
  setApiKey,
  setBrokenState,
  setGlobalSettings,
  setInvalidKey,
} from '../settings/storage';
import {
  broadcastSettingsChanged,
  COMMAND_TRANSLATE_OUTGOING,
  dispatchTranslateOutgoingCommand,
  handleStatusReport,
  startBackground,
} from './background';
import type { Engine } from './engine';

const tabsSendMessage = vi.fn(async () => undefined);
const openOptionsPage = vi.fn(async () => undefined);
let commandListener: ((command: string) => void) | undefined;

function fakeEngine(): Engine {
  return {
    translateBatch: vi.fn(async (_r: string, _l: string, items: TranslateBatchItem[]) =>
      items.map((i) => ({
        messageId: i.messageId,
        status: 'translated' as const,
        translation: 'T',
      })),
    ),
    translateOutgoing: vi.fn(async () => ({
      ok: true as const,
      translation: 'OUT',
      detectedLang: 'ko',
    })),
    retryOne: vi.fn(async (_r: string, _l: string, item: TranslateBatchItem) => ({
      messageId: item.messageId,
      status: 'translated' as const,
      translation: 'RETRIED',
    })),
    dispose: vi.fn(),
  };
}

let stop: (() => void) | undefined;
let engine: Engine;
const testConnection = vi.fn();

beforeEach(() => {
  fakeBrowser.reset();
  tabsSendMessage.mockClear();
  openOptionsPage.mockClear();
  testConnection.mockReset();
  commandListener = undefined;
  // fake-browser 가 구현하지 않는 API 를 대신한다.
  fakeBrowser.tabs.sendMessage = tabsSendMessage as unknown as typeof fakeBrowser.tabs.sendMessage;
  fakeBrowser.runtime.openOptionsPage =
    openOptionsPage as unknown as typeof fakeBrowser.runtime.openOptionsPage;
  fakeBrowser.commands.onCommand.addListener = ((cb: (command: string) => void) => {
    commandListener = cb;
  }) as unknown as typeof fakeBrowser.commands.onCommand.addListener;
  fakeBrowser.commands.onCommand.removeListener = (() => {
    commandListener = undefined;
  }) as unknown as typeof fakeBrowser.commands.onCommand.removeListener;
  engine = fakeEngine();
  stop = startBackground({ engine, testConnection, now: () => 4242 });
});
afterEach(() => {
  stop?.();
});

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe('메시지 핸들러', () => {
  it('settings.get 은 설정과 canTranslate 를 돌려준다', async () => {
    expect(await sendMessage('settings.get', {})).toMatchObject({
      canTranslate: false,
      reason: 'no_key',
    });
    await setApiKey('openai', 'k');
    const r = await sendMessage('settings.get', {});
    expect(r.canTranslate).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(r.settings.activeProvider).toBe('openai');
    expect(JSON.stringify(r)).not.toContain('"k"');
  });
  it('translate.* 은 엔진으로 위임한다', async () => {
    const item: TranslateBatchItem = { messageId: 'a', text: 'x', textHash: 'h' };
    const items = [item];
    expect(await sendMessage('translate.batch', { roomId: 'r', targetLang: 'ko', items })).toEqual({
      items: [{ messageId: 'a', status: 'translated', translation: 'T' }],
    });
    expect(engine.translateBatch).toHaveBeenCalledWith('r', 'ko', items);
    expect(
      await sendMessage('translate.outgoing', { roomId: 'r', text: '안녕', targetLang: 'en' }),
    ).toEqual({ ok: true, translation: 'OUT', detectedLang: 'ko' });
    expect(await sendMessage('translate.retry', { roomId: 'r', targetLang: 'ko', item })).toEqual({
      item: { messageId: 'a', status: 'translated', translation: 'RETRIED' },
    });
  });
  it('status.report 는 깨짐 상태를 켜고 끈다', async () => {
    await sendMessage('status.report', { roomId: 'r', roomDetected: true, messagesFound: 0 });
    expect(await getBrokenState()).toEqual({ detectedAt: 4242 });
    await sendMessage('status.report', { roomId: 'r', roomDetected: true, messagesFound: 3 });
    expect(await getBrokenState()).toBeNull();
  });
  it('sentOriginal.save / lookup', async () => {
    expect(await sendMessage('sentOriginal.lookup', { roomId: 'r', sentText: 'Hello' })).toBeNull();
    await sendMessage('sentOriginal.save', { roomId: 'r', sentText: 'Hello', original: '안녕' });
    expect(await sendMessage('sentOriginal.lookup', { roomId: 'r', sentText: 'Hello' })).toEqual({
      original: '안녕',
    });
  });
  it('provider.test 는 폼 값으로 testConnection 을 부르고 성공 시 틀린 키 상태를 해제한다', async () => {
    await setInvalidKey('anthropic', 'auth');
    testConnection.mockResolvedValueOnce({ ok: true, sample: '안녕' });
    const r = await sendMessage('provider.test', {
      provider: 'anthropic',
      apiKey: 'form-key',
      model: 'claude-x',
    });
    expect(r).toEqual({ ok: true, sample: '안녕' });
    expect(testConnection).toHaveBeenCalledWith({
      provider: 'anthropic',
      apiKey: 'form-key',
      model: 'claude-x',
      baseUrl: undefined,
    });
    expect(await getInvalidKeys()).toEqual({});
  });
  it('provider.test 실패는 틀린 키 상태를 바꾸지 않는다', async () => {
    await setInvalidKey('openai', 'auth');
    testConnection.mockResolvedValueOnce({ ok: false, errorKind: 'auth', message: '401' });
    const r = await sendMessage('provider.test', { provider: 'openai', apiKey: 'k', model: 'm' });
    expect(r).toMatchObject({ ok: false, errorKind: 'auth' });
    expect((await getInvalidKeys()).openai).toBeDefined();
  });
});

describe('handleStatusReport', () => {
  it('깨짐은 roomDetected && messagesFound === 0 일 때만 켜고 detectedAt 을 유지한다', async () => {
    await handleStatusReport({ roomDetected: false, messagesFound: 0 }, () => 1);
    expect(await getBrokenState()).toBeNull();
    await handleStatusReport({ roomDetected: true, messagesFound: 0 }, () => 1);
    await handleStatusReport({ roomDetected: true, messagesFound: 0 }, () => 2);
    expect(await getBrokenState()).toEqual({ detectedAt: 1 });
    await handleStatusReport({ roomDetected: false, messagesFound: 0 }, () => 3);
    expect(await getBrokenState()).toEqual({ detectedAt: 1 });
    await handleStatusReport({ roomDetected: true, messagesFound: 1 }, () => 3);
    expect(await getBrokenState()).toBeNull();
  });
  it('방 이름은 주어지고 다를 때만 방 설정에 저장한다', async () => {
    await handleStatusReport({ roomId: 'r', roomDetected: true, messagesFound: 1 });
    expect(await getRoomSettings('r')).toBeNull();
    await handleStatusReport({
      roomId: 'r',
      roomName: 'Alpha',
      roomDetected: true,
      messagesFound: 1,
    });
    expect((await getRoomSettings('r'))?.name).toBe('Alpha');
    await handleStatusReport({
      roomId: 'r',
      roomName: 'Beta',
      roomDetected: true,
      messagesFound: 1,
    });
    expect((await getRoomSettings('r'))?.name).toBe('Beta');
  });
});

describe('설치·단축키·브로드캐스트·배지', () => {
  it('최초 설치 시 옵션 페이지를 열고 onboarded 를 기록한다(1회)', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    await flush();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(await isOnboarded()).toBe(true);
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.0.1' });
    await flush();
    expect(openOptionsPage).toHaveBeenCalledTimes(1);
  });
  it('단축키는 현재 창의 활성 chat.google.com 탭에만 전달한다', async () => {
    // fake-browser 는 포커스된 창이 있어야 currentWindow 질의를 지원한다.
    const win = await fakeBrowser.windows.create({ focused: true });
    if (!win) throw new Error('window not created');
    await fakeBrowser.tabs.create({
      url: 'https://mail.google.com/',
      active: true,
      windowId: win.id,
    });
    await dispatchTranslateOutgoingCommand();
    expect(tabsSendMessage).not.toHaveBeenCalled();
    const chat = await fakeBrowser.tabs.create({
      url: 'https://chat.google.com/room/x',
      active: true,
      windowId: win.id,
    });
    expect(commandListener).toBeDefined();
    commandListener?.(COMMAND_TRANSLATE_OUTGOING);
    await flush();
    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
    expect(tabsSendMessage).toHaveBeenCalledWith(chat.id, {
      kind: 'command.translateOutgoing',
      payload: {},
    });
    commandListener?.('other-command');
    await flush();
    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
  });
  it('브로드캐스트는 chat 탭에만 settings.changed 를 보내고 키는 싣지 않는다', async () => {
    await setApiKey('openai', 'secret-key');
    await flush();
    tabsSendMessage.mockClear();
    const chat = await fakeBrowser.tabs.create({ url: 'https://chat.google.com/dm/y' });
    await fakeBrowser.tabs.create({ url: 'https://example.com/' });
    tabsSendMessage.mockRejectedValueOnce(new Error('no receiver'));
    await broadcastSettingsChanged();
    expect(tabsSendMessage).toHaveBeenCalledTimes(1);
    const [tabId, envelope] = tabsSendMessage.mock.calls[0] as unknown as [number, unknown];
    expect(tabId).toBe(chat.id);
    expect(envelope).toMatchObject({
      kind: 'settings.changed',
      payload: { canTranslate: true },
    });
    expect(JSON.stringify(envelope)).not.toContain('secret-key');
  });
  it('설정·키·상태가 바뀌면 브로드캐스트하고 배지를 갱신한다', async () => {
    await fakeBrowser.tabs.create({ url: 'https://chat.google.com/' });
    await flush();
    expect(await fakeBrowser.action.getBadgeText({})).toBe('!');
    tabsSendMessage.mockClear();
    await setApiKey('openai', 'k');
    await flush();
    expect(tabsSendMessage).toHaveBeenCalled();
    expect(await fakeBrowser.action.getBadgeText({})).toBe('');
    tabsSendMessage.mockClear();
    await setBrokenState({ detectedAt: 1 });
    await flush();
    expect(await fakeBrowser.action.getBadgeText({})).toBe('!');
    await setBrokenState(null);
    await setGlobalSettings({ enabled: false });
    await flush();
    expect(tabsSendMessage).toHaveBeenCalled();
    const last = tabsSendMessage.mock.calls.at(-1) as unknown as [number, { payload: unknown }];
    expect(last[1].payload).toMatchObject({ canTranslate: false, reason: 'disabled' });
  });
});
