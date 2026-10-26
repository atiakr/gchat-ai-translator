import { DEFAULTS } from '../config/defaults';
import {
  type CustomPrices,
  DEFAULT_GLOBAL_SETTINGS,
  type GlobalSettings,
  isProviderId,
  normalizeModelName,
  PROVIDER_IDS,
  SETTINGS_VERSION,
  type TokenPrice,
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
  // v2 → v3: 일일 토큰 상한(dailyTokenLimit)과 서비스별 단가(prices) 추가. 없으면 기본값.
  if (version < 3) {
    base.version = 3;
  }
  // v3 → v4: 단가가 서비스별에서 모델별로 바뀌었다. 적어 둔 서비스 단가는 그 서비스의 현재 모델 단가로 옮긴다.
  if (version < 4) {
    base.prices = pricesFromV3(base.prices, base.models);
    base.version = 4;
  }

  const out: GlobalSettings = {
    ...DEFAULT_GLOBAL_SETTINGS,
    models: { ...DEFAULT_GLOBAL_SETTINGS.models },
    prices: { openai: {}, anthropic: {}, openai_compatible: {} },
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
  if (isNonNegativeNumber(base.dailyTokenLimit))
    out.dailyTokenLimit = Math.floor(base.dailyTokenLimit);
  if (base.prices && typeof base.prices === 'object') {
    for (const id of PROVIDER_IDS) {
      out.prices[id] = sanitizeCustomPrices((base.prices as Record<string, unknown>)[id]);
    }
  }
  out.version = SETTINGS_VERSION;
  return out;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** 단가는 0 이상의 유한한 수만 받는다. 손상된 값은 0. 객체가 아니면 null. */
function sanitizePrice(value: unknown): TokenPrice | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    input: isNonNegativeNumber(raw.input) ? raw.input : 0,
    output: isNonNegativeNumber(raw.output) ? raw.output : 0,
  };
}

/** 모델 이름 → 단가. 빈 이름·손상된 단가는 버리고 `DEFAULTS.maxCustomPricesPerProvider` 개까지만 둔다. */
function sanitizeCustomPrices(value: unknown): CustomPrices {
  const out: CustomPrices = {};
  if (!value || typeof value !== 'object') return out;
  for (const [rawName, rawPrice] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= DEFAULTS.maxCustomPricesPerProvider) break;
    const name = normalizeModelName(rawName);
    const price = sanitizePrice(rawPrice);
    if (name && price) out[name] = price;
  }
  return out;
}

/** v3 의 서비스별 단가 `{ input, output }` 를 `{ [그 서비스의 모델]: 단가 }` 로 바꾼다. 0 단가는 버린다. */
function pricesFromV3(prices: unknown, models: unknown): Record<string, CustomPrices> {
  const out: Record<string, CustomPrices> = {};
  if (!prices || typeof prices !== 'object') return out;
  const storedModels =
    models && typeof models === 'object' ? (models as Record<string, unknown>) : {};
  for (const id of PROVIDER_IDS) {
    const price = sanitizePrice((prices as Record<string, unknown>)[id]);
    if (!price || (price.input === 0 && price.output === 0)) continue;
    const stored = storedModels[id];
    const model = normalizeModelName(typeof stored === 'string' ? stored : DEFAULTS.models[id]);
    if (model) out[id] = { [model]: price };
  }
  return out;
}
