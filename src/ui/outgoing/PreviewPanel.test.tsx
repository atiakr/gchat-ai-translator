import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PreviewPanel, type PreviewPanelProps } from './PreviewPanel';

const NO_RICH = { mentions: false, formatting: false, attachments: false };

function makeProps(overrides: Partial<PreviewPanelProps> = {}): PreviewPanelProps {
  return {
    original: '안녕하세요',
    translation: 'Hello',
    lang: 'en',
    saveAsDefault: false,
    translating: false,
    error: null,
    rich: NO_RICH,
    sendFailed: false,
    onTranslationChange: vi.fn(),
    onLanguageChange: vi.fn(),
    onSaveAsDefaultChange: vi.fn(),
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('PreviewPanel', () => {
  it('원문(읽기 전용)과 번역문(편집 가능)을 보여준다', () => {
    render(<PreviewPanel {...makeProps()} />);
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    const textarea = screen.getByRole('textbox', { name: 'outgoing_translation' });
    expect(textarea).toHaveValue('Hello');
    expect(textarea).not.toHaveAttribute('readonly');
  });

  it('번역 중에는 확인 버튼이 비활성이고 진행 문구를 보여준다', () => {
    render(<PreviewPanel {...makeProps({ translating: true, translation: '' })} />);
    expect(screen.getByRole('button', { name: 'common_confirm' })).toBeDisabled();
    expect(screen.getByText('outgoing_translating')).toBeInTheDocument();
  });

  it('번역문이 비어 있으면 확인 버튼이 비활성이다', () => {
    render(<PreviewPanel {...makeProps({ translation: '   ' })} />);
    expect(screen.getByRole('button', { name: 'common_confirm' })).toBeDisabled();
  });

  it('번역문이 있고 번역 중이 아니면 확인 버튼이 활성이다', () => {
    render(<PreviewPanel {...makeProps()} />);
    expect(screen.getByRole('button', { name: 'common_confirm' })).toBeEnabled();
  });

  it('서식·멘션·첨부가 감지되면 경고 배너를 보여준다', () => {
    const { rerender } = render(<PreviewPanel {...makeProps()} />);
    expect(screen.queryByText('outgoing_richWarning')).not.toBeInTheDocument();
    rerender(<PreviewPanel {...makeProps({ rich: { ...NO_RICH, mentions: true } })} />);
    expect(screen.getByText('outgoing_richWarning')).toBeInTheDocument();
    rerender(<PreviewPanel {...makeProps({ rich: { ...NO_RICH, formatting: true } })} />);
    expect(screen.getByText('outgoing_richWarning')).toBeInTheDocument();
    rerender(<PreviewPanel {...makeProps({ rich: { ...NO_RICH, attachments: true } })} />);
    expect(screen.getByText('outgoing_richWarning')).toBeInTheDocument();
  });

  it('"이 방의 기본 언어로 저장" 체크는 기본 꺼짐이고 바꾸면 콜백이 호출된다', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PreviewPanel {...props} />);
    const checkbox = screen.getByRole('checkbox', { name: 'outgoing_saveAsDefault' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(props.onSaveAsDefaultChange).toHaveBeenCalledWith(true);
  });

  it('언어 선택은 LANGUAGES 전체를 보여주고 바꾸면 콜백이 호출된다', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PreviewPanel {...props} />);
    const select = screen.getByRole('combobox', { name: 'outgoing_language' });
    expect(select).toHaveValue('en');
    expect(screen.getByRole('option', { name: 'lang_zh_CN' })).toBeInTheDocument();
    await user.selectOptions(select, 'ja');
    expect(props.onLanguageChange).toHaveBeenCalledWith('ja');
  });

  it('번역문을 편집하면 onTranslationChange 가 호출된다', async () => {
    const user = userEvent.setup();
    const props = makeProps({ translation: '' });
    render(<PreviewPanel {...props} />);
    await user.type(screen.getByRole('textbox', { name: 'outgoing_translation' }), 'Hi');
    expect(props.onTranslationChange).toHaveBeenCalled();
  });

  it('확인·취소 버튼이 콜백을 호출한다', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PreviewPanel {...props} />);
    await user.click(screen.getByRole('button', { name: 'common_confirm' }));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'common_cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('오류가 있으면 종류별 문구와 재시도 버튼을 보여준다', async () => {
    const user = userEvent.setup();
    const props = makeProps({ error: 'rate_limit', translation: '' });
    render(<PreviewPanel {...props} />);
    expect(screen.getByText('outgoing_error_rate_limit')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'common_retry' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('전송 실패 시 안내 문구를 보여주고 확인 대신 닫기만 남는다', () => {
    render(<PreviewPanel {...makeProps({ sendFailed: true })} />);
    expect(screen.getByText('outgoing_sendFailed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common_confirm' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'outgoing_close' })).toBeInTheDocument();
  });

  it('Escape 키는 취소다', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<PreviewPanel {...props} />);
    await user.click(screen.getByRole('textbox', { name: 'outgoing_translation' }));
    await user.keyboard('{Escape}');
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
});
