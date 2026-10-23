import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clickSend,
  composerHasRichContent,
  forgetSelfUserId,
  getActiveComposer,
  getChatTheme,
  getCurrentRoom,
  getMessageRoomId,
  getOwnContentNodes,
  getSelfUserId,
  getTranslationAnchor,
  isComposerEmpty,
  isConversationView,
  listComposers,
  listMessageContainers,
  mutateUnobserved,
  observeMessages,
  readComposerText,
  readMessage,
  rememberSelfUserId,
  setComposerText,
} from './adapter';

const FIXTURE_DIR = resolve(__dirname, '../../tests/fixtures/gchat');

function loadFixture(name: string): void {
  const html = readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
  document.body.innerHTML = html;
  const theme = html.match(/<body[^>]*data-theme="([^"]+)"/)?.[1];
  if (theme) document.body.dataset.theme = theme;
  else delete document.body.dataset.theme;
}

function container(id: string): HTMLElement {
  const found = listMessageContainers().find((c) => c.dataset.id === id);
  if (!found) throw new Error(`fixture container ${id} missing`);
  return found;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => forgetSelfUserId());
afterEach(() => {
  document.body.innerHTML = '';
  delete document.body.dataset.theme;
});

describe('room detection', () => {
  it('DM: [role=main][data-group-id] 에서 방 id 를 읽는다', () => {
    loadFixture('dm-messages.html');
    expect(isConversationView()).toBe(true);
    expect(getCurrentRoom()).toEqual({ roomId: 'dm/kGrFAKE0001' });
  });

  it('사이드바 listitem 의 data-name 이 있으면 방 이름으로 쓴다', () => {
    loadFixture('dm-messages.html');
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<nav><span role="listitem" data-group-id="dm/other">x</span>' +
        '<span role="listitem" data-group-id="dm/kGrFAKE0001"><span data-name="Other Person">Other Person</span> 3</span></nav>',
    );
    expect(getCurrentRoom()).toEqual({ roomId: 'dm/kGrFAKE0001', name: 'Other Person' });
  });

  it('스페이스: 메인 메시지와 스레드 패널 메시지 모두 가장 가까운 data-group-id 를 따른다', () => {
    loadFixture('space-thread.html');
    expect(getCurrentRoom()?.roomId).toBe('space/AAQFAKE0001');
    expect(getMessageRoomId(container('7SgFAKE0201'))).toBe('space/AAQFAKE0001');
    const panel = container('7SgFAKE0202');
    expect(panel.closest('[role="main"]')).toBeNull();
    expect(getMessageRoomId(panel)).toBe('space/AAQFAKE0001');
    // 패널의 c-wiz 가 자기 group id 를 갖는다면 그것을 우선한다
    panel.closest('c-wiz[data-group-id]')?.setAttribute('data-group-id', 'space/OTHER');
    expect(getMessageRoomId(panel)).toBe('space/OTHER');
  });

  it('조상에 group id 가 없으면 메인의 값으로 대체한다', () => {
    loadFixture('space-thread.html');
    const panel = container('7SgFAKE0202');
    panel.closest('c-wiz[data-group-id]')?.removeAttribute('data-group-id');
    expect(getMessageRoomId(panel)).toBe('space/AAQFAKE0001');
  });

  it('DOM 에 없으면 soft view, 그 다음 URL 에서 읽는다', () => {
    loadFixture('dm-messages.html');
    document.querySelector('[role="main"]')?.removeAttribute('data-group-id');
    expect(getCurrentRoom()?.roomId).toBe('dm/kGrFAKE0001');
    document.querySelector('[data-soft-view-id]')?.removeAttribute('data-soft-view-id');
    expect(getCurrentRoom()).toBeNull();
    expect(isConversationView()).toBe(false);
    expect(getCurrentRoom('https://chat.google.com/u/0/room/AAAAlegacy')?.roomId).toBe(
      'space/AAAAlegacy',
    );
    expect(isConversationView('https://chat.google.com/dm/AAAAabc')).toBe(true);
  });
});

