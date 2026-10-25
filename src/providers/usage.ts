import type { ProviderId } from '../config/defaults';
import type { TokenUsage } from '../settings/usage';

export type { TokenUsage };

/**
 * 서비스 응답의 토큰 사용량 보고. 서비스 코드는 응답 본문을 받는 즉시 `reportUsage` 로 알리고,
 * background 가 리스너를 달아 기록한다. 파싱에 실패해도 과금은 됐으므로 파싱 전에 보고한다.
 * 리스너가 없으면 버린다. 리스너의 예외는 번역 결과에 영향을 주지 않는다.
 */
export interface UsageEvent {
  provider: ProviderId;
  model: string;
  usage: TokenUsage;
}

export type UsageListener = (event: UsageEvent) => void;

let listener: UsageListener | null = null;

export function setUsageListener(next: UsageListener | null): void {
  listener = next;
}

export function reportUsage(event: UsageEvent): void {
  if (!listener) return;
  try {
    listener(event);
  } catch {
    // 기록 실패는 번역을 막지 않는다.
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Chat Completions `usage.prompt_tokens` / `usage.completion_tokens`. usage 가 없으면 null. */
export function usageFromChatCompletions(data: unknown): TokenUsage | null {
  const usage = (data as { usage?: unknown } | null)?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  return { inputTokens: count(u.prompt_tokens), outputTokens: count(u.completion_tokens) };
}

/**
 * Anthropic Messages `usage.input_tokens` / `usage.output_tokens`.
 * 캐시 생성·읽기 토큰도 입력으로 센다(요금은 다르지만 토큰 수는 모두 입력이다).
 */
export function usageFromAnthropic(data: unknown): TokenUsage | null {
  const usage = (data as { usage?: unknown } | null)?.usage;
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens:
      count(u.input_tokens) +
      count(u.cache_creation_input_tokens) +
      count(u.cache_read_input_tokens),
    outputTokens: count(u.output_tokens),
  };
}
