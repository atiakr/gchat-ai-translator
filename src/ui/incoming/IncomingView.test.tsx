import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IncomingView, type IncomingViewProps } from './IncomingView';

// 테스트 환경의 fake-browser 는 i18n.getMessage 를 구현하지 않으므로 t() 는 키 이름을 돌려준다.
function renderView(over: Partial<IncomingViewProps> = {}) {
  const props: IncomingViewProps = {
    status: 'pending',
    onRetry: () => {},
    ...over,
  };
  return render(<IncomingView {...props} />);
}

describe('IncomingView', () => {
  it('pending → 로딩 플레이스홀더', () => {
    const { container } = renderView({ status: 'pending' });
    expect(container.querySelector('[data-gat="placeholder"]')).not.toBeNull();
    expect(screen.getByText('incoming_loading')).toBeInTheDocument();
    expect(container.querySelector('[data-gat="incoming"]')?.getAttribute('data-status')).toBe(
      'pending',
    );
  });

  it('translated → 번역문 + 작은 [원문보기] 토글, 누르면 [번역 보기] 로 바뀌고 번역문이 숨는다', () => {
    const onToggleOriginal = vi.fn();
    const { container, rerender } = renderView({
      status: 'translated',
      translation: '안녕하세요',
      originalVisible: false,
      onToggleOriginal,
    });
    expect(container.querySelector('[data-gat="block"]')).not.toBeNull();
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    const toggle = container.querySelector('[data-gat="toggle"]') as HTMLElement;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.textContent).toBe('incoming_seeOriginal');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    expect(onToggleOriginal).toHaveBeenCalledTimes(1);

    rerender(
      <IncomingView
        status="translated"
        translation="안녕하세요"
        onRetry={() => {}}
        originalVisible={true}
        onToggleOriginal={onToggleOriginal}
      />,
    );
    expect(screen.queryByText('안녕하세요')).toBeNull();
    expect(toggle.textContent).toBe('incoming_seeTranslation');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('sent → 내 원문을 그리고, 토글은 [보낸 번역 보기] / [원문보기] 로 바뀐다', () => {
    const props = {
      status: 'translated',
      translation: '안녕하세요',
      onRetry: () => {},
      onToggleOriginal: () => {},
      variant: 'sent',
    } as const;
    const { container, rerender } = render(<IncomingView {...props} originalVisible={false} />);
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    const toggle = container.querySelector('[data-gat="toggle"]') as HTMLElement;
    expect(toggle.textContent).toBe('outgoing_seeSentTranslation');
    rerender(<IncomingView {...props} originalVisible={true} />);
    expect(toggle.textContent).toBe('outgoing_seeMyOriginal');
  });

  it('error → 짧은 이유 + 재시도 버튼, 클릭하면 onRetry', () => {
    const onRetry = vi.fn();
    const { container } = renderView({ status: 'error', errorKind: 'rate_limit', onRetry });
    expect(container.querySelector('[data-gat="error"]')).not.toBeNull();
    expect(screen.getByText('incoming_errorRateLimit')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'incoming_retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['auth', 'incoming_errorAuth'],
    ['server', 'incoming_errorServer'],
    ['bad_request', 'incoming_errorBadRequest'],
    ['parse', 'incoming_errorParse'],
    [undefined, 'incoming_errorUnknown'],
  ] as const)('error kind %s → %s', (errorKind, key) => {
    renderView({ status: 'error', errorKind });
    expect(screen.getByText(key)).toBeInTheDocument();
  });

  it('skipped_long / skipped_limit → 회색 안내 한 줄', () => {
    const a = renderView({ status: 'skipped_long' });
    expect(a.container.querySelector('[data-gat="skipped"]')).not.toBeNull();
    expect(screen.getByText('incoming_skippedLong')).toBeInTheDocument();
    a.unmount();
    const b = renderView({ status: 'skipped_limit' });
    expect(b.container.querySelector('[data-gat="skipped"]')).not.toBeNull();
    expect(screen.getByText('incoming_skippedLimit')).toBeInTheDocument();
  });

  it('same_language / no_text → 아무것도 그리지 않는다', () => {
    const a = renderView({ status: 'same_language' });
    expect(a.container.innerHTML).toBe('');
    a.unmount();
    const b = renderView({ status: 'no_text' });
    expect(b.container.innerHTML).toBe('');
  });
});
