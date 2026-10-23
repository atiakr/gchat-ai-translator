import { DEFAULTS } from '../config/defaults';
import { isRetryable, ProviderError } from './types';

/**
 * 재시도: 재시도 대상 오류(rate_limit/server/parse)만 지수 백오프로 최대 N회.
 * 소진하면 마지막 오류를 그대로 던진다. 인증·잘못된 요청 오류는 즉시 던진다.
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
}

export function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableError(error: unknown): boolean {
  return error instanceof ProviderError && isRetryable(error.kind);
}

/** n번째 재시도(0부터) 전 대기 시간: base × 2^n. */
export function backoffDelay(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** attempt;
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULTS.maxRetries;
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.retryBaseDelayMs;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) throw error;
      await sleep(backoffDelay(attempt, baseDelayMs));
      attempt += 1;
    }
  }
}
