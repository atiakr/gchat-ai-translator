import { useId, useState } from 'react';
import type { ProviderId } from '../../config/defaults';
import { t } from '../../i18n/t';
import { type GlobalSettings, PROVIDER_IDS, type TokenPrice } from '../../settings/schema';
import {
  estimateCost,
  isDailyLimitReached,
  summarizeUsage,
  totalTokens,
  type UsageByProvider,
} from '../../settings/usage';
import { Banner } from '../common/Banner';
import { Card } from '../common/Card';
import { Field } from '../common/Field';
import { TextField } from '../common/TextField';
import { providerLabel } from './options';
import { formatInteger, formatUsd, parsePrice } from './usageFormat';
import { useDraft } from './useDraft';
import { useUsage } from './useUsage';

export interface UsageSectionProps {
  settings: GlobalSettings;
  updateSettings: (patch: Partial<GlobalSettings>) => Promise<boolean>;
  now?: () => number;
}

/**
 * 옵션 "사용량과 비용": 오늘·이번 달 서비스별 토큰 수와 어림 금액, 활성 서비스의 단가 입력.
 * 사용량은 local 기록을 읽기만 한다. 단가는 전역 설정(sync)에 저장된다.
 */
export function UsageSection({ settings, updateSettings, now = Date.now }: UsageSectionProps) {
  const store = useUsage();
  const at = now();
  const summary = store ? summarizeUsage(store, at) : null;
  const reached = store ? isDailyLimitReached(settings.dailyTokenLimit, store, at) : false;
  const active = settings.activeProvider;
  const savePrice = (patch: Partial<TokenPrice>) =>
    updateSettings({
      prices: { ...settings.prices, [active]: { ...settings.prices[active], ...patch } },
    });

  return (
    <Card title={t('options_sectionUsage')} description={t('options_sectionUsageHelp')}>
      {reached && <Banner tone="warning">{t('common_budgetReached')}</Banner>}
      {summary && (
        <>
          <UsageTable
            title={t('options_usageToday')}
            usage={summary.today}
            prices={settings.prices}
          />
          <UsageTable
            title={t('options_usageMonth')}
            usage={summary.month}
            prices={settings.prices}
          />
        </>
      )}
      <PriceFields provider={active} price={settings.prices[active]} onSave={savePrice} />
    </Card>
  );
}

function UsageTable({
  title,
  usage,
  prices,
}: {
  title: string;
  usage: UsageByProvider;
  prices: GlobalSettings['prices'];
}) {
  const rows = PROVIDER_IDS.filter((id) => usage[id].calls > 0 || totalTokens(usage[id]) > 0);
  return (
    <div className="gat-usage">
      <h3 className="gat-usage__title">{title}</h3>
      {rows.length === 0 ? (
        <p className="gat-field__help">{t('options_usageEmpty')}</p>
      ) : (
        <table className="gat-table">
          <thead>
            <tr>
              <th scope="col">{t('options_usageProvider')}</th>
              <th scope="col" className="gat-table__num">
                {t('options_usageCalls')}
              </th>
              <th scope="col" className="gat-table__num">
                {t('options_usageInputTokens')}
              </th>
              <th scope="col" className="gat-table__num">
                {t('options_usageOutputTokens')}
              </th>
              <th scope="col" className="gat-table__num">
                {t('options_usageCost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((id) => {
              const cost = estimateCost(usage[id], prices[id]);
              return (
                <tr key={id}>
                  <th scope="row">{providerLabel(id)}</th>
                  <td className="gat-table__num">{formatInteger(usage[id].calls)}</td>
                  <td className="gat-table__num">{formatInteger(usage[id].inputTokens)}</td>
                  <td className="gat-table__num">{formatInteger(usage[id].outputTokens)}</td>
                  <td className="gat-table__num">
                    {cost === null ? <span className="gat-muted">–</span> : formatUsd(cost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PriceFields({
  provider,
  price,
  onSave,
}: {
  provider: ProviderId;
  price: TokenPrice;
  onSave: (patch: Partial<TokenPrice>) => void;
}) {
  const ids = useId();
  return (
    <div className="gat-row gat-row--wrap gat-usage__prices">
      <PriceField
        id={`${ids}-in`}
        label={t('options_priceInput')}
        value={price.input}
        onCommit={(input) => onSave({ input })}
      />
      <PriceField
        id={`${ids}-out`}
        label={t('options_priceOutput')}
        value={price.output}
        onCommit={(output) => onSave({ output })}
      />
      <p className="gat-field__help gat-usage__priceHelp">
        {t('options_priceHelp', providerLabel(provider))}
      </p>
    </div>
  );
}

function PriceField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const draft = useDraft(value === 0 ? '' : String(value), (next) => {
    const n = parsePrice(next);
    if (n === null) {
      setError(t('options_priceInvalid'));
      return;
    }
    setError(null);
    onCommit(n);
  });
  return (
    <Field htmlFor={id} label={label} error={error}>
      <TextField
        id={id}
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={draft.draft}
        aria-invalid={error ? true : undefined}
        onChange={(v) => {
          setError(parsePrice(v) === null ? t('options_priceInvalid') : null);
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
