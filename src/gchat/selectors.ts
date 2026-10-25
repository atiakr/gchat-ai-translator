/**
 * Google Chat DOM 셀렉터·속성명 모음 — 코드베이스에서 DOM 구조 지식이 있는 **유일한** 파일.
 *
 * Google Chat 의 DOM 은 비공개 구조라 바뀔 수 있다. 셀렉터가 깨지면 이 파일과
 * `tests/fixtures/gchat/*.html` 을 함께 갱신한다. 모든 상수는 아래 확인 조건으로 검증했다.
 *
 * 확인일: 2026-10-23 / 확인 방법: 실제 chat.google.com(새 `/app` UI, 한국어 로케일)의 DOM 을
 * 직접 읽어 확인. 샘플: tests/fixtures/gchat/README.md
 *
 * 여기의 셀렉터는 반드시 아래 safe* 도우미로만 질의한다. 잘못된 셀렉터·null 루트 등 어떤 실패도
 * 예외 대신 null / [] / false 로 끝난다(invariant: 셀렉터 실패가 Google Chat 동작을 깨지 않는다).
 */

/** 속성명. 값 해석은 adapter 가 담당한다. */
export const ATTR = {
  /** 대화방 id. `[role=main]`·스레드 패널 `c-wiz`·사이드바 listitem 에 있음. 값: `dm/<id>` · `space/<id>`. 확인 2026-10-23, 실제 화면. */
  groupId: 'data-group-id',
  /** 현재 화면 id. 값: `/dm/<id>` · `/room/<id>`. 확인 2026-10-23, 실제 화면. */
  softViewId: 'data-soft-view-id',
  /** 메시지 컨테이너의 안정적 메시지 id. 확인 2026-10-23, 실제 화면(76/76 메시지). */
  messageId: 'data-id',
  /** 메시지 컨테이너의 발신자 id. 확인 2026-10-23, 실제 화면. */
  userId: 'data-user-id',
  /** 발신자 헤딩의 실명(자기 자신도 실명 유지; 표시 텍스트만 "나"/"You"). 확인 2026-10-23, 실제 화면. */
  name: 'data-name',
  /** 발신자 헤딩의 멤버 id (`user/human/<id>`). 확인 2026-10-23, 실제 화면. */
  memberId: 'data-member-id',
  /** 시각 span 의 epoch ms. 확인 2026-10-23, 실제 화면. */
  absoluteTimestamp: 'data-absolute-timestamp',
  /** `body` 의 테마 값: `light` | `dark`. 확인 2026-10-23, 실제 화면. */
  theme: 'data-theme',
} as const;

