import { DownOutlined, UpOutlined } from '@ant-design/icons';
import {
  type Adapter,
  type MessageSignerWalletAdapterProps,
  type SignerWalletAdapterProps,
  type WalletAdapterProps,
  WalletReadyState,
} from '@solana/wallet-adapter-base';
import { useWallet as useBaseWallet } from '@solana/wallet-adapter-react';
import {
  Coin98WalletAdapter,
  Coin98WalletName,
  CoinbaseWalletAdapter,
  CoinbaseWalletName,
  LedgerWalletAdapter,
  LedgerWalletName,
  MathWalletAdapter,
  MathWalletName,
  PhantomWalletAdapter,
  PhantomWalletName,
  SolflareWalletAdapter,
  SolflareWalletName,
  SolongWalletAdapter,
  SolongWalletName,
  TorusWalletAdapter,
  TorusWalletName,
  TrustWalletAdapter,
  TrustWalletName,
} from '@solana/wallet-adapter-wallets';
import { segmentAnalytics } from 'App';
import { Button, Modal } from 'antd';
import { openNotification } from 'components/Notifications';
import { AppUsageEvent } from 'middleware/segment-service';
import React, { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isDesktop } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDefaultRpc } from 'services/connections-hq';
import { consoleOut, isProd } from '../middleware/ui';
import { isUnauthenticatedRoute, useLocalStorageState } from '../middleware/utils';

// Flag to block processing of events when triggered multiple times
let isDisconnecting = false;

export interface WalletProviderEntry {
  name: string;
  url: string;
  icon: string;
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  adapter: any;
  adapterParams: unknown;
  hideOnDesktop: boolean;
  hideOnMobile: boolean;
  isWebWallet: boolean;
  underDevelopment: boolean;
  hideIfUnavailable: boolean;
}

