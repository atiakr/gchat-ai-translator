import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  listRoomSettings,
  setApiKey,
  setBrokenState,
  setInvalidKey,
  setRoomSettings,
} from '../../src/settings/storage';
import { App } from './App';

beforeEach(() => fakeBrowser.reset());

describe('options App', () => {
  it('모든 섹션을 렌더한다', async () => {
    render(<App />);
    await screen.findByText('options_sectionProvider');
    for (const key of [
      'options_sectionLanguage',
      'options_sectionLimits',
      'options_sectionRooms',
      'options_sectionData',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
    expect(screen.queryByText('options_invalidKeyBanner')).toBeNull();
    expect(screen.queryByText('options_brokenBanner')).toBeNull();
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('틀린 키 상태가 있으면 배너를 보인다', async () => {
    await setApiKey('anthropic', 'sk-ant');
    await setInvalidKey('anthropic', 'auth');
    await setBrokenState({ detectedAt: 1 });
    render(<App />);
    await screen.findByText('options_invalidKeyBanner');
    await screen.findByText('options_brokenBanner');
  });

  it('대화방별 설정 목록을 보이고 삭제할 수 있다', async () => {
    await setRoomSettings('space/X', { name: '우리 팀', incomingDisabled: true });
    await setRoomSettings('dm/Y', {});
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('우리 팀');
    expect(screen.getByText('dm/Y')).toBeInTheDocument();
    const deletes = screen.getAllByRole('button', { name: 'common_delete' });
    // 목록은 이름(없으면 id) 순: 'dm/Y' < '우리 팀'
    await user.click(deletes[1] as Element);
    await waitFor(async () => {
      expect((await listRoomSettings()).map((r) => r.roomId)).toEqual(['dm/Y']);
    });
    await waitFor(() => expect(screen.queryByText('우리 팀')).toBeNull());
  });

  it('번역 기록 지우기는 확인 후 실행된다', async () => {
    await fakeBrowser.storage.local.set({
      'translationCache:1': { x: 1 },
      'sentOriginals:1': { y: 1 },
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('options_sectionData');
    await user.click(screen.getByRole('button', { name: 'options_clearHistory' }));
    expect((await fakeBrowser.storage.local.get(null))['translationCache:1']).toBeDefined();
    await screen.findByText('options_clearHistoryConfirm');
    await user.click(screen.getByRole('button', { name: 'common_confirm' }));
    await screen.findByText('options_clearHistoryDone');
    const local = await fakeBrowser.storage.local.get(null);
    expect(local['translationCache:1']).toBeUndefined();
    expect(local['sentOriginals:1']).toBeUndefined();
  });
});
