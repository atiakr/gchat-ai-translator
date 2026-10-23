import { type ErrorKind, ProviderError } from '../engine/types';

const MAX_MESSAGE_CHARS = 300;

/** HTTP 상태 → 오류 분류. */
export function kindFromStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'bad_request';
}

/**
 * 오류 응답 본문에서 사용자에게 보여줄 짧은 메시지를 뽑는다.
 * OpenAI/Anthropic 모두 `{ error: { message } }` 형태. 아니면 본문 앞부분.
 */
export function safeErrorMessage(bodyText: string): string {
  const text = bodyText.trim();
  if (!text) return '';
  try {
    const data: unknown = JSON.parse(text);
    if (data && typeof data === 'object') {
      const error = (data as Record<string, unknown>).error;
      if (error && typeof error === 'object') {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === 'string' && message.trim()) return truncate(message.trim());
      }
      const message = (data as Record<string, unknown>).message;
      if (typeof message === 'string' && message.trim()) return truncate(message.trim());
    }
  } catch {
    // JSON 아님 → 본문 앞부분 사용
  }
  return truncate(text);
}

function truncate(text: string): string {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS)}…` : text;
}

/** HTTP 오류 응답 → ProviderError. 키는 절대 메시지에 넣지 않는다(본문만 사용). */
export function errorFromStatus(status: number, bodyText: string, apiKey = ''): ProviderError {
  let detail = safeErrorMessage(bodyText);
  if (apiKey && detail.includes(apiKey)) detail = detail.split(apiKey).join('[redacted]');
  const message = detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
  return new ProviderError(kindFromStatus(status), message, status);
}

/** fetch 자체의 실패(네트워크·CORS·중단) → server. 이미 ProviderError 면 그대로. */
export function errorFromFetchFailure(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const detail = err instanceof Error ? err.message : String(err);
  return new ProviderError('server', `Network error: ${detail}`);
}

const STRUCTURED_OUTPUT_MARKERS = ['response_format', 'json_schema', 'output_config', 'format'];

/**
 * 구조화 출력 파라미터를 서비스가 거부했는지 판정한다.
 * 400 이면서 본문에 response_format / json_schema / output_config / format 이 보이면 폴백 대상.
 */
export function isStructuredOutputRejection(status: number, bodyText: string): boolean {
  if (status !== 400) return false;
  const lower = bodyText.toLowerCase();
  return STRUCTURED_OUTPUT_MARKERS.some((m) => lower.includes(m));
}
