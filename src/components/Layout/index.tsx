import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./../../App.less";
import "./style.less";
import { appConfig, gitInfo } from "../..";
import { Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";
import { useTranslation } from "react-i18next";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { notify } from "../../utils/notifications";
import { consoleOut, isLocal, isProd, isValidAddress } from "../../utils/ui";
import ReactGA from 'react-ga';
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { isMobile, isDesktop, isTablet, browserName, osName, osVersion, fullBrowserVersion, deviceType } from "react-device-detect";
import { environment } from "../../environments/environment";
import { GOOGLE_ANALYTICS_PROD_TAG_ID, LANGUAGES, PERFORMANCE_SAMPLE_INTERVAL, PERFORMANCE_SAMPLE_INTERVAL_FAST, PERFORMANCE_THRESHOLD, SOLANA_STATUS_PAGE } from "../../constants";
import useLocalStorage from "../../hooks/useLocalStorage";
import { reportConnectedAccount } from "../../utils/api";
import { Connection } from "@solana/web3.js";
import useOnlineStatus from "../../contexts/online-status";
import { AccountDetails } from "../../models";
import { segmentAnalytics } from "../../App";
import { AppUsageEvent } from "../../utils/segment-service";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    theme,
    detailsPanelOpen,
    addAccountPanelOpen,
    canShowAccountDetails,
    previousWalletConnectState,
    setStreamList,
    setSelectedAsset,
    setDiagnosisInfo,
    setAccountAddress,
    setDtailsPanelOpen,
    setShouldLoadTokens,
    refreshTokenBalance,
    setAddAccountPanelOpen,
    setCanShowAccountDetails,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);

  const { t, i18n } = useTranslation("common");
  const { isOnline, responseTime } = useOnlineStatus();
  const connectionConfig = useConnectionConfig();
  const { provider, connected, publicKey } = useWallet();
  const [previousChain, setChain] = useState("");
  const [gaInitialized, setGaInitialized] = useState(false);
  const [referralAddress, setReferralAddress] = useLocalStorage('pendingReferral', '');
  const [language, setLanguage] = useState("");
  // undefined at first (never had a value), null = couldn't get, number the value successfully retrieved
  const [avgTps, setAvgTps] = useState<number | null | undefined>(undefined);
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
    // TODO: Next lines are useful if we turn OFF wallet autoConnect
    // if (window.localStorage.getItem('walletProvider')) {
    //   window.localStorage.removeItem('walletProvider');
    // }
    // window.localStorage.removeItem('providerName');
  }

  // Callback to fetch performance data (TPS)
  const getPerformanceSamples = useCallback(async () => {

    let connection: Connection;

    if (isProd()) {
      connection = new Connection("https://ssc-dao.genesysgo.net/");
    } else {
      connection = new Connection("https://api.devnet.solana.com/");
    }

    if (!connection) { return null; }

    const round = (series: number[]) => {
      return series.map((n) => Math.round(n));
    }

    try {
      const samples = await connection.getRecentPerformanceSamples(30);

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
      console.error(error);
      return null;
    }
  }, []);

  // Get Performance Samples on a timeout
  useEffect(() => {

    // Hoping this to happens once
    if (avgTps === undefined && needRefresh) {
      setTimeout(() => {
        setAvgTps(null);
        setNeedRefresh(false);
      });
      getPerformanceSamples()
        .then(value => {
          if (value) {
            setAvgTps(value);
          }
        });
    }

    // Set to run every 30 sec
    const performanceInterval = setInterval(() => {
      getPerformanceSamples()
        .then(value => {
          if (value) {
            setNeedRefresh(true);
            setAvgTps(value);
          }
        });
    },
    avgTps && avgTps < PERFORMANCE_THRESHOLD
      ? isProd()
        ? PERFORMANCE_SAMPLE_INTERVAL_FAST
        : PERFORMANCE_SAMPLE_INTERVAL
      : PERFORMANCE_SAMPLE_INTERVAL
    );

    return () => {
      clearInterval(performanceInterval);
    };
  }, [
    avgTps,
    needRefresh,
    getPerformanceSamples
  ]);

  const getPlatform = (): string => {
    return isDesktop ? 'Desktop' : isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Other';
  }

  const sendConnectionMetric = useCallback((address: string) => {
    const url = appConfig.getConfig().influxDbUrl;
    const token = appConfig.getConfig().influxDbToken;
    const org = appConfig.getConfig().influxDbOrg;
    const bucket = appConfig.getConfig().influxDbBucket;
    const writeApi = new InfluxDB({url, token, timeout: 3000, writeOptions: {maxRetries: 0}}).getWriteApi(org, bucket);
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
    if (avgTps !== undefined) {
      setNeedRefresh(true);
    }
  }, [
    avgTps
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
        if (publicKey) {
          const walletAddress = publicKey.toBase58();

          // Record user login in Segment Analytics
          segmentAnalytics.recordIdentity(walletAddress, {
            connected: true,
            platform: getPlatform(),
            browser: browserName,
            walletProvider: provider?.name || 'Other',
            theme: theme,
            language: language
          }, () => {
            segmentAnalytics.recordEvent(AppUsageEvent.WalletConnected, {
              walletAddress,
              walletProvider: provider?.name || 'Other'
            })
          });

          if (!isLocal()) {
            sendConnectionMetric(walletAddress);
          }
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
              .catch(error => console.error(error));;
          }
          // Let the AppState know which wallet address is connected and save it
          setAccountAddress(walletAddress);
          setSelectedAsset(undefined);
        }
        refreshTokenBalance();
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        setPreviousWalletConnectState(false);
        setNeedRefresh(true);
        setStreamList([]);
        refreshTokenBalance();
        notify({
          message: t('notifications.wallet-connection-event-title'),
          description: t('notifications.wallet-disconnect-message'),
          type: 'info'
        });
        // Send identity to Segment if no wallew connection
        if (!publicKey) {
          segmentAnalytics.recordIdentity('', {
            connected: false,
            platform: getPlatform(),
            browser: browserName
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
    sendConnectionMetric,
    refreshTokenBalance,
    setReferralAddress,
    setAccountAddress,
    setSelectedAsset,
    setStreamList,
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
        notify({
          message: t('notifications.friend-referral-completed'),
          description: t('referrals.address-processed'),
          type: "info"
        });
        navigate('/');
      } else {
        consoleOut('Invalid address', '', 'red');
        notify({
          message: t('notifications.error-title'),
          description: t('referrals.address-invalid'),
          type: "error"
        });
        navigate('/');
      }
    }
  }, [
    location,
    t,
    navigate,
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

    if (location.pathname === '/' || location.pathname === '/accounts') {
      setShouldLoadTokens(true);
    }

    return () => {
      if (bodyClass) {
        document.body.classList.remove(bodyClass);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const closeAllPanels = () => {
    if (detailsPanelOpen) {
      setDtailsPanelOpen(false);
    } else if (addAccountPanelOpen) {
      setCanShowAccountDetails(true);
      setAddAccountPanelOpen(false);
    }
  }

  // Update diagnosis info
  useEffect(() => {
    if (connectionConfig && connectionConfig.endpoint && needRefresh) {
      const now = new Date();
      const device = isDesktop ? 'Desktop' : isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Other';
      const dateTime = `Client time: ${now.toUTCString()}`;
      const clientInfo = `Client software: ${deviceType} ${browserName} ${fullBrowserVersion} on ${osName} ${osVersion} (${device})`;
      const networkInfo = `Cluster: ${connectionConfig.cluster} (${connectionConfig.endpoint}) TPS: ${avgTps || '-'}, latency: ${responseTime}ms`;
      const accountInfo = publicKey && provider ? `Address: ${publicKey.toBase58()} (${provider.name})` : '';
      const appBuildInfo = `App package: ${process.env.REACT_APP_VERSION}, env: ${process.env.REACT_APP_ENV}, build: [${gitInfo.commit.shortHash}] on ${gitInfo.commit.date}`;
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
    avgTps,
    isOnline,
    provider,
    publicKey,
    responseTime,
    connectionConfig,
    needRefresh,
    setDiagnosisInfo,
    t
  ]);

  return (
    <>
    <div className="App">
      <Layout>
        {(isProd() && (avgTps !== undefined && avgTps !== null) && avgTps < PERFORMANCE_THRESHOLD) && (
          <div className="warning-bar">
            <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href={SOLANA_STATUS_PAGE}>
              {t('notifications.network-performance-low')}
            </a>
          </div>
        )}
        <Header className="App-Bar">
          {(detailsPanelOpen || (addAccountPanelOpen && !canShowAccountDetails)) && (
            <BackButton handleClose={() => closeAllPanels()} />
          )}
          <div className="app-bar-inner">
            <Link to="/" className="flex-center">
              <div className="app-title simplelink">
                <img className="app-logo" src={theme === 'dark' ? '/assets/mean-pay-logo-color-light.svg' : '/assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
              </div>
            </Link>
            <AppBar menuType="desktop" topNavVisible={(location.pathname === '/ido' || location.pathname === '/ido-live') ? false : true} />
          </div>
          <AppBar menuType="mobile" topNavVisible={false} />
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
