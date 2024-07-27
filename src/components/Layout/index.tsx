import { segmentAnalytics } from 'App';
import { Drawer, Empty, Layout } from 'antd';
import {
  CREATE_SAFE_ROUTE_PATH,
  GOOGLE_ANALYTICS_PROD_TAG_ID,
  LANGUAGES,
  PERFORMANCE_THRESHOLD,
  SOLANA_STATUS_PAGE,
} from 'app-constants/common';
import { AccountSelectorModal } from 'components/AccountSelectorModal';
import { AppBar } from 'components/AppBar';
import { FooterBar } from 'components/FooterBar';
import { openNotification } from 'components/Notifications';
import { TransactionConfirmationHistory } from 'components/TransactionConfirmationHistory';
import { useAccountsContext } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import useLocalStorage from 'hooks/useLocalStorage';
import { reportConnectedAccount } from 'middleware/api';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, isProd, isValidAddress } from 'middleware/ui';
import { isUnauthenticatedRoute } from 'middleware/utils';
import type { RuntimeAppDetails } from 'models/accounts';
import useGetPerformanceSamples from 'query-hooks/performanceSamples';
import React, { type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
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

export const PERFORMANCE_SAMPLE_INTERVAL = 60 * 60 * 1000;

const { Header, Content, Footer } = Layout;

interface LayoutProps {
  children: ReactNode;
}

export const AppLayout = React.memo(({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setNeedReloadMultisigAccounts, setDiagnosisInfo, selectedAccount } = useContext(AppStateContext);
  const { tpsAvg } = useGetPerformanceSamples();
  const { confirmationHistory, clearConfirmationHistory } = useContext(TxConfirmationContext);
  const { t, i18n } = useTranslation('common');
  const { refreshAccount } = useAccountsContext();
  const connectionConfig = useConnectionConfig();
  const { provider, connected, publicKey, disconnect } = useWallet();
  const [gaInitialized, setGaInitialized] = useState(false);
  const [referralAddress, setReferralAddress] = useLocalStorage('pendingReferral', '');
  const [language, setLanguage] = useState('');
  const [isDrawerVisible, setIsDrawerVisible] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(true);

  ///////////////
  // Callbacks //
  ///////////////

  const getPlatform = useCallback((): string => {
    if (isDesktop) {
      return 'Desktop';
    }
    if (isTablet) {
      return 'Tablet';
    }
    if (isMobile) {
      return 'Mobile';
    }
    return 'Other';
  }, []);

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
  }, [location.pathname]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (publicKey) {
      setNeedReloadMultisigAccounts(true);
      const walletAddress = publicKey.toBase58();
      refreshAccount();

      // Record user login in Segment Analytics
      segmentAnalytics.recordIdentity(walletAddress, {
        connected: true,
        platform: getPlatform(),
        browser: browserName,
        walletProvider: provider?.name || 'Other',
        theme,
        language,
      });

      // Record pending referral, get referrals count and clear referralAddress from localStorage
      // Only record if referral address is valid and different from wallet address
      if (referralAddress && isValidAddress(referralAddress) && referralAddress !== walletAddress) {
        reportConnectedAccount(walletAddress, referralAddress)
          .then(() => {
            setReferralAddress('');
          })
          .catch(error => console.error(error));
      } else {
        reportConnectedAccount(walletAddress)
          .then(() => consoleOut('reportConnectedAccount hit'))
          .catch(error => console.error(error));
      }
    } else {
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
      clearConfirmationHistory();
    }

    setNeedRefresh(true);
  }, [
    theme,
    language,
    publicKey,
    provider?.name,
    referralAddress,
    getPlatform,
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
      return;
    }
    consoleOut('Invalid address', '', 'red');
    openNotification({
      title: t('notifications.error-title'),
      description: t('referrals.address-invalid'),
      type: 'error',
    });
    navigate('/');
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
    if (!needRefresh) {
      return;
    }

    setNeedRefresh(false);
    const now = new Date();
    const device = getPlatform();
    const dateTime = `Client time: ${now.toUTCString()}`;
    const clientInfo = `Client software: ${deviceType} ${browserName} ${fullBrowserVersion} on ${osName} ${osVersion} (${device})`;
    const networkInfo = `Cluster: ${connectionConfig.cluster}`;
    // const networkInfo = `Cluster: ${connectionConfig.cluster} | TPS: ${tpsAvg || '-'}`;
    const accountInfo = publicKey && provider ? `Address: ${publicKey.toBase58()} (${provider.name})` : '';
    const debugInfo: RuntimeAppDetails = {
      dateTime,
      clientInfo,
      networkInfo,
      accountInfo,
    };
    setDiagnosisInfo(debugInfo);
  }, [provider, publicKey, needRefresh, connectionConfig, setDiagnosisInfo, getPlatform]);

  ////////////////////
  // Event handlers //
  ////////////////////

  const onCreateSafe = () => {
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

  const renderAccountSelector = () => {
    return (
      !selectedAccount.address &&
      publicKey && (
        <AccountSelectorModal
          isVisible={true}
          isFullWorkflowEnabled={true}
          onCreateSafe={onCreateSafe}
          onGotoSelectWallet={() => {
            disconnect();
          }}
        />
      )
    );
  };

  if (isUnauthenticatedRoute(location.pathname) || selectedAccount.address) {
    // Launch the Account selector modal

    // Render layout
    return (
      <>
        {renderAccountSelector()}
        <div className='App'>
          <Layout>
            {isProd() && tpsAvg && tpsAvg < PERFORMANCE_THRESHOLD ? (
              <div id='performance-warning-bar'>
                <div className='sitemessage'>
                  <a
                    className='simplelink underline-on-hover'
                    target='_blank'
                    rel='noopener noreferrer'
                    href={SOLANA_STATUS_PAGE}
                  >
                    {t('notifications.network-performance-low')} [TPS: {tpsAvg}]
                  </a>
                </div>
              </div>
            ) : null}
            <Header className='App-Bar'>
              <div className='app-bar-inner'>
                <Link to='/' className='flex-center'>
                  <div className='app-title simplelink'>
                    <img className='app-logo' src='/assets/mean-lettermark.svg' alt='Mean Finance' />
                  </div>
                </Link>
                <AppBar
                  menuType='desktop'
                  onOpenDrawer={showDrawer}
                  topNavVisible={!(location.pathname === '/ido' || location.pathname === '/ido-live')}
                />
              </div>
              <AppBar menuType='mobile' topNavVisible={false} onOpenDrawer={showDrawer} />
            </Header>
            <Content>{children}</Content>
            <Footer>
              <FooterBar onOpenDrawer={showDrawer} />
            </Footer>
          </Layout>
        </div>
        <Drawer
          title={<div className='ant-drawer-header-title'>Recent events</div>}
          placement='right'
          width={360}
          onClose={hideDrawer}
          className='recent-events'
          open={isDrawerVisible}
        >
          {confirmationHistory && confirmationHistory.length > 0 ? (
            <TransactionConfirmationHistory confirmationHistory={confirmationHistory} />
          ) : (
            <div className='flex-center h-50'>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<p>{connected ? t('account-area.no-recent-events') : t('general.not-connected')}</p>}
              />
            </div>
          )}
        </Drawer>
      </>
    );
  }

  // Render dark MEAN background
  return <>{renderAccountSelector()}</>;
});
