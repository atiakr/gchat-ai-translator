import '../tokens.css';
import '../common/styles.css';
import './options.css';
import { useEffect } from 'react';
import { type I18nKey, t } from '../../i18n/t';
import { PROVIDER_IDS } from '../../settings/schema';
import { Banner } from '../common/Banner';
import { Button } from '../common/Button';
import { DataSection } from './DataSection';
import { LanguageSection } from './LanguageSection';
import { LimitsSection } from './LimitsSection';
import { providerLabel } from './options';
import { ProviderSection } from './ProviderSection';
import { RoomsSection } from './RoomsSection';
import { useSettings } from './useSettings';
import { useSystemTheme } from './useSystemTheme';

/** 옵션 페이지 화면. */
export function OptionsApp() {
  useSystemTheme();
  const store = useSettings();
  const { settings, saveError } = store;

  useEffect(() => {
    document.title = `${t('extName' as I18nKey)} — ${t('options_title')}`;
  }, []);

  return (
    <main className="gat-page options-page">
      <header className="options-header">
        <h1>{t('extName' as I18nKey)}</h1>
        <p>{t('options_title')}</p>
      </header>

      {saveError && (
        <Banner
          tone="error"
          actions={
            <Button size="sm" onClick={store.dismissSaveError}>
              {t('options_dismiss')}
            </Button>
          }
        >
          {saveError.kind === 'quota'
            ? t('options_quotaBanner')
            : t('options_saveFailed', saveError.message)}
        </Banner>
      )}
      {PROVIDER_IDS.filter((id) => store.invalidKeys[id]).map((id) => (
        <Banner key={id} tone="error">
          {t('options_invalidKeyBanner', providerLabel(id))}
        </Banner>
      ))}
      {store.broken && <Banner tone="warning">{t('options_brokenBanner')}</Banner>}

      {settings && (
        <>
          <ProviderSection
            settings={settings}
            apiKeys={store.apiKeys}
            updateSettings={store.updateSettings}
            updateApiKey={store.updateApiKey}
          />
          <LanguageSection settings={settings} updateSettings={store.updateSettings} />
          <LimitsSection settings={settings} updateSettings={store.updateSettings} />
          <RoomsSection
            rooms={store.rooms}
            updateRoom={store.updateRoom}
            deleteRoom={store.deleteRoom}
          />
          <DataSection />
        </>
      )}
    </main>
  );
}
