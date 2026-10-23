import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SentOriginal } from './SentOriginal';

// 테스트 환경의 fake-browser 는 i18n.getMessage 를 구현하지 않으므로 t() 는 키 이름을 돌려준다.
describe('SentOriginal', () => {
  it('처음에는 접혀 있어 원문 없이 [원문보기] 버튼만 보인다', () => {
    render(<SentOriginal original="안녕하세요" />);
    const toggle = screen.getByRole('button', { name: 'outgoing_showMyOriginal' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('안녕하세요')).toBeNull();
  });

  it('누르면 원문이 펼쳐지고, 다시 누르면 접힌다', () => {
    render(<SentOriginal original="안녕하세요" />);
    fireEvent.click(screen.getByRole('button', { name: 'outgoing_showMyOriginal' }));
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    const hide = screen.getByRole('button', { name: 'outgoing_hideMyOriginal' });
    expect(hide.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(hide);
    expect(screen.queryByText('안녕하세요')).toBeNull();
  });
});
