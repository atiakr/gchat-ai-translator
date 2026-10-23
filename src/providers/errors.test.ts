import { describe, expect, it } from 'vitest';
import {
  errorFromFetchFailure,
  errorFromStatus,
  isStructuredOutputRejection,
  safeErrorMessage,
} from './errors';

describe('errorFromStatus', () => {
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [500, 'server'],
    [502, 'server'],
    [503, 'server'],
    [400, 'bad_request'],
    [404, 'bad_request'],
    [422, 'bad_request'],
  ])('%i → %s', (status, kind) => {
    const err = errorFromStatus(status, '');
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
  });
  it('본문의 error.message 를 메시지에 담는다', () => {
    const err = errorFromStatus(404, JSON.stringify({ error: { message: 'model not found' } }));
    expect(err.message).toContain('model not found');
    expect(err.message).toContain('404');
  });
  it('본문이 JSON 이 아니면 잘라서 담는다', () => {
    const err = errorFromStatus(502, 'x'.repeat(1000));
    expect(err.message.length).toBeLessThan(400);
  });
});

describe('errorFromFetchFailure', () => {
  it('네트워크 TypeError → server', () => {
    const err = errorFromFetchFailure(new TypeError('Failed to fetch'));
    expect(err.kind).toBe('server');
    expect(err.status).toBeUndefined();
  });
  it('ProviderError 는 그대로', () => {
    const err = errorFromFetchFailure(errorFromStatus(401, ''));
    expect(err.kind).toBe('auth');
  });
});

describe('isStructuredOutputRejection', () => {
  it('400 + response_format / json_schema / output_config / format', () => {
    for (const w of ['response_format', 'json_schema', 'output_config', 'format']) {
      expect(isStructuredOutputRejection(400, `{"error":{"message":"bad ${w} param"}}`)).toBe(true);
    }
  });
  it('다른 400 또는 다른 status 는 아님', () => {
    expect(isStructuredOutputRejection(400, 'model not found')).toBe(false);
    expect(isStructuredOutputRejection(404, 'response_format')).toBe(false);
    expect(isStructuredOutputRejection(500, 'json_schema')).toBe(false);
  });
});

describe('safeErrorMessage', () => {
  it('anthropic 형태의 error.message', () => {
    expect(safeErrorMessage('{"type":"error","error":{"type":"x","message":"boom"}}')).toBe('boom');
  });
  it('문자열 message 가 없으면 본문 일부', () => {
    expect(safeErrorMessage('plain text')).toBe('plain text');
    expect(safeErrorMessage('')).toBe('');
  });
});
