/**
 * chat.google.com URL → 대화방 id. DOM 지식은 없다.
 * 예: https://chat.google.com/u/1/room/AAAAxyz/… → "room/AAAAxyz"
 *     https://chat.google.com/dm/AAAAabc → "dm/AAAAabc"
 */
const ROOM_KINDS = ['room', 'dm', 'space'] as const;

export interface RoomRef {
  /** 종류와 id 를 합친 안정 식별자. 계정 인덱스(/u/n/)와 무관. */
  roomId: string;
  kind: (typeof ROOM_KINDS)[number];
  rawId: string;
}

export function parseRoomFromUrl(url: string): RoomRef | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'chat.google.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  let i = 0;
  if (parts[i] === 'u' && /^\d+$/.test(parts[i + 1] ?? '')) i += 2;
  const kind = parts[i];
  const rawId = parts[i + 1];
  if (!kind || !rawId) return null;
  if (!(ROOM_KINDS as readonly string[]).includes(kind)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(rawId)) return null;
  return { roomId: `${kind}/${rawId}`, kind: kind as RoomRef['kind'], rawId };
}
