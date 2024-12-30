import { ArrowLeftOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Drawer, Empty, Layout, Tooltip } from 'antd';
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
import { segmentAnalytics } from 'src/App';
import { IconWallet } from 'src/Icons';
import {
  CREATE_SAFE_ROUTE_PATH,
  GOOGLE_ANALYTICS_PROD_TAG_ID,
  LANGUAGES,
  PERFORMANCE_THRESHOLD,
  SOLANA_STATUS_PAGE,
} from 'src/app-constants/common';
import { AppBar } from 'src/components/AppBar';
import { FooterBar } from 'src/components/FooterBar';
import { openNotification } from 'src/components/Notifications';
import { TransactionConfirmationHistory } from 'src/components/TransactionConfirmationHistory';
import { useAccountsContext } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnectionConfig } from 'src/contexts/connection';
import { TxConfirmationContext } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { environment } from 'src/environments/environment';
import useLocalStorage from 'src/hooks/useLocalStorage';
import { reportConnectedAccount } from 'src/middleware/api';
import { consoleOut, isProd, isValidAddress } from 'src/middleware/ui';
import { isUnauthenticatedRoute } from 'src/middleware/utils';
import type { RuntimeAppDetails } from 'src/models/accounts';
import { useGetMultisigAccounts } from 'src/query-hooks/multisigAccounts/index.ts';
import useGetPerformanceSamples from 'src/query-hooks/performanceSamples';
import { AppUsageEvent } from 'src/services/segment-service';
import AccountRedirect from 'src/views/AccountRedirect';
import { AccountSelector } from '../AccountSelector';
import './style.scss';

export const PERFORMANCE_SAMPLE_INTERVAL = 60 * 60 * 1000;

const { Header, Content, Footer } = Layout;

interface LayoutProps {
  children: ReactNode;
}

export const AppLayout = React.memo(({ children }: LayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setDiagnosisInfo, selectedAccount } = useContext(AppStateContext);
  const { data: tpsAvg } = useGetPerformanceSamples();
  const { confirmationHistory, clearConfirmationHistory } = useContext(TxConfirmationContext);
  const { t, i18n } = useTranslation('common');
  const { refreshAccount } = useAccountsContext();
  const connectionConfig = useConnectionConfig();
  const { wallet, connected, publicKey, disconnect } = useWallet();
  const { refetch: refreshMultisigs } = useGetMultisigAccounts(publicKey?.toBase58());
  const [referralAddress, setReferralAddress] = useLocalStorage('pendingReferral', '');
  const [gaInitialized, setGaInitialized] = useState(false);
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

  const onCompleteAccountSelection = useCallback(
    (account: string) => {
      navigate(`/redirect-account/${account}`);
    },
    [navigate],
  );

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
      refreshMultisigs();
      const walletAddress = publicKey.toBase58();
      refreshAccount();

      // Record user login in Segment Analytics
      segmentAnalytics.recordIdentity(walletAddress, {
        connected: true,
        platform: getPlatform(),
        browser: browserName,
        walletProvider: wallet?.adapter.name || 'Other',
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
  }, [theme, language, publicKey, wallet?.adapter.name, referralAddress, getPlatform]);

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
    const accountInfo = publicKey && wallet ? `Address: ${publicKey.toBase58()} (${wallet.adapter.name})` : '';
    const debugInfo: RuntimeAppDetails = {
      dateTime,
      clientInfo,
      networkInfo,
      accountInfo,
    };
    setDiagnosisInfo(debugInfo);
  }, [wallet, wallet?.adapter.name, publicKey, needRefresh, connectionConfig, setDiagnosisInfo, getPlatform]);

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
    return !selectedAccount.address && publicKey ? (
      <div className='container main-container'>
        <div className='interaction-area'>
          <div className='title-and-subtitle mb-2'>
            <div className='title'>
              <IconWallet className='mean-svg-icons' />
              <div>Select account</div>
            </div>
          </div>
          <div className='place-transaction-box container-max-width-640 flat mb-0'>
            <div className='flexible-left mb-3'>
              <div className='left'>
                <span className='icon-button-container secondary-button'>
                  <Tooltip placement='bottom' title='Back to wallet selection'>
                    <Button
                      type='default'
                      shape='circle'
                      icon={<ArrowLeftOutlined />}
                      onClick={() => {
                        disconnect();
                      }}
                    />
                  </Tooltip>
                </span>
              </div>
              <div className='right'>
                <span className='icon-button-container secondary-button'>
                  <Tooltip placement='bottom' title='Refresh the list of accounts'>
                    <Button
                      id='account-refresh-cta'
                      type='default'
                      shape='circle'
                      size='middle'
                      icon={<ReloadOutlined className='mean-svg-icons' />}
                      onClick={() => {
                        refreshMultisigs();
                        refreshAccount();
                      }}
                    />
                  </Tooltip>
                </span>
              </div>
            </div>
            <div className='account-selector-popover-content vertical-scroll'>
              <AccountSelector
                onAccountSelected={onCompleteAccountSelection}
                onCreateSafeClick={onCreateSafe}
                onDisconnectWallet={() => {
                  disconnect();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ) : null;
  };

  if (location.pathname.startsWith('/redirect-account')) {
    return <AccountRedirect />;
  }

  if (selectedAccount.address || isUnauthenticatedRoute(location.pathname)) {
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
