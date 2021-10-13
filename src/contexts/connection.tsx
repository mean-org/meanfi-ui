import React, { useContext, useEffect, useMemo, useState } from "react";
import { setProgramIds } from "../utils/ids";
import { cache, getMultipleAccounts, MintParser } from "./accounts";
import { ENV as ChainID, TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { environment } from "../environments/environment";
import { useLocalStorageState } from "./../utils/utils";
import { Account, Cluster, clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { ConnectionEndpoint, RpcConfig } from "../models/connections-hq";
import useConnectionHq from "../hooks/useConnectionHq";

export const ENDPOINTS: ConnectionEndpoint[] = [
  {
    cluster: "mainnet-beta",
    httpProvider: clusterApiUrl("mainnet-beta"),
    networkId: ChainID.MainnetBeta,
  },
  {
    cluster: "testnet",
    httpProvider: clusterApiUrl("testnet"),
    networkId: ChainID.Testnet,
  },
  {
    cluster: "devnet",
    httpProvider: clusterApiUrl("devnet"),
    networkId: ChainID.Devnet,
  }
];

const DEFAULT = ENDPOINTS[0].httpProvider;
const DEFAULT_SLIPPAGE = 0.25;

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

export const getEndpointByRuntimeEnv = (): string => {
  switch (environment) {
    case 'local':
    case 'development':
      return ENDPOINTS[2].httpProvider;
    case 'staging':
      return ENDPOINTS[1].httpProvider;
    case 'production':
    default:
      return ENDPOINTS[0].httpProvider;
  }
}

export const getSolanaExplorerClusterParam = (): string => {
  switch (environment) {
    case 'local':
    case 'development':
      return '?cluster=devnet';
    case 'staging':
      return '?cluster=testnet';
    default:
      return '';
  }
}

interface ConnectionConfig {
  connection: Connection;
  swapConnection: Connection | undefined;
  endpoint: string;
  slippage: number;
  setSlippage: (val: number) => void;
  cluster: Cluster;
  setEndpoint: (val: string) => void;
  nextRpcEndpoint: () => void;
  tokens: TokenInfo[];
  tokenMap: Map<string, TokenInfo>;
}

const ConnectionContext = React.createContext<ConnectionConfig>({
  endpoint: DEFAULT,
  setEndpoint: () => {},
  nextRpcEndpoint: () => {},
  slippage: DEFAULT_SLIPPAGE,
  setSlippage: (val: number) => {},
  connection: new Connection(DEFAULT, "recent"),
  cluster: ENDPOINTS[0].cluster,
  tokens: [],
  tokenMap: new Map<string, TokenInfo>(),
  swapConnection: undefined
});

export function ConnectionProvider({ children = undefined as any }) {

  const [lastUsedRpc, setLastUsedRpc] = useLocalStorageState("lastUsedRpc");

  const nextRpcEndpoint = () => {
    // Forcefully set a different endpoint.
  }

  // const [endpoint, setEndpoint] = useState(getEndpointByRuntimeEnv());

  const [endpoint, setEndpoint] = useState((lastUsedRpc as RpcConfig).httpProvider || getEndpointByRuntimeEnv());
  const [slippage, setSlippage] = useLocalStorageState(
    "slippage",
    DEFAULT_SLIPPAGE.toString()
  );

  const connection = useMemo(() => new Connection(endpoint, "recent"), [
    endpoint,
  ]);

  const sendConnection = useMemo(() => new Connection(endpoint, "recent"), [
    endpoint,
  ]);

  // FIxed for now
  // const swapConnection = useMemo(() => new Connection(ENDPOINTS[0].httpProvider, "confirmed"), []);

  const { selectedRpcEndpoint, isSuccessful, isNetworkFailure } = useConnectionHq(101);
  // If isNetworkFailure turns true in any moment just go to root
  if (isNetworkFailure) {
    window.location.href = '/';
  }

  // Use the value of 'endpoint' if the the cluster is mainnet or use the solana public API
  const swapConnection = useMemo(() => {
    const isMainnetRpc = lastUsedRpc && (lastUsedRpc as RpcConfig).cluster === "mainnet-beta" ? true : false;
    if (selectedRpcEndpoint && isSuccessful) {
      return new Connection(isMainnetRpc ? endpoint : selectedRpcEndpoint.httpProvider, "confirmed")
    }
  }, [
    endpoint,
    lastUsedRpc,
    isSuccessful,
    selectedRpcEndpoint
  ]);

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  const chain = lastUsedRpc ? (lastUsedRpc as RpcConfig) : ENDPOINTS.find((end) => end.httpProvider === endpoint) || ENDPOINTS[0];
  const env = chain.cluster;

  useEffect(() => {
    // fetch token files
    (async () => {
      let list: TokenInfo[];
      // if (environment === 'production') {
      //   const res = await new TokenListProvider().resolve();
      //   list = res
      //     .filterByChainId(chain.networkId)
      //     .excludeByTag("nft")
      //     .getList();
      // }
      list = MEAN_TOKEN_LIST.filter(t => t.chainId === chain.networkId);
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

  }, [connection, chain]);

  setProgramIds(env);

  return (
    <ConnectionContext.Provider
      value={{
        endpoint,
        setEndpoint,
        nextRpcEndpoint,
        slippage: parseFloat(slippage),
        setSlippage: (val) => setSlippage(val.toString()),
        connection,
        tokens,
        tokenMap,
        cluster: env,
        swapConnection
      }}
    >
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection() {
  return useContext(ConnectionContext).connection as Connection;
}

export function useSwapConnection() {
  return useContext(ConnectionContext).swapConnection as Connection;
}

export function useConnectionConfig() {
  const context = useContext(ConnectionContext);
  return {
    endpoint: context.endpoint,
    setEndpoint: context.setEndpoint,
    nextRpcEndpoint: context.nextRpcEndpoint,
    cluster: context.cluster,
    tokens: context.tokens,
    tokenMap: context.tokenMap,
  };
}

export function useSlippageConfig() {
  const { slippage, setSlippage } = useContext(ConnectionContext);
  return { slippage, setSlippage };
}
