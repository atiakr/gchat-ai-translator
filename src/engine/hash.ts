/**
 * 작은 안정 해시(FNV-1a). 번역 기록 키와 본문 텍스트 해시(textHash)에 쓴다.
 * 암호학적 용도가 아니며, 같은 입력이면 어느 환경에서든 같은 값을 돌려주는 것이 목적이다.
 */

const FNV_OFFSET_32 = 0x811c9dc5;
const FNV_PRIME_32 = 0x01000193;
/** 두 번째 패스용 다른 시작값(충돌 확률을 낮추기 위해 64비트 폭으로 합친다). */
const FNV_OFFSET_32_ALT = 0x050c5d1f;

function fnv1a32(input: string, offset: number): number {
  let hash = offset >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME_32) >>> 0;
  }
  return hash >>> 0;
}

function toHex8(n: number): string {
  return n.toString(16).padStart(8, '0');
}

/** 32비트 FNV-1a → 8자리 소문자 16진수. content 의 textHash 로 쓴다. */
export function hashString(input: string): string {
  return toHex8(fnv1a32(input, FNV_OFFSET_32));
}

/** 서로 다른 시작값의 FNV-1a 두 개를 이어 붙인 16자리 16진수. 기록 키처럼 충돌이 아까운 곳에 쓴다. */
export function hashStringLong(input: string): string {
  return toHex8(fnv1a32(input, FNV_OFFSET_32)) + toHex8(fnv1a32(input, FNV_OFFSET_32_ALT));
}
