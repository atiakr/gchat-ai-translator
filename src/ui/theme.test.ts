import { describe, expect, it } from 'vitest';
import { themeFromBackground } from './theme';

describe('themeFromBackground', () => {
  it('투명 배경은 칠해진 조상을 따르고, 없으면 light', () => {
    document.body.innerHTML =
      '<div id="p" style="background-color: rgb(20,20,20)"><div id="c" style="background-color: transparent"></div></div>';
    expect(themeFromBackground(document.getElementById('c'))).toBe('dark');
    document.body.innerHTML = '<div id="c"></div>';
    expect(themeFromBackground(document.getElementById('c'))).toBe('light');
    expect(themeFromBackground(null)).toBe('light');
  });
  it('밝은 배경은 light', () => {
    document.body.innerHTML = '<div id="c" style="background-color: rgb(255,255,255)"></div>';
    expect(themeFromBackground(document.getElementById('c'))).toBe('light');
  });
});
