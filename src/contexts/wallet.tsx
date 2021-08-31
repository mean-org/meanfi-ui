import { Button, Modal } from "antd";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { notify } from "./../utils/notifications";
import { useLocalStorageState } from "./../utils/utils";
import { WalletName } from "../wallet-adapters/wallets";
import { SolongWalletAdapter } from "../wallet-adapters/solong";
import { PhantomWalletAdapter } from "../wallet-adapters/phantom";
import { MathWalletWalletAdapter } from "../wallet-adapters/mathwallet";
import { SolflareWalletAdapter } from "../wallet-adapters/solflare";
import { Coin98WalletAdapter } from "../wallet-adapters/coin98";
import { WalletConnectWalletAdapter } from "../wallet-adapters/walletconnect";
import { useTranslation } from "react-i18next";
import { WalletAdapter } from "money-streaming/lib/wallet-adapter";

const ICONS_URL = "/assets/wallets/";
export const WALLET_PROVIDERS = [
  {
    name: WalletName.Phantom,
    url: 'https://www.phantom.app',
    icon: `${ICONS_URL}/phantom.svg`,
    adapter: PhantomWalletAdapter,
    hasExtension: true
  },
  {
    name: WalletName.Coin98,
    url: 'https://coin98.com',
    icon: `${ICONS_URL}/coin98.svg`,
    adapter: Coin98WalletAdapter,
    hasExtension: true
  },
  {
    name: WalletName.Solong,
    url: 'https://solongwallet.com',
    icon: `${ICONS_URL}/solong.png`,
    adapter: SolongWalletAdapter,
    hasExtension: true
  },
  {
    name: WalletName.Solflare,
    url: "https://solflare.com/access-wallet",
    icon: `${ICONS_URL}/solflare.svg`,
    adapter: SolflareWalletAdapter,
    hasExtension: true
  },
  {
    name: WalletName.MathWallet,
    url: 'https://mathwallet.org',
    icon: `${ICONS_URL}/mathwallet.svg`,
    adapter: MathWalletWalletAdapter,
    hasExtension: true
  },
  {
    name: WalletName.WalletConnect,
    url: 'https://walletconnect.org',
    icon: `${ICONS_URL}/walletconnect.svg`,
    adapter: WalletConnectWalletAdapter,
    hasExtension: true
  },
];

const getIsProviderAvailable = (provider: any): boolean => {
  if (provider.hasExtension) {
    switch (provider.name) {
      case WalletName.Phantom:
        return !!(window as any).solana?.isPhantom;
      case WalletName.Solong:
        return !!(window as any).solong;
      case WalletName.MathWallet:
        return !!(window as any).solana?.isMathWallet;
      case WalletName.Coin98:
        return !!(window as any).coin98;
      case WalletName.Solflare:
        return !!(window as any).solflare?.isSolflare;
      case WalletName.WalletConnect:
        return true;
    }
  }
  return false;
}

const WalletContext = React.createContext<{
  wallet: WalletAdapter | undefined;
  connected: boolean;
  select: () => void;
  provider: typeof WALLET_PROVIDERS[number] | undefined;
  resetWalletProvider: () => void;
}>({
  wallet: undefined,
  connected: false,
  select() {},
  provider: undefined,
  resetWalletProvider: () => {},
});

export function WalletProvider({ children = null as any }) {
  const { t } = useTranslation("common");

  const [autoConnect, setAutoConnect] = useState(false);
  const [providerUrl, setProviderUrl] = useLocalStorageState("walletProvider");

  const resetWalletProvider = () => {
    setProviderUrl(null);
  }

  const provider = useMemo(
    () => WALLET_PROVIDERS.find(({ url }) => url === providerUrl),
    [providerUrl]
  );

  const wallet = useMemo(
    function () {
      if (provider) {
        return new (provider.adapter)() as WalletAdapter;
      }
    },
    [provider]
  );

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (wallet) {
      wallet.on("connect", () => {
        if (wallet.publicKey) {
          setConnected(true);
          const walletPublicKey = wallet.publicKey.toBase58();
          const keyToDisplay =
            walletPublicKey.length > 20
              ? `${walletPublicKey.substring(
                  0,
                  7
                )}.....${walletPublicKey.substring(
                  walletPublicKey.length - 7,
                  walletPublicKey.length
                )}`
              : walletPublicKey;

          notify({
            message: t('notifications.wallet-connection-event-title'),
            description: t('notifications.wallet-connect-message', {address: keyToDisplay}),
            type: 'info'
          });
        }
      });

      wallet.on("disconnect", () => {
        setConnected(false);
      });
    }

    return () => {
      setConnected(false);
      if (wallet) {
        wallet.disconnect();
      }
    };
  }, [wallet]);

  useEffect(() => {
    if (wallet && autoConnect) {
      wallet.connect();
      setAutoConnect(false);
    }

    return () => {};
  }, [wallet, autoConnect]);

  const [isModalVisible, setIsModalVisible] = useState(false);

  const select = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connected,
        select,
        provider,
        resetWalletProvider,
      }}>
      {children}
      <Modal
        className="mean-modal"
        title={t(`wallet-selector.primary-action`)}
        okText="Connect"
        visible={isModalVisible}
        footer={null}
        onCancel={close}
        width={400}>
        <div className="wallet-providers">
          {WALLET_PROVIDERS.map((provider, index) => {
            const isProviderAvailable = getIsProviderAvailable(provider);
            const onClick = function () {
              if (isProviderAvailable) {
                if (wallet) {
                  wallet.disconnect();
                }
                setProviderUrl(provider.url);
                setAutoConnect(true);
              } else {
                window.open(provider.url, '_blank', 'noreferrer');
              }
              close();
            };

            return (
              <Button
                size="large"
                className="wallet-provider"
                shape="round"
                type="ghost"
                onClick={onClick}
                key={index}
                icon={
                  <img
                    alt={`${provider.name}`}
                    width={20}
                    height={20}
                    src={provider.icon}
                    style={{ marginRight: 8 }}
                  />
                }
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 8,
                }}>
                {provider.name}
              </Button>
            );
          })}
        </div>
      </Modal>
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const { wallet, connected, provider, select, resetWalletProvider } = useContext(WalletContext);

  return {
    wallet,
    connected,
    provider,
    select,
    resetWalletProvider,
    publicKey: wallet?.publicKey,
    connect() {
      wallet ? wallet.connect() : select();
    },
    disconnect() {
      wallet?.disconnect();
    },
  };
}
