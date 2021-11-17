import React, { useEffect } from 'react';
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from "../../contexts/appstate";
import { IconMoneyTransfer } from "../../Icons";
import { OneTimePayment, RepeatingPayment, Streams } from "../../views";
import { PreFooter } from "../../components/PreFooter";

type SwapOption = "one-time" | "recurring";

export const TransfersView = () => {
  const { publicKey } = useWallet();
  const {
    streamList,
    currentScreen,
    loadingStreams,
    setContract,
    setCurrentScreen,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [isLoading, setIsLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState<SwapOption>("one-time");

  // If the last known screen was 'streams' but there are no streams, fallback to 'contract'
  useEffect(() => {
    if (publicKey) {
      if (currentScreen === 'contract') {
        // While the contract screen is set, lets see what happens while loading and after loading
        if (loadingStreams) {
          setIsLoading(true);
        } else {
          if (streamList && streamList.length > 0) {
            setIsLoading(false);
            setCurrentScreen('streams');
          } else {
            setIsLoading(false);
            setCurrentScreen('contract');
          }
        }
      } else {
        if (!loadingStreams && streamList && streamList.length === 0) {
          setIsLoading(false);
          setCurrentScreen('contract');
        }
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

  const renderContract = () => {
    if (currentTab === "one-time") {
      return <OneTimePayment />;
    } else {
      return <RepeatingPayment />;
    }
  }

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
    if (option === "one-time") {
      setContract('One Time Payment');
    } else {
      setContract('Repeating Payment');
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
        {currentScreen === 'contract' ? (
          <>
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
          </>
        ) : (
          <Streams />
        )}
      </div>
    </div>
    <PreFooter />
    </>
  );

};
