import { IconExchange } from 'Icons';
import { PreFooter } from 'components/PreFooter';
import React from 'react';
import { useTranslation } from 'react-i18next';

const Bridge = () => {
  const { t } = useTranslation('common');

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
          <div className="place-transaction-box mb-3">Widget here</div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};

export default Bridge;
