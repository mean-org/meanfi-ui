import { useEffect, useState } from 'react';

import { IconExchange } from 'Icons';
import { PreFooter } from 'components/PreFooter';
import { useScript } from 'hooks/useScript';
import { useTranslation } from 'react-i18next';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const deBridge: any;

type BridgeWidgetInitStatus = 'initializing' | 'ini-success' | 'init-failure';

const Bridge = () => {
  const { t } = useTranslation('common');

  const status = useScript(`https://app.debridge.finance/assets/scripts/widget.js`, {
    removeOnUnmount: false,
  });

  const [widgetInitStatus, setWidgetInitStatus] = useState<BridgeWidgetInitStatus>('initializing');

  useEffect(() => {
    console.log('status:', status);
    if (status === 'loading') {
      setWidgetInitStatus('initializing');
    } else if (status === 'ready') {
      console.log('deBridge:', deBridge);
      if (typeof deBridge !== 'undefined') {
        deBridge.widget({
          v: '1',
          element: 'debridgeWidget',
          title: '',
          description: '',
          width: '600',
          height: '640',
          r: null,
          supportedChains:
            '{"inputChains":{"1":"all","10":"all","56":"all","137":"all","8453":"all","42161":"all","43114":"all","59144":"all","7565164":"all"},"outputChains":{"1":"all","10":"all","56":"all","137":"all","8453":"all","42161":"all","43114":"all","59144":"all","7565164":"all"}}',
          inputChain: 7565164,
          outputChain: 1,
          inputCurrency: '',
          outputCurrency: '',
          address: '',
          showSwapTransfer: true,
          amount: '',
          outputAmount: '',
          isAmountFromNotModifiable: false,
          isAmountToNotModifiable: false,
          lang: 'en',
          mode: 'deswap',
          isEnableCalldata: false,
          styles:
            'eyJhcHBCYWNrZ3JvdW5kIjoicmdiYSgwLDAsMCwwKSIsImFwcEFjY2VudEJnIjoicmdiYSgwLDAsMCwwLjMpIiwiY2hhcnRCZyI6IiMwMDAwMDAiLCJiYWRnZSI6IiM4OTAwMTQiLCJib3JkZXJSYWRpdXMiOjgsImZvcm1Db250cm9sQmciOiJyZ2JhKDAsMCwwLDAuMjUpIiwicHJpbWFyeSI6IiNiNzAwMWMiLCJzZWNvbmRhcnkiOiIjODkwMDE0Iiwic3VjY2VzcyI6IiM0OWFhMTkiLCJlcnJvciI6IiNhNjFkMjQiLCJ3YXJuaW5nIjoiI2Q4OTYxNCIsImljb25Db2xvciI6IiNmZjAwMTciLCJmb250Q29sb3JBY2NlbnQiOiIjZmYwMDE3IiwiZm9udEZhbWlseSI6IkxhdG8iLCJwcmltYXJ5QnRuVGV4dCI6InJnYmEoMjU1LDI1NSwyNTUsMC44NSkifQ==',
          theme: 'dark',
          isHideLogo: false,
          logo: 'https://app.meanfi.com/assets/mean-logo-color-light.svg',
        });

        setWidgetInitStatus('ini-success');
      } else {
        setWidgetInitStatus('init-failure');
      }
    } else if (status === 'error') {
      setWidgetInitStatus('init-failure');
    }
  }, [status]);

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
          </div>
          <div
            className="place-transaction-box mb-3"
            style={{ width: 'auto', minWidth: 450, maxWidth: 'max-content', minHeight: 450 }}
          >
            {widgetInitStatus === 'initializing' ? <p>Loading...</p> : null}
            {widgetInitStatus === 'init-failure' ? <p>Init error</p> : null}
            <div id="debridgeWidget"></div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};

export default Bridge;
