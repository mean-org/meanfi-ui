import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { SentreWalletAdapter, SentreWalletName } from '@sentre/connector';
import {
  Adapter,
  MessageSignerWalletAdapterProps,
  SignerWalletAdapterProps,
  WalletAdapterProps,
  WalletReadyState,
} from '@solana/wallet-adapter-base';
import { useWallet as useBaseWallet } from '@solana/wallet-adapter-react';
import {
  BitKeepWalletAdapter,
  BitKeepWalletName,
  BraveWalletAdapter,
  BraveWalletName,
  Coin98WalletAdapter,
  Coin98WalletName,
  CoinbaseWalletAdapter,
  CoinbaseWalletName,
  ExodusWalletAdapter,
  ExodusWalletName,
  LedgerWalletAdapter,
  LedgerWalletName,
  MathWalletAdapter,
  MathWalletName,
  PhantomWalletAdapter,
  PhantomWalletName,
  SlopeWalletAdapter,
  SlopeWalletName,
  SolflareWalletAdapter,
  SolflareWalletName,
  SolongWalletAdapter,
  SolongWalletName,
  TrustWalletAdapter,
  TrustWalletName,
} from '@solana/wallet-adapter-wallets';
import { Button, Modal } from 'antd';
import { openNotification } from 'components/Notifications';
import { sentreAppId } from 'constants/common';
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isDesktop, isSafari } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDefaultRpc } from 'services/connections-hq';
import { segmentAnalytics } from '../App';
import { AppUsageEvent } from '../middleware/segment-service';
import { consoleOut, isProd } from '../middleware/ui';
import { isUnauthenticatedRoute, useLocalStorageState } from '../middleware/utils';
import { XnftWalletAdapter, XnftWalletName, isInXnftWallet } from '../integrations/xnft/xnft-wallet-adapter';

// Flag to block processing of events when triggered multiple times
let isDisconnecting = false;

