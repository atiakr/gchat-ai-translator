import { describe, expect, it } from 'vitest';
import { extractText } from './text';

function el(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

describe('extractText', () => {
  it('일반 텍스트의 앞뒤 공백·빈 span 을 정리한다', () => {
    expect(extractText(el('Hello, can you check this today? <span></span>'))).toBe(
      'Hello, can you check this today?',
    );
    expect(extractText(el('  여러   칸\n\t공백  '))).toBe('여러 칸 공백');
  });

  it('링크·멘션·인라인 코드의 표면 텍스트를 보존한다', () => {
    const html =
      'See <a class="oiM5sf" target="_blank" href="https://example.com/doc">https://example.com/doc</a> ' +
      'and ping <span class="mention">@Me Myself</span> with <code>npm run build</code><span></span>';
    expect(extractText(el(html))).toBe(
      'See https://example.com/doc and ping @Me Myself with npm run build',
    );
  });

  it('<br> 과 블록 경계를 줄바꿈으로 바꾼다', () => {
    expect(extractText(el('first<br>second'))).toBe('first\nsecond');
    expect(extractText(el('<div>one</div><div>two</div><p>three</p>'))).toBe('one\ntwo\nthree');
    expect(extractText(el('<div>a</div><div><br></div><div>b</div>'))).toBe('a\n\nb');
    expect(extractText(el('<ul><li>x</li><li>y</li></ul>'))).toBe('x\ny');
  });

  it('연속 빈 줄은 하나로 줄이고 바깥 빈 줄은 없앤다', () => {
    expect(
      extractText(el('<div><br></div><div>a</div><br><br><br><div>b</div><div><br></div>')),
    ).toBe('a\n\nb');
  });

  it('pre 블록 안 공백·줄바꿈을 보존한다', () => {
    const html = 'before<pre>line 1\n  indented\n\nline 3</pre>after';
    expect(extractText(el(html))).toBe('before\nline 1\n  indented\n\nline 3\nafter');
  });

  it('script/style 내용은 무시한다', () => {
    expect(extractText(el('a<style>.x{}</style><script>1</script>b'))).toBe('ab');
  });

  it('빈 요소·null 은 빈 문자열', () => {
    expect(extractText(el(''))).toBe('');
    expect(extractText(el('<span></span><div><br></div>'))).toBe('');
    expect(extractText(null)).toBe('');
  });
});
