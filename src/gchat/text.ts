/**
 * 메시지 본문 요소 → 사람이 읽는 평문.
 * 링크·@멘션·인라인 code 는 표면 텍스트를 그대로 쓰고, `<br>`·블록 경계는 줄바꿈으로,
 * `<pre>` 안은 공백·줄바꿈을 보존한다. DOM 셀렉터 지식은 없다(태그 이름만 안다).
 */

const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

const SKIP_TAGS: ReadonlySet<string> = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE']);

interface Segment {
  text: string;
  /** `<pre>` 안의 조각: 공백을 그대로 둔다. */
  verbatim: boolean;
}

/** 줄 단위로 조각을 모은다. `null` 은 줄 경계(새 줄 시작). */
type Line = Segment[];

export interface ExtractOptions {
  /** true 를 돌려주는 요소는 서브트리째 건너뛴다(인용 블록·화면 낭독기용 글자·확장이 끼운 호스트 등). */
  skip?: (el: Element) => boolean;
}

function collect(node: Node, lines: Line[], inPre: boolean, skip?: (el: Element) => boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const raw = node.nodeValue ?? '';
    if (!raw) return;
    if (inPre) {
      const parts = raw.split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lastLine(lines).push({ text: part, verbatim: true });
      });
    } else {
      lastLine(lines).push({ text: raw.replace(/\s+/g, ' '), verbatim: false });
    }
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toUpperCase();
  if (SKIP_TAGS.has(tag)) return;
  if (skip?.(el)) return;
  if (tag === 'BR') {
    lines.push([]);
    return;
  }
  const block = BLOCK_TAGS.has(tag);
  if (block && lastLine(lines).length > 0) lines.push([]);
  const childPre = inPre || tag === 'PRE';
  for (const child of Array.from(el.childNodes)) collect(child, lines, childPre, skip);
  if (block && lastLine(lines).length > 0) lines.push([]);
}

function lastLine(lines: Line[]): Line {
  const last = lines[lines.length - 1];
  if (last) return last;
  const fresh: Line = [];
  lines.push(fresh);
  return fresh;
}

function renderLine(line: Line): string {
  if (line.length === 0) return '';
  const hasVerbatim = line.some((s) => s.verbatim);
  const joined = line.map((s) => s.text).join('');
  if (hasVerbatim) return joined.replace(/[ \t]+$/, '');
  return joined.replace(/\s+/g, ' ').trim();
}

/**
 * 요소의 평문. 빈 요소·null 은 빈 문자열. `options.skip` 이 참인 자손 요소는 통째로 뺀다. 결과는 앞뒤 빈 줄이 없고 연속 빈 줄은 최대 하나다.
 * 어떤 입력에도 던지지 않는다.
 */
export function extractText(el: Element | null | undefined, options: ExtractOptions = {}): string {
  if (!el) return '';
  try {
    const lines: Line[] = [[]];
    const { skip } = options;
    // skip 은 자손에만 적용한다(루트 자신은 항상 읽는다).
    collect(el, lines, false, skip ? (e) => e !== el && skip(e) : undefined);
    const rendered = lines.map(renderLine);
    const out: string[] = [];
    for (const line of rendered) {
      if (line === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
      out.push(line);
    }
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  } catch {
    return '';
  }
}
