import '../tokens.css';
import '../common/styles.css';
import './popup.css';
import { useEffect, useId, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULTS } from '../../config/defaults';
import { type I18nKey, t } from '../../i18n/t';
import { sendToTab } from '../../messaging/protocol';
import type { GlobalSettings } from '../../settings/schema';
import { roomInstructions } from '../../settings/storage';
import {
  summarizeUsage,
  sumRows,
  totalCost,
  totalTokens,
  type UsageRow,
} from '../../settings/usage';
import { Banner } from '../common/Banner';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Select } from '../common/Select';
import { Toggle } from '../common/Toggle';
import { providerLabel, roomOutgoingOptions } from '../settings/options';
import { RoomInstructionsField } from '../settings/RoomInstructionsField';
import { formatTokenCount, formatUsd } from '../settings/usageFormat';
import { useSystemTheme } from '../settings/useSystemTheme';
import { useUsage } from '../settings/useUsage';
import { usePopupSettings, useRoomSettings } from './usePopupSettings';

const CHAT_ORIGIN = 'https://chat.google.com/';

export interface CurrentRoom {
  roomId: string;
  name?: string;
}

/** 활성 탭이 Google Chat 이면 content script 에 현재 방을 묻는다. 응답이 없으면 null. */
export async function queryCurrentRoom(): Promise<CurrentRoom | null> {
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

/** 팝업 화면. API 키는 읽지 않고, 번역 가능 여부는 background 의 settings.get 으로 안다. */
export function PopupApp() {
  useSystemTheme();
  const store = usePopupSettings();
  const { settings, gate } = store;
  const usage = useUsage();
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
  const noKey = gate?.reason === 'no_key';
  const invalidKey = gate?.reason === 'invalid_key';
  const budget = gate?.reason === 'budget';
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
      {budget && <Banner tone="warning">{t('common_budgetReached')}</Banner>}
      {store.broken && <Banner tone="warning">{t('options_brokenBanner')}</Banner>}

      <Card compact>
        <dl className="gat-kv">
          <dt>{t('popup_summaryProvider')}</dt>
          <dd>{providerLabel(provider)}</dd>
          <dt>{t('popup_summaryModel')}</dt>
          <dd>{model || <span className="gat-muted">{t('popup_noModel')}</span>}</dd>
          {usage && <UsageRows settings={settings} usage={usage} />}
        </dl>
      </Card>

      {room && <RoomCard room={room} />}

      <footer className="popup-footer">{optionsLink}</footer>
    </main>
  );
}

/** 오늘·이번 달 토큰 사용량(모든 서비스·모델 합). 단가를 아는 모델이 있으면 모델별 어림 금액의 합을 붙인다. */
function UsageRows({
  settings,
  usage,
  now = Date.now,
}: {
  settings: GlobalSettings;
  usage: Parameters<typeof summarizeUsage>[0];
  now?: () => number;
}) {
  const summary = summarizeUsage(usage, now());
  const line = (rows: UsageRow[]) => {
    const tokens = formatTokenCount(totalTokens(sumRows(rows)));
    const cost = totalCost(rows, settings.prices);
    return cost === null ? tokens : `${tokens} · ${formatUsd(cost)}`;
  };
  return (
    <>
      <dt>{t('popup_usageToday')}</dt>
      <dd>{line(summary.today)}</dd>
      <dt>{t('popup_usageMonth')}</dt>
      <dd>{line(summary.month)}</dd>
    </>
  );
}

/** 현재 대화방 카드. 방 설정 항목을 처음 만들 때 화면에서 받은 방 이름도 함께 저장한다. */
export function RoomCard({ room }: { room: CurrentRoom }) {
  const { room: roomSettings, update, saveError } = useRoomSettings(room.roomId);
  const selectId = useId();
  if (!roomSettings) return null;
  const withName = room.name && room.name !== roomSettings.name ? { name: room.name } : {};
  return (
    <Card
      compact
      title={t('popup_currentRoom')}
      description={room.name || roomSettings.name || room.roomId}
    >
      <Toggle
        label={t('options_roomIncomingOff')}
        checked={roomSettings.incomingDisabled}
        onChange={(incomingDisabled) => update({ incomingDisabled, ...withName })}
      />
      <Toggle
        label={t('options_roomEnterTranslate')}
        checked={roomSettings.enterTranslates === true}
        onChange={(enterTranslates) => update({ enterTranslates, ...withName })}
      />
      <div className="gat-field">
        <label className="gat-field__label" htmlFor={selectId}>
          {t('options_roomOutgoingLang')}
        </label>
        <Select
          id={selectId}
          value={roomSettings.outgoingLang ?? ''}
          options={roomOutgoingOptions()}
          onChange={(v) => update({ outgoingLang: v || undefined, ...withName })}
        />
      </div>
      <RoomInstructionsField
        value={roomInstructions(roomSettings)}
        onSave={(instructions) => update({ instructions, ...withName })}
        autoSaveMs={DEFAULTS.popupAutoSaveMs}
      />
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
