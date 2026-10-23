import '../../src/ui/tokens.css';
import '../../src/ui/common/styles.css';
import './style.css';
import { useEffect, useId, useState } from 'react';
import { browser } from 'wxt/browser';
import { type I18nKey, t } from '../../src/i18n/t';
import { sendToTab } from '../../src/messaging/protocol';
import { Banner } from '../../src/ui/common/Banner';
import { Button } from '../../src/ui/common/Button';
import { Card } from '../../src/ui/common/Card';
import { Select } from '../../src/ui/common/Select';
import { Toggle } from '../../src/ui/common/Toggle';
import { providerLabel, roomOutgoingOptions } from '../../src/ui/settings/options';
import { useRoomSettings, useSettings } from '../../src/ui/settings/useSettings';
import { useSystemTheme } from '../../src/ui/settings/useSystemTheme';

const CHAT_ORIGIN = 'https://chat.google.com/';

interface CurrentRoom {
  roomId: string;
  name?: string;
}

/** 활성 탭이 Google Chat 이면 content script 에 현재 방을 묻는다. 응답이 없으면 null. */
async function queryCurrentRoom(): Promise<CurrentRoom | null> {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined || !tab.url?.startsWith(CHAT_ORIGIN)) return null;
    const room = await sendToTab(tab.id, 'room.current', {});
    return room && typeof room.roomId === 'string' ? room : null;
  } catch {
    return null;
  }
}

function openOptions() {
  browser.runtime.openOptionsPage().catch(() => undefined);
}

export function App() {
  useSystemTheme();
  const store = useSettings();
  const { settings } = store;
  const [room, setRoom] = useState<CurrentRoom | null>(null);

  useEffect(() => {
    let alive = true;
    queryCurrentRoom().then((r) => alive && setRoom(r));
    return () => {
      alive = false;
    };
  }, []);

  if (!settings) return <main className="gat-page popup-page" />;

  const provider = settings.activeProvider;
  const model = settings.models[provider];
  const noKey = provider !== 'openai_compatible' && !store.apiKeys[provider];
  const invalidKey = Boolean(store.invalidKeys[provider]);
  const optionsLink = (
    <Button variant="link" size="sm" onClick={openOptions}>
      {t('common_openOptions')}
    </Button>
  );

  return (
    <main className="gat-page popup-page">
      <header className="popup-header">
        <h1>{t('extName' as I18nKey)}</h1>
        <Toggle
          ariaLabel={t('popup_enabled')}
          checked={settings.enabled}
          onChange={(enabled) => store.updateSettings({ enabled })}
        />
      </header>

      {store.saveError && (
        <Banner tone="error">
          {store.saveError.kind === 'quota'
            ? t('options_quotaBanner')
            : t('options_saveFailed', store.saveError.message)}
        </Banner>
      )}
      {invalidKey ? (
        <Banner tone="error" actions={optionsLink}>
          {t('popup_invalidKeyBanner')}
        </Banner>
      ) : (
        noKey && (
          <Banner tone="warning" actions={optionsLink}>
            {t('popup_noKeyBanner')}
          </Banner>
        )
      )}
      {store.broken && <Banner tone="warning">{t('options_brokenBanner')}</Banner>}

      <Card compact>
        <dl className="gat-kv">
          <dt>{t('popup_summaryProvider')}</dt>
          <dd>{providerLabel(provider)}</dd>
          <dt>{t('popup_summaryModel')}</dt>
          <dd>{model || <span className="gat-muted">{t('popup_noModel')}</span>}</dd>
        </dl>
      </Card>

      {room && <RoomCard room={room} />}

      <footer className="popup-footer">{optionsLink}</footer>
    </main>
  );
}

function RoomCard({ room }: { room: CurrentRoom }) {
  const { room: roomSettings, update, saveError } = useRoomSettings(room.roomId);
  const selectId = useId();
  if (!roomSettings) return null;
  return (
    <Card compact title={t('popup_currentRoom')} description={room.name || room.roomId}>
      <Toggle
        label={t('options_roomIncomingOff')}
        checked={roomSettings.incomingDisabled}
        onChange={(incomingDisabled) => update({ incomingDisabled })}
      />
      <div className="gat-field">
        <label className="gat-field__label" htmlFor={selectId}>
          {t('options_roomOutgoingLang')}
        </label>
        <Select
          id={selectId}
          value={roomSettings.outgoingLang ?? ''}
          options={roomOutgoingOptions()}
          onChange={(v) => update({ outgoingLang: v || undefined })}
        />
      </div>
      {saveError && (
        <Banner tone="error">
          {saveError.kind === 'quota'
            ? t('options_quotaBanner')
            : t('options_saveFailed', saveError.message)}
        </Banner>
      )}
    </Card>
  );
}
