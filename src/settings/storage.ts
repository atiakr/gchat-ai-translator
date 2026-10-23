import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import type { ProviderId } from '../config/defaults';
import { migrateGlobalSettings } from './migrate';
import {
  type ApiKeys,
  type BrokenState,
  DEFAULT_GLOBAL_SETTINGS,
  EMPTY_API_KEYS,
  type GlobalSettings,
  type InvalidKeyState,
  ROOM_KEY_PREFIX,
  type RoomSettings,
  roomSettingsKey,
} from './schema';

/**
 * 저장 계층. 규칙:
 * - API 키는 `local:` 에만 쓴다. 이 파일 밖에서 키를 저장하는 경로는 없다.
 * - 전역 설정·방별 설정은 `sync:`, 기록·상태는 `local:`.
 */

const globalItem = storage.defineItem<GlobalSettings>('sync:settings', {
  fallback: DEFAULT_GLOBAL_SETTINGS,
});
const apiKeysItem = storage.defineItem<ApiKeys>('local:apiKeys', { fallback: EMPTY_API_KEYS });
const invalidKeyItem = storage.defineItem<InvalidKeyState>('local:invalidKeys', { fallback: {} });
const brokenItem = storage.defineItem<BrokenState | null>('local:broken', { fallback: null });
const installedItem = storage.defineItem<boolean>('local:onboarded', { fallback: false });

export class SyncQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncQuotaError';
  }
}

function wrapQuota<T>(p: Promise<T>): Promise<T> {
  return p.catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/QUOTA|quota/.test(msg)) throw new SyncQuotaError(msg);
    throw e;
  });
}

// ---- 전역 설정 (sync) ----
export async function getGlobalSettings(): Promise<GlobalSettings> {
  const raw = await storage.getItem<unknown>('sync:settings');
  return migrateGlobalSettings(raw);
}

export async function setGlobalSettings(patch: Partial<GlobalSettings>): Promise<GlobalSettings> {
  const current = await getGlobalSettings();
  const next: GlobalSettings = migrateGlobalSettings({ ...current, ...patch });
  await wrapQuota(globalItem.setValue(next));
  return next;
}

export function watchGlobalSettings(cb: (next: GlobalSettings) => void): () => void {
  return globalItem.watch((value) => cb(migrateGlobalSettings(value)));
}

// ---- 방별 설정 (sync, 항목 분리) ----
export async function getRoomSettings(roomId: string): Promise<RoomSettings | null> {
  return storage.getItem<RoomSettings>(roomSettingsKey(roomId));
}

export async function setRoomSettings(
  roomId: string,
  patch: Partial<Omit<RoomSettings, 'roomId'>>,
): Promise<RoomSettings> {
  const current = (await getRoomSettings(roomId)) ?? { roomId, incomingDisabled: false };
  const next: RoomSettings = { ...current, ...patch, roomId };
  await wrapQuota(storage.setItem(roomSettingsKey(roomId), next));
  return next;
}

export async function removeRoomSettings(roomId: string): Promise<void> {
  await storage.removeItem(roomSettingsKey(roomId));
}

export async function listRoomSettings(): Promise<RoomSettings[]> {
  const all = (await browser.storage.sync.get(null)) as Record<string, unknown>;
  const rooms: RoomSettings[] = [];
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(ROOM_KEY_PREFIX)) continue;
    if (value && typeof value === 'object' && 'roomId' in value) rooms.push(value as RoomSettings);
  }
  return rooms.sort((a, b) => (a.name ?? a.roomId).localeCompare(b.name ?? b.roomId));
}

export function watchRoomSettings(cb: () => void): () => void {
  const listener = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'sync') return;
    if (Object.keys(changes).some((k) => k.startsWith(ROOM_KEY_PREFIX))) cb();
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}

// ---- API 키 (local 전용) ----
export async function getApiKeys(): Promise<ApiKeys> {
  const v = await apiKeysItem.getValue();
  return { ...EMPTY_API_KEYS, ...v };
}

export async function setApiKey(provider: ProviderId, key: string): Promise<void> {
  const current = await getApiKeys();
  await apiKeysItem.setValue({ ...current, [provider]: key });
  // 키를 바꾸면 그 서비스의 틀린 키 상태는 해제된다.
  await clearInvalidKey(provider);
}

export function watchApiKeys(cb: (keys: ApiKeys) => void): () => void {
  return apiKeysItem.watch((v) => cb({ ...EMPTY_API_KEYS, ...v }));
}

// ---- 상태 (local) ----
export async function getInvalidKeys(): Promise<InvalidKeyState> {
  return invalidKeyItem.getValue();
}

export async function setInvalidKey(provider: ProviderId, kind: 'auth'): Promise<void> {
  const current = await invalidKeyItem.getValue();
  await invalidKeyItem.setValue({ ...current, [provider]: { kind, at: Date.now() } });
}

export async function clearInvalidKey(provider: ProviderId): Promise<void> {
  const current = await invalidKeyItem.getValue();
  if (!(provider in current)) return;
  const next = { ...current };
  delete next[provider];
  await invalidKeyItem.setValue(next);
}

export function watchInvalidKeys(cb: (v: InvalidKeyState) => void): () => void {
  return invalidKeyItem.watch(cb);
}

export async function getBrokenState(): Promise<BrokenState | null> {
  return brokenItem.getValue();
}

export async function setBrokenState(state: BrokenState | null): Promise<void> {
  await brokenItem.setValue(state);
}

export function watchBrokenState(cb: (v: BrokenState | null) => void): () => void {
  return brokenItem.watch(cb);
}

export async function isOnboarded(): Promise<boolean> {
  return installedItem.getValue();
}

export async function markOnboarded(): Promise<void> {
  await installedItem.setValue(true);
}

/** 번역 가능 조건(불변식 5): 전역 스위치 + 활성 서비스의 유효한 키(커스텀 서비스는 빈 키 허용). */
export async function canTranslate(): Promise<{
  ok: boolean;
  reason?: 'disabled' | 'no_key' | 'invalid_key';
}> {
  const settings = await getGlobalSettings();
  if (!settings.enabled) return { ok: false, reason: 'disabled' };
  const keys = await getApiKeys();
  const provider = settings.activeProvider;
  if (provider !== 'openai_compatible' && !keys[provider]) return { ok: false, reason: 'no_key' };
  const invalid = await getInvalidKeys();
  if (invalid[provider]) return { ok: false, reason: 'invalid_key' };
  return { ok: true };
}
