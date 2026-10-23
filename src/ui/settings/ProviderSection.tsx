import { useId, useState } from 'react';
import { browser } from 'wxt/browser';
import { DEFAULTS, type ProviderId } from '../../config/defaults';
import { t } from '../../i18n/t';
import { sendMessage } from '../../messaging/protocol';
import { type ApiKeys, type GlobalSettings, PROVIDER_IDS } from '../../settings/schema';
import { Banner } from '../common/Banner';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { Field } from '../common/Field';
import { TextField } from '../common/TextField';
import { providerLabel } from './options';
import { useDraft } from './useDraft';

export interface ProviderSectionProps {
  settings: GlobalSettings;
  apiKeys: ApiKeys;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
  /** 키는 이 콜백(= setApiKey, local 전용)으로만 저장된다. */
  updateApiKey: (provider: ProviderId, key: string) => Promise<void>;
}

/** 커스텀 주소를 optional_host_permissions 패턴 `<scheme>://<host>/*` 로 바꾼다. 잘못된 주소면 null. */
export function originPattern(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return `${url.protocol}//${url.host}/*`;
}

interface ModelSuggestion {
  value: string;
  hint?: string;
}

function modelSuggestions(provider: ProviderId): ModelSuggestion[] {
  if (provider === 'anthropic') {
    return DEFAULTS.anthropicModelChoices.map((value) => ({ value, hint: anthropicHint(value) }));
  }
  if (provider === 'openai') return [{ value: DEFAULTS.models.openai }];
  return [];
}

/** 가격 힌트. 모델 이름의 등급 토큰으로 고른다. */
function anthropicHint(model: string): string | undefined {
  if (model.includes('opus')) return t('options_modelHint_quality');
  if (model.includes('sonnet')) return t('options_modelHint_balanced');
  if (model.includes('haiku')) return t('options_modelHint_cheapest');
  return undefined;
}

type Notice = { tone: 'success' | 'error'; text: string } | null;