export const SELECTORS = {
  /** 현재 대화방 루트. URL 이 `/app/home` 으로 고정이라 방 id 는 여기서 읽는다. 확인 2026-10-23, 실제 chat.google.com(한국어, /app UI). */
  conversationRoot: '[role="main"][data-group-id]',
  /** 방 id 를 가진 모든 조상 후보(메인·스레드 패널 `c-wiz`). 메시지의 소속 방 = 가장 가까운 이 조상. 확인 2026-10-23, 실제 화면. */
  anyGroupId: '[data-group-id]',
  /** 현재 화면 id 보조 소스. 확인 2026-10-23, 실제 화면. */
  softView: '[data-soft-view-id]',
  /** 메시지 1건 컨테이너(메인·스레드 패널 공통). 확인 2026-10-23, 실제 화면(76/76). */
  messageContainer: 'div[role="group"][data-id]',
  /** 컨테이너 안 발신자 헤딩. 표시 텍스트 ≠ data-name 이면 내 메시지. 확인 2026-10-23, 실제 화면(76/76). */
  senderHeading: 'span[role="heading"][data-message-id][data-name][data-member-id]',
  /** 컨테이너 안 본문(클래스 `Zc1Emd` 와 같은 요소). 이미지·파일 전용 메시지엔 없다. 번역 UI 는 이 요소 안, 메시지 자체의 글 뒤에 넣는다. 확인 2026-10-23, 실제 화면(75/76). */
  messageBody: 'div[jsname="bgckF"]',
  /**
   * 본문 안 인용 블록(클래스 `wVNE5`, 본문의 첫 자식). 인용된 원문과 화면 낭독기용 숨은 글자("인용됨"·"발신자"·
   * "인용 종료"·"L 키" 안내)를 품는다. 본문 안의 `aria-hidden="true"` 서브트리는 인용 블록이 아니어도 본문 텍스트에서
   * 뺀다. 확인 2026-10-23, 실제 화면(한국어 로케일). 샘플: quote-message.html
   */
  quoteBlock: '[aria-hidden="true"]',
  /** 인용 컨테이너. 이것을 품은 본문의 직계 자식이 인용 블록이다. 확인 2026-10-23, 실제 화면(한국어 로케일). */
  quoteContainer: '[jsname="jJpMGe"][data-inside-message-stream]',
  /** 본문 안 링크. 확인 2026-10-23, 실제 화면. */
  bodyLink: 'a[target="_blank"]',
  /** 컨테이너 안 시각 표시(epoch ms 속성 포함). 확인 2026-10-23, 실제 화면. */
  timestamp: 'span[jsname="E53oB"][data-absolute-timestamp]',
  /** 작성 영역 전체(메인·스레드 패널마다 하나). 확인 2026-10-23, 실제 화면. */
  composerRegion: 'c-wiz[role="region"][jsname="kBQE3c"]',
  /** 입력창과 보내기 버튼의 공통 조상. 확인 2026-10-23, 실제 화면. */
  composerWrapper: 'div[jsname="SFaVIf"]',
  /** 입력창. 비었을 때 내용은 `<div><br></div>`. 확인 2026-10-23, 실제 화면. */
  composerTextbox: 'div[role="textbox"][contenteditable="true"][jsname="yrriRe"]',
  /** 보내기 버튼. aria-label 은 로케일 의존("메시지 보내기")이라 쓰지 않는다. 확인 2026-10-23, 실제 화면. */
  sendButton: 'button[jsname="GBTyxb"]',
  /**
   * 대화방 화면 전체(머리글 + `conversationRoot`). 현재 방 루트의 가장 가까운 이 조상에서 머리글을 찾는다.
   * 확인 2026-10-25, 실제 화면(한국어, 스페이스·DM, 전체 화면 보기와 홈 오른쪽 창 보기 모두).
   */
  roomPane: 'div[jsname="BNT4Ge"]',
  /** `roomPane` 의 직계 자식인 방 머리글(방 이름 줄). 확인 2026-10-25, 실제 화면(두 보기 모두). */
  roomHeader: '[jsname="uwkwCe"]',
  /**
   * 전체 화면 보기 머리글의 가로 flex 줄. 자식: 방 이름 · 검색·팝업 아이콘 묶음 · 남는 폭을 채우는 빈 요소(마지막).
   * 오른쪽 끝은 Google 의 옆 도구 막대에 가려지므로 마지막 빈 요소 앞에 넣는다. 확인 2026-10-25, 실제 화면.
   */
  headerRowFull: '[jsname="yXpuyc"] > div',
  /** 홈 오른쪽 창 보기 머리글의 오른쪽 아이콘 묶음(전체 화면으로 열기 · 닫기). 그 앞에 넣는다. 확인 2026-10-25, 실제 화면. */
  headerActionsPane: 'header > section',
  /**
   * 사이드바 대화방 항목 — **부분 확인**. 2026-10-23 실제 화면에서 `span[role="listitem"][data-group-id]` 요소의
   * 존재는 확인했으나 그 안의 이름 요소 구조는 확인하지 못했다(best effort; 못 찾으면 이름 없음).
   */
  sidebarRoomItem: 'span[role="listitem"][data-group-id]',
  /** 사이드바 항목 안 이름 후보 — **미확인(UNVERIFIED)**. 속성이 없으면 이름 없음으로 본다. */
  displayName: '[data-name]',
  /**
   * 작성 영역 안 첨부 칩 후보 — **미확인(UNVERIFIED)**. 2026-10-23 실제 화면에선 첨부 상태를 캡처하지
   * 못했다. 보수적 추정값이며 못 찾으면 그냥 "첨부 없음" 으로 본다(best effort).
   */
  composerAttachment: '[data-attachment-id], [data-file-id], [data-upload-id]',
} as const;

export type SelectorKey = keyof typeof SELECTORS;

/**
 * 입력창 안에서 "순수 텍스트 래퍼" 로 보는 태그 — **미확인(UNVERIFIED)**. 2026-10-23 실제 화면에선 빈 입력창
 * (`<div><br></div>`)만 확인했고 멘션 칩·서식의 실제 마크업은 캡처하지 못했다. 그 밖의 요소는 보수적으로
 * 멘션 칩 등 리치 콘텐츠로 본다(경고만 띄우므로 오판해도 동작은 깨지지 않는다).
 */
export const COMPOSER_PLAIN_TAGS: ReadonlySet<string> = new Set(['DIV', 'BR', 'SPAN']);

/** 입력창 안 서식 태그 — **미확인(UNVERIFIED)**, 일반적인 contenteditable 서식 태그 기준. */
export const COMPOSER_FORMATTING_TAGS: ReadonlySet<string> = new Set([
  'B',
  'I',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'STRONG',
  'EM',
  'UL',
  'OL',
  'LI',
  'BLOCKQUOTE',
  'CODE',
  'PRE',
]);

/* ------------------------------------------------------------------ */
/* 안전한 질의 도우미: 어떤 입력에도 던지지 않는다.                     */
/* ------------------------------------------------------------------ */

export function safeQuery<T extends Element = HTMLElement>(
  root: ParentNode | null | undefined,
  selector: string,
): T | null {
  if (!root) return null;
  try {
    return root.querySelector<T>(selector);
  } catch {
    return null;
  }
}

export function safeQueryAll<T extends Element = HTMLElement>(
  root: ParentNode | null | undefined,
  selector: string,
): T[] {
  if (!root) return [];
  try {
    return Array.from(root.querySelectorAll<T>(selector));
  } catch {
    return [];
  }
}

export function safeClosest<T extends Element = HTMLElement>(
  el: Element | null | undefined,
  selector: string,
): T | null {
  if (!el) return null;
  try {
    return el.closest<T>(selector);
  } catch {
    return null;
  }
}

export function safeMatches(el: Element | null | undefined, selector: string): boolean {
  if (!el) return false;
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

export function safeAttr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  try {
    return el.getAttribute(name);
  } catch {
    return null;
  }
}
