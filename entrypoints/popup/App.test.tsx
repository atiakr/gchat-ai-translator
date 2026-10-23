import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  getGlobalSettings,
  getRoomSettings,
  setApiKey,
  setBrokenState,
  setInvalidKey,
} from '../../src/settings/storage';
import { App } from './App';

const queryMock = vi.fn();
const sendMock = vi.fn();
const openOptionsMock = vi.fn(async () => undefined);

beforeEach(() => {
  fakeBrowser.reset();
  queryMock.mockReset();
  sendMock.mockReset();
  openOptionsMock.mockClear();
  Object.assign(fakeBrowser.tabs, { query: queryMock, sendMessage: sendMock });
  Object.assign(fakeBrowser.runtime, { openOptionsPage: openOptionsMock });
  queryMock.mockResolvedValue([{ id: 7, url: 'https://chat.google.com/room/AAA' }]);
});

describe('popup App', () => {
  it('room.current 에 응답이 없으면 대화방 카드를 숨긴다', async () => {
    sendMock.mockResolvedValue(null);
    render(<App />);
    await screen.findByText('popup_summaryProvider');
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(sendMock.mock.calls[0]?.[0]).toBe(7);
    expect(sendMock.mock.calls[0]?.[1]).toEqual({ kind: 'room.current', payload: {} });
    expect(screen.queryByText('popup_currentRoom')).toBeNull();
  });

  it('content script 가 없어 전송이 실패해도 카드만 숨긴다', async () => {
    sendMock.mockRejectedValue(new Error('Could not establish connection'));
    render(<App />);
    await screen.findByText('popup_summaryProvider');
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    expect(screen.queryByText('popup_currentRoom')).toBeNull();
  });

  it('Google Chat 탭이 아니면 묻지 않는다', async () => {
    queryMock.mockResolvedValue([{ id: 3, url: 'https://example.com/' }]);
    render(<App />);
    await screen.findByText('popup_summaryProvider');
    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.queryByText('popup_currentRoom')).toBeNull();
  });

  it('응답이 있으면 카드를 보이고 토글이 방 설정을 쓴다', async () => {
    sendMock.mockResolvedValue({ roomId: 'space/AAA', name: '팀 방' });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('popup_currentRoom');
    expect(screen.getByText('팀 방')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'options_roomIncomingOff' }));
    await waitFor(async () => {
      expect((await getRoomSettings('space/AAA'))?.incomingDisabled).toBe(true);
    });
    await user.selectOptions(screen.getByLabelText('options_roomOutgoingLang'), 'ja');
    await waitFor(async () => {
      expect((await getRoomSettings('space/AAA'))?.outgoingLang).toBe('ja');
    });
    const sync = await fakeBrowser.storage.sync.get(null);
    expect(sync['room:space/AAA']).toMatchObject({ roomId: 'space/AAA', incomingDisabled: true });
  });

  it('전역 스위치는 enabled 를 쓴다', async () => {
    sendMock.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<App />);
    const toggle = await screen.findByRole('switch', { name: 'popup_enabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    await waitFor(async () => {
      expect((await getGlobalSettings()).enabled).toBe(false);
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('키 없음 경고와 설정 열기 링크', async () => {
    sendMock.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('popup_noKeyBanner');
    await user.click(screen.getAllByRole('button', { name: 'common_openOptions' })[0] as Element);
    expect(openOptionsMock).toHaveBeenCalled();
  });

  it('틀린 키·화면 구조 변경 경고는 local 상태로 보인다', async () => {
    sendMock.mockResolvedValue(null);
    await setApiKey('openai', 'sk-x');
    await setInvalidKey('openai', 'auth');
    await setBrokenState({ detectedAt: Date.now() });
    render(<App />);
    await screen.findByText('popup_invalidKeyBanner');
    await screen.findByText('options_brokenBanner');
    expect(screen.queryByText('popup_noKeyBanner')).toBeNull();
    // 키 요약은 보여도 키 값은 화면에 없다.
    expect(document.body.textContent).not.toContain('sk-x');
  });
});
