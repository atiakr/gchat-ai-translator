import { browser } from 'wxt/browser';
import { type Handlers, type MessageMap, onMessage, sendToTab } from '../messaging/protocol';
import { testConnection as defaultTestConnection } from '../providers/index';
import {
  canTranslate,
  clearInvalidKey,
  getBrokenState,
  getGlobalSettings,
  getRoomSettings,
  isOnboarded,
  markOnboarded,
  setBrokenState,
  setRoomSettings,
  watchApiKeys,
  watchBrokenState,
  watchGlobalSettings,
  watchInvalidKeys,
} from '../settings/storage';
import { refreshBadge } from './badge';
import * as cache from './cache';
import { createEngine, type Engine } from './engine';

/**
 * background service worker 배선. 엔트리(entrypoints/background.ts)는 `startBackground()` 만 부른다.
 * - 메시지 핸들러, 설치 직후 옵션 페이지(4.4), 단축키 → 활성 chat 탭(4.3)
 * - 설정·키·상태 변경 → 모든 chat.google.com 탭에 settings.changed 브로드캐스트 + 배지 갱신(4.4·4.2·4.7)
 * 키는 어떤 메시지에도 싣지 않는다(불변식 2).
 */

export const CHAT_URL_PREFIX = 'https://chat.google.com/';
export const COMMAND_TRANSLATE_OUTGOING = 'translate-outgoing';

export interface BackgroundDeps {
  engine?: Engine;
  testConnection?: typeof defaultTestConnection;
  now?: () => number;
}

type StatusReport = MessageMap['status.report']['request'];

/**
 * 깨짐 보고. content 는 60초 동안 메시지를 하나도 못 찾았을 때만
 * `roomDetected: true, messagesFound: 0` 을 보낸다. 메시지를 찾은 보고는 상태를 해제한다.
 * 방 이름이 오고 저장된 것과 다르면 방 설정에 기록한다.
 */
export async function handleStatusReport(
  report: StatusReport,
  now: () => number = () => Date.now(),
): Promise<void> {
  const current = await getBrokenState();
  if (report.roomDetected && report.messagesFound === 0) {
    if (!current) await setBrokenState({ detectedAt: now() });
  } else if (report.messagesFound > 0 && current) {
    await setBrokenState(null);
  }
  if (report.roomId && report.roomName) {
    try {
      const room = await getRoomSettings(report.roomId);
      if (room?.name !== report.roomName) {
        await setRoomSettings(report.roomId, { name: report.roomName });
      }
    } catch {
      // sync 용량 초과 등 — 방 이름은 표시용일 뿐이므로 무시한다.
    }
  }
}

async function settingsSnapshot(): Promise<MessageMap['settings.get']['response']> {
  const [settings, gate] = await Promise.all([getGlobalSettings(), canTranslate()]);
  return gate.reason
    ? { settings, canTranslate: gate.ok, reason: gate.reason }
    : { settings, canTranslate: gate.ok };
}

async function chatTabs(): Promise<number[]> {
  try {
    const tabs = await browser.tabs.query({});
    return tabs.flatMap((t) =>
      t.id !== undefined && t.url?.startsWith(CHAT_URL_PREFIX) ? [t.id] : [],
    );
  } catch {
    return [];
  }
}

/** 열려 있는 모든 chat.google.com 탭에 현재 설정을 알린다. 탭별 실패는 무시한다. */
export async function broadcastSettingsChanged(): Promise<void> {
  const payload = await settingsSnapshot();
  const ids = await chatTabs();
  await Promise.all(
    ids.map((id) => sendToTab(id, 'settings.changed', payload).catch(() => undefined)),
  );
}

/** 현재 창의 활성 chat.google.com 탭에 단축키 명령을 전달한다. */
export async function dispatchTranslateOutgoingCommand(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs.find((t) => t.id !== undefined && t.url?.startsWith(CHAT_URL_PREFIX));
    if (tab?.id === undefined) return;
    await sendToTab(tab.id, 'command.translateOutgoing', {});
  } catch {
    // content 가 아직 없거나 탭이 닫힘 — 무시
  }
}

export function createHandlers(deps: BackgroundDeps = {}): Handlers {
  const engine = deps.engine ?? createEngine();
  const testConnection = deps.testConnection ?? defaultTestConnection;
  const now = deps.now ?? (() => Date.now());
  return {
    'translate.batch': async ({ roomId, targetLang, items }) => ({
      items: await engine.translateBatch(roomId, targetLang, items),
    }),
    'translate.outgoing': ({ roomId, text, targetLang }) =>
      engine.translateOutgoing(roomId, text, targetLang),
    'translate.retry': async ({ roomId, targetLang, item }) => ({
      item: await engine.retryOne(roomId, targetLang, item),
    }),
    'settings.get': () => settingsSnapshot(),
    'status.report': async (report) => {
      await handleStatusReport(report, now);
      return undefined;
    },
    'sentOriginal.save': async ({ roomId, sentText, original }) => {
      await cache.saveSentOriginal(roomId, sentText, original, now());
      return undefined;
    },
    'sentOriginal.lookup': async ({ roomId, sentText }) => {
      const original = await cache.lookupSentOriginal(roomId, sentText);
      return original === null ? null : { original };
    },
    'provider.test': async (payload) => {
      const result = await testConnection({
        provider: payload.provider,
        apiKey: payload.apiKey,
        model: payload.model,
        baseUrl: payload.baseUrl,
      });
      // 연결 테스트 성공은 틀린 키 상태를 해제한다.
      if (result.ok) await clearInvalidKey(payload.provider);
      return result;
    },
  };
}

async function onInstalled(details: { reason: string }): Promise<void> {
  if (details.reason !== 'install') return;
  if (await isOnboarded()) return;
  try {
    await browser.runtime.openOptionsPage();
  } catch {
    // 옵션 페이지를 열 수 없는 환경 — 무시
  }
  await markOnboarded();
}

/** 모든 배선을 등록한다. 돌려주는 함수로 해제한다(테스트용). */
export function startBackground(deps: BackgroundDeps = {}): () => void {
  const disposers: (() => void)[] = [];

  disposers.push(onMessage(createHandlers(deps)));

  const installedListener = (details: { reason: string }) => {
    void onInstalled(details);
  };
  browser.runtime.onInstalled.addListener(installedListener);
  disposers.push(() => browser.runtime.onInstalled.removeListener(installedListener));

  const commandListener = (command: string) => {
    if (command === COMMAND_TRANSLATE_OUTGOING) void dispatchTranslateOutgoingCommand();
  };
  try {
    browser.commands.onCommand.addListener(commandListener);
    disposers.push(() => browser.commands.onCommand.removeListener(commandListener));
  } catch {
    // commands API 미지원(예: 테스트 환경)
  }

  // 설정·키·상태 변경은 한 틱 안에서 하나로 모아 브로드캐스트한다.
  let scheduled = false;
  const onChange = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      void Promise.all([broadcastSettingsChanged(), refreshBadge()]);
    });
  };
  disposers.push(watchGlobalSettings(onChange));
  disposers.push(watchApiKeys(onChange));
  disposers.push(watchInvalidKeys(onChange));
  disposers.push(watchBrokenState(onChange));

  void refreshBadge();

  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        // 이미 해제됨
      }
    }
    deps.engine?.dispose();
  };
}
