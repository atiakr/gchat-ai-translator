import { describe, expect, it } from 'vitest';
import { isMostlyInLanguage } from './script';

const RATIO = 0.5;

describe('isMostlyInLanguage', () => {
  it('영어 용어가 섞인 한국어 문장은 한국어로 본다', () => {
    for (const text of [
      '기능들이 업데이트 되면서, dummy 로 만들었던 계정들을 지우고 다시만들고 하다가',
      'Producer, talent, staff 계정을 새로 다 만들어서 다시 테스트 할 계획이야',
      'Package 에서 talent 정보나 사진이 뜨지 않는 경우도 있었고',
      'Project 를 올린 계정을 지우거나 변경해서 문제점이 생긴거 같아',
      'dummy로 만든 계정',
    ]) {
      expect(isMostlyInLanguage(text, 'ko', RATIO)).toBe(true);
    }
  });

  it('한국어 단어가 조금 섞인 외국어 문장은 한국어로 보지 않는다', () => {
    expect(isMostlyInLanguage('Did you see the 계정 page yesterday?', 'ko', RATIO)).toBe(false);
    expect(isMostlyInLanguage('Hello there', 'ko', RATIO)).toBe(false);
  });

  it('링크·멘션·숫자·이모지는 세지 않는다', () => {
    expect(
      isMostlyInLanguage('https://example.com/a/b @Someone 확인 부탁해요 123 🙂', 'ko', RATIO),
    ).toBe(true);
    // 글자가 있는 토큰이 없으면 판정하지 않는다
    expect(isMostlyInLanguage('https://example.com 123 🙂', 'ko', RATIO)).toBe(false);
  });

  it('일본어는 가나, 태국어는 태국 문자로 판정한다', () => {
    expect(isMostlyInLanguage('今日はmeetingがあります', 'ja', RATIO)).toBe(true);
    expect(isMostlyInLanguage('会议在明天', 'ja', RATIO)).toBe(false);
    expect(isMostlyInLanguage('สวัสดีครับ meeting', 'th', RATIO)).toBe(true);
  });

  it('문자로 언어를 가를 수 없는 대상 언어는 판정하지 않는다', () => {
    expect(isMostlyInLanguage('Hello there', 'en', RATIO)).toBe(false);
    expect(isMostlyInLanguage('你好', 'zh-CN', RATIO)).toBe(false);
    expect(isMostlyInLanguage('Привет', 'ru', RATIO)).toBe(false);
  });
});
