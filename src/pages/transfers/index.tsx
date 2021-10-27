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
    loadingStreams,
    setCurrentScreen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(false);

  // If the last known screen was 'streams' but there are no streams, fallback to 'contract'
  useEffect(() => {
    if (publicKey) {
      if (!streamList && loadingStreams) {
        setIsLoading(true);
      } else if (!loadingStreams && currentScreen === 'streams' && streamList && streamList.length === 0) {
        setCurrentScreen('contract');
        setIsLoading(false);
      } else {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, [
    publicKey,
    streamList,
    currentScreen,
    loadingStreams,
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

  if (isLoading) {
    return (
      <div className="flex-center h-100">
        <div className="loading-screen-container flex-center">
          <div className="flex-column flex-center">
            <div className="loader-container">
              <div className="app-loading">
                <div className="logo" style={{display: 'none'}}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 245 238" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                    <path d="M238.324 75l-115.818 30.654L6.689 75 0 128.402l47.946 122.08L122.515 313l74.55-62.518L245 128.402 238.324 75zm-21.414 29.042l3.168 25.313-42.121 107.268-26.849 22.511 37.922-120.286-48.471 12.465-8.881 107.524-9.176 24.128-9.174-24.128-8.885-107.524-48.468-12.465 37.922 120.286-26.85-22.511-42.118-107.268 3.167-25.313 94.406 24.998 94.408-24.998z" fill="url(#_Linear1)" transform="translate(0 -64)"/>
                    <defs>
                      <linearGradient id="_Linear1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 238 -238 0 122.5 75)">
                        <stop offset="0" stopColor="#ff0017"/><stop offset="1" stopColor="#b7001c"/>
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <svg className="spinner" viewBox="25 25 50 50">
                  <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="2" strokeMiterlimit="10"/>
                </svg>
              </div>
            </div>
            <p className="loader-message">{t('general.loading')}</p>
          </div>
        </div>
      </div>
    );
  }

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
