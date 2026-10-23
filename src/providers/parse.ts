import { ProviderError, type TranslateItem, type TranslateItemResult } from '../engine/types';

/**
 * 모델이 돌려준 언어 코드를 정규화한다: 소문자 2글자, 중국어 지역 변형만 유지.
 * 빈 값·문자열 아님 → 'und'.
 */
export function normalizeLang(raw: unknown): string {
  if (typeof raw !== 'string') return 'und';
  const value = raw.trim().toLowerCase();
  if (!value) return 'und';
  if (value.startsWith('zh')) {
    if (/cn|hans|sg/.test(value.slice(2))) return 'zh-CN';
    if (/tw|hant|hk|mo/.test(value.slice(2))) return 'zh-TW';
    return 'zh';
  }
  const primary = value.split(/[-_]/)[0] ?? '';
  const letters = primary.replace(/[^a-z]/g, '');
  if (!letters) return 'und';
  return letters.slice(0, 2);
}

/** 본문 전체를 JSON 으로 파싱하고, 실패하면 첫 JSON 객체/배열 구간을 찾아 다시 시도한다. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // 코드펜스나 설명 사이에 끼인 JSON 을 찾는다.
  }
  const start = findFirst(trimmed, ['{', '[']);
  if (start < 0) throw new ProviderError('parse', 'No JSON found in model output');
  const open = trimmed[start];
  const close = open === '{' ? '}' : ']';
  const end = trimmed.lastIndexOf(close);
  if (end <= start) throw new ProviderError('parse', 'Unterminated JSON in model output');
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    throw new ProviderError('parse', 'Invalid JSON in model output');
  }
}

function findFirst(text: string, chars: string[]): number {
  let best = -1;
  for (const c of chars) {
    const i = text.indexOf(c);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

const FAILED_ITEM = { translation: '', detectedLang: 'und', sameLanguage: false } as const;

/**
 * 모델 출력을 검증해 입력 순서대로 결과를 돌려준다.
 * - 구조·개수·id 불일치, JSON 아님 → ProviderError('parse') (묶음 전체 실패)
 * - 항목 하나의 translation 이 문자열이 아님 → 그 항목만 `{ translation: '', detectedLang: 'und', sameLanguage: false }`
 *   (호출자는 빈 translation + sameLanguage=false 를 항목 단위 오류로 본다)
 */
export function parseTranslationOutput(
  text: string,
  items: TranslateItem[],
): TranslateItemResult[] {
  const data = extractJson(text);
  if (!isRecord(data) || !Array.isArray(data.items)) {
    throw new ProviderError('parse', 'Model output is not an object with an "items" array');
  }
  const outputs = data.items;
  if (outputs.length !== items.length) {
    throw new ProviderError(
      'parse',
      `Item count mismatch: expected ${items.length}, got ${outputs.length}`,
    );
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const entry of outputs) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      throw new ProviderError('parse', 'Model output item is malformed');
    }
    if (byId.has(entry.id)) throw new ProviderError('parse', `Duplicate item id: ${entry.id}`);
    byId.set(entry.id, entry);
  }
  return items.map((item) => {
    const entry = byId.get(item.id);
    if (!entry) throw new ProviderError('parse', `Missing item id in model output: ${item.id}`);
    if (typeof entry.translation !== 'string') return { id: item.id, ...FAILED_ITEM };
    return {
      id: item.id,
      translation: entry.translation,
      detectedLang: normalizeLang(entry.detected_lang),
      sameLanguage: entry.same_language === true,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
