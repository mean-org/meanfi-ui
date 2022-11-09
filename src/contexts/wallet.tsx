import { DownOutlined, UpOutlined } from "@ant-design/icons";
import { SentreWalletAdapter, SentreWalletName } from '@sentre/connector';
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
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
  SolletExtensionWalletAdapter,
  SolletExtensionWalletName,
  SolletWalletAdapter,
  SolletWalletName,
  SolongWalletAdapter,
  SolongWalletName,
  TrustWalletAdapter,
  TrustWalletName
} from "@solana/wallet-adapter-wallets";
import { Button, Modal } from "antd";
import { openNotification } from "components/Notifications";
import { sentreAppId } from "constants/common";
import { environment } from "environments/environment";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { isDesktop, isSafari } from "react-device-detect";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getDefaultRpc } from "services/connections-hq";
import { segmentAnalytics } from "../App";
import { AppUsageEvent } from "../middleware/segment-service";
import { consoleOut, isProd } from "../middleware/ui";
import { isUnauthenticatedRoute, useLocalStorageState } from "../middleware/utils";
import { XnftWalletAdapter, XnftWalletName, isInXnftWallet } from '../integrations/xnft/xnft-wallet-adapter';

export type MeanFiWallet = PhantomWalletAdapter | ExodusWalletAdapter | SolflareWalletAdapter
                          | SlopeWalletAdapter | Coin98WalletAdapter | SolongWalletAdapter | SolletWalletAdapter
                          | SolletExtensionWalletAdapter | MathWalletAdapter | TrustWalletAdapter | LedgerWalletAdapter
                          | BitKeepWalletAdapter | CoinbaseWalletAdapter | SentreWalletAdapter | BraveWalletAdapter |       XnftWalletAdapter | undefined;

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
    hideIfUnavailable: false
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
    hideIfUnavailable: true
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
    hideIfUnavailable: false
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
    hideIfUnavailable: false
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
    hideIfUnavailable: false
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
    hideIfUnavailable: false
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
    hideIfUnavailable: true
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
    hideIfUnavailable: true
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
    hideIfUnavailable: true
  },
  {
    name: SolletWalletName,
    url: '',
    icon: '',
    adapter: SolletWalletAdapter,
    adapterParams: { provider: 'https://www.sollet.io', timeout: 10000, network: environment === 'production' ? WalletAdapterNetwork.Mainnet : WalletAdapterNetwork.Devnet },
    hideOnDesktop: false,
    hideOnMobile: false,
    isWebWallet: true,
    underDevelopment: false,
    hideIfUnavailable: false
  },
  {
    name: SolletExtensionWalletName,
    url: '',
    icon: '',
    adapter: SolletExtensionWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: isSafari ? true : false,
    hideOnMobile: true,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true
  },
  {
    name: TrustWalletName,
    url: '',
    icon: '',
    adapter: TrustWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: true,
    hideOnMobile: false,
    isWebWallet: true,
    underDevelopment: false,
    hideIfUnavailable: false
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
    hideIfUnavailable: false
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
    hideIfUnavailable: true
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
    hideIfUnavailable: true
  },
  {
    name: XnftWalletName,
    url: '',
    icon: '',
    adapter: XnftWalletAdapter,
    adapterParams: undefined,
    hideOnDesktop: true,
    hideOnMobile: true,
    isWebWallet: false,
    underDevelopment: false,
    hideIfUnavailable: true
  }
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
      case SolletWalletName:
      case SolletExtensionWalletName:
        return !!(window as any).sollet && typeof (window as any).sollet?.postMessage === 'function';
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

interface WalletContextState {
  wallet: MeanFiWallet;
  connected: boolean;
  connecting: boolean;
  autoConnect: boolean;
  isSelectingWallet: boolean;
  provider: typeof WALLET_PROVIDERS[number] | undefined;
  resetWalletProvider: () => void;
  select: () => void;
}

