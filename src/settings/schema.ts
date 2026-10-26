import { DEFAULTS, type ProviderId } from '../config/defaults';
import type { ErrorKind } from '../engine/types';

/** 설정 스키마 버전. 구조가 바뀌면 올리고 migrate.ts 에 마이그레이션을 추가한다. */
export const SETTINGS_VERSION = 4;

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
  /** 하루 토큰 상한(입력+출력, 모든 서비스 합). 0 이면 상한 없음. */
  dailyTokenLimit: number;
  /**
   * 사용자가 직접 입력한 모델별 단가(USD / 100만 토큰). 서비스 → 모델 이름 → 단가.
   * 여기 없는 모델은 내장 단가(`src/config/prices.ts`)를 쓴다. 입력·출력이 모두 0 이면 금액을 표시하지 않는다.
   */
  prices: Record<ProviderId, CustomPrices>;
}

export interface TokenPrice {
  input: number;
  output: number;
}

/** 모델 이름 → 직접 입력한 단가. */
export type CustomPrices = Record<string, TokenPrice>;

/** 번역 가능 여부가 거짓일 때의 이유. */
export type GateReason = 'disabled' | 'no_key' | 'invalid_key' | 'budget';

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
  dailyTokenLimit: DEFAULTS.dailyTokenLimit,
  prices: { openai: {}, anthropic: {}, openai_compatible: {} },
};

/** 대화방별 설정(sync, 방 id 마다 항목 1개 `room:<id>`). */
export interface RoomSettings {
  roomId: string;
  name?: string;
  incomingDisabled: boolean;
  outgoingLang?: string;
  /** 켜면 이 방에서 그냥 Enter 도 바로 보내지 않고 번역 미리보기를 연다. 없으면 꺼짐. */
  enterTranslates?: boolean;
  /** 이 방에만 적용할 추가 지시문. 전역 지시문 뒤에 이어 붙는다. */
  instructions?: string;
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

/** 하루·서비스·모델 하나의 토큰 사용량(local). */
export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  calls: number;
}

/**
 * 토큰 사용량 기록(local). 날짜(이 기기의 현지 날짜 `YYYY-MM-DD`) → 서비스 → 모델 이름 → 합계.
 * 모델별로 나누기 전의 기록은 모델 이름 `''`(모름)으로 읽힌다.
 */
export interface UsageStore {
  days: Record<string, Partial<Record<ProviderId, Record<string, UsageTotals>>>>;
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

/** 기록·단가 키로 쓰는 모델 이름. 앞뒤 공백을 떼고 `DEFAULTS.maxModelNameChars` 로 자른다. */
export function normalizeModelName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, DEFAULTS.maxModelNameChars) : '';
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDER_IDS as readonly string[]).includes(value);
}
