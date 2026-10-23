import type { ProviderId } from '../config/defaults';

export type { ProviderId };

/** 수신 메시지 1건의 번역 상태 집합. 정확히 이 값들만 존재한다. */
export const TRANSLATION_STATUSES = [
  'pending',
  'translated',
  'same_language',
  'no_text',
  'skipped_long',
  'skipped_limit',
  'error',
] as const;
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number];

/** 번역 서비스 오류 분류. */
export const ERROR_KINDS = ['auth', 'rate_limit', 'server', 'bad_request', 'parse'] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const RETRYABLE_ERROR_KINDS: readonly ErrorKind[] = ['rate_limit', 'server', 'parse'];

export function isRetryable(kind: ErrorKind): boolean {
  return RETRYABLE_ERROR_KINDS.includes(kind);
}

export class ProviderError extends Error {
  readonly kind: ErrorKind;
  readonly status: number | undefined;
  constructor(kind: ErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = status;
  }
}

export type TranslateMode = 'incoming' | 'outgoing';

export interface TranslateItem {
  id: string;
  text: string;
}

export interface TranslateRequest {
  items: TranslateItem[];
  /** ISO 639-1 (예: ko, en, zh-CN) */
  targetLang: string;
  /** 사용자 추가 지시문. 빈 문자열이면 미사용. */
  instructions: string;
  mode: TranslateMode;
}

export interface TranslateItemResult {
  id: string;
  translation: string;
  /** 서비스가 판정한 원문 언어 코드(소문자, 예: en, ja). 판정 불가 시 'und'. */
  detectedLang: string;
  /** 원문 언어가 대상 언어와 같은가(서비스 판정). */
  sameLanguage: boolean;
  /** 응답의 항목 수·id 는 맞지만 이 항목의 번역문이 비었거나 형식이 틀린 경우. */
  failed?: true;
}

/** 서비스가 호출에 쓰는 자격 정보·설정. 키는 background/옵션 페이지만 다룬다. */
export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  model: string;
  /** openai_compatible 전용 base URL (예: https://host/v1) */
  baseUrl?: string;
}

/** 모든 번역 서비스가 구현하는 공통 계약. */
export interface TranslationProvider {
  readonly id: ProviderId;
  translate(request: TranslateRequest, config: ProviderConfig): Promise<TranslateItemResult[]>;
}
