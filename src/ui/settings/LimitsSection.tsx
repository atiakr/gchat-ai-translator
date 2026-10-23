import { useId, useState } from 'react';
import { t } from '../../i18n/t';
import type { GlobalSettings } from '../../settings/schema';
import { Card } from '../common/Card';
import { Field } from '../common/Field';
import { TextField } from '../common/TextField';
import { useDraft } from './useDraft';

export interface LimitsSectionProps {
  settings: GlobalSettings;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
}

/** 1 이상의 정수만 허용. */
export function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function LimitsSection({ settings, updateSettings }: LimitsSectionProps) {
  const ids = useId();
  return (
    <Card title={t('options_sectionLimits')}>
      <NumberField
        id={`${ids}-chars`}
        label={t('options_maxMessageChars')}
        help={t('options_maxMessageCharsHelp')}
        value={settings.maxMessageChars}
        onCommit={(maxMessageChars) => updateSettings({ maxMessageChars })}
      />
      <NumberField
        id={`${ids}-room`}
        label={t('options_maxAutoPerRoom')}
        help={t('options_maxAutoPerRoomHelp')}
        value={settings.maxAutoPerRoom}
        onCommit={(maxAutoPerRoom) => updateSettings({ maxAutoPerRoom })}
      />
    </Card>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  help: string;
  value: number;
  onCommit: (value: number) => void;
}

function NumberField({ id, label, help, value, onCommit }: NumberFieldProps) {
  const [error, setError] = useState<string | null>(null);
  const draft = useDraft(String(value), (next) => {
    const n = parsePositiveInt(next);
    if (n === null) {
      setError(t('options_limitInvalid'));
      return;
    }
    setError(null);
    onCommit(n);
  });
  return (
    <Field htmlFor={id} label={label} help={help} error={error}>
      <TextField
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={draft.draft}
        aria-invalid={error ? true : undefined}
        onChange={(v) => {
          setError(parsePositiveInt(v) === null ? t('options_limitInvalid') : null);
          draft.setDraft(v);
        }}
        onBlur={draft.commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') draft.commit();
        }}
      />
    </Field>
  );
}
