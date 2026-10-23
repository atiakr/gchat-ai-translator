import { describe, expect, it } from 'vitest';
import { parseRoomFromUrl } from './url';

describe('parseRoomFromUrl', () => {
  it('스페이스·DM 경로를 읽는다', () => {
    expect(parseRoomFromUrl('https://chat.google.com/room/AAAAxyz123')?.roomId).toBe(
      'room/AAAAxyz123',
    );
    expect(parseRoomFromUrl('https://chat.google.com/dm/AAAAabc')?.roomId).toBe('dm/AAAAabc');
    expect(parseRoomFromUrl('https://chat.google.com/space/AAAAq_w-1')?.kind).toBe('space');
  });
  it('다중 계정 접두어 /u/n/ 을 무시한다', () => {
    expect(parseRoomFromUrl('https://chat.google.com/u/1/room/AAAAxyz/thread/abc')?.roomId).toBe(
      'room/AAAAxyz',
    );
    expect(parseRoomFromUrl('https://chat.google.com/u/0/dm/AAAAabc?x=1#y')?.roomId).toBe(
      'dm/AAAAabc',
    );
  });
  it('대화방 화면이 아니면 null', () => {
    expect(parseRoomFromUrl('https://chat.google.com/')).toBeNull();
    expect(parseRoomFromUrl('https://chat.google.com/u/0/')).toBeNull();
    expect(parseRoomFromUrl('https://chat.google.com/home')).toBeNull();
    expect(parseRoomFromUrl('https://chat.google.com/search?q=a')).toBeNull();
    expect(parseRoomFromUrl('https://mail.google.com/chat/u/0/#chat/space/AAAA')).toBeNull();
    expect(parseRoomFromUrl('not a url')).toBeNull();
  });
});
