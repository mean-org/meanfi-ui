import '@rainbow-me/rainbowkit/styles.css';
import { AnalyticsBrowser } from '@segment/analytics-next';
import { SentreWalletAdapter } from '@sentre/connector';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletProvider } from '@solana/wallet-adapter-react';
import {
  BraveWalletAdapter,
  Coin98WalletAdapter,
  CoinbaseWalletAdapter,
  ExodusWalletAdapter,
  LedgerWalletAdapter,
  MathWalletAdapter,
  PhantomWalletAdapter,
  SlopeWalletAdapter,
  SolflareWalletAdapter,
  SolongWalletAdapter,
  TrustWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from 'antd';
import { sentreAppId } from 'constants/common';
import { MeanFiWalletProvider } from 'contexts/wallet';
import { WalletAccountProvider } from 'contexts/walletAccount';
import { environment } from 'environments/environment';
import useLocalStorage from 'hooks/useLocalStorage';
import { XnftWalletAdapter } from 'integrations/xnft/xnft-wallet-adapter';
import { useEffect, useMemo, useState } from 'react';
import { isDesktop } from 'react-device-detect';
import { BrowserRouter } from 'react-router-dom';
import { PageLoadingView } from 'views';
import { appConfig } from '.';
import './App.scss';
import { AccountsProvider } from './contexts/accounts';
import AppStateProvider from './contexts/appstate';
import { ConnectionProvider } from './contexts/connection';
import TxConfirmationProvider from './contexts/transaction-status';
import { SegmentAnalyticsService } from './middleware/segment-service';
import { isLocal } from './middleware/ui';
import { AppRoutes } from './routes';
import { refreshCachedRpc } from './services/connections-hq';

const { Content } = Layout;
export const segmentAnalytics = new SegmentAnalyticsService();

function App() {
  const [theme, updateTheme] = useLocalStorage('theme', 'dark');
  const [loadingStatus, setLoadingStatus] = useState<string>('loading');
  const [writeKey, setWriteKey] = useState('');

  useEffect(() => {
    if (!isDesktop) {
      window.localStorage.removeItem('walletName');
      window.localStorage.removeItem('lastUsedAccount');
      window.localStorage.removeItem('cachedRpc');
    }
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

  const queryClient = new QueryClient();

  const network = environment === 'production' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new BraveWalletAdapter(),
      new ExodusWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new CoinbaseWalletAdapter(),
      new SlopeWalletAdapter(),
      new Coin98WalletAdapter(),
      new SolongWalletAdapter(),
      new TrustWalletAdapter(),
      new MathWalletAdapter(),
      new LedgerWalletAdapter(),
      new SentreWalletAdapter({ appId: sentreAppId }),
      new XnftWalletAdapter(),
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
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
