import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { type MessageMap, onMessage } from '../../messaging/protocol';
import * as storage from '../../settings/storage';
import { getApiKeys, getGlobalSettings } from '../../settings/storage';
import { originPattern, ProviderSection } from './ProviderSection';
import { useSettings } from './useSettings';

/** 실제 저장 계층(useSettings)과 묶어서 렌더한다. */
function Harness() {
  const s = useSettings();
  if (!s.settings) return null;
  return (
    <ProviderSection
      settings={s.settings}
      apiKeys={s.apiKeys}
      updateSettings={s.updateSettings}
      updateApiKey={s.updateApiKey}
    />
  );
}

const requestMock = vi.fn<(req: { origins?: string[] }) => Promise<boolean>>();

beforeEach(() => {
  fakeBrowser.reset();
  requestMock.mockReset();
  Object.assign(fakeBrowser.permissions, { request: requestMock });
});

async function renderSection() {
  const user = userEvent.setup();
  render(<Harness />);
  await screen.findByText('options_sectionProvider');
  return { user };
}

/** 서비스 탭을 눌러 그 서비스의 설정만 보이게 한다(기본은 openai). */
async function selectTab(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByRole('radio', { name: `options_provider_${id}` }));
  await waitFor(() =>
    expect(screen.getByRole('radio', { name: `options_provider_${id}` })).toBeChecked(),
  );
}

function keyInput(): HTMLInputElement {
  return screen.getByLabelText('options_apiKey') as HTMLInputElement;
}

describe('originPattern', () => {
  it('scheme://host/* 로 정규화한다', () => {
    expect(originPattern('https://my-host.example/v1/chat')).toBe('https://my-host.example/*');
    expect(originPattern(' http://localhost:8080/v1 ')).toBe('http://localhost:8080/*');
    expect(originPattern('ftp://x')).toBeNull();
    expect(originPattern('not a url')).toBeNull();
  });
});