export interface WalletProviderEntry {
  name: string;
  url: string;
  icon: string;
  adapter: any;
  adapterParams: any;
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
    name: BraveWalletName,
    url: '',
    icon: '',
    adapter: BraveWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true,
  },
  {
    name: ExodusWalletName,
    url: '',
    icon: '',
    adapter: ExodusWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: true,
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
    hideOnDesktop: isDesktop && !isSafari ? false : true,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: false,
  },
  // These ones go into the [more] CTA
  {
    name: BitKeepWalletName,
    url: '',
    icon: '',
    adapter: BitKeepWalletAdapter,
    adapterParams: undefined,
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
    name: SlopeWalletName,
    url: '',
    icon: '',
    adapter: SlopeWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true,
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
    hideIfUnavailable: true,
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
  {
    name: SentreWalletName,
    url: '',
    icon: '',
    adapter: SentreWalletAdapter,
    adapterParams: { appId: sentreAppId },
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
  {
    name: XnftWalletName,
    url: '',
    icon: '',
    adapter: XnftWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true,
  },
];

const getIsProviderInstalled = (provider: any): boolean => {
  if (provider) {
    switch (provider.name) {
      case SentreWalletName:
        return true;
      case PhantomWalletName:
        return !!(window as any).solana?.isPhantom;
      case ExodusWalletName:
        return !!(window as any).exodus?.solana;
      case SlopeWalletName:
        return typeof (window as any).Slope === 'function' || (window as any).slopeApp ? true : false;
      case SolongWalletName:
        return !!(window as any).solong;
      case MathWalletName:
        return !!(window as any).solana?.isMathWallet;
      case Coin98WalletName:
        return !!(window as any).coin98?.sol;
      case SolflareWalletName:
        return !!(window as any).solflare?.isSolflare || !!(window as any).SolflareApp;
      case BitKeepWalletName:
        return !!(window as any).bitkeep?.solana;
      case CoinbaseWalletName:
        return !!(window as any).coinbaseSolana;
      case TrustWalletName:
        return !!(window as any).trustwallet?.isTrustWallet || !!(window as any).trustwallet?.solana?.isTrust;
      case LedgerWalletName:
        return true;
      case BraveWalletName:
        return !!(window as any).braveSolana?.isBraveWallet;
      case XnftWalletName:
        return isInXnftWallet();
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

export function MeanFiWalletProvider({ children = null as any }) {
  const { t } = useTranslation('common');
  const location = useLocation();
  const navigate = useNavigate();
  const [walletName, setWalletName] = useLocalStorageState('walletName');
  const {
    wallet,
    wallets,
    select,
    connect,
    connecting,
    disconnect,
    disconnecting,
    signMessage,
    sendTransaction,
    signTransaction,
    signAllTransactions,
  } = useBaseWallet();
  const [connected, setConnected] = useState(false);
  const [canConnect, setCanConnect] = useState(isDesktop);
  const [isSelectingWallet, setIsModalVisible] = useState(false);
  const selectWalletProvider = useCallback(() => {
    setIsModalVisible(true);
  }, []);
  const close = useCallback(() => {
    setIsModalVisible(false);
  }, []);
  const [walletListExpanded, setWalletListExpanded] = useState(isDesktop ? false : true);

  const resetWalletProvider = useCallback(() => {
    setWalletName(null);
  }, [setWalletName]);

  const provider = useMemo(() => {
    const item = WALLET_PROVIDERS.find(({ name }) => name === walletName);
    return item;
  }, [walletName]);

  useEffect(() => {
    for (const item of wallets) {
      const itemIndex = WALLET_PROVIDERS.findIndex(p => p.name === item.adapter.name);
      if (itemIndex !== -1) {
        WALLET_PROVIDERS[itemIndex].url = item.adapter.url;
        WALLET_PROVIDERS[itemIndex].icon = item.adapter.icon;
      }
    }
    if (isInXnftWallet() && (!wallet || wallet.adapter.name !== XnftWalletName)) {
      document.body.classList.add('in-xnft-wallet');
      setWalletName(XnftWalletName);
      select(XnftWalletName);
    } else if (walletName) {
      consoleOut('walletName:', walletName, 'blue');
      const wa = wallets.find(w => w.adapter.name === walletName);
      const walletEntry = WALLET_PROVIDERS.filter(w => !isProviderHidden(w, { isDesktop })).find(
        w => w.name === walletName,
      );
      consoleOut('provider:', wa, 'blue');
      if (!(wa && walletEntry)) {
        setWalletName(null);
      }
    } else {
      setWalletName(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletName, wallets, wallet]);

  useEffect(() => {
    if (walletName && wallet && wallet.readyState === WalletReadyState.Installed && canConnect) {
      console.log('trying autoconnect');
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canConnect, wallet, walletName]);

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
      if (isDisconnecting) {
        isDisconnecting = false;
        consoleOut('Wallet disconnect event fired:', '', 'blue');
        setConnected(false);
        setCanConnect(false);
        if (readyState !== WalletReadyState.Installed) return;
        navigate('/');
      }
    });
  }

  function setupOnErrorEvent(adapter: Adapter) {
    adapter.on('error', errorEvent => {
      consoleOut('Wallet error event fired:', '', 'blue');

      if (adapter.connecting) {
        setConnected(false);
        adapter.removeAllListeners();
        resetWalletProvider();
        selectWalletProvider();
      }
    });
  }

  // // Setup listeners
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        className="mean-modal simple-modal"
        title={<div className="modal-title">{t(`wallet-selector.primary-action`)}</div>}
        open={isSelectingWallet}
        footer={null}
        maskClosable={connected}
        closable={connected}
        onCancel={close}
        width={450}
      >
        <div className="connect-wallet-modal vertical-scroll">
          <div className="mb-3 text-center">
            <h2>{t('wallet-selector.connect-to-begin')}</h2>
          </div>
          <div className={`wallet-providers ${walletListExpanded ? 'expanded' : ''}`}>
            {WALLET_PROVIDERS.map((item, index) => {
              const isInstalled = getIsProviderInstalled(item);
              // Skip items that won't show up
              if (isProviderHidden(item, { isDesktop })) {
                return null;
              }

              const onClick = function () {
                if (wallet) {
                  disconnect();
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
                  if (!isDesktop && !canConnect) {
                    setCanConnect(true);
                  }
                }
              };

              return (
                <Button
                  block
                  size="large"
                  className="wallet-provider thin-stroke"
                  shape="round"
                  type="ghost"
                  onClick={onClick}
                  key={item.name}
                  icon={<img alt={`${item.name}`} width={20} height={20} src={item.icon} style={{ marginRight: 8 }} />}
                >
                  <span className="align-middle">{item.name}</span>
                </Button>
              );
            })}
          </div>
          {isDesktop && (
            <Button
              block
              size="large"
              className="wallet-providers-more-options thin-stroke"
              shape="round"
              type="ghost"
              onClick={() => setWalletListExpanded(state => !state)}
              icon={walletListExpanded ? <UpOutlined /> : <DownOutlined />}
              key="more-options"
            >
              <span className="align-middle">
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
      consoleOut(`Disconnecting provider...`, '', 'blue');
      resetWalletProvider();
      isDisconnecting = true;
      wallet?.disconnect();
    },
    isSelectingWallet,
  };
}
