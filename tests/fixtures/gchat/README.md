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
  요소가 없다(75/76). 링크는 본문 안 `a[target="_blank"]`. 번역 UI 는 본문 요소 **안**, 메시지 자체의 글 뒤에 넣는다(번역 중에는 그 글을 감싸 숨긴다).
- 시각: `span[jsname="E53oB"][data-absolute-timestamp]`(ms epoch).
- 입력창: `div[role="textbox"][contenteditable="true"][jsname="yrriRe"]`(비었을 때 `<div><br></div>`).
  보내기 버튼: `button[jsname="GBTyxb"]`(aria-label "메시지 보내기"). 둘의 공통 조상: `div[jsname="SFaVIf"]`,
  작성 영역 전체: `c-wiz[role="region"][jsname="kBQE3c"]`.
  `SFaVIf` 는 가로 flex 줄이고, 보내기 버튼은 그 직계 자식 `div[jsname="enxoGf"]`(예약 전송 화살표 + 보내기) 안
  폭 44px 로 고정된 래퍼 여러 겹 속에 있다(2026-10-24 확인). 번역 버튼을 보내기 버튼 바로 옆에 끼우면 위로 밀려
  쌓이므로, `SFaVIf` 의 직계 자식 중 보내기 버튼을 품은 요소 바로 앞에 둔다.
- 테마: `body[data-theme="light"|"dark"]`.
- 수정됨 표시는 샘플 화면에서 발견되지 않았다(수정 감지는 본문 텍스트 변화로 한다).
- 인용 메시지(`quote-message.html`): 본문 요소 안 첫 자식이 인용 블록 `div[aria-hidden="true"]`(클래스 `wVNE5`)이고,
  그 안에 인용된 원문(`div[jsname="Yj53ue"]`)과 화면 낭독기용 숨은 글자("인용됨", "발신자", "인용 종료",
  "인용된 원본 메시지로 링크를 걸려면 L 키를 누르세요.")가 있다. 메시지 자체의 글은 인용 블록 **뒤의 텍스트 노드**다.
  인용 컨테이너에는 `[jsname="jJpMGe"][data-inside-message-stream]` 이 있다. 본문 텍스트·번역 대상은 메시지 자체의 글뿐이고
  인용 블록은 그대로 둔다.

방 머리글(2026-10-25 확인, `header-full.html`·`header-pane.html`):
- 현재 방 루트(`[role="main"][data-group-id]`)의 가장 가까운 조상 `div[jsname="BNT4Ge"]` 의 직계 자식
  `[jsname="uwkwCe"]` 가 방 머리글이다. 스페이스·DM, 두 보기 모두 같다. 머리글은 `[role="main"]` 바깥에 있다.
- 전체 화면 보기(사이드바에서 연 방): 머리글 안 `[jsname="yXpuyc"] > div` 가 가로 flex 줄이고, 자식은 방 이름 ·
  검색·팝업 아이콘 묶음 · 남는 폭을 채우는 빈 요소(`flex-grow: 1`, 마지막) 순서다. 줄의 오른쪽 끝은 Google 의
  옆 도구 막대(파일·할 일 등)에 가려지므로 Enter 번역 스위치는 마지막 빈 요소 앞에 둔다.
- 홈 오른쪽 창 보기(홈 목록에서 연 방): 머리글 안 `header`(가로 flex) 의 자식이 방 이름 영역과 `section`
  (전체 화면으로 열기 · 닫기 버튼)이다. 스위치는 `section` 앞에 둔다.
