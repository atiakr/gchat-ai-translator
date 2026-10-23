import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMessages } from '../../gchat/adapter';
import {
  getMounted,
  HOST_ATTR,
  mountedCount,
  mountIncoming,
  ORIGINAL_ATTR,
  unmountAll,
} from './mount';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FIXTURE_DIR = resolve(__dirname, '../../../tests/fixtures/gchat');

function makeMessage(id: string) {
  const container = document.createElement('div');
  container.dataset.id = id;
  container.innerHTML =
    '<div class="meta">author</div><div class="body" style="display: flex">original <b>text</b></div><div class="footer">reactions</div>';
  document.body.appendChild(container);
  const anchor = container.querySelector('.body') as HTMLElement;
  return { container, anchor };
}

function loadQuoteFixture() {
  document.body.innerHTML = readFileSync(resolve(FIXTURE_DIR, 'quote-message.html'), 'utf8');
  const container = document.querySelector('div[role="group"][data-id]') as HTMLElement;
  const anchor = container.querySelector('[jsname="bgckF"]') as HTMLElement;
  return { container, anchor };
}

function hostOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector(`[${HOST_ATTR}]`);
}

function wrapperOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector(`[${ORIGINAL_ATTR}]`);
}

function shadowQuery(host: HTMLElement | null, sel: string): HTMLElement | null {
  return (host?.shadowRoot?.querySelector(sel) as HTMLElement | null) ?? null;
}

const noop = () => {};
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => unmountAll());
});

