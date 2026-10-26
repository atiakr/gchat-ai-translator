import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { getGlobalSettings, setGlobalSettings } from '../../settings/storage';
import { addUsage } from '../../settings/usage';
import { LimitsSection } from './LimitsSection';
import { UsageSection } from './UsageSection';
import { useSettings } from './useSettings';

beforeEach(() => fakeBrowser.reset());

const NOW = new Date(2026, 9, 24, 12).getTime();
const DAY = 24 * 60 * 60 * 1000;

function Harness({ section }: { section: 'usage' | 'limits' }) {
  const store = useSettings();
  if (!store.settings) return null;
  return section === 'usage' ? (
    <UsageSection settings={store.settings} updateSettings={store.updateSettings} now={() => NOW} />
  ) : (
    <LimitsSection settings={store.settings} updateSettings={store.updateSettings} />
  );
}

describe('UsageSection', () => {
  it('서비스·모델별 행과 합계, 단가를 아는 모델만 금액을 보인다', async () => {
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 1_000_000, outputTokens: 500_000 }, NOW);
    await addUsage('openai', 'my-model', { inputTokens: 3, outputTokens: 1 }, NOW);
    await addUsage(
      'anthropic',
      'claude-haiku-5-5',
      { inputTokens: 7, outputTokens: 3 },
      NOW - 5 * DAY,
    );
    render(<Harness section="usage" />);
    await screen.findByText('options_sectionUsage');
    // 오늘: openai 두 모델. 이번 달: openai 두 모델 + anthropic.
    await waitFor(() => expect(screen.getAllByText('gpt-5-mini')).toHaveLength(2));
    expect(screen.getAllByText('my-model')).toHaveLength(2);
    expect(screen.getAllByText('claude-haiku-5-5')).toHaveLength(1);
    expect(screen.getAllByText('options_provider_openai')).toHaveLength(4);
    // gpt-5-mini 내장 단가: 1M × $0.25 + 0.5M × $2 = $1.25. 모르는 모델은 "–".
    expect(screen.getAllByText('$1.25').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('options_usageTotal')).toHaveLength(2);
    expect(screen.queryByText('options_usageEmpty')).toBeNull();
    expect(screen.queryByText('common_budgetReached')).toBeNull();
  });

  it('모델별로 나누기 전의 기록은 "모델 기록 없음" 행으로 보이고 금액은 없다', async () => {
    await fakeBrowser.storage.local.set({
      usage: { days: { '2026-10-24': { openai: { inputTokens: 5, outputTokens: 1, calls: 1 } } } },
    });
    render(<Harness section="usage" />);
    await waitFor(() => expect(screen.getAllByText('options_usageModelUnknown')).toHaveLength(2));
    expect(screen.queryByText(/^\$/)).toBeNull();
  });

  it('기록이 없으면 오늘·이번 달 모두 빈 안내', async () => {
    render(<Harness section="usage" />);
    await screen.findByText('options_sectionUsage');
    await waitFor(() => expect(screen.getAllByText('options_usageEmpty')).toHaveLength(2));
  });

  it('상한에 이르렀으면 경고 배너', async () => {
    await setGlobalSettings({ dailyTokenLimit: 5 });
    await addUsage('openai', 'gpt-5-mini', { inputTokens: 5, outputTokens: 0 }, NOW);
    render(<Harness section="usage" />);
    await screen.findByText('common_budgetReached');
  });

  it('활성 모델의 내장 단가를 채워 보이고, 고치면 그 모델의 직접 입력 단가로 저장한다', async () => {
    const user = userEvent.setup();
    render(<Harness section="usage" />);
    const input = await screen.findByLabelText('options_priceInput');
    expect(input).toHaveValue('0.25');
    expect(screen.getByLabelText('options_priceOutput')).toHaveValue('2');
    expect(screen.getByText('options_priceHelpBuiltin')).toBeInTheDocument();
    expect(screen.queryByText('options_priceReset')).toBeNull();
    await user.clear(input);
    await user.type(input, '0.3');
    expect((await getGlobalSettings()).prices.openai).toEqual({});
    await user.tab();
    await waitFor(async () =>
      expect((await getGlobalSettings()).prices.openai).toEqual({
        'gpt-5-mini': { input: 0.3, output: 2 },
      }),
    );
    await screen.findByText('options_priceHelpCustom');
    await user.click(screen.getByText('options_priceReset'));
    await waitFor(async () => expect((await getGlobalSettings()).prices.openai).toEqual({}));
    expect(screen.getByLabelText('options_priceInput')).toHaveValue('0.25');
  });

  it('잘못된 값은 오류를 보이며 저장하지 않고, 내장 단가가 없는 모델은 빈 칸에서 시작한다', async () => {
    const user = userEvent.setup();
    await setGlobalSettings({
      models: { ...(await getGlobalSettings()).models, openai: 'my-model' },
    });
    render(<Harness section="usage" />);
    const input = await screen.findByLabelText('options_priceInput');
    expect(input).toHaveValue('');
    expect(screen.getByText('options_priceHelp')).toBeInTheDocument();
    await user.type(input, '0.15');
    await user.tab();
    await waitFor(async () =>
      expect((await getGlobalSettings()).prices.openai).toEqual({
        'my-model': { input: 0.15, output: 0 },
      }),
    );
    const output = screen.getByLabelText('options_priceOutput');
    await user.type(output, 'abc');
    await user.tab();
    expect(screen.getByText('options_priceInvalid')).toBeInTheDocument();
    expect((await getGlobalSettings()).prices.openai['my-model']?.output).toBe(0);
    // 내장 단가가 없으면 되돌리기 버튼도 없다.
    expect(screen.queryByText('options_priceReset')).toBeNull();
  });

  it('활성 서비스의 모델이 비어 있으면 단가 입력 대신 안내를 보인다', async () => {
    await setGlobalSettings({ activeProvider: 'openai_compatible' });
    render(<Harness section="usage" />);
    await screen.findByText('options_priceNoModel');
    expect(screen.queryByLabelText('options_priceInput')).toBeNull();
  });
});

describe('LimitsSection — 일일 토큰 상한', () => {
  it('0 을 허용하고 음수·소수는 거부한다', async () => {
    const user = userEvent.setup();
    await setGlobalSettings({ dailyTokenLimit: 500 });
    render(<Harness section="limits" />);
    const input = await screen.findByLabelText('options_dailyTokenLimit');
    expect(input).toHaveValue(500);
    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    await waitFor(async () => expect((await getGlobalSettings()).dailyTokenLimit).toBe(0));
    await user.clear(input);
    await user.type(input, '1.5');
    await user.tab();
    expect(screen.getByText('options_dailyTokenLimitInvalid')).toBeInTheDocument();
    expect((await getGlobalSettings()).dailyTokenLimit).toBe(0);
  });
});
