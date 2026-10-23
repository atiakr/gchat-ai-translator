import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { isEnvelope, onMessage, sendMessage } from './protocol';

beforeEach(() => fakeBrowser.reset());

describe('protocol', () => {
  it('봉투 판별', () => {
    expect(isEnvelope({ kind: 'room.current', payload: {} })).toBe(true);
    expect(isEnvelope({ kind: 1 })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });
  it('sendMessage → onMessage 핸들러로 왕복한다', async () => {
    const off = onMessage({
      'room.current': () => ({ roomId: 'dm/X', name: 'X' }),
      'translate.outgoing': async ({ text, targetLang }) => ({
        ok: true,
        translation: `${text}:${targetLang}`,
        detectedLang: 'ko',
      }),
    });
    expect(await sendMessage('room.current', {})).toEqual({ roomId: 'dm/X', name: 'X' });
    const r = await sendMessage('translate.outgoing', {
      roomId: 'dm/X',
      text: '안녕',
      targetLang: 'en',
    });
    expect(r).toEqual({ ok: true, translation: '안녕:en', detectedLang: 'ko' });
    off();
  });
  it('등록되지 않은 종류는 핸들러가 응답하지 않는다', async () => {
    const off = onMessage({ 'room.current': () => null });
    expect(await sendMessage('room.current', {})).toBeNull();
    off();
  });
});

describe('protocol 오류 전달', () => {
  it('핸들러가 던진 오류는 호출자에게 거부로 전달된다', async () => {
    const off = onMessage({
      'room.current': () => {
        throw new Error('boom');
      },
    });
    await expect(sendMessage('room.current', {})).rejects.toThrow('boom');
    off();
  });
});
