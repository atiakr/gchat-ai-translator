import { browser } from 'wxt/browser';
import type { ProviderId } from '../config/defaults';
import type { ErrorKind, TranslationStatus } from '../engine/types';
import type { GlobalSettings } from '../settings/schema';

/**
 * content ↔ background ↔ popup/options 메시지 계약.
 * 종류 집합은 여기서만 정의한다.
 */

export interface TranslateBatchItem {
  messageId: string;
  text: string;
  textHash: string;
}

export interface TranslateBatchResultItem {
  messageId: string;
  status: Extract<TranslationStatus, 'translated' | 'same_language' | 'error'>;
  translation?: string;
  detectedLang?: string;
  errorKind?: ErrorKind;
}

export interface MessageMap {
  'translate.batch': {
    request: { roomId: string; targetLang: string; items: TranslateBatchItem[] };
    response: { items: TranslateBatchResultItem[] };
  };
  'translate.outgoing': {
    request: { roomId: string; text: string; targetLang: string };
    response:
      | { ok: true; translation: string; detectedLang: string }
      | { ok: false; errorKind: ErrorKind; message?: string };
  };
  'translate.retry': {
    request: { roomId: string; targetLang: string; item: TranslateBatchItem };
    response: { item: TranslateBatchResultItem };
  };
  'settings.get': {
    request: Record<string, never>;
    response: {
      settings: GlobalSettings;
      canTranslate: boolean;
      reason?: 'disabled' | 'no_key' | 'invalid_key';
    };
  };
  /** bg → 모든 chat 탭 브로드캐스트. 응답 없음. */
  'settings.changed': {
    request: {
      settings: GlobalSettings;
      canTranslate: boolean;
      reason?: 'disabled' | 'no_key' | 'invalid_key';
    };
    response: undefined;
  };
  /** bg → 활성 탭 content. Chrome 단축키 설정으로 매긴 키가 눌림. */
  'command.translateOutgoing': {
    request: Record<string, never>;
    response: undefined;
  };
  /** popup → 활성 탭 content. */
  'room.current': {
    request: Record<string, never>;
    response: { roomId: string; name?: string } | null;
  };
  'status.report': {
    request: { roomId?: string; roomName?: string; roomDetected: boolean; messagesFound: number };
    response: undefined;
  };
  'sentOriginal.save': {
    request: { roomId: string; sentText: string; original: string };
    response: undefined;
  };
  'sentOriginal.lookup': {
    request: { roomId: string; sentText: string };
    response: { original: string } | null;
  };
  'provider.test': {
    request: { provider: ProviderId; apiKey: string; model: string; baseUrl?: string };
    response: { ok: true; sample: string } | { ok: false; errorKind: ErrorKind; message: string };
  };
}

export type MessageKind = keyof MessageMap;

export interface Envelope<K extends MessageKind = MessageKind> {
  kind: K;
  payload: MessageMap[K]['request'];
}

export function isEnvelope(value: unknown): value is Envelope {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as { kind?: unknown }).kind === 'string' &&
    'payload' in (value as object)
  );
}

/** runtime 으로 보낸다(content/popup/options → background). */
export async function sendMessage<K extends MessageKind>(
  kind: K,
  payload: MessageMap[K]['request'],
): Promise<MessageMap[K]['response']> {
  const envelope: Envelope<K> = { kind, payload };
  return unwrap(await browser.runtime.sendMessage(envelope)) as MessageMap[K]['response'];
}

function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && '__error' in value) {
    throw new Error(String((value as { __error: unknown }).__error));
  }
  return value;
}

/** 특정 탭의 content script 로 보낸다(background/popup → content). */
export async function sendToTab<K extends MessageKind>(
  tabId: number,
  kind: K,
  payload: MessageMap[K]['request'],
): Promise<MessageMap[K]['response']> {
  const envelope: Envelope<K> = { kind, payload };
  return unwrap(await browser.tabs.sendMessage(tabId, envelope)) as MessageMap[K]['response'];
}

export type Handler<K extends MessageKind> = (
  payload: MessageMap[K]['request'],
  sender: { tabId?: number },
) => Promise<MessageMap[K]['response']> | MessageMap[K]['response'];

export type Handlers = { [K in MessageKind]?: Handler<K> };

/**
 * 핸들러 표를 등록한다. 알 수 없는 종류는 무시(다른 리스너에 양보). 반환값은 해제 함수.
 * 비동기 응답을 위해 리스너는 Promise 를 반환한다(MV3 지원).
 */
export function onMessage(handlers: Handlers): () => void {
  // Chrome 은 리스너의 Promise 반환을 보장하지 않으므로 sendResponse + return true 방식을 쓴다.
  const listener = (
    raw: unknown,
    sender: { tab?: { id?: number } },
    sendResponse: (response?: unknown) => void,
  ): true | undefined => {
    if (!isEnvelope(raw)) return undefined;
    const handler = handlers[raw.kind] as Handler<MessageKind> | undefined;
    if (!handler) return undefined;
    Promise.resolve()
      .then(() => handler(raw.payload, { tabId: sender.tab?.id }))
      .then(
        (result) => sendResponse(result ?? null),
        (error: unknown) =>
          sendResponse({ __error: error instanceof Error ? error.message : String(error) }),
      );
    return true;
  };
  type Listener = Parameters<typeof browser.runtime.onMessage.addListener>[0];
  browser.runtime.onMessage.addListener(listener as unknown as Listener);
  return () => browser.runtime.onMessage.removeListener(listener as unknown as Listener);
}