describe('messages', () => {
  it('DM 샘플에서 컨테이너 4개를 순서대로 찾는다', () => {
    loadFixture('dm-messages.html');
    expect(listMessageContainers().map((c) => c.dataset.id)).toEqual([
      '6SgFAKE0101',
      '6SgFAKE0102',
      '6SgFAKE0103',
      '6SgFAKE0104',
    ]);
  });

  it('스페이스 샘플에서 패널 포함 3개를 찾고 루트를 좁힐 수 있다', () => {
    loadFixture('space-thread.html');
    expect(listMessageContainers()).toHaveLength(3);
    const main = document.querySelector('[role="main"]');
    expect(listMessageContainers(main ?? undefined)).toHaveLength(1);
  });

  it('상대 메시지를 읽는다', () => {
    loadFixture('dm-messages.html');
    const m = readMessage(container('6SgFAKE0101'));
    expect(m).toMatchObject({
      messageId: '6SgFAKE0101',
      roomId: 'dm/kGrFAKE0001',
      senderId: '100FAKE0001',
      isOwn: false,
      hasBody: true,
      text: 'Hello, can you check this today?',
      timestampMs: 1772330535271,
    });
    expect(m?.bodyEl?.getAttribute('jsname')).toBe('bgckF');
  });

  it('헤딩 표시가 data-name 과 다르면("나") 내 메시지이고 user id 를 기억한다', () => {
    loadFixture('dm-messages.html');
    expect(getSelfUserId()).toBeNull();
    const m = readMessage(container('6SgFAKE0102'));
    expect(m?.isOwn).toBe(true);
    expect(m?.senderId).toBe('115FAKE0002');
    expect(getSelfUserId()).toBe('115FAKE0002');
  });

  it('"You" 표시도 내 메시지다 (로케일 무관)', () => {
    loadFixture('space-thread.html');
    expect(readMessage(container('7SgFAKE0203'))?.isOwn).toBe(true);
    expect(readMessage(container('7SgFAKE0202'))?.isOwn).toBe(false);
    expect(readMessage(container('7SgFAKE0201'))?.isOwn).toBe(false);
  });

  it('기억한 user id 와 같은 컨테이너는 헤딩 표시가 실명이어도 내 메시지다', () => {
    loadFixture('dm-messages.html');
    const c = container('6SgFAKE0101');
    expect(readMessage(c)?.isOwn).toBe(false);
    rememberSelfUserId('100FAKE0001');
    expect(readMessage(c)?.isOwn).toBe(true);
    c.querySelector('[role="heading"]')?.remove();
    expect(readMessage(c)?.isOwn).toBe(true);
  });

  it('링크·멘션·인라인 코드 표면 텍스트를 추출한다', () => {
    loadFixture('dm-messages.html');
    expect(readMessage(container('6SgFAKE0103'))?.text).toBe(
      'See https://example.com/doc and ping @Me Myself with npm run build',
    );
  });

  it('본문에 줄바꿈이 있으면 유지한다', () => {
    loadFixture('dm-messages.html');
    const body = container('6SgFAKE0101').querySelector('[jsname="bgckF"]');
    if (!body) throw new Error('body missing');
    body.innerHTML = 'line one<br>line two<div>line three</div>';
    expect(readMessage(container('6SgFAKE0101'))?.text).toBe('line one\nline two\nline three');
  });

  it('이미지 전용 메시지: hasBody=false, text=""', () => {
    loadFixture('dm-messages.html');
    const m = readMessage(container('6SgFAKE0104'));
    expect(m).toMatchObject({ messageId: '6SgFAKE0104', hasBody: false, text: '' });
    expect(m?.bodyEl).toBeNull();
    expect(getTranslationAnchor(container('6SgFAKE0104'))).toBeNull();
  });

  it('타임스탬프가 없거나 숫자가 아니면 undefined', () => {
    loadFixture('dm-messages.html');
    const c = container('6SgFAKE0101');
    c.querySelector('[jsname="E53oB"]')?.setAttribute('data-absolute-timestamp', 'abc');
    expect(readMessage(c)?.timestampMs).toBeUndefined();
    c.querySelector('[jsname="E53oB"]')?.remove();
    expect(readMessage(c)?.timestampMs).toBeUndefined();
  });

  it('data-id 없는 요소는 null', () => {
    loadFixture('dm-messages.html');
    const c = container('6SgFAKE0101');
    c.removeAttribute('data-id');
    expect(readMessage(c)).toBeNull();
  });

  it('번역 블록 앵커는 본문 요소 자신이다', () => {
    loadFixture('dm-messages.html');
    const c = container('6SgFAKE0101');
    const anchor = getTranslationAnchor(c);
    expect(anchor).toBe(c.querySelector('[jsname="bgckF"]'));
  });
});