export const WALLET_PROVIDERS: WalletProviderEntry[] = [
  {
    name: PhantomWalletName,
    url: '',
    icon: '',
    adapter: PhantomWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: SolflareWalletName,
    url: '',
    icon: '',
    adapter: SolflareWalletAdapter,
    adapterParams: { network: getDefaultRpc().cluster },
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: CoinbaseWalletName,
    url: '',
    icon: '',
    adapter: CoinbaseWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: TrustWalletName,
    url: '',
    icon: '',
    adapter: TrustWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  // These ones go into the [more] CTA
  {
    name: TorusWalletName,
    url: '',
    icon: '',
    adapter: TorusWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: MathWalletName,
    url: '',
    icon: '',
    adapter: MathWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: true,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: Coin98WalletName,
    url: '',
    icon: '',
    adapter: Coin98WalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  {
    name: SolongWalletName,
    url: '',
    icon: '',
    adapter: SolongWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: true,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true,
  },
  {
    name: LedgerWalletName,
    url: '',
    icon: '',
    adapter: LedgerWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true,
  },
];

const getIsProviderInstalled = (provider: WalletProviderEntry): boolean => {
  // biome-ignore lint/suspicious/noExplicitAny: The window object to be interrogated
  const windowObject = window as any;
  if (provider) {
    switch (provider.name) {
      case PhantomWalletName:
        return !!windowObject.phantom?.solana?.isPhantom || !!windowObject.solana?.isPhantom;
      case SolflareWalletName:
        return !!windowObject.solflare?.isSolflare || !!windowObject.SolflareApp;
      case CoinbaseWalletName:
        return !!windowObject.coinbaseSolana;
      case TrustWalletName:
        return !!windowObject.trustwallet?.isTrustWallet || !!windowObject.trustwallet?.solana?.isTrust;
      case TorusWalletName:
        return !!windowObject.torus;
      case SolongWalletName:
        return !!windowObject.solong;
      case MathWalletName:
        return !!windowObject.solana?.isMathWallet;
      case Coin98WalletName:
        return !!windowObject.coin98?.sol;
      case LedgerWalletName:
        return true;
      default:
        return false;
    }
  }
  return true;
};

const isProviderHidden = (item: WalletProviderEntry, { isDesktop }: { isDesktop: boolean }) =>
  (item.hideOnDesktop && isDesktop) ||
  (item.hideOnMobile && !isDesktop) ||
  (item.underDevelopment && isProd()) ||
  (item.hideIfUnavailable && !getIsProviderInstalled(item));

interface MeanFiWalletContextState {
  wallet: Adapter | undefined;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  isSelectingWallet: boolean;
  provider: (typeof WALLET_PROVIDERS)[number] | undefined;
  resetWalletProvider: () => void;
  selectWalletProvider: () => void;
  sendTransaction: WalletAdapterProps['sendTransaction'];
  signTransaction: SignerWalletAdapterProps['signTransaction'] | undefined;
  signAllTransactions: SignerWalletAdapterProps['signAllTransactions'] | undefined;
  signMessage: MessageSignerWalletAdapterProps['signMessage'] | undefined;
}

const defaultCtxValues: MeanFiWalletContextState = {
  wallet: undefined,
  connected: false,
  connecting: true,
  disconnecting: false,
  provider: undefined,
  isSelectingWallet: false,
  resetWalletProvider: () => {},
  selectWalletProvider: () => {},
  sendTransaction: async () => '',
  signTransaction: undefined,
  signAllTransactions: undefined,
  signMessage: undefined,
};

const MeanFiWalletContext = React.createContext<MeanFiWalletContextState>(defaultCtxValues);

interface Props {
  children: ReactNode;
}

export function MeanFiWalletProvider({ children }: Props) {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const [walletName, setWalletName] = useLocalStorageState('walletName');
  const {
    wallet,
    wallets,
    select,
    connecting,
    disconnect,
    disconnecting,
    signMessage,
    sendTransaction,
    signTransaction,
    signAllTransactions,
  } = useBaseWallet();
  const [connected, setConnected] = useState(false);
  const [isSelectingWallet, setIsModalVisible] = useState(false);
  const selectWalletProvider = useCallback(() => {
    setIsModalVisible(true);
  }, []);
  const close = useCallback(() => {
    setIsModalVisible(false);
  }, []);
  const [walletListExpanded, setWalletListExpanded] = useState(false);

  const resetWalletProvider = useCallback(() => {
    setWalletName(null);
  }, [setWalletName]);

  const provider = useMemo(() => {
    return WALLET_PROVIDERS.find(({ name }) => name === walletName);
  }, [walletName]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    for (const item of wallets) {
      const itemIndex = WALLET_PROVIDERS.findIndex(p => p.name === item.adapter.name);
      if (itemIndex !== -1) {
        WALLET_PROVIDERS[itemIndex].url = item.adapter.url;
        WALLET_PROVIDERS[itemIndex].icon = item.adapter.icon;
      }
    }
    if (walletName) {
      consoleOut('walletName:', walletName, 'blue');
      const wa = wallets.find(w => w.adapter.name === walletName);
      const walletEntry = WALLET_PROVIDERS.filter(w => !isProviderHidden(w, { isDesktop })).find(
        w => w.name === walletName,
      );
      consoleOut('provider:', wa, 'blue');
      if (!(wa && walletEntry)) {
        setWalletName(null);
      }
      return;
    }
    setWalletName(null);
  }, [walletName, wallets, wallet]);

  function setupOnConnectEvent(adapter: Adapter) {
    adapter.on('connect', pk => {
      consoleOut('Wallet connect event fired:', pk.toBase58(), 'blue');
      if (adapter.connected && !adapter.connecting) {
        setConnected(false);
        resetWalletProvider();
        window.location.reload();
      } else if (adapter.publicKey) {
        setConnected(true);
        close();
      }
    });
  }

  function setupOnDisconnectEvent(adapter: Adapter, readyState: WalletReadyState) {
    adapter.on('disconnect', () => {
      if (!isDisconnecting) {
        return;
      }

      isDisconnecting = false;
      consoleOut('Wallet disconnect event fired:', '', 'blue');
      setConnected(false);
      if (readyState !== WalletReadyState.Installed) return;
      resetWalletProvider();
      navigate('/');
    });
  }

  function setupOnErrorEvent(adapter: Adapter) {
    adapter.on('error', _errorEvent => {
      consoleOut('Wallet error event fired:', '', 'blue');

      if (!adapter.connecting) {
        return;
      }

      setConnected(false);
      adapter.removeAllListeners();
      resetWalletProvider();
      selectWalletProvider();
    });
  }

  // Setup listeners
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (wallet?.adapter) {
      setupOnConnectEvent(wallet.adapter);

      setupOnDisconnectEvent(wallet.adapter, wallet.readyState);

      setupOnErrorEvent(wallet.adapter);
    }

    return () => {
      setConnected(false);
      if (wallet) {
        disconnect();
      }
    };
  }, [wallet]);

  // Handle connect
  useEffect(() => {
    // When a wallet is selected but not installed
    if (!walletName || !wallet || wallet.readyState === WalletReadyState.Installed) return;
    consoleOut('Wallet not installed', '', 'red');

    openNotification({
      type: 'info',
      title: 'Wallet adapter not configured',
      description: `Cannot connect to ${walletName}. Wallet is not configured or enabled in your browser.`,
    });

    setConnected(false);
    setWalletName(null);
    disconnect();
    selectWalletProvider();
  }, [wallet, walletName, setWalletName, disconnect, selectWalletProvider]);

  useEffect(() => {
    if (isUnauthenticatedRoute(location.pathname)) return;
    if (wallet || connected || connecting) return;

    selectWalletProvider();
  }, [wallet, connected, connecting, selectWalletProvider, location.pathname]);

  const providerValues = useMemo(() => {
    return {
      provider,
      wallet: wallet?.adapter,
      connected,
      connecting,
      disconnecting,
      isSelectingWallet,
      selectWalletProvider,
      signAllTransactions,
      resetWalletProvider,
      sendTransaction,
      signTransaction,
      signMessage,
    };
  }, [
    connected,
    connecting,
    disconnecting,
    isSelectingWallet,
    provider,
    resetWalletProvider,
    selectWalletProvider,
    sendTransaction,
    signAllTransactions,
    signMessage,
    signTransaction,
    wallet?.adapter,
  ]);

  return (
    <MeanFiWalletContext.Provider value={providerValues}>
      {children}

      <Modal
        centered
        className='mean-modal simple-modal header-autoheight'
        title={
          <div className='mt-3'>
            <img className='app-logo' src='/assets/mean-lettermark.svg' alt='Mean Finance' />
          </div>
        }
        open={isSelectingWallet}
        footer={null}
        maskClosable={connected}
        closable={connected}
        onCancel={close}
        width={450}
      >
        <div className='connect-wallet-modal vertical-scroll'>
          <div className='mb-3 text-center'>
            <h2>{t('wallet-selector.connect-to-begin')}</h2>
          </div>
          <div className={`wallet-providers ${walletListExpanded ? 'expanded' : ''}`}>
            {WALLET_PROVIDERS.map(item => {
              const isInstalled = getIsProviderInstalled(item);
              // Skip items that won't show up
              if (isProviderHidden(item, { isDesktop })) {
                return null;
              }

              const onClick = async () => {
                if (wallet) {
                  await disconnect();
                }

                // Record user event in Segment Analytics
                segmentAnalytics.recordEvent(AppUsageEvent.WalletSelected, {
                  walletProvider: item.name,
                  isWebWallet: item.isWebWallet,
                });

                // If not installed take the user to its extension url
                if (!isInstalled) {
                  window.open(item.url, '_blank');
                  return;
                }

                consoleOut('Selected wallet:', item.name, 'blue');
                setWalletName(item.name);
                const selected = wallets.find(w => w.adapter.name === item.name);
                if (selected) {
                  select(selected.adapter.name);
                }
              };

              return (
                <Button
                  block
                  size='large'
                  className='wallet-provider thin-stroke'
                  shape='round'
                  type='default'
                  onClick={onClick}
                  key={item.name}
                  icon={<img alt={item.name} width={20} height={20} src={item.icon} style={{ marginRight: 8 }} />}
                >
                  <span className='align-middle'>{item.name}</span>
                </Button>
              );
            })}
          </div>
          {isDesktop && (
            <Button
              block
              size='large'
              className='wallet-providers-more-options wallet-provider thin-stroke'
              shape='round'
              type='default'
              onClick={() => setWalletListExpanded(state => !state)}
              icon={walletListExpanded ? <UpOutlined /> : <DownOutlined />}
              key='more-options'
            >
              <span className='align-middle'>
                {walletListExpanded
                  ? t('wallet-selector.more-options-expanded')
                  : t('wallet-selector.more-options-collapsed')}
              </span>
            </Button>
          )}
        </div>
      </Modal>
    </MeanFiWalletContext.Provider>
  );
}

export function useWallet() {
  const {
    wallet,
    connected,
    connecting,
    disconnecting,
    provider,
    signTransaction,
    resetWalletProvider,
    selectWalletProvider,
    isSelectingWallet,
  } = useContext(MeanFiWalletContext);

  const publicKey = connected && !disconnecting && !connecting ? wallet?.publicKey : null;
  return {
    wallet,
    provider,
    connected,
    connecting,
    signTransaction,
    resetWalletProvider,
    selectWalletProvider,
    publicKey,
    connect() {
      if (wallet) {
        wallet.connect();
      } else {
        selectWalletProvider();
      }
    },
    disconnect() {
      consoleOut('Disconnecting provider...', '', 'blue');
      if (wallet) {
        wallet.disconnect();
        isDisconnecting = true;
      }
    },
    isSelectingWallet,
  };
}
