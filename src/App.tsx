import '@rainbow-me/rainbowkit/styles.css';
import { AnalyticsBrowser } from '@segment/analytics-next';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletProvider } from '@solana/wallet-adapter-react';
import {
  Coin98WalletAdapter,
  CoinbaseWalletAdapter,
  LedgerWalletAdapter,
  MathWalletAdapter,
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  SolongWalletAdapter,
  TorusWalletAdapter,
  TrustWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { Layout } from 'antd';
import { MeanFiWalletProvider } from 'contexts/wallet';
import { WalletAccountProvider } from 'contexts/walletAccount';
import { environment } from 'environments/environment';
import useLocalStorage from 'hooks/useLocalStorage';
import { appConfig } from 'main';
import { useEffect, useMemo, useState } from 'react';
import { isDesktop } from 'react-device-detect';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from 'routes';
import { PageLoadingView } from 'views/PageLoading';
import './App.scss';
import { AccountsProvider } from './contexts/accounts';
import AppStateProvider from './contexts/appstate';
import { ConnectionProvider } from './contexts/connection';
import TxConfirmationProvider from './contexts/transaction-status';
import { SegmentAnalyticsService } from './middleware/segment-service';
import { isLocal } from './middleware/ui';
import { refreshCachedRpc } from './services/connections-hq';

const { Content } = Layout;
export const segmentAnalytics = new SegmentAnalyticsService();

function App() {
  const [theme, updateTheme] = useLocalStorage('theme', 'dark');
  const [loadingStatus, setLoadingStatus] = useState<string>('loading');
  const [writeKey, setWriteKey] = useState('');

  useEffect(() => {
    if (isDesktop) {
      return;
    }

    window.localStorage.removeItem('walletName');
    window.localStorage.removeItem('lastUsedAccount');
    window.localStorage.removeItem('cachedRpc');
  }, []);

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

  // Select a default RPC
  useEffect(() => {
    refreshCachedRpc().then(() => setLoadingStatus('finished'));
    return () => {};
  }, []);

  const network = environment === 'production' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new CoinbaseWalletAdapter(),
      new TrustWalletAdapter(),
      new TorusWalletAdapter(),
      new MathWalletAdapter(),
      new Coin98WalletAdapter(),
      new SolongWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    [network],
  );

  if (loadingStatus === 'loading') {
    return (
      <Layout>
        <Content className='flex-center'>
          <PageLoadingView addWrapper={false} />
        </Content>
      </Layout>
    );
  }

  return (
    <BrowserRouter basename={'/'}>
      <ConnectionProvider>
        <WalletProvider wallets={wallets} autoConnect>
          <MeanFiWalletProvider>
            <WalletAccountProvider>
              <AccountsProvider>
                <TxConfirmationProvider>
                  <AppStateProvider>
                    <AppRoutes />
                  </AppStateProvider>
                </TxConfirmationProvider>
              </AccountsProvider>
            </WalletAccountProvider>
          </MeanFiWalletProvider>
        </WalletProvider>
      </ConnectionProvider>
    </BrowserRouter>
  );
}

export default App;
