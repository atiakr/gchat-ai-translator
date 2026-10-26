import { useId, useState } from 'react';
import type { ProviderId } from '../../config/defaults';
import { BUILTIN_PRICES_CHECKED_AT, builtinPrice } from '../../config/prices';
import { t } from '../../i18n/t';
import { type GlobalSettings, normalizeModelName, type TokenPrice } from '../../settings/schema';
import {
  isDailyLimitReached,
  resolvePrice,
  rowCost,
  summarizeUsage,
  sumRows,
  totalCost,
  type UsageRow,
} from '../../settings/usage';
import { Banner } from '../common/Banner';
import { Button } from '../common/Button';
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
 * 옵션 "사용량과 비용": 오늘·이번 달 서비스·모델별 토큰 수와 어림 금액, 활성 모델의 단가 입력.
 * 사용량은 local 기록을 읽기만 한다. 금액은 직접 입력한 단가(전역 설정, sync)가 먼저, 없으면 내장 단가로 어림한다.
 */
export function UsageSection({ settings, updateSettings, now = Date.now }: UsageSectionProps) {
  const store = useUsage();
  const at = now();
  const summary = store ? summarizeUsage(store, at) : null;
  const reached = store ? isDailyLimitReached(settings.dailyTokenLimit, store, at) : false;
  const active = settings.activeProvider;
  const model = normalizeModelName(settings.models[active]);
  const resolved = resolvePrice(active, model, settings.prices);
  const builtin = builtinPrice(active, model);
  const setCustom = (next: TokenPrice | null) => {
    const rest = Object.fromEntries(
      Object.entries(settings.prices[active]).filter(([name]) => name !== model),
    );
    // 내장 단가와 같아지면 직접 입력 항목을 두지 않는다(sync 용량 절약, 내장 단가 갱신을 그대로 받음).
    const same = next && builtin && next.input === builtin.input && next.output === builtin.output;
    return updateSettings({
      prices: { ...settings.prices, [active]: next && !same ? { ...rest, [model]: next } : rest },
    });
  };
  const savePrice = (patch: Partial<TokenPrice>) =>
    setCustom({ input: 0, output: 0, ...resolved?.price, ...patch });

  return (
    <Card title={t('options_sectionUsage')} description={t('options_sectionUsageHelp')}>
      {reached && <Banner tone="warning">{t('common_budgetReached')}</Banner>}
      {summary && (
        <>
          <UsageTable
            title={t('options_usageToday')}
            rows={summary.today}
            prices={settings.prices}
          />
          <UsageTable
            title={t('options_usageMonth')}
            rows={summary.month}
            prices={settings.prices}
          />
        </>
      )}
      {model ? (
        <PriceFields
          key={`${active}:${model}`}
          provider={active}
          model={model}
          price={resolved?.price ?? { input: 0, output: 0 }}
          custom={resolved?.custom ?? false}
          hasBuiltin={builtin !== null}
          onSave={savePrice}
          onReset={() => setCustom(null)}
        />
      ) : (
        <p className="gat-field__help">{t('options_priceNoModel')}</p>
      )}
    </Card>
  );
}

function modelLabel(model: string): string {
  return model || t('options_usageModelUnknown');
}

function CostCell({ cost }: { cost: number | null }) {
  return (
    <td className="gat-table__num">
      {cost === null ? <span className="gat-muted">–</span> : formatUsd(cost)}
    </td>
  );
}

function UsageTable({
  title,
  rows,
  prices,
}: {
  title: string;
  rows: UsageRow[];
  prices: GlobalSettings['prices'];
}) {
  const sum = sumRows(rows);
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
              <th scope="col">{t('options_usageModel')}</th>
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
            {rows.map((row) => (
              <tr key={`${row.provider}:${row.model}`}>
                <th scope="row">{providerLabel(row.provider)}</th>
                <td className={row.model ? 'gat-table__model' : 'gat-table__model gat-muted'}>
                  {modelLabel(row.model)}
                </td>
                <td className="gat-table__num">{formatInteger(row.totals.calls)}</td>
                <td className="gat-table__num">{formatInteger(row.totals.inputTokens)}</td>
                <td className="gat-table__num">{formatInteger(row.totals.outputTokens)}</td>
                <CostCell cost={rowCost(row, prices)} />
              </tr>
            ))}
          </tbody>
          {rows.length > 1 && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={2}>
                  {t('options_usageTotal')}
                </th>
                <td className="gat-table__num">{formatInteger(sum.calls)}</td>
                <td className="gat-table__num">{formatInteger(sum.inputTokens)}</td>
                <td className="gat-table__num">{formatInteger(sum.outputTokens)}</td>
                <CostCell cost={totalCost(rows, prices)} />
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}

function priceHelp(provider: ProviderId, model: string, custom: boolean, hasBuiltin: boolean) {
  if (custom) return t('options_priceHelpCustom', model);
  if (hasBuiltin) return t('options_priceHelpBuiltin', [model, BUILTIN_PRICES_CHECKED_AT]);
  return t('options_priceHelp', [providerLabel(provider), model]);
}

function PriceFields({
  provider,
  model,
  price,
  custom,
  hasBuiltin,
  onSave,
  onReset,
}: {
  provider: ProviderId;
  model: string;
  price: TokenPrice;
  custom: boolean;
  hasBuiltin: boolean;
  onSave: (patch: Partial<TokenPrice>) => void;
  onReset: () => void;
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
        {priceHelp(provider, model, custom, hasBuiltin)}
      </p>
      {custom && hasBuiltin && (
        <Button size="sm" onClick={onReset}>
          {t('options_priceReset')}
        </Button>
      )}
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