const defaultCtxValues: WalletContextState = {
  wallet: undefined,
  connected: false,
  connecting: true,
  autoConnect: true,
  provider: undefined,
  isSelectingWallet: false,
  resetWalletProvider: () => {},
  select: () => {},
};

const WalletContext = React.createContext<WalletContextState>(defaultCtxValues);

export function WalletProvider({ children = null as any }) {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const [autoConnect] = useState(true);
  const [walletName, setWalletName] = useLocalStorageState("walletName");
  const [lastUsedAccount] = useLocalStorageState("lastUsedAccount");
  const [wallet, setWallet] = useState<MeanFiWallet>(undefined);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [isSelectingWallet, setIsModalVisible] = useState(false);
  const select = useCallback(() => {
    setIsModalVisible(true);
  }, []);
  const close = useCallback(() => {
    setIsModalVisible(false);
  }, []);
  const [walletListExpanded, setWalletListExpanded] = useState(isDesktop ? false : true);

  // Live reference to the wallet adapter
  const walletRef = useRef(wallet);
  useEffect(() => {
    walletRef.current = wallet;
  }, [wallet]);

  const forgetWallet = useCallback(() => {
    setConnected(false);
    setWalletName(null);
    setWallet(undefined);
  }, [setWalletName]);

  const connectOnDemand = useCallback(() => {
    if (!wallet) { return; }

    wallet.connect()
    .catch(error => {
      console.error('wallet.connect() error', error);
      if (error.toString().indexOf('WalletNotReadyError') !== -1) {
        console.warn('Enforcing wallet selection...');
        openNotification({
          type: "info",
          title: 'Wallet adapter not configured',
          description: `Cannot connect to ${wallet.name}. Wallet is not configured or enabled in your browser.`
        });
        forgetWallet();
      }
    });
  }, [wallet, forgetWallet]);

  const resetWalletProvider = () => {
    setWalletName(null);
  }

  const provider = useMemo(() => {
    const item = WALLET_PROVIDERS.find(({ name }) => name === walletName);
    return item;
  },
    [walletName]
  );

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
          new SolletWalletAdapter(),
          new SolletExtensionWalletAdapter(),
          new TrustWalletAdapter(),
          new MathWalletAdapter(),
          new LedgerWalletAdapter(),
          new SentreWalletAdapter({ appId: sentreAppId }),
          new XnftWalletAdapter(),
      ],
      [network]
  );
  
  useEffect(()=>{
    if(isInXnftWallet()) {
      document.body.classList.add('in-xnft-wallet');
      setWalletName(XnftWalletName);
      setWallet(wallets.find(w => w.name === XnftWalletName));
    }
  }, [setWalletName, wallets]);

  useEffect(() => {
    if (wallets) {
      for (const item of wallets) {
        const itemIndex = WALLET_PROVIDERS.findIndex(p => p.name === item.name);
        if (itemIndex !== -1) {
          WALLET_PROVIDERS[itemIndex].url = item.url;
          WALLET_PROVIDERS[itemIndex].icon = item.icon;
        }
      }
      if (walletName) {
        consoleOut('walletName:', walletName, 'blue');
        const wa = wallets.find(w => w.name === walletName);
        consoleOut('provider:', wa, 'blue');
        if (wa) {
          setWallet(wa);
        } else {
          setWalletName(null);
          setWallet(undefined);
        }
      } else {
        setWalletName(null);
        setWallet(undefined);
      }
    }
  }, [walletName, setWalletName, wallets]);

  // Keep up with connecting flag
  useEffect(() => {
    if (wallet) {
      setConnecting(wallet.connecting);
    } else {
      setConnecting(false);
    }
  }, [wallet]);

  // Setup listeners
  useEffect(() => {
    if (wallet) {

      wallet.on("connect", (pk) => {
        if (wallet.connected && !wallet.connecting && pk.toBase58() !== lastUsedAccount) {
          setConnected(false);
          wallet.removeAllListeners();
          resetWalletProvider();
          select();
        } else if (wallet.publicKey) {
          setConnected(true);
          close();
        }
      });

      wallet.on("disconnect", () => {
        setConnected(false);
        if (!isUnauthenticatedRoute(location.pathname)) {
          navigate('/');
        }
      });

      wallet.on("error", (errorEvent) => {
        if (wallet.connecting) {
          setConnected(false);
          wallet.removeAllListeners();
          resetWalletProvider();
          select();
        }
      });
    }

    return () => {
      setConnected(false);
      if (wallet) {
        wallet.disconnect();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, lastUsedAccount]);

  // Handle connect
  useEffect(() => {

    // When a wallet is created, selected and the autoConnect is ON, lets connect
    if (wallet && autoConnect) {
      consoleOut('Auto-connecting...', '', 'blue');
      connectOnDemand();
    }

    return () => {};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, autoConnect]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connected,
        connecting,
        select,
        provider,
        autoConnect,
        resetWalletProvider,
        isSelectingWallet
      }}>
      {children}
      <Modal
        centered
        className="mean-modal simple-modal"
        title={<div className="modal-title">{t(`wallet-selector.primary-action`)}</div>}
        open={!isInXnftWallet() && isSelectingWallet}
        footer={null}
        maskClosable={connected}
        closable={connected}
        onCancel={close}
        width={450}>
        <div className="connect-wallet-modal vertical-scroll">
          <div className="mb-3 text-center">
            <h2>{t('wallet-selector.connect-to-begin')}</h2>
          </div>
          <div className={`wallet-providers ${walletListExpanded ? 'expanded' : ''}`}>
            {WALLET_PROVIDERS.map((item, index) => {

              const isInstalled = getIsProviderInstalled(item);

              const shouldHideItem = () => {
                if ((item.hideOnDesktop && isDesktop) || (item.hideOnMobile && !isDesktop)) {
                  return true;
                } else {
                  return false;
                }
              }

              // Skip items that won't show up
              if ((item.underDevelopment && isProd()) || (item.hideIfUnavailable && !isInstalled)) {
                return null;
              }

              const onClick = function () {

                if (wallet) {
                  wallet.disconnect();
                }

                // Record user event in Segment Analytics
                segmentAnalytics.recordEvent(AppUsageEvent.WalletSelected, {
                  walletProvider: item.name,
                  isWebWallet: item.isWebWallet
                });

                // If not installed take the user to its extension url
                if (!isInstalled) {
                  window.open(item.url, '_blank');
                }

                consoleOut('Selected wallet:', item.name, 'blue');
                setWalletName(item.name);
                setWallet(wallets.find(w => w.name === item.name));

              };

              return (
                <Button
                  block
                  size="large"
                  className={`wallet-provider thin-stroke${shouldHideItem() ? ' hidden' : ''}`}
                  shape="round"
                  type="ghost"
                  onClick={onClick}
                  key={index}
                  icon={
                    <img
                      alt={`${item.name}`}
                      width={20}
                      height={20}
                      src={item.icon}
                      style={{ marginRight: 8 }}
                    />
                  }>
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
              key="more-options">
              <span className="align-middle">{
                walletListExpanded
                  ? t('wallet-selector.more-options-expanded')
                  : t('wallet-selector.more-options-collapsed')
              }</span>
            </Button>
          )}
        </div>
      </Modal>
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const { wallet, connected, connecting, provider, autoConnect, resetWalletProvider, select, isSelectingWallet } = useContext(WalletContext);

  return {
    wallet,
    provider,
    connected,
    connecting,
    select,
    autoConnect,
    resetWalletProvider,
    publicKey: wallet?.publicKey,
    connect() {
      if  (wallet) {
        wallet.connect();
      } else {
        select();
      }
    },
    disconnect() {
      consoleOut(`Disconnecting provider...`, '', 'blue');
      wallet?.disconnect();
      resetWalletProvider();
    },
    isSelectingWallet
  };
}
