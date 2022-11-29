import { AnalyticsBrowser } from '@segment/analytics-next';
import { Layout } from 'antd';
import { WalletProvider } from 'contexts/wallet';
import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { PageLoadingView } from 'views';
import { appConfig } from '.';
import './App.scss';
import { AccountsProvider } from './contexts/accounts';
import AppStateProvider from './contexts/appstate';
import { ConnectionProvider } from './contexts/connection';
import { OnlineStatusProvider } from './contexts/online-status';
import TxConfirmationProvider from './contexts/transaction-status';
import { SegmentAnalyticsService } from './middleware/segment-service';
import { isLocal } from './middleware/ui';
import { useLocalStorageState } from './middleware/utils';
import { AppRoutes } from './routes';
import { refreshCachedRpc } from './services/connections-hq';

const { Content } = Layout;
export const segmentAnalytics = new SegmentAnalyticsService();

function App() {
  const [theme, updateTheme] = useLocalStorageState('theme');
  const [loadingStatus, setLoadingStatus] = useState<string>('loading');
  const [writeKey, setWriteKey] = useState('');

  useEffect(() => {
    if (!writeKey) {
      setWriteKey(appConfig.getConfig().segmentAnalyticsKey);
      return;
    }
    const loadAnalytics = async () => {
      const [response] = await AnalyticsBrowser.load({ writeKey });
      segmentAnalytics.analytics = response;
    };

    // Load Segment Analytics only for PROD and DEV
    if (!isLocal()) {
      loadAnalytics();
    }
  }, [writeKey]);

  // Use the preferred theme or dark as a default
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    };

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  // Fire only once
  useEffect(() => {
    refreshCachedRpc().then(() => setLoadingStatus('finished'));
    return () => {};
  }, []);

  const loader = (
    <>
      <Layout>
        <Content className="flex-center">
          <PageLoadingView addWrapper={false} />
        </Content>
      </Layout>
    </>
  );

  if (loadingStatus === 'loading') {
    return loader;
  } else {
    return (
      <OnlineStatusProvider>
        <BrowserRouter basename={'/'}>
          <ConnectionProvider>
            {/* Here is where we replace out context provider by this one <WalletProvider wallets={wallets} autoConnect> */}
            <WalletProvider>
              <AccountsProvider>
                <TxConfirmationProvider>
                  <AppStateProvider>
                    <AppRoutes />
                  </AppStateProvider>
                </TxConfirmationProvider>
              </AccountsProvider>
            </WalletProvider>
          </ConnectionProvider>
        </BrowserRouter>
      </OnlineStatusProvider>
    );
  }
}

export default App;
