import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULTS } from '../config/defaults';
import { migrateGlobalSettings } from './migrate';
import { DEFAULT_GLOBAL_SETTINGS } from './schema';
import {
  canTranslate,
  clearInvalidKey,
  getApiKeys,
  getGlobalSettings,
  getInvalidKeys,
  getRoomSettings,
  listRoomSettings,
  removeRoomSettings,
  roomInstructions,
  setApiKey,
  setGlobalSettings,
  setInvalidKey,
  setRoomSettings,
} from './storage';

beforeEach(() => fakeBrowser.reset());

describe('migrateGlobalSettings', () => {
  it('빈 저장소 → 기본값', () => {
    expect(migrateGlobalSettings(null)).toEqual(DEFAULT_GLOBAL_SETTINGS);
    expect(migrateGlobalSettings(undefined)).toEqual(DEFAULT_GLOBAL_SETTINGS);
  });
  it('기본값은 정해진 기본값 표와 일치한다', () => {
    expect(DEFAULT_GLOBAL_SETTINGS).toMatchObject({
      enabled: true,
      activeProvider: 'openai',
      targetLang: 'ko',
      outgoingLang: 'en',
      instructions: '',
      customBaseUrl: '',
      maxMessageChars: 2000,
      maxAutoPerRoom: 200,
    });
    expect(DEFAULT_GLOBAL_SETTINGS.models.anthropic).toBe(DEFAULTS.models.anthropic);
  });
  it('손상된 값은 버리고 알려진 필드만 취한다', () => {
    const out = migrateGlobalSettings({
      enabled: 'yes',
      activeProvider: 'bogus',
      targetLang: 'ja',
      maxAutoPerRoom: -1,
    });
    expect(out.enabled).toBe(true);
    expect(out.activeProvider).toBe('openai');
    expect(out.targetLang).toBe('ja');
    expect(out.maxAutoPerRoom).toBe(200);
    expect(out.version).toBe(2);
  });
  it('v1 → v2: 원문 숨기기(hideOriginal) 필드를 버리고 나머지는 유지한다', () => {
    const out = migrateGlobalSettings({ version: 1, hideOriginal: true, targetLang: 'ja' });
    expect(out.version).toBe(2);
    expect(out.targetLang).toBe('ja');
    expect('hideOriginal' in out).toBe(false);
  });
});

describe('storage 영역 규칙', () => {
  it('API 키는 local 에만 쓰이고 sync 에는 절대 없다', async () => {
    await setApiKey('openai', 'sk-test');
    const sync = await fakeBrowser.storage.sync.get(null);
    const local = await fakeBrowser.storage.local.get(null);
    expect(JSON.stringify(sync)).not.toContain('sk-test');
    expect(JSON.stringify(local)).toContain('sk-test');
    expect((await getApiKeys()).openai).toBe('sk-test');
  });
  it('전역 설정은 sync 에 저장되고 읽을 때 마이그레이션된다', async () => {
    await setGlobalSettings({ targetLang: 'ja', enabled: false });
    const sync = await fakeBrowser.storage.sync.get(null);
    expect(Object.keys(sync)).toContain('settings');
    const s = await getGlobalSettings();
    expect(s.targetLang).toBe('ja');
    expect(s.enabled).toBe(false);
    expect(s.version).toBe(2);
  });
  it('방별 설정은 방마다 sync 항목 하나(room:<id>)', async () => {
    await setRoomSettings('room/AAA', { incomingDisabled: true, name: 'Alpha' });
    await setRoomSettings('dm/BBB', { outgoingLang: 'ja' });
    const sync = await fakeBrowser.storage.sync.get(null);
    expect(Object.keys(sync).sort()).toEqual(['room:dm/BBB', 'room:room/AAA']);
    const list = await listRoomSettings();
    expect(list.map((r) => r.roomId).sort()).toEqual(['dm/BBB', 'room/AAA']);
    expect(list.find((r) => r.roomId === 'dm/BBB')?.incomingDisabled).toBe(false);
    await removeRoomSettings('room/AAA');
    expect((await listRoomSettings()).map((r) => r.roomId)).toEqual(['dm/BBB']);
  });

  it('방 지시문은 방 항목(sync)에 저장되고, 상한을 넘으면 자르며, 비우면 필드를 지운다', async () => {
    await setRoomSettings('room/AAA', { instructions: '존댓말로' });
    expect((await fakeBrowser.storage.sync.get('room:room/AAA'))['room:room/AAA']).toMatchObject({
      instructions: '존댓말로',
    });
    expect(await fakeBrowser.storage.local.get(null)).toEqual({});

    await setRoomSettings('room/AAA', {
      instructions: 'x'.repeat(DEFAULTS.maxRoomInstructionsChars + 5),
    });
    expect((await getRoomSettings('room/AAA'))?.instructions).toHaveLength(
      DEFAULTS.maxRoomInstructionsChars,
    );

    await setRoomSettings('room/AAA', { instructions: '  \n ' });
    const room = await getRoomSettings('room/AAA');
    expect(room && 'instructions' in room).toBe(false);
    expect(roomInstructions(room)).toBe('');
    // 다른 필드만 바꾸면 지시문은 그대로 둔다.
    await setRoomSettings('room/AAA', { instructions: '용어 유지' });
    await setRoomSettings('room/AAA', { incomingDisabled: true });
    expect(roomInstructions(await getRoomSettings('room/AAA'))).toBe('용어 유지');
  });

  it('roomInstructions 는 없거나 손상된 값이면 빈 문자열', () => {
    expect(roomInstructions(null)).toBe('');
    expect(
      roomInstructions({
        roomId: 'r',
        incomingDisabled: false,
        instructions: 3 as unknown as string,
      }),
    ).toBe('');
  });
});

describe('틀린 키 상태와 번역 가능 조건', () => {
  it('키 없음 → no_key, 키 있음 → ok, 틀린 키 → invalid_key, 키 변경 시 해제', async () => {
    expect(await canTranslate()).toEqual({ ok: false, reason: 'no_key' });
    await setApiKey('openai', 'k1');
    expect(await canTranslate()).toEqual({ ok: true });
    await setInvalidKey('openai', 'auth');
    expect(await canTranslate()).toEqual({ ok: false, reason: 'invalid_key' });
    await setApiKey('openai', 'k2');
    expect(await getInvalidKeys()).toEqual({});
    expect(await canTranslate()).toEqual({ ok: true });
  });
  it('전역 스위치 off → disabled', async () => {
    await setApiKey('openai', 'k1');
    await setGlobalSettings({ enabled: false });
    expect(await canTranslate()).toEqual({ ok: false, reason: 'disabled' });
  });
  it('커스텀 서비스는 빈 키를 허용한다', async () => {
    await setGlobalSettings({
      activeProvider: 'openai_compatible',
      customBaseUrl: 'http://localhost:11434/v1',
    });
    expect(await canTranslate()).toEqual({ ok: true });
    await setInvalidKey('openai_compatible', 'auth');
    expect((await canTranslate()).reason).toBe('invalid_key');
    await clearInvalidKey('openai_compatible');
    expect(await canTranslate()).toEqual({ ok: true });
  });
  it('커스텀 서비스인데 주소가 비어 있으면 no_key', async () => {
    await setGlobalSettings({ activeProvider: 'openai_compatible', customBaseUrl: '' });
    expect(await canTranslate()).toEqual({ ok: false, reason: 'no_key' });
    await setGlobalSettings({ customBaseUrl: '   ' });
    expect(await canTranslate()).toEqual({ ok: false, reason: 'no_key' });
  });
});
