/**
 * 조정 가능한 값 모음. 모든 수치·기본 모델 이름은 여기에서만 바꾼다.
 */
export const DEFAULTS = {
  /** 번역 서비스별 기본 모델 이름. 사용자가 설정에서 자유롭게 바꿀 수 있다. */
  models: {
    openai: 'gpt-5-mini',
    anthropic: 'claude-opus-5-5',
    openai_compatible: '',
  },
  /** Claude 설정 화면 추천 선택지(가격 힌트는 i18n 문구로). */
  anthropicModelChoices: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  /** Anthropic Messages API 버전 헤더. */
  anthropicVersion: '2023-06-01',
  /** Claude 호출 시 사고 깊이. 번역에는 낮은 값으로 충분하다. */
  anthropicEffort: 'low',
  /** 대상 언어 / 발신 언어 기본값. */
  targetLang: 'ko',
  outgoingLang: 'en',
  /** 자동 번역 길이 상한(자). 초과 시 skipped_long. */
  maxMessageChars: 2000,
  /** 대화방당 자동 번역 상한(건, 최신순). 초과 시 skipped_limit. */
  maxAutoPerRoom: 200,
  /** 묶음 호출 최대 건수. */
  batchSize: 10,
  /** 대기열이 비어 있을 때 단건 요청을 잠시 기다리는 시간(ms). */
  batchDelayMs: 150,
  /** 서비스당 동시 호출 수. */
  concurrency: 3,
  /** 재시도 대상 오류의 최대 재시도 횟수와 백오프 시작값(ms). */
  maxRetries: 2,
  retryBaseDelayMs: 800,
  /** 번역 기록(캐시) 항목 수 상한. 초과 시 오래된 것부터 삭제. */
  cacheMaxEntries: 5000,
  /** 내 원문 기록 항목 수 상한. */
  sentOriginalMaxEntries: 1000,
  /** 대화방 화면에서 메시지를 하나도 못 찾으면 깨짐으로 보는 시간(ms). */
  brokenDetectMs: 60_000,
  /** 단축키 두 경로의 중복 발동 방지 창(ms). */
  shortcutDedupeMs: 300,
  /** 전송 직후 내 메시지를 찾는 최대 시간(ms). */
  sentMatchTimeoutMs: 5000,
  /** 응답 없이 끊긴 요청을 content 가 다시 보내는 횟수. */
  reRequestOnDisconnect: 1,
} as const;

export type ProviderId = keyof typeof DEFAULTS.models;
