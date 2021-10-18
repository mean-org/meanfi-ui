import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, Redirect, useLocation } from "react-router-dom";
import "./../../App.less";
import "./style.less";
import { appConfig } from "../..";
import { Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { notify } from "../../utils/notifications";
import { consoleOut, isValidAddress } from "../../utils/ui";
import ReactGA from 'react-ga';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { isMobile, isDesktop, isTablet, browserName } from "react-device-detect";
import { environment } from "../../environments/environment";
import { GOOGLE_ANALYTICS_PROD_TAG_ID } from "../../constants";
import useLocalStorage from "../../hooks/useLocalStorage";
import { reportConnectedAccount } from "../../utils/api";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const [redirect, setRedirect] = useState<string | null>(null);

  const {
    theme,
    referrals,
    detailsPanelOpen,
    addAccountPanelOpen,
    canShowAccountDetails,
    previousWalletConnectState,
    setReferrals,
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
  const [referralAddress, setReferralAddress] = useLocalStorage('pendingReferral', '');

  // Clear cachedRpc on App destroy (window is being reloaded)
  useEffect(() => {
    window.addEventListener('beforeunload', handleTabClosingOrPageRefresh)
    return () => {
        window.removeEventListener('beforeunload', handleTabClosingOrPageRefresh)
    }
  })

  const handleTabClosingOrPageRefresh = () => {
    window.localStorage.removeItem('cachedRpc');
  }

  const getPlatform = (): string => {
    return isDesktop ? 'Desktop' : isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Other';
  }

  const sendConnectionMetric = useCallback((address: string) => {
    const url = appConfig.getConfig().influxDbUrl;
    const token = appConfig.getConfig().influxDbToken;
    const org = appConfig.getConfig().influxDbOrg;
    const bucket = appConfig.getConfig().influxDbBucket;
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
    if (previousChain !== connectionConfig.cluster) {
      setChain(connectionConfig.cluster);
      consoleOut('Cluster:', connectionConfig.cluster, 'brown');
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
          const walletAddress = publicKey.toBase58();
          sendConnectionMetric(walletAddress);

          // Record pending referral, get referrals count and clear referralAddress from localStorage
          // Only record if referral address is valid and different from wallet address
          if (referralAddress && isValidAddress(referralAddress) && referralAddress !== walletAddress) {
            reportConnectedAccount(walletAddress, referralAddress)
              .then(result => {
                setReferralAddress('');
              })
              .catch(error => console.error(error));
          } else {
            reportConnectedAccount(walletAddress).then(result => consoleOut('reportConnectedAccount hit'));
          }
          // Let the AppState know which wallet address is connected and save it
          setAccountAddress(walletAddress);
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
    referrals,
    referralAddress,
    previousWalletConnectState,
    t,
    setReferrals,
    setStreamList,
    setCurrentScreen,
    setSelectedAsset,
    setAccountAddress,
    refreshStreamList,
    setReferralAddress,
    refreshTokenBalance,
    sendConnectionMetric,
    setPreviousWalletConnectState
  ]);

  // Get referral address from query string params and save it to localStorage
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('ref')) {
      const address = params.get('ref');
      if (address && isValidAddress(address)) {
        consoleOut('Referral address:', address, 'green');
        setReferralAddress(address);
        notify({
          message: t('notifications.friend-referral-completed'),
          description: t('referrals.address-processed'),
          type: "info"
        });
        setRedirect('/');
      } else {
        consoleOut('Invalid address', '', 'red');
        notify({
          message: t('notifications.error-title'),
          description: t('referrals.address-invalid'),
          type: "error"
        });
        setRedirect('/');
      }
    }
  }, [
    location,
    t,
    setReferralAddress,
  ]);

  useEffect(() => {
    const bodyClass = location.pathname.split('/')[1];

    const addRouteNameClass = () => {
      if (bodyClass) {
        document.body.classList.add(bodyClass);
      }
    }

    addRouteNameClass();

    return () => {
      if (bodyClass) {
        document.body.classList.remove(bodyClass);
      }
    };
  }, [location.pathname]);

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
    {redirect && <Redirect to={redirect} />}
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
          {/* {environment === 'local' && (
            <div className="debug-bar">
              <span className="ml-1">currentScreen:</span><span className="ml-1 font-bold fg-dark-active">{currentScreen}</span>
            </div>
          )} */}
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
