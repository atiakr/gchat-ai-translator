import { useId } from 'react';
import { t } from '../../i18n/t';
import type { GlobalSettings } from '../../settings/schema';
import { Card } from '../common/Card';
import { Field } from '../common/Field';
import { Select } from '../common/Select';
import { languageOptions } from './options';
import { useDraft } from './useDraft';

export interface LanguageSectionProps {
  settings: GlobalSettings;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
}

export function LanguageSection({ settings, updateSettings }: LanguageSectionProps) {
  const ids = useId();
  const langs = languageOptions();
  const instructions = useDraft(settings.instructions, (next) => {
    updateSettings({ instructions: next });
  });
  return (
    <Card title={t('options_sectionLanguage')}>
      <Field htmlFor={`${ids}-target`} label={t('options_targetLang')}>
        <Select
          id={`${ids}-target`}
          value={settings.targetLang}
          options={langs}
          onChange={(targetLang) => updateSettings({ targetLang })}
        />
      </Field>
      <Field htmlFor={`${ids}-outgoing`} label={t('options_outgoingLang')}>
        <Select
          id={`${ids}-outgoing`}
          value={settings.outgoingLang}
          options={langs}
          onChange={(outgoingLang) => updateSettings({ outgoingLang })}
        />
      </Field>
      <Field
        htmlFor={`${ids}-instructions`}
        label={t('options_instructions')}
        help={t('options_instructionsHelp')}
      >
        <textarea
          id={`${ids}-instructions`}
          className="gat-textarea"
          value={instructions.draft}
          onChange={(e) => instructions.setDraft(e.target.value)}
          onBlur={instructions.commit}
          placeholder={t('options_instructionsPlaceholder')}
          rows={3}
        />
      </Field>
    </Card>
  );
}
