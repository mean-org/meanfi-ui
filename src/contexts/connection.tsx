import React, { useContext, useEffect, useMemo, useState } from "react";
import { setProgramIds } from "../utils/ids";
import { cache, getMultipleAccounts, MintParser } from "./accounts";
import { ENV as ChainID, TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { environment } from "../environments/environment";
import { useLocalStorageState } from "./../utils/utils";
import { Account, Cluster, clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import { ConnectionEndpoint, RpcConfig } from "../models/connections-hq";

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
  sendConnection: Connection;
  swapConnection: Connection;
  endpoint: string;
  slippage: number;
  setSlippage: (val: number) => void;
  cluster: Cluster;
  setEndpoint: (val: string) => void;
  tokens: TokenInfo[];
  tokenMap: Map<string, TokenInfo>;
}

const ConnectionContext = React.createContext<ConnectionConfig>({
  endpoint: DEFAULT,
  setEndpoint: () => {},
  slippage: DEFAULT_SLIPPAGE,
  setSlippage: (val: number) => {},
  connection: new Connection(DEFAULT, "recent"),
  sendConnection: new Connection(DEFAULT, "recent"),
  cluster: ENDPOINTS[0].cluster,
  tokens: [],
  tokenMap: new Map<string, TokenInfo>(),
  swapConnection: new Connection(ENDPOINTS[0].httpProvider, "confirmed")
});

export function ConnectionProvider({ children = undefined as any }) {

  const [lastUsedRpc, setLastUsedRpc] = useLocalStorageState("lastUsedRpc");
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

  const swapConnection = useMemo(() => new Connection(ENDPOINTS[0].httpProvider, "confirmed"), []);

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map());

  const chain = lastUsedRpc ? (lastUsedRpc as RpcConfig) : ENDPOINTS.find((end) => end.httpProvider === endpoint) || ENDPOINTS[0];
  const env = chain.cluster;

  useEffect(() => {
    cache.clear();
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

      const accounts = await getMultipleAccounts(connection, [...knownMints.keys()], 'recent');
      accounts.keys.forEach((key, index) => {
        const account = accounts.array[index];
        if(!account) {
          return;
        }
        cache.add(new PublicKey(key), account, MintParser);
      })

      setTokenMap(knownMints);
      setTokens(list);

    })();

    return () => { }

  }, [connection, chain]);

  setProgramIds(env);

  // The websocket library solana/web3.js uses closes its websocket connection when the subscription list
  // is empty after opening its first time, preventing subsequent subscriptions from receiving responses.
  // This is a hack to prevent the list from every getting empty
  useEffect(() => {
    const id = connection.onAccountChange(new Account().publicKey, () => {});
    return () => {
      connection.removeAccountChangeListener(id);
    };
  }, [connection]);

  useEffect(() => {
    const id = connection.onSlotChange(() => null);
    return () => {
      connection.removeSlotChangeListener(id);
    };
  }, [connection]);

  useEffect(() => {
    const id = sendConnection.onAccountChange(
      new Account().publicKey,
      () => {}
    );
    return () => {
      sendConnection.removeAccountChangeListener(id);
    };
  }, [sendConnection]);

  useEffect(() => {
    const id = sendConnection.onSlotChange(() => null);
    return () => {
      sendConnection.removeSlotChangeListener(id);
    };
  }, [sendConnection]);

  return (
    <ConnectionContext.Provider
      value={{
        endpoint,
        setEndpoint,
        slippage: parseFloat(slippage),
        setSlippage: (val) => setSlippage(val.toString()),
        connection,
        sendConnection,
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

export function useSendConnection() {
  return useContext(ConnectionContext)?.sendConnection;
}

export function useConnectionConfig() {
  const context = useContext(ConnectionContext);
  return {
    endpoint: context.endpoint,
    setEndpoint: context.setEndpoint,
    cluster: context.cluster,
    tokens: context.tokens,
    tokenMap: context.tokenMap,
  };
}

export function useSlippageConfig() {
  const { slippage, setSlippage } = useContext(ConnectionContext);
  return { slippage, setSlippage };
}