describe('quoted messages', () => {
  const OWN = 'Hi Henry, apologies our internet was unstable earlier but it is all fixed now';
  const LABELS = [
    '인용됨',
    '발신자',
    '인용 종료',
    '인용된 원본 메시지로 링크를 걸려면 L 키를 누르세요.',
  ];

  it('인용 메시지는 메시지 자체의 글만 읽고 인용 원문·숨은 낭독 글자는 뺀다', () => {
    loadFixture('quote-message.html');
    const m = readMessage(container('8SgFAKE0301'));
    expect(m?.hasBody).toBe(true);
    expect(m?.text).toBe(OWN);
    for (const label of LABELS) expect(m?.text).not.toContain(label);
    expect(m?.text).not.toContain('documentation');
  });

  it('인용만 있는 메시지는 본문 없음', () => {
    loadFixture('quote-message.html');
    const c = container('8SgFAKE0301');
    const body = c.querySelector('[jsname="bgckF"]') as HTMLElement;
    for (const n of getOwnContentNodes(c)) body.removeChild(n);
    const m = readMessage(c);
    expect(m?.hasBody).toBe(false);
    expect(m?.text).toBe('');
  });

  it('본문 안의 aria-hidden 서브트리는 인용이 아니어도 뺀다', () => {
    loadFixture('dm-messages.html');
    const c = container('6SgFAKE0101');
    c.querySelector('[jsname="bgckF"]')?.insertAdjacentHTML(
      'beforeend',
      '<span aria-hidden="true">숨은 글자</span>',
    );
    expect(readMessage(c)?.text).toBe('Hello, can you check this today?');
  });

  it('getOwnContentNodes: 인용 블록과 확장이 끼운 요소를 뺀 본문 직계 자식', () => {
    loadFixture('quote-message.html');
    const c = container('8SgFAKE0301');
    const body = c.querySelector('[jsname="bgckF"]') as HTMLElement;
    const own = getOwnContentNodes(c);
    expect(own).toHaveLength(2);
    expect(own[0]?.nodeType).toBe(Node.TEXT_NODE);
    expect(own[0]?.textContent).toBe(OWN);
    expect(getOwnContentNodes(body)).toEqual(own);
    const host = document.createElement('gat-incoming');
    host.setAttribute('data-gat-incoming', '');
    body.appendChild(host);
    expect(getOwnContentNodes(c)).toEqual(own);
    expect(getOwnContentNodes(null)).toEqual([]);
  });

  it('원문 감싸개 안의 글은 그대로 읽고 수신 호스트는 무시한다(해시가 바뀌지 않는다)', () => {
    loadFixture('quote-message.html');
    const c = container('8SgFAKE0301');
    const body = c.querySelector('[jsname="bgckF"]') as HTMLElement;
    const own = getOwnContentNodes(c);
    const span = document.createElement('span');
    span.setAttribute('data-gat-original', '');
    span.hidden = true;
    body.insertBefore(span, own[0] ?? null);
    for (const n of own) span.appendChild(n);
    const host = document.createElement('gat-incoming');
    host.setAttribute('data-gat-incoming', '');
    host.textContent = '번역문';
    span.after(host);
    expect(readMessage(c)?.text).toBe(OWN);
  });
});

