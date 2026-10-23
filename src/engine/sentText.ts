/**
 * 보낸 번역문 비교용 정규화: 연속 공백(줄바꿈 포함)을 한 칸으로 줄이고 앞뒤 공백을 뗀다.
 * Google Chat 이 렌더한 내 메시지 본문은 공백이 입력과 다를 수 있으므로, 내 원문 기록의 저장·조회와
 * 전송 직후 내 메시지 찾기가 모두 이 함수 하나로 비교한다.
 */
export function normalizeSentText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
