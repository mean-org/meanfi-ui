import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./../../App.less";
import { AppConfig } from "../..";
import { Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { notify } from "../../utils/notifications";
import { consoleOut } from "../../utils/ui";
import ReactGA from 'react-ga';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { isMobile, isDesktop, isTablet, browserName } from "react-device-detect";
import { environment } from "../../environments/environment";
import { GOOGLE_ANALYTICS_PROD_TAG_ID } from "../../constants";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const {
    theme,
    currentScreen,
    detailsPanelOpen,
    addAccountPanelOpen,
    canShowAccountDetails,
    previousWalletConnectState,
    setStreamList,
    setCurrentScreen,
    setSelectedAsset,
    setAccountAddress,
    refreshTokenBalance,
    refreshStreamList,
    setDtailsPanelOpen,
    setAddAccountPanelOpen,
    setCanShowAccountDetails,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);

  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { provider, connected, publicKey } = useWallet();
  const [previousChain, setChain] = useState("");
  const [gaInitialized, setGaInitialized] = useState(false);

  const getPlatform = (): string => {
    return isDesktop ? 'Desktop' : isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Other';
  }

  const sendConnectionMetric = useCallback((address: string) => {
    const url = AppConfig.getConfig().influxDbUrl;
    const token = AppConfig.getConfig().influxDbToken;
    const org = AppConfig.getConfig().influxDbOrg;
    const bucket = AppConfig.getConfig().influxDbBucket;
    const writeApi = new InfluxDB({url, token}).getWriteApi(org, bucket);
    const data = {
      platform: getPlatform(),
      browser: browserName,
      'wallet_address': address,
      'wallet_type': provider?.name || 'Other'
    };
    writeApi.useDefaultTags({
      platform: getPlatform(),
      browser: browserName
    });

    const point1 = new Point('wallet_account_connections')
      .tag('wallet_address', address)
      .tag('wallet_type', provider?.name || 'Other')
      .intField('value', 1);

    writeApi.writePoint(point1);

    // flush pending writes and close writeApi
    writeApi
      .close()
      .then(() => {
        consoleOut('InfluxDB write API - WRITE FINISHED', data, 'green');
      })
      .catch(e => {
        consoleOut('InfluxDB write API - WRITE FAILED', e, 'red');
      })
  }, [provider]);

  // Init Google Analytics
  useEffect(() => {
    if (!gaInitialized && environment === 'production') {
      setGaInitialized(true);
      ReactGA.initialize(GOOGLE_ANALYTICS_PROD_TAG_ID, {
        gaOptions: {
          siteSpeedSampleRate: 100
        }
      });
    }
  }, [gaInitialized]);

  // Report route
  useEffect(() => {
    if (environment === 'production') {
      ReactGA.pageview(location.pathname);
    }
  }, [location.pathname]);

  // Effect Network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      consoleOut('Cluster:', connectionConfig.env, 'brown');
    }
  }, [
    previousChain,
    connectionConfig
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('User is connecting...', '', 'blue');
        if (publicKey) {
          sendConnectionMetric(publicKey.toBase58());

          // Let the AppState know which wallet address is connected and save it
          setAccountAddress(publicKey.toBase58());
          setSelectedAsset(undefined);

          if (location.pathname === '/transfers') {
            refreshStreamList(true);
          }
        }
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setPreviousWalletConnectState(false);
        setStreamList([]);
        setCurrentScreen('contract');
        refreshTokenBalance();
        notify({
          message: t('notifications.wallet-connection-event-title'),
          description: t('notifications.wallet-disconnect-message'),
          type: 'info'
        });
      }
    }
  }, [
    location,
    publicKey,
    connected,
    previousWalletConnectState,
    t,
    setStreamList,
    setCurrentScreen,
    setSelectedAsset,
    setAccountAddress,
    refreshStreamList,
    refreshTokenBalance,
    sendConnectionMetric,
    setPreviousWalletConnectState
  ]);

  const closeAllPanels = () => {
    if (detailsPanelOpen) {
      setDtailsPanelOpen(false);
    } else if (addAccountPanelOpen) {
      setCanShowAccountDetails(true);
      setAddAccountPanelOpen(false);
    }
  }

  return (
    <>
    <div className="App wormhole-bg">
      <Layout>
        <Header className="App-Bar">
          {(detailsPanelOpen || (addAccountPanelOpen && !canShowAccountDetails)) && (
            <BackButton handleClose={() => closeAllPanels()} />
          )}
          <div className="app-bar-inner">
            <Link to="/" className="flex-center">
              <div className="app-title simplelink">
                <img className="app-logo" src={theme === 'dark' ? 'assets/mean-pay-logo-color-light.svg' : 'assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
              </div>
            </Link>
            <AppBar menuType="desktop" />
          </div>
          <AppBar menuType="mobile" />
          {environment === 'local' && (
            <div className="debug-bar">
              <span className="ml-1">currentScreen:</span><span className="ml-1 font-bold fg-dark-active">{currentScreen}</span>
            </div>
          )}
        </Header>
        <Content>{props.children}</Content>
        <Footer>
          <FooterBar/>
        </Footer>
      </Layout>
    </div>
    </>
  );
});
