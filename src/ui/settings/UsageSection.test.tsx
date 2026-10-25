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
  it('기록이 없으면 빈 안내, 기록이 있으면 서비스별 행과 단가가 있을 때만 금액을 보인다', async () => {
    await setGlobalSettings({
      prices: { ...(await getGlobalSettings()).prices, openai: { input: 1, output: 1 } },
    });
    await addUsage('openai', { inputTokens: 1_000_000, outputTokens: 500_000 }, NOW);
    await addUsage('anthropic', { inputTokens: 7, outputTokens: 3 }, NOW - 5 * 24 * 60 * 60 * 1000);
    render(<Harness section="usage" />);
    await screen.findByText('options_sectionUsage');
    // 오늘: openai 만. 이번 달: openai + anthropic.
    await waitFor(() => expect(screen.getAllByText('options_provider_openai')).toHaveLength(2));
    expect(screen.getAllByText('options_provider_anthropic')).toHaveLength(1);
    expect(screen.getAllByText('$1.50')).toHaveLength(2);
    expect(screen.getAllByText('1,000,000')).toHaveLength(2);
    expect(screen.queryByText('options_usageEmpty')).toBeNull();
    expect(screen.queryByText('common_budgetReached')).toBeNull();
  });

  it('기록이 없으면 오늘·이번 달 모두 빈 안내', async () => {
    render(<Harness section="usage" />);
    await screen.findByText('options_sectionUsage');
    await waitFor(() => expect(screen.getAllByText('options_usageEmpty')).toHaveLength(2));
  });

  it('상한에 이르렀으면 경고 배너', async () => {
    await setGlobalSettings({ dailyTokenLimit: 5 });
    await addUsage('openai', { inputTokens: 5, outputTokens: 0 }, NOW);
    render(<Harness section="usage" />);
    await screen.findByText('common_budgetReached');
  });

  it('단가는 활성 서비스에 blur 때 저장되고, 잘못된 값은 오류를 보이며 저장하지 않는다', async () => {
    const user = userEvent.setup();
    render(<Harness section="usage" />);
    const input = await screen.findByLabelText('options_priceInput');
    await user.type(input, '0.15');
    expect((await getGlobalSettings()).prices.openai.input).toBe(0);
    await user.tab();
    await waitFor(async () => expect((await getGlobalSettings()).prices.openai.input).toBe(0.15));
    const output = screen.getByLabelText('options_priceOutput');
    await user.type(output, 'abc');
    await user.tab();
    expect(screen.getByText('options_priceInvalid')).toBeInTheDocument();
    expect((await getGlobalSettings()).prices.openai.output).toBe(0);
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
