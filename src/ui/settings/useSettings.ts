import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProviderId } from '../../config/defaults';
import type {
  ApiKeys,
  BrokenState,
  GlobalSettings,
  InvalidKeyState,
  RoomSettings,
} from '../../settings/schema';
import { EMPTY_API_KEYS } from '../../settings/schema';
import {
  getApiKeys,
  getBrokenState,
  getGlobalSettings,
  getInvalidKeys,
  getRoomSettings,
  listRoomSettings,
  removeRoomSettings,
  SyncQuotaError,
  setApiKey,
  setGlobalSettings,
  setRoomSettings,
  watchApiKeys,
  watchBrokenState,
  watchGlobalSettings,
  watchInvalidKeys,
  watchRoomSettings,
} from '../../settings/storage';

/** 저장 실패 종류. `quota` 는 sync 한도 초과, `other` 는 그 밖의 오류. */
export type SaveError = { kind: 'quota' } | { kind: 'other'; message: string };

export interface SettingsStore {
  /** 첫 로드가 끝나기 전엔 null. */
  settings: GlobalSettings | null;
  apiKeys: ApiKeys;
  invalidKeys: InvalidKeyState;
  broken: BrokenState | null;
  rooms: RoomSettings[];
  loaded: boolean;
  saveError: SaveError | null;
  dismissSaveError: () => void;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
  /** 키는 local 에만 저장된다(setApiKey 경유). */
  updateApiKey: (provider: ProviderId, key: string) => Promise<void>;
  updateRoom: (roomId: string, patch: Partial<Omit<RoomSettings, 'roomId'>>) => Promise<boolean>;
  deleteRoom: (roomId: string) => Promise<void>;
}

function toSaveError(e: unknown): SaveError {
  if (e instanceof SyncQuotaError) return { kind: 'quota' };
  return { kind: 'other', message: e instanceof Error ? e.message : String(e) };
}

/**
 * 옵션·팝업 공용 설정 훅. 저장소를 읽고 변경을 구독하며, 타입이 있는 갱신 함수를 제공한다.
 * 모든 저장 함수는 던지지 않는다 — 실패는 `saveError` 로 드러난다.
 */
export function useSettings(): SettingsStore {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeys>(EMPTY_API_KEYS);
  const [invalidKeys, setInvalidKeys] = useState<InvalidKeyState>({});
  const [broken, setBroken] = useState<BrokenState | null>(null);
  const [rooms, setRooms] = useState<RoomSettings[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  // 키 입력은 글자마다 저장되므로 read-modify-write 가 겹치지 않도록 직렬화한다.
  const keyQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    const refreshRooms = () => {
      listRoomSettings().then((list) => alive && setRooms(list));
    };
    Promise.all([getGlobalSettings(), getApiKeys(), getInvalidKeys(), getBrokenState()]).then(
      ([s, k, i, b]) => {
        if (!alive) return;
        setSettings(s);
        setApiKeys(k);
        setInvalidKeys(i);
        setBroken(b);
        setLoaded(true);
      },
    );
    refreshRooms();
    const offs = [
      watchGlobalSettings((s) => alive && setSettings(s)),
      watchApiKeys((k) => alive && setApiKeys(k)),
      watchInvalidKeys((i) => alive && setInvalidKeys(i)),
      watchBrokenState((b) => alive && setBroken(b)),
      watchRoomSettings(refreshRooms),
    ];
    return () => {
      alive = false;
      for (const off of offs) off();
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<GlobalSettings>) => {
    try {
      const next = await setGlobalSettings(patch);
      setSettings(next);
      return true;
    } catch (e) {
      setSaveError(toSaveError(e));
      return false;
    }
  }, []);

  const updateApiKey = useCallback(async (provider: ProviderId, key: string) => {
    setApiKeys((prev) => ({ ...prev, [provider]: key }));
    const run = keyQueue.current.then(() => setApiKey(provider, key));
    keyQueue.current = run.catch(() => undefined);
    try {
      await run;
    } catch (e) {
      setSaveError(toSaveError(e));
    }
  }, []);

  const updateRoom = useCallback(
    async (roomId: string, patch: Partial<Omit<RoomSettings, 'roomId'>>) => {
      try {
        const next = await setRoomSettings(roomId, patch);
        setRooms((prev) => {
          const idx = prev.findIndex((r) => r.roomId === roomId);
          if (idx < 0) return [...prev, next];
          const copy = prev.slice();
          copy[idx] = next;
          return copy;
        });
        return true;
      } catch (e) {
        setSaveError(toSaveError(e));
        return false;
      }
    },
    [],
  );

  const deleteRoom = useCallback(async (roomId: string) => {
    try {
      await removeRoomSettings(roomId);
      setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
    } catch (e) {
      setSaveError(toSaveError(e));
    }
  }, []);

  const dismissSaveError = useCallback(() => setSaveError(null), []);

  return {
    settings,
    apiKeys,
    invalidKeys,
    broken,
    rooms,
    loaded,
    saveError,
    dismissSaveError,
    updateSettings,
    updateApiKey,
    updateRoom,
    deleteRoom,
  };
}

/** 대화방 하나의 설정(팝업 "현재 대화방" 카드용). 없으면 기본값 객체. */
export function useRoomSettings(roomId: string | null): {
  room: RoomSettings | null;
  update: (patch: Partial<Omit<RoomSettings, 'roomId'>>) => Promise<boolean>;
  saveError: SaveError | null;
} {
  const [room, setRoom] = useState<RoomSettings | null>(null);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  useEffect(() => {
    if (!roomId) {
      setRoom(null);
      return;
    }
    let alive = true;
    const load = () => {
      getRoomSettings(roomId).then(
        (r) => alive && setRoom(r ?? { roomId, incomingDisabled: false }),
      );
    };
    load();
    const off = watchRoomSettings(load);
    return () => {
      alive = false;
      off();
    };
  }, [roomId]);

  const update = useCallback(
    async (patch: Partial<Omit<RoomSettings, 'roomId'>>) => {
      if (!roomId) return false;
      try {
        const next = await setRoomSettings(roomId, patch);
        setRoom(next);
        return true;
      } catch (e) {
        setSaveError(toSaveError(e));
        return false;
      }
    },
    [roomId],
  );

  return { room, update, saveError };
}
