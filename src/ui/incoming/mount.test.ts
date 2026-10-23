import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMounted, HOST_ATTR, mountedCount, mountIncoming, unmountAll } from './mount';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeMessage(id: string) {
  const container = document.createElement('div');
  container.dataset.id = id;
  container.innerHTML =
    '<div class="meta">author</div><div class="body" style="display: flex">original text</div><div class="footer">reactions</div>';
  document.body.appendChild(container);
  const anchor = container.querySelector('.body') as HTMLElement;
  return { container, anchor };
}

function hostOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector(`[${HOST_ATTR}]`);
}

function shadowQuery(host: HTMLElement | null, sel: string): HTMLElement | null {
  return (host?.shadowRoot?.querySelector(sel) as HTMLElement | null) ?? null;
}

const noop = () => {};

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => unmountAll());
});

describe('mountIncoming', () => {
  it('호스트를 anchor 바로 다음 형제로 끼우고 shadow root 안에 렌더링한다', () => {
    const { container, anchor } = makeMessage('m1');
    let handle: ReturnType<typeof mountIncoming> = null;
    act(() => {
      handle = mountIncoming(container, anchor, 'light', {
        status: 'pending',
        hideOriginal: false,
        onRetry: noop,
      });
    });
    expect(handle).not.toBeNull();
    const host = hostOf(container);
    expect(host).not.toBeNull();
    expect(anchor.nextElementSibling).toBe(host);
    expect(host?.nextElementSibling?.className).toBe('footer');
    expect(host?.tagName.toLowerCase()).toBe('gat-incoming');
    expect(host?.getAttribute('data-theme')).toBe('light');
    expect(host?.style.display).toBe('block');
    expect(shadowQuery(host, 'style')?.textContent).toContain('.gat-block');
    expect(shadowQuery(host, '[data-gat="placeholder"]')).not.toBeNull();
    // 메시지 본문 밖(라이트 DOM)에는 아무것도 새지 않는다.
    expect(container.querySelector('[data-gat="placeholder"]')).toBeNull();
    expect(getMounted(container)).toBe(handle);
    expect(mountedCount()).toBe(1);
  });

  it('update 가 렌더링을 바꾼다 (pending → translated → error → no_text)', () => {
    const { container, anchor } = makeMessage('m1');
    const onRetry = vi.fn();
    const handle = mountIncoming(container, anchor, 'light');
    if (!handle) throw new Error('mount failed');
    const host = hostOf(container);

    act(() => handle.update({ status: 'pending', hideOriginal: false, onRetry }));
    expect(shadowQuery(host, '[data-gat="placeholder"]')).not.toBeNull();

    act(() => handle.update({ status: 'translated', translation: '번역문' }));
    expect(shadowQuery(host, '[data-gat="placeholder"]')).toBeNull();
    expect(shadowQuery(host, '[data-gat="block"]')?.textContent).toContain('번역문');

    act(() => handle.update({ status: 'error', errorKind: 'server' }));
    expect(shadowQuery(host, '[data-gat="block"]')).toBeNull();
    const retry = shadowQuery(host, '[data-gat="retry"]');
    expect(retry).not.toBeNull();
    act(() => retry?.click());
    expect(onRetry).toHaveBeenCalledTimes(1);

    act(() => handle.update({ status: 'no_text' }));
    expect(shadowQuery(host, '[data-gat="incoming"]')).toBeNull();
    // 호스트 자체는 남아 있어 다음 갱신에 재사용된다.
    expect(hostOf(container)).toBe(host);
  });

  it('같은 컨테이너에 다시 mount 하면 호스트를 재사용하고 테마만 갱신한다', () => {
    const { container, anchor } = makeMessage('m1');
    const a = mountIncoming(container, anchor, 'light');
    const b = mountIncoming(container, anchor, 'dark');
    expect(b).toBe(a);
    expect(container.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(1);
    expect(hostOf(container)?.getAttribute('data-theme')).toBe('dark');
  });

  it('anchor 가 없거나 문서에서 떨어져 있으면 throw 없이 null', () => {
    const { container, anchor } = makeMessage('m1');
    anchor.remove();
    expect(mountIncoming(container, anchor, 'light')).toBeNull();
    expect(mountIncoming(container, null, 'light')).toBeNull();
    expect(mountIncoming(null, anchor, 'light')).toBeNull();
    expect(mountedCount()).toBe(0);
  });

  it('hideOriginal 이면 원문을 숨기고, 블록 클릭으로 펼치고 접는다', () => {
    const { container, anchor } = makeMessage('m1');
    const handle = mountIncoming(container, anchor, 'light');
    if (!handle) throw new Error('mount failed');
    const host = hostOf(container);

    // pending 동안에는 원문을 숨기지 않는다(아직 번역 블록이 없음).
    act(() => handle.update({ status: 'pending', hideOriginal: true, onRetry: noop }));
    expect(anchor.style.display).toBe('flex');

    act(() => handle.update({ status: 'translated', translation: 'hi' }));
    expect(anchor.style.display).toBe('none');
    const block = shadowQuery(host, '[data-gat="block"]');
    expect(block?.tagName).toBe('BUTTON');
    expect(shadowQuery(host, '[data-gat="toggle"]')?.textContent).toBe('incoming_showOriginal');

    act(() => block?.click());
    expect(anchor.style.display).toBe('flex');
    expect(shadowQuery(host, '[data-gat="toggle"]')?.textContent).toBe('incoming_hideOriginal');

    act(() => shadowQuery(host, '[data-gat="block"]')?.click());
    expect(anchor.style.display).toBe('none');

    // 설정을 끄면 원문이 복구되고 블록은 더 이상 버튼이 아니다.
    act(() => handle.update({ hideOriginal: false }));
    expect(anchor.style.display).toBe('flex');
    expect(shadowQuery(host, '[data-gat="block"]')?.tagName).toBe('DIV');
  });

  it('setTheme 이 호스트의 data-theme 을 바꾼다', () => {
    const { container, anchor } = makeMessage('m1');
    const handle = mountIncoming(container, anchor, 'light');
    handle?.setTheme('dark');
    expect(hostOf(container)?.getAttribute('data-theme')).toBe('dark');
  });

  it('unmount 는 호스트를 제거하고 원문을 복구한다', () => {
    const { container, anchor } = makeMessage('m1');
    const handle = mountIncoming(container, anchor, 'light', {
      status: 'translated',
      translation: 'hi',
      hideOriginal: true,
      onRetry: noop,
    });
    expect(anchor.style.display).toBe('none');
    act(() => handle?.unmount());
    expect(hostOf(container)).toBeNull();
    expect(anchor.style.display).toBe('flex');
    expect(getMounted(container)).toBeNull();
    // 두 번 불러도 안전하다.
    act(() => handle?.unmount());
    expect(mountedCount()).toBe(0);
  });

  it('unmountAll 은 모든 호스트를 즉시 제거하고 모든 원문을 복구한다', () => {
    const msgs = ['a', 'b', 'c'].map(makeMessage);
    act(() => {
      for (const { container, anchor } of msgs) {
        mountIncoming(container, anchor, 'dark', {
          status: 'translated',
          translation: 't',
          hideOriginal: true,
          onRetry: noop,
        });
      }
    });
    expect(document.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(3);
    for (const { anchor } of msgs) expect(anchor.style.display).toBe('none');

    unmountAll();
    expect(document.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(0);
    for (const { anchor, container } of msgs) {
      expect(anchor.style.display).toBe('flex');
      expect(getMounted(container)).toBeNull();
    }
    expect(mountedCount()).toBe(0);
  });
});
