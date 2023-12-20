import { useMemo } from 'react';
import { IconExchange } from 'Icons';
import { PreFooter } from 'components/PreFooter';
import { useTranslation } from 'react-i18next';
import DlnBridge from 'views/DlnBridge';
import { useLocation } from 'react-router-dom';
import { consoleOut } from 'middleware/ui';

const Bridge = () => {
  const location = useLocation();
  const { t } = useTranslation('common');

  // Parse query params
  const fromAssetSymbol = useMemo(() => {
    const params = new URLSearchParams(location.search);
    if (location.search.length) {
      consoleOut('params:', params.toString());
    }

    if (params.has('from')) {
      const symbol = params.get('from');
      if (!symbol) return undefined;
      return symbol;
    }

    return undefined;
  }, [location.search]);

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconExchange className="mean-svg-icons" />
              <div>{t('bridge.screen-title')}</div>
            </div>
            <div className="subtitle">{t('bridge.screen-subtitle')}</div>
            <div className="subtitle">{t('bridge.screen-subtitle2')}</div>
          </div>
          <DlnBridge fromAssetSymbol={fromAssetSymbol} />
        </div>
      </div>
      <PreFooter />
    </>
  );
};

export default Bridge;