export function ProviderSection({
  settings,
  apiKeys,
  updateSettings,
  updateApiKey,
}: ProviderSectionProps) {
  const groupName = useId();
  return (
    <Card title={t('options_sectionProvider')} description={t('options_sectionProviderHelp')}>
      <fieldset className="gat-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="gat-field__label">{t('options_activeProvider')}</legend>
        <div className="gat-segment" role="radiogroup">
          {PROVIDER_IDS.map((id) => (
            <label key={id} className="gat-segment__item">
              <input
                type="radio"
                name={groupName}
                value={id}
                checked={settings.activeProvider === id}
                onChange={() => updateSettings({ activeProvider: id })}
              />
              <span>{providerLabel(id)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {PROVIDER_IDS.map((id) => (
        <ProviderBlock
          key={id}
          provider={id}
          active={settings.activeProvider === id}
          apiKey={apiKeys[id]}
          model={settings.models[id]}
          baseUrl={settings.customBaseUrl}
          onModel={(model) => updateSettings({ models: { ...settings.models, [id]: model } })}
          onBaseUrl={(customBaseUrl) => updateSettings({ customBaseUrl })}
          onApiKey={(key) => updateApiKey(id, key)}
        />
      ))}
    </Card>
  );
}

interface ProviderBlockProps {
  provider: ProviderId;
  active: boolean;
  apiKey: string;
  model: string;
  baseUrl: string;
  onModel: (model: string) => Promise<boolean>;
  onBaseUrl: (url: string) => Promise<boolean>;
  onApiKey: (key: string) => Promise<void>;
}

function ProviderBlock({
  provider,
  active,
  apiKey,
  model,
  baseUrl,
  onModel,
  onBaseUrl,
  onApiKey,
}: ProviderBlockProps) {
  const ids = useId();
  const isCompat = provider === 'openai_compatible';
  const modelDraft = useDraft(model, (next) => {
    onModel(next.trim());
  });
  const [urlDraft, setUrlDraft] = useState(baseUrl);
  const [urlNotice, setUrlNotice] = useState<Notice>(null);
  const [testNotice, setTestNotice] = useState<Notice>(null);
  const [testing, setTesting] = useState(false);
  const suggestions = modelSuggestions(provider);
  const listId = `${ids}-models`;

  const saveBaseUrl = async () => {
    const trimmed = urlDraft.trim();
    setUrlNotice(null);
    if (trimmed === '') {
      if (await onBaseUrl('')) setUrlNotice({ tone: 'success', text: t('options_baseUrlSaved') });
      return;
    }
    const pattern = originPattern(trimmed);
    if (!pattern) {
      setUrlNotice({ tone: 'error', text: t('options_baseUrlInvalid') });
      return;
    }
    // 저장 시점에 그 출처만 권한 요청. 거부하면 저장하지 않는다.
    let granted = false;
    try {
      granted = await browser.permissions.request({ origins: [pattern] });
    } catch {
      granted = false;
    }
    if (!granted) {
      setUrlNotice({ tone: 'error', text: t('options_baseUrlPermissionDenied') });
      return;
    }
    if (await onBaseUrl(trimmed)) {
      setUrlNotice({ tone: 'success', text: t('options_baseUrlSaved') });
    }
  };

  /** 폼에 입력된 값 그대로 테스트한다(저장 전에도 가능). 절대 던지지 않는다. */
  const testConnection = async () => {
    setTesting(true);
    setTestNotice(null);
    try {
      const result = await sendMessage('provider.test', {
        provider,
        apiKey,
        model: modelDraft.draft.trim(),
        ...(isCompat ? { baseUrl: urlDraft.trim() } : {}),
      });
      if (result.ok) {
        setTestNotice({ tone: 'success', text: t('options_testSuccess', result.sample) });
      } else {
        setTestNotice({
          tone: 'error',
          text: t('options_testFailure', [result.errorKind, result.message]),
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setTestNotice({ tone: 'error', text: t('options_testFailure', ['server', message]) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={active ? 'gat-subcard gat-subcard--active' : 'gat-subcard'}>
      <h3 className="gat-subcard__title">{providerLabel(provider)}</h3>
      <Field
        htmlFor={`${ids}-key`}
        label={t('options_apiKey')}
        help={isCompat ? t('options_apiKeyOptionalHelp') : t('options_apiKeyHelp')}
      >
        <TextField
          id={`${ids}-key`}
          type="password"
          value={apiKey}
          onChange={(v) => {
            onApiKey(v);
          }}
          placeholder="sk-…"
        />
      </Field>
      <Field htmlFor={`${ids}-model`} label={t('options_model')} help={t('options_modelHelp')}>
        <TextField
          id={`${ids}-model`}
          value={modelDraft.draft}
          onChange={modelDraft.setDraft}
          onBlur={modelDraft.commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') modelDraft.commit();
          }}
          list={suggestions.length > 0 ? listId : undefined}
          placeholder={isCompat ? 'model-name' : DEFAULTS.models[provider]}
        />
        {suggestions.length > 0 && (
          <>
            <datalist id={listId}>
              {suggestions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.hint}
                </option>
              ))}
            </datalist>
            <div className="gat-chips">
              {suggestions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={s.value === model ? 'gat-chip gat-chip--selected' : 'gat-chip'}
                  onClick={() => {
                    modelDraft.setDraft(s.value);
                    onModel(s.value);
                  }}
                >
                  {s.value}
                  {s.hint && <span className="gat-chip__hint">· {s.hint}</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </Field>
      {isCompat && (
        <Field htmlFor={`${ids}-url`} label={t('options_baseUrl')} help={t('options_baseUrlHelp')}>
          <div className="gat-row">
            <TextField
              id={`${ids}-url`}
              type="url"
              value={urlDraft}
              onChange={setUrlDraft}
              placeholder="https://host/v1"
            />
            <Button variant="primary" onClick={saveBaseUrl} disabled={urlDraft.trim() === baseUrl}>
              {t('options_baseUrlSave')}
            </Button>
          </div>
          {urlNotice && <Banner tone={urlNotice.tone}>{urlNotice.text}</Banner>}
        </Field>
      )}
      <div className="gat-row">
        <Button onClick={testConnection} disabled={testing}>
          {testing ? t('options_testing') : t('options_testConnection')}
        </Button>
      </div>
      {testNotice && <Banner tone={testNotice.tone}>{testNotice.text}</Banner>}
    </div>
  );
}
