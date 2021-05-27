import type { PublicKey } from "@solana/web3.js";

import Wallet from "@project-serum/sol-wallet-adapter";
import { Transaction } from "@solana/web3.js";
import { Button, Modal } from "antd";
import EventEmitter from "eventemitter3";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { notify } from "./../utils/notifications";
import { useConnectionConfig } from "./connection";
import { useLocalStorageState } from "./../utils/utils";
import { WALLET_PROVIDERS } from "../constants";

export interface WalletAdapter extends EventEmitter {
  publicKey: PublicKey | null;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  connect: () => any;
  disconnect: () => any;
}

const WalletContext = React.createContext<{
  wallet: WalletAdapter | undefined;
  connected: boolean;
  select: () => void;
  lastWalletProviderSuccess: string | undefined;
  provider: typeof WALLET_PROVIDERS[number] | undefined;
}>({
  wallet: undefined,
  connected: false,
  select() {},
  lastWalletProviderSuccess: undefined,
  provider: undefined,
});

export function WalletProvider({ children = null as any }) {
  const { endpoint } = useConnectionConfig();

  const [lastWalletProviderSuccess, setWalletSuccess] = useLocalStorageState("lastWalletProviderSuccess");
  const [autoConnect, setAutoConnect] = useState(true);
  const [providerUrl, setProviderUrl] = useLocalStorageState("walletProvider");

  const provider = WALLET_PROVIDERS.find(({ url }) => url === providerUrl);

  // const provider = useMemo(
  //   () => WALLET_PROVIDERS.find(({ url }) => url === providerUrl),
  //   [providerUrl]
  // );

  const wallet = useMemo(
    function () {
      if (provider) {
        return new (provider.adapter || Wallet)(
          providerUrl,
          endpoint
        ) as WalletAdapter;
      }
    },
    [provider, providerUrl, endpoint]
  );

  const [connected, setConnected] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const select = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);

  useEffect(() => {
    if (wallet) {
      wallet.on("connect", () => {
        if (wallet.publicKey) {
          // Save lastWalletProviderSuccess (The last successful connected attempt)
          setWalletSuccess(provider?.url);
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
            message: "Wallet update",
            description: "Connected to wallet " + keyToDisplay,
          });
        }
      });

      wallet.on("disconnect", () => {
        setConnected(false);
        notify({
          message: "Wallet update",
          description: "Disconnected from wallet",
        });
      });
    }

    return () => {
      setConnected(false);
      if (wallet) {
        wallet.disconnect();
      }
    };
  }, [wallet, provider, setWalletSuccess]);

  useEffect(() => {
    if (wallet && autoConnect) {
      try {
        wallet.connect();
        setAutoConnect(false);
      } catch (error) {
        console.log(error);
      }
    }

    return () => {};
  }, [wallet, autoConnect]);

  return (
    <WalletContext.Provider
      value={{
        wallet,
        connected,
        select,
        provider,
        lastWalletProviderSuccess
      }}>
      {children}
      <Modal
        className="mean-modal"
        title="Select Wallet"
        okText="Connect"
        visible={isModalVisible}
        okButtonProps={{ style: { display: "none" } }}
        onCancel={close}
        width={400}>
        <div className="account-settings-group">
          {WALLET_PROVIDERS.map((provider, index) => {
            const onClick = function () {
              setProviderUrl(provider.url);
              setAutoConnect(true);
              close();
            };

            return (
              <Button
                size="large"
                className="wallet-provider"
                shape="round"
                type={providerUrl === provider.url ? "primary" : "ghost"}
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
  const { wallet, connected, provider, lastWalletProviderSuccess, select } = useContext(WalletContext);
  return {
    wallet,
    connected,
    select,
    lastWalletProviderSuccess,
    provider,
    publicKey: wallet?.publicKey,
    connect() {
      wallet && lastWalletProviderSuccess === provider?.url ? wallet.connect() : select();
    },
    disconnect() {
      wallet?.disconnect();
    },
  };
}
