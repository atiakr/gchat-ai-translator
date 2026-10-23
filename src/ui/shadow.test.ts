import { describe, expect, it } from 'vitest';
import { createShadowHost, setHostTheme } from './shadow';

describe('createShadowHost', () => {
  it('open shadow root 에 토큰 CSS 와 컴포넌트 CSS 를 <style> 로 주입한다', () => {
    const { host, root } = createShadowHost('.x { color: red; }');
    expect(host.tagName.toLowerCase()).toBe('gat-host');
    expect(host.shadowRoot).toBe(root);
    expect(root.mode).toBe('open');
    const style = root.querySelector('style');
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain('--gat-bg-subtle');
    expect(style?.textContent).toContain(':host([data-theme="dark"])');
    expect(style?.textContent).toContain('.x { color: red; }');
  });

  it('호스트는 block 이고 contain: content 로 바깥 레이아웃에 영향을 주지 않는다', () => {
    const { host } = createShadowHost('', 'gat-custom');
    expect(host.tagName.toLowerCase()).toBe('gat-custom');
    expect(host.style.display).toBe('block');
    expect(host.style.contain).toBe('content');
  });

  it('setHostTheme 은 data-theme 속성을 건다', () => {
    const { host } = createShadowHost();
    setHostTheme(host, 'dark');
    expect(host.getAttribute('data-theme')).toBe('dark');
    setHostTheme(host, 'light');
    expect(host.getAttribute('data-theme')).toBe('light');
  });
});
