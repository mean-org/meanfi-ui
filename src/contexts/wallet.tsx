import Wallet from "@project-serum/sol-wallet-adapter";
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
import { Coin98WalletAdapter } from "../wallet-adapters/coin98";
import { WalletConnectWalletAdapter } from "../wallet-adapters/walletconnect";
import { useTranslation } from "react-i18next";
import { WalletAdapter } from "money-streaming/lib/wallet-adapter";
import { isDesktop } from "react-device-detect";
import { useConnectionConfig } from "./connection";

const ICONS_URL = "/assets/wallets/";
export const WALLET_PROVIDERS = [
  {
    name: WalletName.Phantom,
    url: 'https://www.phantom.app',
    icon: `${ICONS_URL}/phantom.svg`,
    adapter: PhantomWalletAdapter
  },
  {
    name: WalletName.Coin98,
    url: 'https://wallet.coin98.com/',
    icon: `${ICONS_URL}/coin98.svg`,
    adapter: Coin98WalletAdapter
  },
  {
    name: WalletName.Solong,
    url: 'https://solongwallet.com',
    icon: `${ICONS_URL}/solong.png`,
    adapter: SolongWalletAdapter
  },
  {
    name: WalletName.Solflare,
    url: "https://solflare.com/access-wallet",
    icon: `${ICONS_URL}/solflare.svg`,
  },
  {
    name: WalletName.MathWallet,
    url: 'https://mathwallet.org',
    icon: `${ICONS_URL}/mathwallet.svg`,
    adapter: MathWalletWalletAdapter
  },
  {
    name: WalletName.WalletConnect,
    url: 'https://walletconnect.org',
    icon: `${ICONS_URL}/walletconnect.svg`,
    adapter: WalletConnectWalletAdapter
  },
];

const getIsProviderInstalled = (provider: any): boolean => {
  if (provider.adapter) {
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
      default:
        return false;
    }
  }
  return true;
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
  const { endpoint } = useConnectionConfig();

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
        if (provider.adapter) {
          return new (provider.adapter)() as WalletAdapter;
        } else {
          return new Wallet(
            providerUrl,
            endpoint
          ) as WalletAdapter;
        }
      }
    },
    [
      provider,
      endpoint,
      providerUrl,
    ]
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
          {WALLET_PROVIDERS.map((item, index) => {
            const isInstalled = getIsProviderInstalled(item);
            const onClick = function () {
              if (wallet) {
                wallet.disconnect();
              }
              // TODO: This is not the right way of doing this, there most be a better way
              setTimeout(() => {
                setProviderUrl(item.url);
                setAutoConnect(true);
              }, 800);
              close();
              if (!isInstalled) {
                window.open(item.url, '_blank');
              }
            };

            return (
              <Button
                block
                size="large"
                className="wallet-provider"
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
                {item.name}
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
