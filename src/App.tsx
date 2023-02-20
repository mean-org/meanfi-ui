import { AnalyticsBrowser } from '@segment/analytics-next';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { Layout } from 'antd';
import { MeanFiWalletProvider } from 'contexts/wallet';
import { WalletAccountProvider } from 'contexts/walletAccount';
import { environment } from 'environments/environment';
import { useEffect, useMemo, useState } from 'react';
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
import { sentreAppId } from 'constants/common';
import { WalletProvider } from '@solana/wallet-adapter-react';
import {
  BitKeepWalletAdapter,
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
import { SentreWalletAdapter } from '@sentre/connector';
import { XnftWalletAdapter } from 'integrations/xnft/xnft-wallet-adapter';
import { isDesktop } from 'react-device-detect';

const { Content } = Layout;
export const segmentAnalytics = new SegmentAnalyticsService();

function App() {
  const [theme, updateTheme] = useLocalStorageState('theme');
  const [loadingStatus, setLoadingStatus] = useState<string>('loading');
  const [writeKey, setWriteKey] = useState('');

  useEffect(() => {
    if (!isDesktop) {
      localStorage.removeItem('walletName');
      localStorage.removeItem('lastUsedAccount');
      localStorage.removeItem('cachedRpc');
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

  // Fire only once
  useEffect(() => {
    refreshCachedRpc().then(() => setLoadingStatus('finished'));
    return () => {};
  }, []);

  const network = environment === 'production' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet;

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new BraveWalletAdapter(),
      new ExodusWalletAdapter(),
      new SolflareWalletAdapter({ network }),
      new BitKeepWalletAdapter(),
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

  const loader = (
    <>
      <Layout>
        <Content className="flex-center">
          <PageLoadingView addWrapper={false} />
        </Content>
      </Layout>
    </>
  );

  const renderDebugBar = () => {
    return (
      <Layout>
        <Content className="flex-center">
          <div className="debug-bar">
            <span className="mr-1 align-middle">AppDebug</span>
            <span className="ml-1 font-bold fg-dark-active">AAAAAAa</span>
          </div>
        </Content>
      </Layout>
    );
  };

  if (loadingStatus === 'loading') {
    return loader;
  } else {
    return (
      <OnlineStatusProvider>
        <BrowserRouter basename={'/'}>
          {renderDebugBar()}
          {/* <ConnectionProvider>
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
          </ConnectionProvider> */}
        </BrowserRouter>
      </OnlineStatusProvider>
    );
  }
}

export default App;