describe('observeMessages', () => {
  it('컨테이너 추가는 added, 본문 변경은 changed, 제거는 removed 로 알린다', async () => {
    loadFixture('dm-messages.html');
    const cb = vi.fn();
    const stop = observeMessages(cb);

    const source = container('6SgFAKE0101');
    const clone = source.cloneNode(true) as HTMLElement;
    clone.dataset.id = '6SgFAKE0199';
    const topic = source.parentElement as HTMLElement;
    const newTopic = topic.cloneNode(false) as HTMLElement;
    newTopic.appendChild(clone);
    topic.parentElement?.appendChild(newTopic);
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[0]).toEqual([clone]);
    expect(cb.mock.calls[0]?.[1]).toEqual([]);
    expect(cb.mock.calls[0]?.[2]).toEqual([]);

    const body = source.querySelector('[jsname="bgckF"]');
    if (!body?.firstChild) throw new Error('body text missing');
    body.firstChild.textContent = 'Edited text';
    await flush();
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[1]?.[0]).toEqual([]);
    expect(cb.mock.calls[1]?.[2]).toEqual([source]);

    body.appendChild(document.createTextNode(' more'));
    await flush();
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb.mock.calls[2]?.[2]).toEqual([source]);

    // 본문 바깥(번역 블록 삽입 위치) 변경은 changed 가 아니다
    body.insertAdjacentHTML('afterend', '<div class="translation">번역</div>');
    await flush();
    expect(cb).toHaveBeenCalledTimes(3);

    // 본문 안에 확장 요소(호스트·원문 감싸개)를 넣고 빼는 것은 changed 가 아니다
    const host = document.createElement('gat-incoming');
    host.setAttribute('data-gat-incoming', '');
    body.appendChild(host);
    const wrap = document.createElement('span');
    wrap.setAttribute('data-gat-original', '');
    body.insertBefore(wrap, body.firstChild);
    await flush();
    host.remove();
    wrap.remove();
    await flush();
    expect(cb).toHaveBeenCalledTimes(3);

    // mutateUnobserved 안의 조작(노드 이동 포함)은 보고되지 않는다
    mutateUnobserved(() => {
      const span = document.createElement('span');
      span.setAttribute('data-gat-original', '');
      body.insertBefore(span, body.firstChild);
      while (span.nextSibling) span.appendChild(span.nextSibling);
      span.replaceWith(...Array.from(span.childNodes));
    });
    await flush();
    expect(cb).toHaveBeenCalledTimes(3);

    newTopic.remove();
    await flush();
    expect(cb).toHaveBeenCalledTimes(4);
    expect(cb.mock.calls[3]?.[1]).toEqual([clone]);

    stop();
    topic.remove();
    await flush();
    expect(cb).toHaveBeenCalledTimes(4);
  });

  it('한 틱 안의 여러 변경은 한 번에 묶이고 중복이 없다', async () => {
    loadFixture('dm-messages.html');
    const cb = vi.fn();
    const stop = observeMessages(cb);
    const body = container('6SgFAKE0101').querySelector('[jsname="bgckF"]');
    if (!body?.firstChild) throw new Error('body missing');
    body.firstChild.textContent = 'a';
    body.firstChild.textContent = 'b';
    body.appendChild(document.createTextNode('c'));
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[2]).toHaveLength(1);
    stop();
  });

  it('콜백이 던져도 관찰은 계속된다', async () => {
    loadFixture('dm-messages.html');
    const cb = vi.fn(() => {
      throw new Error('boom');
    });
    const stop = observeMessages(cb);
    const body = container('6SgFAKE0101').querySelector('[jsname="bgckF"]');
    if (!body?.firstChild) throw new Error('body missing');
    body.firstChild.textContent = 'a';
    await flush();
    body.firstChild.textContent = 'b';
    await flush();
    expect(cb).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('composer', () => {
  it('포커스가 없으면 메인 안의 입력창을, 포커스가 있으면 그 입력창을 고른다', () => {
    loadFixture('space-thread.html');
    expect(listComposers()).toHaveLength(2);
    const main = getActiveComposer();
    expect(main?.textbox.closest('[role="main"]')).not.toBeNull();
    expect(main?.sendButton?.getAttribute('jsname')).toBe('GBTyxb');
    expect(main?.region.getAttribute('jsname')).toBe('kBQE3c');
    expect(main?.sendGroup?.parentElement?.getAttribute('jsname')).toBe('SFaVIf');
    expect(main?.sendGroup?.contains(main.sendButton ?? null)).toBe(true);

    const panelTextbox = document.querySelector<HTMLElement>(
      '[role="complementary"] [role="textbox"]',
    );
    if (!panelTextbox) throw new Error('panel textbox missing');
    panelTextbox.tabIndex = -1;
    panelTextbox.focus();
    expect(document.activeElement).toBe(panelTextbox);
    const active = getActiveComposer();
    expect(active?.textbox).toBe(panelTextbox);
    expect(active?.sendButton).toBe(
      document.querySelector('[role="complementary"] button[jsname="GBTyxb"]'),
    );
  });

  it('빈 입력창(<div><br></div>)은 빈 텍스트', () => {
    loadFixture('dm-messages.html');
    const { textbox } = getActiveComposer() ?? {};
    if (!textbox) throw new Error('textbox missing');
    expect(readComposerText(textbox)).toBe('');
    expect(isComposerEmpty(textbox)).toBe(true);
  });

  it('여러 줄 div 내용을 줄바꿈으로 읽는다', () => {
    loadFixture('dm-messages.html');
    const { textbox } = getActiveComposer() ?? {};
    if (!textbox) throw new Error('textbox missing');
    textbox.innerHTML = '<div>first line</div><div><br></div><div>third  line</div>';
    expect(readComposerText(textbox)).toBe('first line\n\nthird line');
    expect(isComposerEmpty(textbox)).toBe(false);
    textbox.innerHTML = 'plain text';
    expect(readComposerText(textbox)).toBe('plain text');
  });

  it('composerHasRichContent: 순수 텍스트·멘션 칩·서식·첨부', () => {
    loadFixture('dm-messages.html');
    const composer = getActiveComposer();
    if (!composer) throw new Error('composer missing');
    const { textbox, region } = composer;
    const none = { mentions: false, formatting: false, attachments: false };

    textbox.innerHTML = '<div>hello</div><div><span>world</span><br></div>';
    expect(composerHasRichContent(textbox)).toEqual(none);

    textbox.innerHTML =
      '<div>hi <span data-member-id="user/1" contenteditable="false">@Bob</span></div>';
    expect(composerHasRichContent(textbox)).toMatchObject({ mentions: true, formatting: false });

    textbox.innerHTML = '<div>hi <span contenteditable="false">@Bob</span></div>';
    expect(composerHasRichContent(textbox).mentions).toBe(true);

    textbox.innerHTML = '<div>hi <img alt="😀"></div>';
    expect(composerHasRichContent(textbox).mentions).toBe(true);

    for (const tag of ['b', 'i', 'u', 'strong', 'em', 'blockquote', 'code', 'pre']) {
      textbox.innerHTML = `<div>x <${tag}>y</${tag}></div>`;
      expect(composerHasRichContent(textbox), tag).toEqual({ ...none, formatting: true });
    }
    textbox.innerHTML = '<ul><li>a</li></ul>';
    expect(composerHasRichContent(textbox)).toEqual({ ...none, formatting: true });
    textbox.innerHTML = '<ol><li>a</li></ol>';
    expect(composerHasRichContent(textbox)).toEqual({ ...none, formatting: true });

    textbox.innerHTML = '<div>plain</div>';
    region.insertAdjacentHTML(
      'beforeend',
      '<div class="chips"><div data-attachment-id="f1">image.png</div></div>',
    );
    expect(composerHasRichContent(textbox)).toEqual({ ...none, attachments: true });
  });

  it('setComposerText 왕복: 줄마다 div, input 이벤트 발행', () => {
    loadFixture('dm-messages.html');
    const { textbox } = getActiveComposer() ?? {};
    if (!textbox) throw new Error('textbox missing');
    const onInput = vi.fn();
    textbox.addEventListener('input', onInput);
    setComposerText(textbox, 'Hola\n\n¿cómo estás?');
    expect(readComposerText(textbox)).toBe('Hola\n\n¿cómo estás?');
    expect(textbox.children).toHaveLength(3);
    expect(Array.from(textbox.children).every((c) => c.tagName === 'DIV')).toBe(true);
    expect(onInput).toHaveBeenCalledTimes(1);
    expect((onInput.mock.calls[0]?.[0] as Event | undefined)?.bubbles).toBe(true);

    setComposerText(textbox, '');
    expect(readComposerText(textbox)).toBe('');
    expect(isComposerEmpty(textbox)).toBe(true);
    expect(textbox.innerHTML).toBe('<div><br></div>');
  });

  it('execCommand 가 있으면 먼저 쓰고, 결과가 다르면 DOM 교체로 대체한다', () => {
    loadFixture('dm-messages.html');
    const { textbox } = getActiveComposer() ?? {};
    if (!textbox) throw new Error('textbox missing');
    const exec = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = exec;
    try {
      setComposerText(textbox, 'via exec');
      expect(exec).toHaveBeenCalledWith('insertText', false, 'via exec');
      expect(readComposerText(textbox)).toBe('via exec');
    } finally {
      (document as unknown as { execCommand?: unknown }).execCommand = undefined;
    }
  });

  it('clickSend: 버튼 없음/비활성이면 false, 있으면 click 하고 true', () => {
    loadFixture('dm-messages.html');
    expect(clickSend(null)).toBe(false);
    const composer = getActiveComposer();
    const button = composer?.sendButton;
    if (!button) throw new Error('button missing');
    const onClick = vi.fn();
    button.addEventListener('click', onClick);
    button.disabled = true;
    expect(clickSend(button)).toBe(false);
    button.disabled = false;
    button.setAttribute('aria-disabled', 'true');
    expect(clickSend(button)).toBe(false);
    button.removeAttribute('aria-disabled');
    expect(clickSend(button)).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('theme', () => {
  it('body[data-theme] 를 읽는다', () => {
    loadFixture('dm-messages.html');
    expect(getChatTheme()).toBe('light');
    loadFixture('space-thread.html');
    expect(getChatTheme()).toBe('dark');
  });

  it('속성이 없으면 배경색 판정으로 대체한다', () => {
    loadFixture('dm-messages.html');
    delete document.body.dataset.theme;
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(getChatTheme()).toBe('light');
    document.body.dataset.theme = 'weird';
    expect(getChatTheme()).toBe('light');
    document.body.style.backgroundColor = 'rgb(32, 33, 36)';
    expect(getChatTheme()).toBe('dark');
    document.body.style.backgroundColor = '';
  });
});

describe('selectors broken (unrelated DOM)', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main><article><p>Nothing to see here</p></article><input></main>';
  });

  it('모든 함수가 예외 없이 null/[]/false 를 돌려준다', async () => {
    expect(isConversationView()).toBe(false);
    expect(getCurrentRoom()).toBeNull();
    expect(listMessageContainers()).toEqual([]);
    const p = document.querySelector('p') as HTMLElement;
    expect(readMessage(p)).toBeNull();
    expect(getMessageRoomId(p)).toBeNull();
    expect(getTranslationAnchor(p)).toBeNull();
    expect(getActiveComposer()).toBeNull();
    expect(listComposers()).toEqual([]);
    expect(readComposerText(p)).toBe('Nothing to see here');
    expect(composerHasRichContent(p)).toEqual({
      mentions: false,
      formatting: false,
      attachments: false,
    });
    expect(clickSend(null)).toBe(false);
    expect(['light', 'dark']).toContain(getChatTheme());
    expect(() => setComposerText(p, 'x')).not.toThrow();
    const cb = vi.fn();
    const stop = observeMessages(cb);
    document.body.appendChild(document.createElement('div'));
    await flush();
    expect(cb).not.toHaveBeenCalled();
    stop();
  });

  it('detached/null 입력에도 던지지 않는다', () => {
    const detached = document.createElement('div');
    expect(readMessage(detached)).toBeNull();
    expect(getMessageRoomId(detached)).toBeNull();
    expect(getTranslationAnchor(detached)).toBeNull();
    expect(isComposerEmpty(detached)).toBe(true);
    expect(readMessage(null as unknown as HTMLElement)).toBeNull();
    expect(getTranslationAnchor(null as unknown as HTMLElement)).toBeNull();
    expect(readComposerText(null as unknown as HTMLElement)).toBe('');
    expect(() => setComposerText(null as unknown as HTMLElement, 'x')).not.toThrow();
  });
});

describe('readMessage — 검토 보완 규칙', () => {
  it('data-id 가 없으면 합성 id 를 만들고 idSource=derived', () => {
    document.body.innerHTML =
      '<div role="main" data-group-id="dm/X1"><div role="group" data-id="" data-user-id="u1">' +
      '<span role="heading" data-message-id="m" data-name="Other"><span>Other</span></span>' +
      '<span jsname="E53oB" data-absolute-timestamp="1">오전 1:00</span>' +
      '<div jsname="bgckF">hello</div></div></div>';
    const c = document.querySelector('[role="group"]') as HTMLElement;
    const info = readMessage(c);
    expect(info?.idSource).toBe('derived');
    expect(info?.messageId).toMatch(/^derived:[0-9a-f]{8}$/);
    expect(info?.timestampText).toBe('오전 1:00');
    // 같은 재료면 같은 id
    expect(readMessage(c)?.messageId).toBe(info?.messageId);
  });
  it('이모지만 있는 본문은 본문 없음으로 본다', () => {
    document.body.innerHTML =
      '<div role="main" data-group-id="dm/X1"><div role="group" data-id="a" data-user-id="u1">' +
      '<span role="heading" data-message-id="a" data-name="Other"><span>Other</span></span>' +
      '<div jsname="bgckF">👍🏻 🎉</div></div></div>';
    const info = readMessage(document.querySelector('[role="group"]') as HTMLElement);
    expect(info?.hasBody).toBe(false);
    expect(info?.text).toBe('');
  });
  it('헤딩도 발신자도 없는 요소(시스템 알림 추정)는 본문 없음', () => {
    document.body.innerHTML =
      '<div role="main" data-group-id="dm/X1"><div role="group" data-id="s1">' +
      '<div jsname="bgckF">Someone joined</div></div></div>';
    const info = readMessage(document.querySelector('[role="group"]') as HTMLElement);
    expect(info?.hasBody).toBe(false);
  });
  it('표시 이름이 실제 이름으로 시작하면(앱 배지 등) 내 메시지가 아니다', () => {
    forgetSelfUserId();
    document.body.innerHTML =
      '<div role="main" data-group-id="dm/X1"><div role="group" data-id="b1" data-user-id="bot1">' +
      '<span role="heading" data-message-id="b1" data-name="Bot"><span>Bot 앱</span></span>' +
      '<div jsname="bgckF">hi</div></div></div>';
    expect(readMessage(document.querySelector('[role="group"]') as HTMLElement)?.isOwn).toBe(false);
  });
  it('방 id 에 특수문자가 섞여도 대화방으로 인식한다', () => {
    document.body.innerHTML = '<div role="main" data-group-id="space/AAQ.x~y"></div>';
    expect(getCurrentRoom()?.roomId).toBe('space/AAQ.x~y');
  });
});
