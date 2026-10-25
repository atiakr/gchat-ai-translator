import { t, uiLanguage } from '../../i18n/t';

/** 토큰 수를 자릿수 구분 기호를 넣어 "12,345 토큰" 꼴로. */
export function formatTokenCount(n: number): string {
  return t('common_tokenCount', formatInteger(n));
}

export function formatInteger(n: number): string {
  try {
    return new Intl.NumberFormat(uiLanguage()).format(Math.max(0, Math.floor(n)));
  } catch {
    return String(Math.max(0, Math.floor(n)));
  }
}

/**
 * 미국 달러 금액. 1달러 미만은 소수 네 자리까지, 그 이상은 두 자리까지 보인다.
 * 모든 서비스가 달러로 청구하므로 통화 기호는 고정이다.
 */
export function formatUsd(amount: number): string {
  const safe = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const digits = safe > 0 && safe < 1 ? 4 : 2;
  try {
    return `$${new Intl.NumberFormat(uiLanguage(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: digits,
    }).format(safe)}`;
  } catch {
    return `$${safe.toFixed(digits)}`;
  }
}

/** 0 이상의 유한한 수만 허용(단가 입력). 빈 문자열은 0. */
export function parsePrice(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return 0;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 0 이상의 정수만 허용(일일 상한). */
export function parseNonNegativeInt(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
