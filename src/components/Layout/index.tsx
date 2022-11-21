import { Connection } from '@solana/web3.js';
import { Drawer, Empty, Layout } from 'antd';
import { segmentAnalytics } from 'App';
import { AccountSelectorModal } from 'components/AccountSelectorModal';
import { AppBar } from 'components/AppBar';
import { FooterBar } from 'components/FooterBar';
import { openNotification } from 'components/Notifications';
import { TransactionConfirmationHistory } from 'components/TransactionConfirmationHistory';
import {
  CREATE_SAFE_ROUTE_PATH,
  GOOGLE_ANALYTICS_PROD_TAG_ID,
  LANGUAGES,
  PERFORMANCE_SAMPLE_INTERVAL,
  PERFORMANCE_THRESHOLD,
  SOLANA_STATUS_PAGE,
} from 'constants/common';
import { useAccountsContext } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import useOnlineStatus from 'contexts/online-status';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import useLocalStorage from 'hooks/useLocalStorage';
import { gitInfo } from 'index';
import { reportConnectedAccount } from 'middleware/api';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, isProd, isValidAddress } from 'middleware/ui';
import { isUnauthenticatedRoute } from 'middleware/utils';
import { AccountDetails } from 'models/accounts';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  browserName,
  deviceType,
  fullBrowserVersion,
  isDesktop,
  isMobile,
  isTablet,
  osName,
  osVersion,
} from 'react-device-detect';
import ReactGA from 'react-ga';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './style.scss';
import './xnft.scss';

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    theme,
    tpsAvg,
    selectedAccount,
    lastUsedAccount,
    isSelectingAccount,
    previousWalletConnectState,
    setPreviousWalletConnectState,
    setNeedReloadMultisigAccounts,
    setIsSelectingAccount,
    refreshTokenBalance,
    setSelectedAccount,
    setDiagnosisInfo,
    setSelectedAsset,
    setStreamList,
    setTpsAvg,
  } = useContext(AppStateContext);
  const { confirmationHistory, clearConfirmationHistory } = useContext(
    TxConfirmationContext,
  );
  const { t, i18n } = useTranslation('common');
  const { refreshAccount } = useAccountsContext();
  const { isOnline, responseTime } = useOnlineStatus();
  const connectionConfig = useConnectionConfig();
  const {
    wallet,
    provider,
    connected,
    publicKey,
    connecting,
    select,
    disconnect,
    isSelectingWallet,
  } = useWallet();
  const [previousChain, setChain] = useState('');
  const [gaInitialized, setGaInitialized] = useState(false);
  const [referralAddress, setReferralAddress] = useLocalStorage(
    'pendingReferral',
    '',
  );
  const [language, setLanguage] = useState('');
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [shouldSelectAccount, setShouldSelectAccount] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(true);

  ///////////////
  // Callbacks //
  ///////////////

  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  // Fetch performance data (TPS)
  const getPerformanceSamples = useCallback(async () => {

    if (!connection) {
      return null;
    }

    const round = (series: number[]) => {
      return series.map(n => Math.round(n));
    };

    try {
      const samples = await connection.getRecentPerformanceSamples(60);

      if (samples.length < 1) {
        // no samples to work with (node has no history).
        return null; // we will allow for a timeout instead of throwing an error
      }

      let tpsValues = samples
        .filter(sample => {
          return sample.numTransactions !== 0;
        })
        .map(sample => {
          return sample.numTransactions / sample.samplePeriodSecs;
        });

      tpsValues = round(tpsValues);
      const averageTps = Math.round(tpsValues[0]);
      return averageTps;
    } catch (error) {
      consoleOut(`getRecentPerformanceSamples`, '', 'darkred');
      return null;
    }
  }, [connection]);

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

  const needAccountSelection = useCallback(() => {
    if (!isUnauthenticatedRoute(location.pathname) && !isSelectingWallet) {
      return false;
    }

    if (isSelectingAccount) {
      return true;
    }

    if (
      wallet &&
      publicKey &&
      connected &&
      selectedAccount.address &&
      lastUsedAccount &&
      (lastUsedAccount.owner === publicKey.toBase58() ||
        lastUsedAccount.address === publicKey.toBase58()) &&
      selectedAccount.address === lastUsedAccount.address
    ) {
      return false;
    }

    return true;
  }, [
    connected,
    isSelectingAccount,
    isSelectingWallet,
    lastUsedAccount,
    location.pathname,
    publicKey,
    selectedAccount.address,
    wallet,
  ]);

  ////////////////
  // UseEffects //
  ////////////////

  // Clear cachedRpc on App destroy (window is being reloaded)
  useEffect(() => {
    window.addEventListener('beforeunload', handleTabClosingOrPageRefresh);
    return () => {
      window.removeEventListener('beforeunload', handleTabClosingOrPageRefresh);
    };
  });

  // Get Performance Samples on a timeout
  useEffect(() => {
    // Hoping this to happens once
    if (tpsAvg === undefined && needRefresh) {
      setTimeout(() => {
        setTpsAvg(null);
        setNeedRefresh(false);
      });
      getPerformanceSamples().then(value => {
        if (value) {
          setTpsAvg(value);
        }
      });
    }

    // Set to run every 30 sec
    const performanceInterval = setInterval(() => {
      getPerformanceSamples().then(value => {
        if (value) {
          setNeedRefresh(true);
          setTpsAvg(value);
        }
      });
    }, PERFORMANCE_SAMPLE_INTERVAL);

    return () => {
      clearInterval(performanceInterval);
    };
  }, [tpsAvg, needRefresh, getPerformanceSamples, setTpsAvg]);

  // Init Google Analytics
  useEffect(() => {
    if (!gaInitialized && environment === 'production') {
      setGaInitialized(true);
      ReactGA.initialize(GOOGLE_ANALYTICS_PROD_TAG_ID, {
        gaOptions: {
          siteSpeedSampleRate: 100,
        },
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
    segmentAnalytics.recordPageVisit(location.pathname);
  }, [publicKey, location.pathname]);

  // Effect Network change
  useEffect(() => {
    if (previousChain !== connectionConfig.cluster) {
      setChain(connectionConfig.cluster);
      consoleOut('Cluster:', connectionConfig.cluster, 'brown');
      setNeedRefresh(true);
    }
  }, [previousChain, connectionConfig]);

  // Show Avg TPS on the console
  useEffect(() => {
    if (tpsAvg !== undefined) {
      setNeedRefresh(true);
    }
  }, [tpsAvg]);

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
            language: language,
          });

          setNeedRefresh(true);

          // Record pending referral, get referrals count and clear referralAddress from localStorage
          // Only record if referral address is valid and different from wallet address
          if (
            referralAddress &&
            isValidAddress(referralAddress) &&
            referralAddress !== walletAddress
          ) {
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
          segmentAnalytics.recordIdentity(
            '',
            {
              connected: false,
              platform: getPlatform(),
              browser: browserName,
            },
            () => {
              segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnected);
            },
          );
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
    if (!params.has('ref')) {
      return;
    }

    const address = params.get('ref');
    if (address && isValidAddress(address)) {
      consoleOut('Referral address:', address, 'green');
      setReferralAddress(address);
      setTimeout(() => {
        if (!publicKey) {
          openNotification({
            title: t('notifications.friend-referral-completed'),
            description: t('referrals.address-processed'),
            type: 'info',
          });
        }
      }, 1000);
      navigate('/');
    } else {
      consoleOut('Invalid address', '', 'red');
      openNotification({
        title: t('notifications.error-title'),
        description: t('referrals.address-invalid'),
        type: 'error',
      });
      navigate('/');
    }
  }, [location, publicKey, setReferralAddress, navigate, t]);

  useEffect(() => {
    const bodyClass = location.pathname.split('/')[1];

    const addRouteNameClass = () => {
      if (bodyClass) {
        document.body.classList.add(bodyClass);
      }
    };

    addRouteNameClass();

    return () => {
      if (bodyClass) {
        document.body.classList.remove(bodyClass);
      }
    };
  }, [location.pathname]);

  // Update diagnosis info
  useEffect(() => {
    if (connectionConfig && connectionConfig.endpoint && needRefresh) {
      const now = new Date();
      const device = getPlatform();
      const dateTime = `Client time: ${now.toUTCString()}`;
      const clientInfo = `Client software: ${deviceType} ${browserName} ${fullBrowserVersion} on ${osName} ${osVersion} (${device})`;
      const networkInfo = `Cluster: ${connectionConfig.cluster} (${
        connectionConfig.endpoint
      }) TPS: ${tpsAvg || '-'}, latency: ${responseTime}ms`;
      const accountInfo =
        publicKey && provider
          ? `Address: ${publicKey.toBase58()} (${provider.name})`
          : '';
      const appBuildInfo = `App package: ${
        process.env.REACT_APP_VERSION
      }, env: ${process.env.REACT_APP_ENV}, branch: ${
        gitInfo.branch || '-'
      }, build: [${gitInfo.commit.shortHash}] on ${gitInfo.commit.date}`;
      const debugInfo: AccountDetails = {
        dateTime,
        clientInfo,
        networkInfo,
        accountInfo,
        appBuildInfo,
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
    t,
  ]);

  useEffect(() => {
    if (publicKey) {
      const needAccount = needAccountSelection();
      if (needAccount) {
        consoleOut('Need account selection:', needAccount, 'crimson');
        setShouldSelectAccount(true);
      } else if (
        lastUsedAccount &&
        (lastUsedAccount.owner === publicKey.toBase58() ||
          lastUsedAccount.address === publicKey.toBase58()) &&
        (!selectedAccount.address ||
          selectedAccount.address !== lastUsedAccount.address)
      ) {
        consoleOut('Auto select account:', lastUsedAccount, 'crimson');
        setSelectedAccount(lastUsedAccount);
        setShouldSelectAccount(false);
        setIsSelectingAccount(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastUsedAccount, selectedAccount, needAccountSelection, publicKey]);

  ////////////////////
  // Event handlers //
  ////////////////////

  const onCreateSafe = () => {
    setShouldSelectAccount(false);
    setIsSelectingAccount(false);
    navigate(CREATE_SAFE_ROUTE_PATH);
  };

  const handleTabClosingOrPageRefresh = () => {
    window.localStorage.removeItem('cachedRpc');
  };

  const showDrawer = () => {
    setIsDrawerVisible(true);
  };

  const hideDrawer = () => {
    setIsDrawerVisible(false);
  };

  ///////////////
  // Rendering //
  ///////////////

  // lastUsedAccount

  if ((wallet && connected) || isUnauthenticatedRoute(location.pathname)) {
    // Launch the Account selector modal
    if (shouldSelectAccount) {
      return (
        <>
          <AccountSelectorModal
            isVisible={shouldSelectAccount}
            isFullWorkflowEnabled={true}
            onAccountSelected={() => setShouldSelectAccount(false)}
            onCreateSafe={onCreateSafe}
            onGotoSelectWallet={() => {
              setShouldSelectAccount(false);
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
            {isProd() &&
              tpsAvg !== undefined &&
              tpsAvg !== null &&
              tpsAvg < PERFORMANCE_THRESHOLD && (
                <div id="performance-warning-bar">
                  <div className="sitemessage">
                    <a
                      className="simplelink underline-on-hover"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={SOLANA_STATUS_PAGE}
                    >
                      {t('notifications.network-performance-low')} [TPS:{' '}
                      {tpsAvg}]
                    </a>
                  </div>
                </div>
              )}
            <Header className="App-Bar">
              <div className="app-bar-inner">
                <Link to="/" className="flex-center">
                  <div className="app-title simplelink">
                    <img
                      className="app-logo"
                      src={
                        theme === 'dark'
                          ? '/assets/mean-logo-color-light.svg'
                          : '/assets/mean-logo-color-dark.svg'
                      }
                      alt="Mean Finance"
                    />
                  </div>
                </Link>
                <AppBar
                  menuType="desktop"
                  onOpenDrawer={showDrawer}
                  topNavVisible={
                    location.pathname === '/ido' ||
                    location.pathname === '/ido-live'
                      ? false
                      : true
                  }
                />
              </div>
            </Header>
            <Content>{props.children}</Content>
            <Footer>
              <FooterBar onOpenDrawer={showDrawer} />
            </Footer>
          </Layout>
        </div>
        <Drawer
          title={<div className="ant-drawer-header-title">Recent events</div>}
          placement="right"
          width={360}
          onClose={hideDrawer}
          className="recent-events"
          open={isDrawerVisible}
        >
          {confirmationHistory && confirmationHistory.length > 0 ? (
            <TransactionConfirmationHistory
              confirmationHistory={confirmationHistory}
            />
          ) : (
            <div className="flex-center h-50">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <p>
                    {connected
                      ? t('account-area.no-recent-events')
                      : t('general.not-connected')}
                  </p>
                }
              />
            </div>
          )}
        </Drawer>
      </>
    );
  } else {
    // Launch wallet selector modal
    if (!wallet && !connected && !connecting) {
      setIsSelectingAccount(true);
      select();
    }

    // Render dark MEAN background
    return (
      <>
        <div className="background-logo-container">
          <img
            className="meanfi-bg-logo"
            src="/assets/mean-square.svg"
            alt=""
          />
        </div>
      </>
    );
  }
});