describe('ProviderSection', () => {
  it('고른 서비스 탭의 설정만 보이고, 탭을 누르면 활성 서비스가 바뀐다', async () => {
    const { user } = await renderSection();
    expect(screen.getAllByLabelText('options_apiKey')).toHaveLength(1);
    expect(screen.queryByLabelText('options_baseUrl')).toBeNull();
    await selectTab(user, 'openai_compatible');
    expect(screen.getAllByLabelText('options_apiKey')).toHaveLength(1);
    expect(screen.getByLabelText('options_baseUrl')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await getGlobalSettings()).activeProvider).toBe('openai_compatible');
    });
  });

  it('키 입력은 local 에만 저장되고 sync 에는 절대 들어가지 않는다', async () => {
    const { user } = await renderSection();
    const openaiKey = keyInput();
    await user.type(openaiKey, 'sk-secret-123');
    await user.tab();
    await waitFor(async () => {
      expect((await getApiKeys()).openai).toBe('sk-secret-123');
    });
    const local = await fakeBrowser.storage.local.get(null);
    const sync = await fakeBrowser.storage.sync.get(null);
    expect(JSON.stringify(local)).toContain('sk-secret-123');
    expect(JSON.stringify(sync)).not.toContain('sk-secret');
    // 입력은 비밀번호 필드이고, 표시 버튼으로 드러낼 수 있다.
    expect(openaiKey.type).toBe('password');
    await user.click(screen.getByRole('button', { name: 'options_showValue' }));
    expect(openaiKey.type).toBe('text');
  });

  it('키는 글자마다 저장하지 않고 blur 또는 Enter 때 한 번만 저장한다', async () => {
    const setApiKey = vi.spyOn(storage, 'setApiKey');
    try {
      const { user } = await renderSection();
      await user.type(keyInput(), 'sk-abc');
      expect(setApiKey).not.toHaveBeenCalled();
      expect((await getApiKeys()).openai).toBe('');
      await user.tab();
      await waitFor(() => expect(setApiKey).toHaveBeenCalledTimes(1));
      expect(setApiKey).toHaveBeenCalledWith('openai', 'sk-abc');

      await selectTab(user, 'anthropic');
      await user.type(keyInput(), 'sk-ant{Enter}');
      await waitFor(() => expect(setApiKey).toHaveBeenCalledTimes(2));
      expect(setApiKey).toHaveBeenLastCalledWith('anthropic', 'sk-ant');
      expect((await getApiKeys()).anthropic).toBe('sk-ant');
    } finally {
      setApiKey.mockRestore();
    }
  });

  it('커스텀 주소: 권한 거부 → 저장하지 않고 안내 배너', async () => {
    requestMock.mockResolvedValue(false);
    const { user } = await renderSection();
    await selectTab(user, 'openai_compatible');
    await user.type(screen.getByLabelText('options_baseUrl'), 'https://my-host.example/v1');
    await user.click(screen.getByRole('button', { name: 'options_baseUrlSave' }));
    await screen.findByText('options_baseUrlPermissionDenied');
    expect(requestMock).toHaveBeenCalledWith({ origins: ['https://my-host.example/*'] });
    expect((await getGlobalSettings()).customBaseUrl).toBe('');
  });

  it('커스텀 주소: 권한 허용 → 저장', async () => {
    requestMock.mockResolvedValue(true);
    const { user } = await renderSection();
    await selectTab(user, 'openai_compatible');
    await user.type(screen.getByLabelText('options_baseUrl'), 'https://my-host.example/v1');
    await user.click(screen.getByRole('button', { name: 'options_baseUrlSave' }));
    await screen.findByText('options_baseUrlSaved');
    expect((await getGlobalSettings()).customBaseUrl).toBe('https://my-host.example/v1');
  });

  it('잘못된 주소는 권한 요청 없이 거절한다', async () => {
    const { user } = await renderSection();
    await selectTab(user, 'openai_compatible');
    await user.type(screen.getByLabelText('options_baseUrl'), 'not-a-url');
    await user.click(screen.getByRole('button', { name: 'options_baseUrlSave' }));
    await screen.findByText('options_baseUrlInvalid');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('연결 테스트는 폼에 입력된 값(저장 전 포함)으로 provider.test 를 보낸다', async () => {
    const handler = vi.fn(async (_payload: MessageMap['provider.test']['request']) => ({
      ok: true as const,
      sample: '안녕하세요',
    }));
    const off = onMessage({ 'provider.test': handler });
    const { user } = await renderSection();
    await selectTab(user, 'anthropic');
    await user.type(keyInput(), 'sk-ant-1');
    const anthropicModel = screen.getByLabelText('options_model') as HTMLInputElement;
    await user.clear(anthropicModel);
    await user.type(anthropicModel, 'claude-haiku-5-5');
    // 아직 blur 하지 않아 저장 전 — 그래도 폼 값으로 테스트한다.
    expect((await getGlobalSettings()).models.anthropic).toBe('claude-opus-5-5');
    await user.click(screen.getByRole('button', { name: 'options_testConnection' }));
    await screen.findByText('options_testSuccess');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { provider: 'anthropic', apiKey: 'sk-ant-1', model: 'claude-haiku-5-5' },
      expect.anything(),
    );
    off();
  });

  it('연결 테스트 실패와 전송 오류는 배너로만 알린다', async () => {
    const off = onMessage({
      'provider.test': async () => ({
        ok: false as const,
        errorKind: 'auth' as const,
        message: 'bad key',
      }),
    });
    const { user } = await renderSection();
    const button = screen.getByRole('button', { name: 'options_testConnection' });
    await user.click(button);
    await screen.findByText('options_testFailure');
    off();
    // 리스너가 없으면 sendMessage 가 거부되지만 화면은 오류 배너를 보일 뿐 던지지 않는다.
    await user.click(button);
    await waitFor(() => expect(screen.getAllByText('options_testFailure').length).toBe(1));
  });

  it('모델 추천 칩을 누르면 즉시 저장된다', async () => {
    const { user } = await renderSection();
    await selectTab(user, 'anthropic');
    await user.click(screen.getByRole('button', { name: /claude-haiku-5-5/ }));
    await waitFor(async () => {
      expect((await getGlobalSettings()).models.anthropic).toBe('claude-haiku-5-5');
    });
    const sync = await fakeBrowser.storage.sync.get(null);
    expect(JSON.stringify(sync)).not.toContain('apiKey');
  });
});
