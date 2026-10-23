import { useState } from 'react';
import { t } from '../../i18n/t';
import { Banner } from '../common/Banner';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { clearTranslationHistory } from './clearHistory';

export function DataSection() {
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const clear = async () => {
    await clearTranslationHistory();
    setConfirming(false);
    setDone(true);
  };
  return (
    <Card title={t('options_sectionData')}>
      <div className="gat-row gat-row--between gat-row--wrap">
        <div>
          <div className="gat-field__label">{t('options_clearHistory')}</div>
          <p className="gat-field__help">{t('options_clearHistoryHelp')}</p>
        </div>
        {!confirming && (
          <Button
            variant="danger"
            onClick={() => {
              setDone(false);
              setConfirming(true);
            }}
          >
            {t('options_clearHistory')}
          </Button>
        )}
      </div>
      {confirming && (
        <Banner
          tone="warning"
          actions={
            <>
              <Button size="sm" onClick={() => setConfirming(false)}>
                {t('common_cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={clear}>
                {t('common_confirm')}
              </Button>
            </>
          }
        >
          {t('options_clearHistoryConfirm')}
        </Banner>
      )}
      {done && <Banner tone="success">{t('options_clearHistoryDone')}</Banner>}
    </Card>
  );
}
