import React from 'react';
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PayrollPayment } from "../../views";
import { PreFooter } from "../../components/PreFooter";
import { PAYROLL_CONTRACT } from "../../constants";
import { ContractDefinition } from "../../models/contract-definition";

export const PayrollView = () => {
  const [contract] = useState<ContractDefinition>(PAYROLL_CONTRACT);
  const { t } = useTranslation('common');

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box mb-3">
          <div className="position-relative mb-2">
            {contract && (
              <>
                <h2 className="contract-heading">{t(`contract-selector.${contract.translationId}.name`)}</h2>
                <p>{t(`contract-selector.${contract.translationId}.description`)}</p>
              </>
            )}
          </div>
          <PayrollPayment />
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );

};
