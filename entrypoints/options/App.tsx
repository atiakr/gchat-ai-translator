import '../../src/ui/tokens.css';
import '../../src/ui/common/styles.css';
import './style.css';
import { useEffect } from 'react';
import { type I18nKey, t } from '../../src/i18n/t';
import { PROVIDER_IDS } from '../../src/settings/schema';
import { Banner } from '../../src/ui/common/Banner';
import { Button } from '../../src/ui/common/Button';
import { DataSection } from '../../src/ui/settings/DataSection';
import { LanguageSection } from '../../src/ui/settings/LanguageSection';
import { LimitsSection } from '../../src/ui/settings/LimitsSection';
import { providerLabel } from '../../src/ui/settings/options';
import { ProviderSection } from '../../src/ui/settings/ProviderSection';
import { RoomsSection } from '../../src/ui/settings/RoomsSection';
import { useSettings } from '../../src/ui/settings/useSettings';
import { useSystemTheme } from '../../src/ui/settings/useSystemTheme';

export function App() {
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
