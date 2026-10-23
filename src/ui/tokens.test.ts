import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = [resolve(process.cwd(), 'src/ui'), resolve(process.cwd(), 'entrypoints')];
const TOKENS = resolve(process.cwd(), 'src/ui/tokens.css');
/** 색 값: #hex, rgb()/rgba()/hsl()/hsla(). 토큰 파일 밖 컴포넌트 CSS 에는 없어야 한다. */
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return cssFiles(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

describe('디자인 토큰', () => {
  it('컴포넌트 CSS 에는 색 값을 직접 쓰지 않는다(--gat-* 토큰만)', () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(cssFiles)) {
      if (file === TOKENS) continue;
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (COLOR.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('컴포넌트가 쓰는 --gat-* 토큰은 모두 tokens.css 에 정의되어 있다', () => {
    const tokens = readFileSync(TOKENS, 'utf8');
    const defined = new Set(Array.from(tokens.matchAll(/(--gat-[\w-]+)\s*:/g), (m) => m[1]));
    const missing = new Set<string>();
    for (const file of ROOTS.flatMap(cssFiles)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/var\((--gat-[\w-]+)/g)) {
        if (m[1] && !defined.has(m[1])) missing.add(m[1]);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
