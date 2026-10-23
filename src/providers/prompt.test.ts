import { describe, expect, it } from 'vitest';
import { buildOutputSchema, buildPrompt, languageName } from './prompt';
import { makeRequest } from './testUtils';

describe('languageName', () => {
  it('알려진 코드는 영어 이름으로', () => {
    expect(languageName('ko')).toBe('Korean');
    expect(languageName('zh-CN')).toBe('Chinese (Simplified)');
    expect(languageName('zh-TW')).toBe('Chinese (Traditional)');
  });
  it('모르는 코드는 코드 자체를 돌려준다', () => {
    expect(languageName('xx')).toBe('xx');
  });
});

describe('buildPrompt', () => {
  it('대상 언어 이름과 코드, 보존 규칙을 포함한다', () => {
    const p = buildPrompt(makeRequest({ targetLang: 'ja' }));
    expect(p.system).toContain('Japanese');
    expect(p.system).toContain('ja');
    expect(p.system).toMatch(/URL/);
    expect(p.system).toMatch(/@mention/i);
    expect(p.system).toMatch(/code block/i);
    expect(p.system).toMatch(/inline code/i);
    expect(p.system).toMatch(/detected_lang/);
  });
  it('추가 지시문은 비어 있지 않을 때만 붙는다', () => {
    const without = buildPrompt(makeRequest({ instructions: '' }));
    expect(without.system).not.toMatch(/additional instructions/i);
    const blank = buildPrompt(makeRequest({ instructions: '   ' }));
    expect(blank.system).not.toMatch(/additional instructions/i);
    const withIt = buildPrompt(makeRequest({ instructions: 'Use polite tone' }));
    expect(withIt.system).toMatch(/additional instructions/i);
    expect(withIt.system).toContain('Use polite tone');
  });
  it('사용자 메시지에 항목 id·본문이 JSON 으로 들어간다', () => {
    const p = buildPrompt(makeRequest());
    const parsed = JSON.parse(p.user.slice(p.user.indexOf('{')));
    expect(parsed.items).toEqual([
      { id: 'a', text: 'Hello there' },
      { id: 'b', text: 'How are you?' },
    ]);
  });
  it('발신 모드는 같은 언어여도 번역을 요구한다', () => {
    const out = buildPrompt(makeRequest({ mode: 'outgoing', items: [{ id: 'x', text: 'hi' }] }));
    expect(out.system).toMatch(/always/i);
    const inc = buildPrompt(makeRequest({ mode: 'incoming' }));
    expect(inc.system).not.toBe(out.system);
  });
  it('수신 모드는 코드·URL·멘션만 있는 메시지를 same_language 로 돌려주라고 지시한다', () => {
    const inc = buildPrompt(makeRequest({ mode: 'incoming' }));
    expect(inc.system).toMatch(/only of code.*URLs.*@mentions.*same_language to true/is);
    expect(inc.system).toMatch(/return the original text unchanged/i);
    const out = buildPrompt(makeRequest({ mode: 'outgoing', items: [{ id: 'x', text: 'hi' }] }));
    expect(out.system).not.toMatch(/only of code/i);
  });
  it('jsonInPrompt 이면 JSON 만 출력하라는 지시가 추가된다', () => {
    const p = buildPrompt(makeRequest(), { jsonInPrompt: true });
    expect(p.system).toMatch(/only.*JSON/i);
  });
});

describe('buildOutputSchema', () => {
  it('strict 스키마: 모든 필드 required, additionalProperties false', () => {
    const s = buildOutputSchema() as Record<string, unknown>;
    expect(s.type).toBe('object');
    expect(s.additionalProperties).toBe(false);
    expect(s.required).toEqual(['items']);
    const items = (s.properties as Record<string, Record<string, unknown>>).items ?? {};
    const item = items.items as Record<string, unknown>;
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(['id', 'detected_lang', 'same_language', 'translation']);
  });
});
