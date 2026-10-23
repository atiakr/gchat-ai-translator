import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ATTR, SELECTORS, safeClosest, safeMatches, safeQuery, safeQueryAll } from './selectors';

const FIXTURE_DIR = resolve(__dirname, '../../tests/fixtures/gchat');

function loadFixture(name: string): void {
  const html = readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
  document.body.innerHTML = html;
  const theme = html.match(/<body[^>]*data-theme="([^"]+)"/)?.[1];
  if (theme) document.body.dataset.theme = theme;
  else delete document.body.dataset.theme;
}

describe('selectors (dm-messages.html)', () => {
  beforeEach(() => loadFixture('dm-messages.html'));

  it('대화방 루트와 soft view 를 찾는다', () => {
    const main = safeQuery(document, SELECTORS.conversationRoot);
    expect(main?.getAttribute(ATTR.groupId)).toBe('dm/kGrFAKE0001');
    expect(safeQuery(document, SELECTORS.softView)?.getAttribute(ATTR.softViewId)).toBe(
      '/dm/kGrFAKE0001',
    );
  });

  it('메시지 컨테이너 4개, 본문 3개, 헤딩 4개, 타임스탬프 4개', () => {
    const containers = safeQueryAll(document, SELECTORS.messageContainer);
    expect(containers).toHaveLength(4);
    expect(containers.map((c) => c.getAttribute(ATTR.messageId))).toEqual([
      '6SgFAKE0101',
      '6SgFAKE0102',
      '6SgFAKE0103',
      '6SgFAKE0104',
    ]);
    expect(safeQueryAll(document, SELECTORS.messageBody)).toHaveLength(3);
    expect(safeQueryAll(document, SELECTORS.senderHeading)).toHaveLength(4);
    expect(safeQueryAll(document, SELECTORS.timestamp)).toHaveLength(4);
  });

  it('본문 안 링크를 찾는다', () => {
    const body = safeQueryAll(document, SELECTORS.messageBody)[2];
    const links = safeQueryAll(body, SELECTORS.bodyLink);
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com/doc');
  });

  it('입력창·보내기 버튼·작성 영역을 찾는다', () => {
    const region = safeQuery(document, SELECTORS.composerRegion);
    expect(region).not.toBeNull();
    const textbox = safeQuery(region, SELECTORS.composerTextbox);
    expect(textbox?.getAttribute('contenteditable')).toBe('true');
    expect(safeQuery(region, SELECTORS.sendButton)).not.toBeNull();
    expect(safeClosest(textbox, SELECTORS.composerWrapper)).not.toBeNull();
  });
});

describe('selectors (space-thread.html)', () => {
  beforeEach(() => loadFixture('space-thread.html'));

  it('메인 1개 + 패널 2개 = 컨테이너 3개, 작성 영역 2개', () => {
    expect(safeQueryAll(document, SELECTORS.messageContainer)).toHaveLength(3);
    expect(safeQueryAll(document, SELECTORS.composerRegion)).toHaveLength(2);
  });

  it('패널 메시지의 가장 가까운 data-group-id 조상은 c-wiz 다', () => {
    const panelMessage = safeQueryAll(document, SELECTORS.messageContainer)[1];
    const owner = safeClosest(panelMessage, SELECTORS.anyGroupId);
    expect(owner?.tagName.toLowerCase()).toBe('c-wiz');
    expect(owner?.getAttribute(ATTR.groupId)).toBe('space/AAQFAKE0001');
    expect(safeMatches(owner, SELECTORS.conversationRoot)).toBe(false);
  });

  it('body 의 테마 속성을 읽는다', () => {
    expect(document.body.getAttribute(ATTR.theme)).toBe('dark');
  });
});

describe('safe query helpers', () => {
  it('잘못된 셀렉터·null 루트에서도 예외 없이 null/[]/false', () => {
    document.body.innerHTML = '<div id="x"></div>';
    expect(safeQuery(document, '[[[')).toBeNull();
    expect(safeQueryAll(document, '[[[')).toEqual([]);
    expect(safeQuery(null, SELECTORS.messageBody)).toBeNull();
    expect(safeQueryAll(undefined, SELECTORS.messageBody)).toEqual([]);
    expect(safeClosest(document.getElementById('x'), '[[[')).toBeNull();
    expect(safeClosest(null, SELECTORS.messageContainer)).toBeNull();
    expect(safeMatches(document.getElementById('x'), '[[[')).toBe(false);
    expect(safeMatches(null, SELECTORS.messageContainer)).toBe(false);
  });

  it('모든 셀렉터 상수는 유효한 CSS 셀렉터다', () => {
    for (const selector of Object.values(SELECTORS)) {
      expect(() => document.querySelector(selector)).not.toThrow();
    }
  });
});
