import {
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  isProviderId,
  SETTINGS_VERSION,
} from './schema';

/**
 * 저장된 전역 설정을 현재 스키마로 맞춘다. 빈 저장소·구버전·손상된 값 모두 기본값으로 채운다.
 * 버전이 올라가면 case 를 추가한다(순차 적용).
 */
export function migrateGlobalSettings(stored: unknown): GlobalSettings {
  const base: Record<string, unknown> =
    stored && typeof stored === 'object' ? { ...(stored as Record<string, unknown>) } : {};
  const version = typeof base.version === 'number' ? base.version : 0;

  // v0 → v1: 최초 스키마. 알려진 필드만 취하고 나머지는 기본값.
  if (version < 1) {
    base.version = 1;
  }
  // v1 → v2: '원문 숨기기'(hideOriginal) 제거. 번역문은 항상 원문 자리를 대신한다.
  if (version < 2) {
    delete base.hideOriginal;
    base.version = 2;
  }

  const out: GlobalSettings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    models: { ...DEFAULT_GLOBAL_SETTINGS.models },
  };
  if (typeof base.enabled === 'boolean') out.enabled = base.enabled;
  if (isProviderId(base.activeProvider)) out.activeProvider = base.activeProvider;
  if (base.models && typeof base.models === 'object') {
    for (const id of Object.keys(out.models) as (keyof GlobalSettings['models'])[]) {
      const v = (base.models as Record<string, unknown>)[id];
      if (typeof v === 'string') out.models[id] = v;
    }
  }
  if (typeof base.customBaseUrl === 'string') out.customBaseUrl = base.customBaseUrl;
  if (typeof base.targetLang === 'string' && base.targetLang) out.targetLang = base.targetLang;
  if (typeof base.outgoingLang === 'string' && base.outgoingLang)
    out.outgoingLang = base.outgoingLang;
  if (typeof base.instructions === 'string') out.instructions = base.instructions;
  if (typeof base.maxMessageChars === 'number' && base.maxMessageChars > 0)
    out.maxMessageChars = base.maxMessageChars;
  if (typeof base.maxAutoPerRoom === 'number' && base.maxAutoPerRoom > 0)
    out.maxAutoPerRoom = base.maxAutoPerRoom;
  out.version = SETTINGS_VERSION;
  return out;
}
