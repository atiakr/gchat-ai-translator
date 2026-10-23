/**
 * 호출 전 같은 언어 판정. 대상 언어만 쓰는 고유 문자가 있는 언어(한국어 한글, 일본어 가나, 태국어 문자)에서만
 * 판정한다. 라틴·키릴·한자처럼 여러 언어가 함께 쓰는 문자는 글자만으로 언어를 가를 수 없어 서비스 판정에 맡긴다.
 */
const SCRIPT_OF: Partial<Record<string, RegExp>> = {
  ko: /\p{Script=Hangul}/u,
  ja: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
  th: /\p{Script=Thai}/u,
};

const LETTER = /\p{L}/u;
/** 언어 판단에서 빼는 토큰: 링크와 @멘션. */
const NEUTRAL_TOKEN = /^(?:https?:\/\/|www\.|@)/i;

/**
 * 글자가 있는 토큰(공백 단위) 중 대상 언어 문자를 품은 토큰의 비율이 `minRatio` 이상이면 true.
 * 글자 수가 아니라 토큰으로 센다: 한글 한 음절이 영어 몇 글자 몫을 해서 글자 수로 세면 영어 용어가 섞인
 * 한국어 문장이 외국어처럼 보인다. 판정할 수 없는 언어거나 글자가 있는 토큰이 없으면 false.
 */
export function isMostlyInLanguage(text: string, lang: string, minRatio: number): boolean {
  const script = SCRIPT_OF[lang];
  if (!script) return false;
  let lettered = 0;
  let inTarget = 0;
  for (const token of text.split(/\s+/)) {
    if (!token || NEUTRAL_TOKEN.test(token) || !LETTER.test(token)) continue;
    lettered += 1;
    if (script.test(token)) inTarget += 1;
  }
  return lettered > 0 && inTarget / lettered >= minRatio;
}
