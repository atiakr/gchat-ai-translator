import { DEFAULTS, type ProviderId } from '../config/defaults';
import type { ErrorKind } from '../engine/types';

/** 설정 스키마 버전. 구조가 바뀌면 올리고 migrate.ts 에 마이그레이션을 추가한다. */
export const SETTINGS_VERSION = 2;

export const PROVIDER_IDS: readonly ProviderId[] = ['openai', 'anthropic', 'openai_compatible'];

/** 계정 동기화(sync) 전역 설정. 키·기록은 절대 여기 두지 않는다. */
export interface GlobalSettings {
  version: number;
  enabled: boolean;
  activeProvider: ProviderId;
  models: Record<ProviderId, string>;
  /** openai_compatible base URL. 빈 문자열이면 미설정. */
  customBaseUrl: string;
  targetLang: string;
  outgoingLang: string;
  instructions: string;
  maxMessageChars: number;
  maxAutoPerRoom: number;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: SETTINGS_VERSION,
  enabled: true,
  activeProvider: 'openai',
  models: { ...DEFAULTS.models },
  customBaseUrl: '',
  targetLang: DEFAULTS.targetLang,
  outgoingLang: DEFAULTS.outgoingLang,
  instructions: '',
  maxMessageChars: DEFAULTS.maxMessageChars,
  maxAutoPerRoom: DEFAULTS.maxAutoPerRoom,
};

/** 대화방별 설정(sync, 방 id 마다 항목 1개 `room:<id>`). */
export interface RoomSettings {
  roomId: string;
  name?: string;
  incomingDisabled: boolean;
  outgoingLang?: string;
}

/** 이 기기에만 저장되는 API 키(local). */
export type ApiKeys = Record<ProviderId, string>;

export const EMPTY_API_KEYS: ApiKeys = { openai: '', anthropic: '', openai_compatible: '' };

/** 틀린 키 상태(local). 서비스별. */
export type InvalidKeyState = Partial<Record<ProviderId, { kind: ErrorKind; at: number }>>;

/** 화면 구조 깨짐 상태(local). */
export interface BrokenState {
  detectedAt: number;
}

/** 번역 기록 엔트리(local). */
export interface CacheEntry {
  key: string;
  status: 'translated' | 'same_language';
  translation?: string;
  detectedLang: string;
  savedAt: number;
}

/** 내 원문 기록 엔트리(local). */
export interface SentOriginalEntry {
  roomId: string;
  sentTextHash: string;
  original: string;
  savedAt: number;
}

export function roomSettingsKey(roomId: string): `sync:room:${string}` {
  return `sync:room:${roomId}`;
}

export const ROOM_KEY_PREFIX = 'room:';

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
