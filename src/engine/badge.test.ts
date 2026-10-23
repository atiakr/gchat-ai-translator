import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { setApiKey, setBrokenState, setGlobalSettings, setInvalidKey } from '../settings/storage';
import { applyBadge, BADGE_WARNING_TEXT, computeBadgeReason, refreshBadge } from './badge';

beforeEach(() => fakeBrowser.reset());

describe('computeBadgeReason', () => {
  it('키 없음 → no_key, 키 있음 → null', async () => {
    expect(await computeBadgeReason()).toBe('no_key');
    await setApiKey('openai', 'k');
    expect(await computeBadgeReason()).toBeNull();
  });
  it('틀린 키가 키 없음·깨짐보다 우선한다', async () => {
    await setApiKey('openai', 'k');
    await setBrokenState({ detectedAt: 1 });
    await setInvalidKey('openai', 'auth');
    expect(await computeBadgeReason()).toBe('invalid_key');
  });
  it('깨짐 상태면 broken', async () => {
    await setApiKey('openai', 'k');
    await setBrokenState({ detectedAt: 1 });
    expect(await computeBadgeReason()).toBe('broken');
    await setBrokenState(null);
    expect(await computeBadgeReason()).toBeNull();
  });
  it('커스텀 서비스는 빈 키여도 경고하지 않는다', async () => {
    await setGlobalSettings({ activeProvider: 'openai_compatible' });
    expect(await computeBadgeReason()).toBeNull();
  });
});

describe('refreshBadge / applyBadge', () => {
  it('경고면 "!" 를, 아니면 빈 문자열을 그린다', async () => {
    expect(await refreshBadge()).toBe('no_key');
    expect(await fakeBrowser.action.getBadgeText({})).toBe(BADGE_WARNING_TEXT);
    await setApiKey('openai', 'k');
    expect(await refreshBadge()).toBeNull();
    expect(await fakeBrowser.action.getBadgeText({})).toBe('');
  });
  it('action API 가 실패해도 던지지 않는다', async () => {
    const spy = vi.spyOn(fakeBrowser.action, 'setBadgeText').mockImplementation(() => {
      throw new Error('no action');
    });
    await expect(applyBadge('broken')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
