import { useEffect, useState } from 'react';

import { IconExchange } from 'Icons';
import { PreFooter } from 'components/PreFooter';
import { useScript } from 'hooks/useScript';
import { useTranslation } from 'react-i18next';
import { Empty, Spin } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';
import './style.scss';

const loadIndicator = <LoadingOutlined style={{ fontSize: 48 }} spin />;

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
    if (status === 'loading') {
      setWidgetInitStatus('initializing');
    } else if (status === 'ready') {
      if (typeof deBridge !== 'undefined') {
        deBridge.widget({
          v: '1',
          element: 'debridgeWidget',
          title: '',
          description: '',
          width: '600',
          height: '700',
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
            'eyJhcHBCYWNrZ3JvdW5kIjoiIzFjMWYzMCIsImFwcEFjY2VudEJnIjoicmdiYSgxMyw5LDI2LDAuNzUpIiwiYmFkZ2UiOiJyZ2JhKDE5NSwwLDAsMC43MykiLCJib3JkZXJSYWRpdXMiOjgsImZvcm1Db250cm9sQmciOiJyZ2JhKDAsMCwwLDAuMjUpIiwiZHJvcGRvd25CZyI6IiMxYzFmMzAiLCJwcmltYXJ5IjoiI2I3MDAxYyIsInNlY29uZGFyeSI6IiMyYTJhMmEiLCJzdWNjZXNzIjoiIzQ5YWExOSIsImVycm9yIjoiI2E2MWQyNCIsIndhcm5pbmciOiIjZDg5NjE0IiwiaWNvbkNvbG9yIjoiI2ZmMDAxNyIsImZvbnRDb2xvckFjY2VudCI6IiNmZjAwMTciLCJmb250RmFtaWx5IjoiTGF0byIsInByaW1hcnlCdG5UZXh0IjoicmdiYSgyNTUsMjU1LDI1NSwwLjg1KSIsInNlY29uZGFyeUJ0blRleHQiOiJyZ2JhKDI1NSwyNTUsMjU1LDAuODUpIn0=',
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
          <div id="debridgeWidget" className="place-transaction-box">
            {widgetInitStatus === 'initializing' ? (
              <div className="flex flex-center h-100 w-100">
                <Spin indicator={loadIndicator} spinning={status === 'loading'} />
              </div>
            ) : null}
            {widgetInitStatus === 'init-failure' ? (
              <div className="flex flex-center h-100 w-100">
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('bridge.loading-error')}</p>} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};

export default Bridge;
