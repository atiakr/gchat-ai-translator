import { SyncQuotaError } from '../../settings/storage';

/** 저장 실패 종류. `quota` 는 sync 한도 초과, `other` 는 그 밖의 오류. */
export type SaveError = { kind: 'quota' } | { kind: 'other'; message: string };

export function toSaveError(e: unknown): SaveError {
  if (e instanceof SyncQuotaError) return { kind: 'quota' };
  return { kind: 'other', message: e instanceof Error ? e.message : String(e) };
}
