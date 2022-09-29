import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./style.scss";
import { gitInfo } from "../..";
import { Drawer, Empty, Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { consoleOut, isLocal, isProd, isValidAddress } from "../../middleware/ui";
import ReactGA from 'react-ga';
import { isMobile, isDesktop, isTablet, browserName, osName, osVersion, fullBrowserVersion, deviceType } from "react-device-detect";
import { environment } from "../../environments/environment";
import { GOOGLE_ANALYTICS_PROD_TAG_ID, LANGUAGES, PERFORMANCE_SAMPLE_INTERVAL, PERFORMANCE_THRESHOLD, SOLANA_STATUS_PAGE } from "../../constants";
import useLocalStorage from "../../hooks/useLocalStorage";
import { reportConnectedAccount } from "../../middleware/api";
import { Connection } from "@solana/web3.js";
import useOnlineStatus from "../../contexts/online-status";
import { segmentAnalytics } from "../../App";
import { AppUsageEvent } from "../../middleware/segment-service";
import { openNotification } from "../Notifications";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { TransactionConfirmationHistory } from "../TransactionConfirmationHistory";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../pages/accounts";
import { isUnauthenticatedRoute, shortenAddress } from "../../middleware/utils";
import { AccountDetails } from "../../models/accounts";
import { AccountSelectorModal } from "../AccountSelectorModal";
import { useAccountsContext } from "contexts/accounts";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    theme,
    tpsAvg,
    previousRoute,
    accountAddress,
    isSelectingAccount,
    previousWalletConnectState,
    setPreviousWalletConnectState,
    setNeedReloadMultisigAccounts,
    setIsSelectingAccount,
    setShouldLoadTokens,
    refreshTokenBalance,
    setDiagnosisInfo,
    setPreviousRoute,
    setSelectedAsset,
    setStreamList,
    setTpsAvg,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    clearConfirmationHistory
  } = useContext(TxConfirmationContext);
  const { t, i18n } = useTranslation("common");
  const { refreshAccount } = useAccountsContext();
  const { isOnline, responseTime } = useOnlineStatus();
  const connectionConfig = useConnectionConfig();
  const { wallet, provider, connected, publicKey, connecting, select, disconnect, isSelectingWallet } = useWallet();
  const [previousChain, setChain] = useState("");
  const [gaInitialized, setGaInitialized] = useState(false);
  const [referralAddress, setReferralAddress] = useLocalStorage('pendingReferral', '');
  const [language, setLanguage] = useState("");
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(true);

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

  // Callback to fetch performance data (TPS)
  const getPerformanceSamples = useCallback(async () => {

    const serumRpc = "https://solana-api.projectserum.com";
    const connection = new Connection(serumRpc);

    if (!connection) { return null; }

    const round = (series: number[]) => {
      return series.map((n) => Math.round(n));
    }

    try {
      const samples = await connection.getRecentPerformanceSamples(60);

      if (samples.length < 1) {
        // no samples to work with (node has no history).
        return null; // we will allow for a timeout instead of throwing an error
      }

      let tpsValues = samples
        .filter((sample) => {
            return sample.numTransactions !== 0;
        })
        .map((sample) => {
            return sample.numTransactions / sample.samplePeriodSecs;
        });

      tpsValues = round(tpsValues);
      const averageTps = Math.round(tpsValues[0]);
      return averageTps;
    } catch (error) {
      consoleOut(`getRecentPerformanceSamples failed for rpc:`, serumRpc, 'darkred');
      return null;
    }
  }, []);

  // Get Performance Samples on a timeout
  useEffect(() => {

    // Hoping this to happens once
    if (tpsAvg === undefined && needRefresh) {
      setTimeout(() => {
        setTpsAvg(null);
        setNeedRefresh(false);
      });
      getPerformanceSamples()
        .then(value => {
          if (value) {
            setTpsAvg(value);
          }
        });
    }

    // Set to run every 30 sec
    const performanceInterval = setInterval(() => {
      getPerformanceSamples()
        .then(value => {
          if (value) {
            setNeedRefresh(true);
            setTpsAvg(value);
          }
        });
      },
      PERFORMANCE_SAMPLE_INTERVAL
    );

    return () => {
      clearInterval(performanceInterval);
    };
  }, [
    tpsAvg,
    needRefresh,
    getPerformanceSamples,
    setTpsAvg,
  ]);

  const getPlatform = useCallback((): string => {
    if (isDesktop) {
      return 'Desktop';
    } else if (isTablet) {
      return 'Tablet';
    } else if (isMobile) {
      return 'Mobile';
    } else {
      return 'Other';
    }
  }, []);

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
    // Report pageview in GA only for prod
    if (environment === 'production') {
      ReactGA.pageview(location.pathname);
    }
    // Report page view in Segment
    segmentAnalytics.recordPageVisit(location.pathname)
  }, [
    publicKey,
    location.pathname,
  ]);

  // Effect Network change
  useEffect(() => {
    if (previousChain !== connectionConfig.cluster) {
      setChain(connectionConfig.cluster);
      consoleOut('Cluster:', connectionConfig.cluster, 'brown');
      setNeedRefresh(true);
    }
  }, [
    previousChain,
    connectionConfig
  ]);

  // Show Avg TPS on the console
  useEffect(() => {
    if (tpsAvg !== undefined) {
      setNeedRefresh(true);
    }
  }, [
    tpsAvg
  ]);

  // Get the current ISO language used by the user
  useEffect(() => {
    const selectedLanguage = i18n.language;
    const item = LANGUAGES.find(l => l.code === selectedLanguage)?.isoName;
    setLanguage(item || LANGUAGES[0].isoName);
  }, [i18n.language]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        setNeedReloadMultisigAccounts(true);
        if (publicKey) {
          const walletAddress = publicKey.toBase58();
          refreshAccount();

          // Record user login in Segment Analytics
          segmentAnalytics.recordIdentity(walletAddress, {
            connected: true,
            platform: getPlatform(),
            browser: browserName,
            walletProvider: provider?.name || 'Other',
            theme: theme,
            language: language
          });

          setNeedRefresh(true);

          // Record pending referral, get referrals count and clear referralAddress from localStorage
          // Only record if referral address is valid and different from wallet address
          if (referralAddress && isValidAddress(referralAddress) && referralAddress !== walletAddress) {
            reportConnectedAccount(walletAddress, referralAddress)
              .then(result => {
                setReferralAddress('');
              })
              .catch(error => console.error(error));
          } else {
            reportConnectedAccount(walletAddress)
              .then(result => consoleOut('reportConnectedAccount hit'))
              .catch(error => console.error(error));
          }
        }
        refreshTokenBalance();
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        setPreviousWalletConnectState(false);
        setNeedRefresh(true);
        setStreamList([]);
        clearConfirmationHistory();
        refreshTokenBalance();
        // Send identity to Segment if no wallew connection
        if (!publicKey) {
          segmentAnalytics.recordIdentity('', {
            connected: false,
            platform: getPlatform(),
            browser: browserName
          }, () => {
            segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnected);
          });
        }
      }
    }
  }, [
    theme,
    location,
    language,
    publicKey,
    connected,
    provider?.name,
    referralAddress,
    previousWalletConnectState,
    setPreviousWalletConnectState,
    setNeedReloadMultisigAccounts,
    clearConfirmationHistory,
    refreshTokenBalance,
    setReferralAddress,
    setSelectedAsset,
    refreshAccount,
    setStreamList,
    getPlatform,
    t,
  ]);

  // Get referral address from query string params and save it to localStorage
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('ref')) {
      const address = params.get('ref');
      if (address && isValidAddress(address)) {
        consoleOut('Referral address:', address, 'green');
        setReferralAddress(address);
        setTimeout(() => {
          if (!publicKey) {
            openNotification({
              title: t('notifications.friend-referral-completed'),
              description: t('referrals.address-processed'),
              type: "info"
            });
          }
        }, 1000);
        navigate('/');
      } else {
        consoleOut('Invalid address', '', 'red');
        openNotification({
          title: t('notifications.error-title'),
          description: t('referrals.address-invalid'),
          type: "error"
        });
        navigate('/');
      }
    }
  }, [
    location,
    publicKey,
    setReferralAddress,
    navigate,
    t,
  ]);

  useEffect(() => {
    const bodyClass = location.pathname.split('/')[1];

    const addRouteNameClass = () => {
      if (bodyClass) {
        document.body.classList.add(bodyClass);
      }
    }

    addRouteNameClass();

    if (location.pathname.startsWith(ACCOUNTS_ROUTE_BASE_PATH)) {
      setShouldLoadTokens(true);
    }

    return () => {
      if (bodyClass) {
        document.body.classList.remove(bodyClass);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Clear accounts state when leaving
  useEffect(() => {
    const isAccountPage = location.pathname.startsWith(ACCOUNTS_ROUTE_BASE_PATH);

    if (location.pathname !== previousRoute) {
      if (!isAccountPage) {
        setPreviousRoute(location.pathname);
      }
    }
  }, [location.pathname, previousRoute, setPreviousRoute]);

  const showDrawer = () => {
    setIsDrawerVisible(true);
  };

  const hideDrawer = () => {
    setIsDrawerVisible(false);
  };

  // Update diagnosis info
  useEffect(() => {
    if (connectionConfig && connectionConfig.endpoint && needRefresh) {
      const now = new Date();
      const device = getPlatform();
      const dateTime = `Client time: ${now.toUTCString()}`;
      const clientInfo = `Client software: ${deviceType} ${browserName} ${fullBrowserVersion} on ${osName} ${osVersion} (${device})`;
      const networkInfo = `Cluster: ${connectionConfig.cluster} (${connectionConfig.endpoint}) TPS: ${tpsAvg || '-'}, latency: ${responseTime}ms`;
      const accountInfo = publicKey && provider ? `Address: ${publicKey.toBase58()} (${provider.name})` : '';
      const appBuildInfo = `App package: ${process.env.REACT_APP_VERSION}, env: ${process.env.REACT_APP_ENV}, branch: ${gitInfo.branch || '-'}, build: [${gitInfo.commit.shortHash}] on ${gitInfo.commit.date}`;
      const debugInfo: AccountDetails = {
        dateTime,
        clientInfo,
        networkInfo,
        accountInfo,
        appBuildInfo
      };
      setDiagnosisInfo(debugInfo);
      setNeedRefresh(false);
    }
  }, [
    tpsAvg,
    isOnline,
    provider,
    publicKey,
    needRefresh,
    responseTime,
    connectionConfig,
    setDiagnosisInfo,
    getPlatform,
    t
  ]);

  if ((wallet && connected) || isUnauthenticatedRoute(location.pathname)) {

    if (wallet && connected && isSelectingAccount && !isUnauthenticatedRoute(location.pathname) && !isSelectingWallet) {
      return (
        <>
          {isLocal() && (
            <div className="debug-bar">
              <span>isSelectingAccount:</span><span className="ml-1 font-extrabold">{isSelectingAccount ? 'true' : 'false'}</span>
              <span className="ml-2">accountAddress:</span><span className="ml-1 font-extrabold">{accountAddress ? shortenAddress(accountAddress) : '-'}</span>
            </div>
          )}
          <AccountSelectorModal
            isVisible={isSelectingAccount}
            isFullWorkflowEnabled={true}
            onGotoSelectWallet={() => {
              disconnect();
              navigate('/');
              select();
            }}
          />
        </>
      );
    }

    // Render layout
    return (
      <>
        <div className="App">
          <Layout>
            {(isProd() && (tpsAvg !== undefined && tpsAvg !== null) && tpsAvg < PERFORMANCE_THRESHOLD) && (
              <div id="performance-warning-bar">
                <div className="sitemessage">
                  <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href={SOLANA_STATUS_PAGE}>
                    {t('notifications.network-performance-low')} [TPS: {tpsAvg}]
                  </a>
                </div>
              </div>
            )}
            <Header className="App-Bar">
              <div className="app-bar-inner">
                <Link to="/" className="flex-center">
                  <div className="app-title simplelink">
                    <img className="app-logo" src={theme === 'dark' ? '/assets/mean-logo-color-light.svg' : '/assets/mean-logo-color-dark.svg'} alt="Mean Finance" />
                  </div>
                </Link>
                <AppBar menuType="desktop" onOpenDrawer={showDrawer} topNavVisible={(location.pathname === '/ido' || location.pathname === '/ido-live') ? false : true} />
              </div>
              <AppBar menuType="mobile" topNavVisible={false} onOpenDrawer={showDrawer} />
            </Header>
            <Content>{props.children}</Content>
            <Footer>
              <FooterBar onOpenDrawer={showDrawer}/>
            </Footer>
          </Layout>
        </div>
        <Drawer
          title={<div className="ant-drawer-header-title">Recent events</div>}
          placement="right"
          width={360}
          onClose={hideDrawer}
          className="recent-events"
          open={isDrawerVisible}>
          {confirmationHistory && confirmationHistory.length > 0 ? (
            <TransactionConfirmationHistory confirmationHistory={confirmationHistory} />
          ) : (
            <div className="flex-center h-50">
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
              ? t('account-area.no-recent-events')
              : t('general.not-connected')}</p>} />
            </div>
          )}
        </Drawer>
      </>
    );
  } else {

    if (!wallet && !connected && !connecting) {
      setIsSelectingAccount(true);
      select();
    }

    return (
      <>
        <div className="background-logo-container">
          <img className="meanfi-bg-logo" src="/assets/mean-square.svg" alt="" />
        </div>
      </>
    );
  }
});
