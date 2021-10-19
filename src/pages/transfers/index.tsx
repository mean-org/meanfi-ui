import React, { useEffect } from 'react';
import { useCallback, useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { ContractSelectorModal } from "../../components/ContractSelectorModal";
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from "../../contexts/appstate";
import { IconCaretDown } from "../../Icons";
import { OneTimePayment, RepeatingPayment, PayrollPayment, Streams } from "../../views";
import { PreFooter } from "../../components/PreFooter";

export const TransfersView = () => {
  const { publicKey } = useWallet();
  const {
    contract,
    streamList,
    currentScreen,
    setCurrentScreen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  // If the last known screen was 'streams' but there are no streams, fallback to 'contract'
  useEffect(() => {
    if (publicKey && currentScreen === 'streams' && (!streamList || streamList.length === 0)) {
      setCurrentScreen('contract');
    }
  }, [
    publicKey,
    streamList,
    currentScreen,
    setCurrentScreen
  ]);

  // Contract switcher modal
  const [isContractSelectorModalVisible, setIsContractSelectorModalVisibility] = useState(false);
  const showContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(true), []);
  const closeContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(false), []);
  const onAcceptContractSelector = () => {
    // Do something and close the modal
    closeContractSelectorModal();
  };

  const renderContract = () => {
    switch(contract?.id) {
      case 1:   return <OneTimePayment />;
      case 2:   return <RepeatingPayment />;
      case 3:   return <PayrollPayment />;
      default:  return null;
    }
  }

  // CONTRACT SETUP SCREEN
  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        {currentScreen === 'streams' ? (
          <Streams />
        ) : (
          <div className="place-transaction-box mb-3">
            <div className="position-relative mb-2">
              {contract && (
                <>
                  <h2 className="contract-heading simplelink" onClick={showContractSelectorModal}>{t(`contract-selector.${contract.translationId}.name`)}<IconCaretDown className="mean-svg-icons" /></h2>
                  <p>{t(`contract-selector.${contract.translationId}.description`)}</p>
                </>
              )}
            </div>
            {/* Display apropriate contract setup screen */}
            {renderContract()}
            <ContractSelectorModal
              isVisible={isContractSelectorModalVisible}
              handleOk={onAcceptContractSelector}
              handleClose={closeContractSelectorModal}/>
          </div>
        )}
      </div>
    </div>
    <PreFooter />
    </>
  );

};
