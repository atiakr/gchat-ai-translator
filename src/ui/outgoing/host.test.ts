import { describe, expect, it } from 'vitest';
import { createShadowHost } from './host';

describe('outgoing createShadowHost', () => {
  it('공용 shadow 호스트 위에 만들어져 contain: content 와 토큰 CSS 를 가진다', () => {
    for (const kind of ['panel', 'sent-original', 'button'] as const) {
      const host = createShadowHost(kind, 'dark');
      expect(host.el.dataset.gatOutgoing).toBe(kind);
      expect(host.el.style.contain).toBe('content');
      expect(host.el.getAttribute('data-theme')).toBe('dark');
      expect(host.root.mode).toBe('open');
      const styles = host.root.querySelectorAll('style');
      expect(styles).toHaveLength(1);
      expect(styles[0]?.textContent).toContain('--gat-bg-subtle');
      expect(host.mount.parentNode).toBe(host.root);
    }
  });

  it('버튼만 inline-flex, 나머지는 block', () => {
    expect(createShadowHost('button', 'light').el.style.display).toBe('inline-flex');
    expect(createShadowHost('panel', 'light').el.style.display).toBe('block');
    expect(createShadowHost('sent-original', 'light').el.style.display).toBe('block');
  });

  it('setHidden 은 인라인 display 까지 바꿔 실제로 숨기고, 다시 보이면 원래 display 로 돌아간다', () => {
    const host = createShadowHost('button', 'light');
    host.setHidden(true);
    expect(host.el.hidden).toBe(true);
    expect(host.el.style.display).toBe('none');
    host.setHidden(false);
    expect(host.el.hidden).toBe(false);
    expect(host.el.style.display).toBe('inline-flex');
  });

  it('setTheme / remove', () => {
    const host = createShadowHost('panel', 'light');
    document.body.append(host.el);
    host.setTheme('dark');
    expect(host.el.getAttribute('data-theme')).toBe('dark');
    host.remove();
    expect(host.el.isConnected).toBe(false);
  });
});