describe('mountIncoming', () => {
  it('pending: 호스트를 본문 안, 원문 뒤에 끼우고 원문은 그대로 둔다', () => {
    const { container, anchor } = makeMessage('m1');
    let handle = null as ReturnType<typeof mountIncoming>;
    act(() => {
      handle = mountIncoming(container, anchor, 'light', { status: 'pending', onRetry: noop });
    });
    expect(handle).not.toBeNull();
    const host = hostOf(container);
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(anchor);
    expect(anchor.lastChild).toBe(host);
    expect(anchor.nextElementSibling?.className).toBe('footer');
    expect(wrapperOf(container)).toBeNull();
    expect(host?.tagName.toLowerCase()).toBe('gat-incoming');
    expect(host?.getAttribute('data-theme')).toBe('light');
    expect(host?.style.display).toBe('block');
    expect(shadowQuery(host, 'style')?.textContent).toContain('.gat-translated');
    expect(shadowQuery(host, '[data-gat="placeholder"]')).not.toBeNull();
    // 라이트 DOM 에는 아무것도 새지 않는다.
    expect(container.querySelector('[data-gat="placeholder"]')).toBeNull();
    expect(getMounted(container)).toBe(handle);
    expect(handle?.isAttached()).toBe(true);
    expect(mountedCount()).toBe(1);
  });

  it('update 가 렌더링을 바꾼다 (pending → translated → error → no_text)', () => {
    const { container, anchor } = makeMessage('m1');
    const onRetry = vi.fn();
    const handle = mountIncoming(container, anchor, 'light');
    if (!handle) throw new Error('mount failed');
    const host = hostOf(container);

    act(() => handle.update({ status: 'pending', onRetry }));
    expect(shadowQuery(host, '[data-gat="placeholder"]')).not.toBeNull();

    act(() => handle.update({ status: 'translated', translation: '번역문' }));
    expect(shadowQuery(host, '[data-gat="placeholder"]')).toBeNull();
    expect(shadowQuery(host, '[data-gat="translation"]')?.textContent).toBe('번역문');

    act(() => handle.update({ status: 'error', errorKind: 'server' }));
    expect(shadowQuery(host, '[data-gat="block"]')).toBeNull();
    // 번역 상태를 벗어나면 원문이 다시 제자리에 보인다.
    expect(wrapperOf(container)).toBeNull();
    expect(anchor.textContent).toBe('original text');
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

  it('translated: 원문을 감싸 숨기고 그 바로 뒤(본문 안)에 번역문을 보인다, 토글로 원문/번역을 오간다', () => {
    const { container, anchor } = makeMessage('m1');
    let handle = null as ReturnType<typeof mountIncoming>;
    act(() => {
      handle = mountIncoming(container, anchor, 'light', {
        status: 'translated',
        translation: '원문 텍스트',
        onRetry: noop,
      });
    });
    const host = hostOf(container);
    const wrapper = wrapperOf(container);
    expect(wrapper?.parentElement).toBe(anchor);
    expect(wrapper?.tagName).toBe('SPAN');
    expect(wrapper?.textContent).toBe('original text');
    expect(wrapper?.hidden).toBe(true);
    expect(wrapper?.style.display).toBe('none');
    expect(wrapper?.nextSibling).toBe(host);
    expect(Array.from(anchor.childNodes)).toEqual([wrapper, host]);
    expect(shadowQuery(host, '[data-gat="translation"]')?.textContent).toBe('원문 텍스트');
    const toggle = shadowQuery(host, '[data-gat="toggle"]');
    expect(toggle?.textContent).toBe('incoming_seeOriginal');

    act(() => toggle?.click());
    expect(wrapper?.hidden).toBe(false);
    expect(wrapper?.style.display).toBe('');
    expect(shadowQuery(host, '[data-gat="translation"]')).toBeNull();
    expect(shadowQuery(host, '[data-gat="toggle"]')?.textContent).toBe('incoming_seeTranslation');

    act(() => shadowQuery(host, '[data-gat="toggle"]')?.click());
    expect(wrapper?.hidden).toBe(true);
    expect(shadowQuery(host, '[data-gat="translation"]')?.textContent).toBe('원문 텍스트');
    expect(shadowQuery(host, '[data-gat="toggle"]')?.textContent).toBe('incoming_seeOriginal');
    expect(handle?.isAttached()).toBe(true);
  });

  it('setTheme 이 호스트의 data-theme 을 바꾼다', () => {
    const { container, anchor } = makeMessage('m1');
    const handle = mountIncoming(container, anchor, 'light');
    handle?.setTheme('dark');
    expect(hostOf(container)?.getAttribute('data-theme')).toBe('dark');
  });

  it('unmount 는 원문을 정확히 제자리로 되돌리고 감싸개·호스트를 지운다', () => {
    const { container, anchor } = makeMessage('m1');
    const before = container.innerHTML;
    const handle = mountIncoming(container, anchor, 'light', {
      status: 'translated',
      translation: 'hi',
      onRetry: noop,
    });
    expect(wrapperOf(container)).not.toBeNull();
    act(() => handle?.unmount());
    expect(container.innerHTML).toBe(before);
    expect(getMounted(container)).toBeNull();
    // 두 번 불러도 안전하다.
    act(() => handle?.unmount());
    expect(mountedCount()).toBe(0);
  });

  it('unmountAll 은 모든 호스트를 즉시 제거하고 모든 원문을 되돌린다', () => {
    const msgs = ['a', 'b', 'c'].map(makeMessage);
    const before = msgs.map(({ container }) => container.innerHTML);
    act(() => {
      for (const { container, anchor } of msgs) {
        mountIncoming(container, anchor, 'dark', {
          status: 'translated',
          translation: 't',
          onRetry: noop,
        });
      }
    });
    expect(document.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(3);
    expect(document.querySelectorAll(`[${ORIGINAL_ATTR}]`).length).toBe(3);

    unmountAll();
    expect(document.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(0);
    expect(document.querySelectorAll(`[${ORIGINAL_ATTR}]`).length).toBe(0);
    msgs.forEach(({ container }, i) => {
      expect(container.innerHTML).toBe(before[i]);
      expect(getMounted(container)).toBeNull();
    });
    expect(mountedCount()).toBe(0);
  });

  it('인용 메시지: 인용 블록은 그대로 두고 메시지 자체의 글만 감싸며, unmount 하면 원래 DOM 으로 돌아간다', () => {
    const { container, anchor } = loadQuoteFixture();
    const before = anchor.innerHTML;
    const quote = anchor.firstElementChild as HTMLElement;
    const quoteHtml = quote.outerHTML;
    const handle = mountIncoming(container, anchor, 'light', {
      status: 'translated',
      translation: '헨리, 아까 인터넷이 불안정했는데 지금은 다 고쳐졌어요',
      onRetry: noop,
    });
    const wrapper = wrapperOf(container);
    const host = hostOf(container);
    expect(anchor.firstElementChild).toBe(quote);
    expect(quote.outerHTML).toBe(quoteHtml);
    expect(quote.hidden).toBe(false);
    expect(wrapper?.textContent).toBe(
      'Hi Henry, apologies our internet was unstable earlier but it is all fixed now',
    );
    expect(wrapper?.hidden).toBe(true);
    expect(Array.from(anchor.childNodes)).toEqual([quote, wrapper, host]);

    act(() => handle?.unmount());
    expect(anchor.innerHTML).toBe(before);
  });

  it('Google 이 본문을 다시 그려 감싸개·호스트를 지우면 isAttached 가 false 이고, 다시 mount 하면 복구된다', () => {
    const { container, anchor } = makeMessage('m1');
    const handle = mountIncoming(container, anchor, 'light', {
      status: 'translated',
      translation: 'hi',
      onRetry: noop,
    });
    anchor.innerHTML = 'original <b>text</b>';
    expect(handle?.isAttached()).toBe(false);

    const again = mountIncoming(container, anchor, 'light');
    expect(again).toBe(handle);
    expect(again?.isAttached()).toBe(true);
    const wrapper = wrapperOf(container);
    expect(wrapper?.textContent).toBe('original text');
    expect(wrapper?.nextSibling).toBe(hostOf(container));
    expect(container.querySelectorAll(`[${HOST_ATTR}]`).length).toBe(1);
  });

  it('확장 자신의 감싸기·호스트 삽입·토글·제거는 관찰자에 changed 로 보고되지 않는다', async () => {
    const { container, anchor } = loadQuoteFixture();
    const cb = vi.fn();
    const stop = observeMessages(cb);
    let handle = null as ReturnType<typeof mountIncoming>;
    act(() => {
      handle = mountIncoming(container, anchor, 'light', { status: 'pending', onRetry: noop });
    });
    act(() => handle?.update({ status: 'translated', translation: '번역' }));
    act(() => shadowQuery(hostOf(container), '[data-gat="toggle"]')?.click());
    act(() => handle?.update({ status: 'error', errorKind: 'server' }));
    act(() => handle?.update({ status: 'translated', translation: '번역 2' }));
    act(() => handle?.unmount());
    await flush();
    expect(cb).not.toHaveBeenCalled();

    // Google 쪽 변화는 여전히 보고된다.
    anchor.appendChild(document.createTextNode(' edited'));
    await flush();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]?.[2]).toEqual([container]);
    stop();
  });
});
