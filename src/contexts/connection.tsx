import React, { useContext, useEffect, useMemo, useState } from "react";
import { setProgramIds } from "../utils/ids";
import { cache, getMultipleAccounts, MintParser } from "./accounts";
import { ENV as ChainID, TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { environment } from "../environments/environment";
import { Cluster, Connection, ConnectionConfig, PublicKey } from "@solana/web3.js";
import { DEFAULT_RPCS, RpcConfig } from "../models/connections-hq";
import { useLocalStorageState } from "./../utils/utils";
import { TRANSACTION_STATUS_RETRY_TIMEOUT } from "../constants";

const DEFAULT = DEFAULT_RPCS[0].httpProvider;
const DEFAULT_SLIPPAGE = 0.25;

export const failsafeConnectionConfig: ConnectionConfig = {
  commitment: "recent",
  confirmTransactionInitialTimeout: TRANSACTION_STATUS_RETRY_TIMEOUT
}

export const getNetworkIdByCluster = (cluster: Cluster) => {
  switch (cluster) {
    case "devnet":
      return ChainID.Devnet;
    case "testnet":
      return ChainID.Testnet;
    default:
      return ChainID.MainnetBeta;
  }
}

export const getNetworkIdByEnvironment = (env: string) => {
  switch (env) {
    case "local":
    case "staging":
    case "development":
      return ChainID.Devnet;
    case "production":
    default:
      return ChainID.MainnetBeta;
  }
}

export const getSolanaExplorerClusterParam = (): string => {
  switch (environment) {
    case 'local':
    case 'development':
    case 'staging':
      return '?cluster=devnet';
    default:
      return '';
  }
}

interface ConnectionProviderConfig {
  connection: Connection;
  endpoint: string;
  slippage: number;
  setSlippage: (val: number) => void;
  cluster: Cluster;
  tokens: TokenInfo[];
  tokenMap: Map<string, TokenInfo>;
}

const ConnectionContext = React.createContext<ConnectionProviderConfig>({
  endpoint: DEFAULT,
  slippage: DEFAULT_SLIPPAGE,
  setSlippage: (val: number) => {},
  connection: new Connection(DEFAULT, "recent"),
  cluster: DEFAULT_RPCS[0].cluster,
  tokens: [],
  tokenMap: new Map<string, TokenInfo>(),
});

export function ConnectionProvider({ children = undefined as any }) {

  const [cachedRpcJson] = useLocalStorageState("cachedRpc");
  const cachedRpc = (cachedRpcJson as RpcConfig);

  const [slippage, setSlippage] = useLocalStorageState(
    "slippage",
    DEFAULT_SLIPPAGE.toString()
  );

  const connection = useMemo(() => new Connection(cachedRpc.httpProvider, failsafeConnectionConfig), [
    cachedRpc,
  ]);

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  useEffect(() => {
    // fetch token files
    (async () => {
      const list = MEAN_TOKEN_LIST.filter(t => t.chainId === cachedRpc.networkId);
      const knownMints = list.reduce((map, item) => {
        map.set(item.address, item);
        return map;
      }, new Map<string, TokenInfo>());

      try {
        const accounts = await getMultipleAccounts(connection, [...knownMints.keys()], 'recent');
        if (accounts) {
          cache.clear();
          accounts.keys.forEach((key, index) => {
            const account = accounts.array[index];
            if(!account) {
              return;
            }
            cache.add(new PublicKey(key), account, MintParser);
          })
        }
      } catch (error) {
        console.log('Cache update failed.', error);
        throw(error);
      }

      setTokenMap(knownMints);
      setTokens(list);

    })();

    return () => { }

  }, [
    cachedRpc.networkId,
    connection
  ]);

  setProgramIds(cachedRpc.cluster);

  return (
    <ConnectionContext.Provider
      value={{
        endpoint: cachedRpc.httpProvider,
        slippage: parseFloat(slippage),
        setSlippage: (val) => setSlippage(val.toString()),
        connection,
        tokens,
        tokenMap,
        cluster: cachedRpc.cluster,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext).connection as Connection;
}

export function useConnectionConfig() {
  const context = useContext(ConnectionContext);
  return {
    endpoint: context.endpoint,
    cluster: context.cluster,
    tokens: context.tokens,
    tokenMap: context.tokenMap,
  };
}

export function useSlippageConfig() {
  const { slippage, setSlippage } = useContext(ConnectionContext);
  return { slippage, setSlippage };
}
