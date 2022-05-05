import React, { useEffect } from 'react';
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { IconMoneyTransfer } from "../../Icons";
import { OneTimePayment, RepeatingPayment } from "../../views";
import { PreFooter } from "../../components/PreFooter";

type TransfersTabOption = "one-time" | "recurring";

export const TransfersView = () => {
  const {
    tokenList,
    selectedToken,
    setSelectedToken,
    setContract,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [currentTab, setCurrentTab] = useState<TransfersTabOption>("one-time");

  const renderContract = () => {
    if (currentTab === "one-time") {
      return <OneTimePayment inModal={false} />;
    } else {
      return <RepeatingPayment inModal={false} />;
    }
  }

  const onTabChange = (option: TransfersTabOption) => {
    setCurrentTab(option);
    if (option === "one-time") {
      setContract('One Time Payment');
    } else {
      setContract('Repeating Payment');
    }
  }

  // Auto select a token
  useEffect(() => {

    if (tokenList && !selectedToken) {
      setSelectedToken(tokenList.find(t => t.symbol === 'MEAN'));
    }

    return () => { };
  }, [
    tokenList,
    selectedToken,
    setSelectedToken
  ]);

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="title-and-subtitle">
          <div className="title">
            <IconMoneyTransfer className="mean-svg-icons" />
            <div>{t('transfers.screen-title')}</div>
          </div>
          <div className="subtitle">
            {t('transfers.screen-subtitle')}
          </div>
        </div>
        <div className="place-transaction-box mb-3">
          <div className="button-tabset-container">
            <div className={`tab-button ${currentTab === "one-time" ? 'active' : ''}`} onClick={() => onTabChange("one-time")}>
              {t('swap.tabset.one-time')}
            </div>
            <div className={`tab-button ${currentTab === "recurring" ? 'active' : ''}`} onClick={() => onTabChange("recurring")}>
              {t('swap.tabset.recurring')}
            </div>
          </div>
          {renderContract()}
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );

};
