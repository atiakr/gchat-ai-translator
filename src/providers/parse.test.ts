import { describe, expect, it } from 'vitest';
import { ProviderError } from '../engine/types';
import { extractJson, normalizeLang, parseTranslationOutput } from './parse';
import { okOutput } from './testUtils';

const items = [
  { id: 'a', text: 'x' },
  { id: 'b', text: 'y' },
];

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof ProviderError) return e.kind;
    throw e;
  }
  return undefined;
}

describe('normalizeLang', () => {
  it('소문자·2글자, zh 지역은 유지', () => {
    expect(normalizeLang('EN')).toBe('en');
    expect(normalizeLang('en-US')).toBe('en');
    expect(normalizeLang('zh-cn')).toBe('zh-CN');
    expect(normalizeLang('ZH-TW')).toBe('zh-TW');
    expect(normalizeLang('zh-Hans')).toBe('zh-CN');
    expect(normalizeLang('zh-Hant')).toBe('zh-TW');
    expect(normalizeLang('zh')).toBe('zh');
    expect(normalizeLang('jpn')).toBe('jp');
  });
  it('빈 값·문자열 아님 → und', () => {
    expect(normalizeLang('')).toBe('und');
    expect(normalizeLang('   ')).toBe('und');
    expect(normalizeLang(undefined)).toBe('und');
    expect(normalizeLang(42)).toBe('und');
  });
});

describe('extractJson', () => {
  it('순수 JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('코드펜스·설명 사이의 첫 JSON 객체', () => {
    expect(extractJson('Sure!\n```json\n{"items":[]}\n```\nDone.')).toEqual({ items: [] });
  });
  it('JSON 없음 → parse 오류', () => {
    expect(kindOf(() => extractJson('nothing here'))).toBe('parse');
    expect(kindOf(() => extractJson('{broken'))).toBe('parse');
  });
});

describe('parseTranslationOutput', () => {
  it('정상 출력을 항목 순서대로 돌려준다', () => {
    const out = parseTranslationOutput(okOutput(['a', 'b']), items);
    expect(out).toEqual([
      { id: 'a', translation: '번역-a', detectedLang: 'en', sameLanguage: false },
      { id: 'b', translation: '번역-b', detectedLang: 'en', sameLanguage: false },
    ]);
  });
  it('순서가 달라도 id 로 맞춘다', () => {
    const out = parseTranslationOutput(okOutput(['b', 'a']), items);
    expect(out.map((r) => r.id)).toEqual(['a', 'b']);
  });
  it('항목 수 불일치 → parse', () => {
    expect(kindOf(() => parseTranslationOutput(okOutput(['a']), items))).toBe('parse');
    expect(kindOf(() => parseTranslationOutput(okOutput(['a', 'b', 'c']), items))).toBe('parse');
  });
  it('id 불일치 → parse', () => {
    expect(kindOf(() => parseTranslationOutput(okOutput(['a', 'z']), items))).toBe('parse');
  });
  it('중복 id → parse', () => {
    expect(kindOf(() => parseTranslationOutput(okOutput(['a', 'a']), items))).toBe('parse');
  });
  it('JSON 아님·items 없음 → parse', () => {
    expect(kindOf(() => parseTranslationOutput('not json', items))).toBe('parse');
    expect(kindOf(() => parseTranslationOutput('{"foo":1}', items))).toBe('parse');
    expect(kindOf(() => parseTranslationOutput('[]', items))).toBe('parse');
  });
  it('항목 하나의 번역문이 문자열이 아니면 그 항목만 빈 실패로', () => {
    const text = JSON.stringify({
      items: [
        { id: 'a', detected_lang: 'en', same_language: false, translation: 42 },
        { id: 'b', detected_lang: 'EN', same_language: false, translation: 'ok' },
      ],
    });
    const out = parseTranslationOutput(text, items);
    expect(out[0]).toEqual({
      id: 'a',
      translation: '',
      detectedLang: 'und',
      sameLanguage: false,
      failed: true,
    });
    expect(out[1]).toEqual({ id: 'b', translation: 'ok', detectedLang: 'en', sameLanguage: false });
  });
  it('same_language 가 boolean 이 아니면 false, detected_lang 는 정규화', () => {
    const text = JSON.stringify({
      items: [
        { id: 'a', detected_lang: 'KO', same_language: 'yes', translation: 'x' },
        { id: 'b', detected_lang: '', same_language: true, translation: '' },
      ],
    });
    const out = parseTranslationOutput(text, items);
    expect(out[0]).toEqual({ id: 'a', translation: 'x', detectedLang: 'ko', sameLanguage: false });
    expect(out[1]).toEqual({ id: 'b', translation: '', detectedLang: 'und', sameLanguage: true });
  });
  it('항목이 객체가 아니면 → parse', () => {
    expect(kindOf(() => parseTranslationOutput('{"items":[1,2]}', items))).toBe('parse');
  });
});
