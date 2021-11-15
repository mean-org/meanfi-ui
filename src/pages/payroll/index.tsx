import React from 'react';
import { useTranslation } from "react-i18next";
import { PayrollPayment } from "../../views";
import { PreFooter } from "../../components/PreFooter";
import { IconPayroll } from '../../Icons';

export const PayrollView = () => {
  const { t } = useTranslation('common');

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="title-and-subtitle">
          <div className="title">
            <IconPayroll className="mean-svg-icons" />
            <div>{t('payroll.screen-title')}</div>
          </div>
          <div className="subtitle">
            {t('payroll.screen-subtitle')}
          </div>
        </div>
        <div className="place-transaction-box mb-3">
          <PayrollPayment />
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );

};
