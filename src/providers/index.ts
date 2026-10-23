import type { ErrorKind, ProviderConfig, ProviderId, TranslationProvider } from '../engine/types';
import { ProviderError } from '../engine/types';
import { _resetAnthropicState, anthropicProvider } from './anthropic';
import { _resetOpenAiState, openaiProvider } from './openai';
import { _resetOpenAiCompatibleState, openaiCompatibleProvider } from './openaiCompatible';

const PROVIDERS: Record<ProviderId, TranslationProvider> = {
  openai: openaiProvider,
  anthropic: anthropicProvider,
  openai_compatible: openaiCompatibleProvider,
};

export function getProvider(id: ProviderId): TranslationProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new Error(`Unknown provider: ${String(id)}`);
  return provider;
}

/** 모든 서비스의 세션 폴백 상태(구조화 출력 거부 기억)를 초기화한다. */
export function resetProviderState(): void {
  _resetOpenAiState();
  _resetAnthropicState();
  _resetOpenAiCompatibleState();
}

export type ConnectionTestResult =
  | { ok: true; sample: string }
  | { ok: false; errorKind: ErrorKind; message: string };

const TEST_ITEM_ID = 'test';

/** 설정으로 실제 호출을 한 번 해 본다: "hello" 1건을 ko 로 발신 모드 번역. 절대 던지지 않는다. */
export async function testConnection(config: ProviderConfig): Promise<ConnectionTestResult> {
  try {
    const results = await getProvider(config.provider).translate(
      {
        items: [{ id: TEST_ITEM_ID, text: 'hello' }],
        targetLang: 'ko',
        instructions: '',
        mode: 'outgoing',
      },
      config,
    );
    const sample = results[0]?.translation ?? '';
    if (!sample.trim()) {
      return { ok: false, errorKind: 'parse', message: 'Empty translation returned' };
    }
    return { ok: true, sample };
  } catch (err) {
    if (err instanceof ProviderError) {
      return { ok: false, errorKind: err.kind, message: err.message };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, errorKind: 'server', message };
  }
}

export type { TranslationProvider };
export { anthropicProvider, openaiCompatibleProvider, openaiProvider };
