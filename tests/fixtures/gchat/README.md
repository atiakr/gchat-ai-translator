# Google Chat DOM 샘플 (2026-10-23, chat.google.com 실제 화면에서 확인)

이 폴더의 HTML 은 실제 chat.google.com(새 `/app/` UI, 한국어 로케일)에서 **직접 읽어 확인한 구조**를
개인정보를 제거하고 필요한 뼈대만 남긴 것이다. 셀렉터 모듈(`src/gchat/selectors.ts`)의 단위 테스트는
이 샘플을 기준으로 돈다. 구조가 바뀌면 샘플과 셀렉터를 함께 갱신한다.

확인된 사실(요약):
- URL 은 대화방을 열어도 `/app/home` 으로 고정된다 → **방 id 는 URL 이 아니라 DOM 에서** 얻는다.
  - 현재 대화방: `[role="main"][data-group-id]` 의 값(`dm/<id>` · `space/<id>`). 같은 값이
    `[data-soft-view-id]`(`/dm/<id>` · `/room/<id>`)에도 있다.
  - 스레드 뷰/패널의 메시지는 `c-wiz[data-group-id]` 아래에 있다 → 메시지의 소속 방은
    **가장 가까운 `[data-group-id]` 조상**으로 판단한다.
- 메시지 컨테이너: `div[role="group"][data-id]` (`data-user-id` = 발신자 id,
  `data-message-multiplat-item-id`, `data-is-initial-message-of-thread`, `data-one-on-one-dm`).
- 발신자 헤딩: 컨테이너 안 `span[role="heading"][data-message-id][data-name][data-member-id]`.
  모든 메시지에 헤딩이 있었다(76/76). **내 메시지 판별: 헤딩의 표시 텍스트가 `data-name` 과 다르면
  (표시 텍스트가 "나"/"You") 내 메시지** — 로케일에 의존하지 않는 규칙. 보조로 그 컨테이너의
  `data-user-id` 를 "내 id" 로 기억해 비교한다.
- 본문: 컨테이너 안 `div[jsname="bgckF"]` (클래스 `Zc1Emd` 와 같은 요소). 이미지 전용 메시지는 이
  요소가 없다(75/76). 링크는 본문 안 `a[target="_blank"]`. 번역 블록은 본문 요소 **바로 뒤 형제**로 넣는다.
- 시각: `span[jsname="E53oB"][data-absolute-timestamp]`(ms epoch).
- 입력창: `div[role="textbox"][contenteditable="true"][jsname="yrriRe"]`(비었을 때 `<div><br></div>`).
  보내기 버튼: `button[jsname="GBTyxb"]`(aria-label "메시지 보내기"). 둘의 공통 조상: `div[jsname="SFaVIf"]`,
  작성 영역 전체: `c-wiz[role="region"][jsname="kBQE3c"]`.
- 테마: `body[data-theme="light"|"dark"]`.
- 수정됨 표시는 샘플 화면에서 발견되지 않았다(수정 감지는 본문 텍스트 변화로 한다).
