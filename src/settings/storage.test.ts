import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DEFAULTS } from '../config/defaults';
import { migrateGlobalSettings } from './migrate';
import { DEFAULT_GLOBAL_SETTINGS, SETTINGS_VERSION } from './schema';
import {
  canTranslate,
  clearInvalidKey,
  dailyLimitReached,
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
import { addUsage } from './usage';

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
    expect(out.version).toBe(SETTINGS_VERSION);
  });
  it('v1 → v2: 원문 숨기기(hideOriginal) 필드를 버리고 나머지는 유지한다', () => {
    const out = migrateGlobalSettings({ version: 1, hideOriginal: true, targetLang: 'ja' });
    expect(out.version).toBe(SETTINGS_VERSION);
    expect(out.targetLang).toBe('ja');
    expect('hideOriginal' in out).toBe(false);
  });
  it('v2 → v3: 일일 토큰 상한과 단가가 없으면 기본값(상한 없음, 단가 0)', () => {
    const out = migrateGlobalSettings({ version: 2, targetLang: 'ja' });
    expect(out.version).toBe(3);
    expect(out.dailyTokenLimit).toBe(0);
    expect(out.prices).toEqual({
      openai: { input: 0, output: 0 },
      anthropic: { input: 0, output: 0 },
      openai_compatible: { input: 0, output: 0 },
    });
  });
  it('일일 토큰 상한·단가는 0 이상의 수만 받고 손상된 값은 기본값', () => {
    const out = migrateGlobalSettings({
      version: 3,
      dailyTokenLimit: 12345.7,
      prices: { openai: { input: 0.15, output: '0.6' }, anthropic: null, bogus: { input: 1 } },
    });
    expect(out.dailyTokenLimit).toBe(12345);
    expect(out.prices.openai).toEqual({ input: 0.15, output: 0 });
    expect(out.prices.anthropic).toEqual({ input: 0, output: 0 });
    expect(migrateGlobalSettings({ dailyTokenLimit: -5 }).dailyTokenLimit).toBe(0);
    expect(migrateGlobalSettings({ dailyTokenLimit: Number.NaN }).dailyTokenLimit).toBe(0);
    expect(migrateGlobalSettings({ prices: { openai: { input: -1 } } }).prices.openai.input).toBe(
      0,
    );
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
    expect(s.version).toBe(SETTINGS_VERSION);
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
  it('오늘 토큰이 일일 상한에 이르면 budget, 상한 0 이면 무시, 다음 날이면 다시 ok', async () => {
    await setApiKey('openai', 'k1');
    const today = new Date(2026, 9, 24, 12).getTime();
    await addUsage('openai', { inputTokens: 600, outputTokens: 400 }, today);
    expect(await canTranslate()).toEqual({ ok: true });
    await setGlobalSettings({ dailyTokenLimit: 1000 });
    expect(await dailyLimitReached(today)).toBe(true);
    expect(await dailyLimitReached(today + 24 * 60 * 60 * 1000)).toBe(false);
    await setGlobalSettings({ dailyTokenLimit: 1001 });
    expect(await dailyLimitReached(today)).toBe(false);
    await setGlobalSettings({ dailyTokenLimit: 0 });
    expect(await dailyLimitReached(today)).toBe(false);
  });
  it('상한 도달은 canTranslate 를 budget 으로 막고, 키 문제가 있으면 키 문제가 먼저다', async () => {
    await setApiKey('openai', 'k1');
    await setGlobalSettings({ dailyTokenLimit: 10 });
    await addUsage('anthropic', { inputTokens: 10, outputTokens: 0 }, Date.now());
    expect(await canTranslate()).toEqual({ ok: false, reason: 'budget' });
    await setInvalidKey('openai', 'auth');
    expect(await canTranslate()).toEqual({ ok: false, reason: 'invalid_key' });
  });
  it('커스텀 서비스인데 주소가 비어 있으면 no_key', async () => {
    await setGlobalSettings({ activeProvider: 'openai_compatible', customBaseUrl: '' });
    expect(await canTranslate()).toEqual({ ok: false, reason: 'no_key' });
    await setGlobalSettings({ customBaseUrl: '   ' });
    expect(await canTranslate()).toEqual({ ok: false, reason: 'no_key' });
  });
});
