import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../../messaging/protocol';
import type { BrokenState, GlobalSettings, RoomSettings } from '../../settings/schema';
import {
  getBrokenState,
  getGlobalSettings,
  getRoomSettings,
  setGlobalSettings,
  setRoomSettings,
  watchBrokenState,
  watchGlobalSettings,
  watchInvalidKeys,
  watchRoomSettings,
} from '../../settings/storage';
import { type SaveError, toSaveError } from '../settings/saveError';

/**
 * 팝업 전용 설정 훅. API 키는 읽지 않는다(키를 읽는 곳은 background 와 옵션 페이지뿐).
 * 번역 가능 여부(키 없음·틀린 키·꺼짐)는 background 의 `settings.get` 응답으로 알고,
 * 설정·틀린 키 상태가 바뀌면 다시 묻는다. 화면 구조 깨짐은 local 상태를 직접 본다.
 */

export type GateReason = 'disabled' | 'no_key' | 'invalid_key';

export interface PopupGate {
  canTranslate: boolean;
  reason?: GateReason;
}

export interface PopupSettingsStore {
  /** 첫 로드가 끝나기 전엔 null. */
  settings: GlobalSettings | null;
  /** background 응답 전이거나 응답이 없으면 null(경고를 띄우지 않는다). */
  gate: PopupGate | null;
  broken: BrokenState | null;
  saveError: SaveError | null;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
}

export function usePopupSettings(): PopupSettingsStore {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [gate, setGate] = useState<PopupGate | null>(null);
  const [broken, setBroken] = useState<BrokenState | null>(null);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const refreshGate = () => {
      const mine = ++seq;
      sendMessage('settings.get', {}).then(
        (response) => {
          if (!alive || mine !== seq) return;
          setGate(
            response
              ? {
                  canTranslate: response.canTranslate === true,
                  ...(response.reason ? { reason: response.reason } : {}),
                }
              : null,
          );
        },
        () => {
          if (alive && mine === seq) setGate(null);
        },
      );
    };
    Promise.all([getGlobalSettings(), getBrokenState()]).then(([s, b]) => {
      if (!alive) return;
      setSettings(s);
      setBroken(b);
    });
    refreshGate();
    const offs = [
      watchGlobalSettings((s) => {
        if (!alive) return;
        setSettings(s);
        refreshGate();
      }),
      watchInvalidKeys(() => {
        if (alive) refreshGate();
      }),
      watchBrokenState((b) => alive && setBroken(b)),
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

  return { settings, gate, broken, saveError, updateSettings };
}

/** 대화방 하나의 설정(팝업 "현재 대화방" 카드용). 저장된 항목이 없으면 기본값 객체. */
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
