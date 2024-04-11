import { Cluster, Connection } from '@solana/web3.js';
import useLocalStorage from 'hooks/useLocalStorage';
import { ChainID } from 'models/enums';
import React, { useContext, useMemo } from 'react';
import { environment } from '../environments/environment';
import { useLocalStorageState } from '../middleware/utils';
import { DEFAULT_RPCS, RpcConfig, failsafeConnectionConfig } from '../services/connections-hq';

const DEFAULT = DEFAULT_RPCS[0].httpProvider;
const DEFAULT_SLIPPAGE = 0.25;

export const getNetworkIdByCluster = (cluster: Cluster | 'local-validator') => {
  switch (cluster) {
    case 'devnet':
      return ChainID.Devnet;
    case 'testnet':
      return ChainID.Testnet;
    default:
      return ChainID.MainnetBeta;
  }
};

export const getNetworkIdByEnvironment = (env: string) => {
  switch (env) {
    case 'local':
    case 'staging':
    case 'development':
      return ChainID.Devnet;
    case 'local-validator':
      return ChainID.LocalValidator;
    case 'production':
    default:
      return ChainID.MainnetBeta;
  }
};

export const getSolanaExplorerClusterParam = (): string => {
  switch (environment) {
    case 'local':
    case 'development':
    case 'staging':
      return '?cluster=devnet-solana'; // ?cluster=devnet normally
    default:
      return '';
  }
};

interface ConnectionProviderConfig {
  connection: Connection;
  endpoint: string;
  slippage: number;
  setSlippage: (val: number) => void;
  cluster: Cluster | 'local-validator';
}

const ConnectionContext = React.createContext<ConnectionProviderConfig>({
  endpoint: DEFAULT,
  slippage: DEFAULT_SLIPPAGE,
  setSlippage: (val: number) => {},
  connection: new Connection(DEFAULT, 'confirmed'),
  cluster: DEFAULT_RPCS[0].cluster,
});

export function ConnectionProvider({ children = undefined as any }) {
  const [cachedRpcJson] = useLocalStorageState('cachedRpc');
  const cachedRpc = cachedRpcJson as RpcConfig;

  const [slippage, setSlippage] = useLocalStorage('slippage', DEFAULT_SLIPPAGE.toString());

  const connection = useMemo(() => new Connection(cachedRpc.httpProvider, failsafeConnectionConfig), [cachedRpc]);

  return (
    <ConnectionContext.Provider
      value={{
        endpoint: cachedRpc.httpProvider,
        slippage: parseFloat(slippage),
        setSlippage: val => setSlippage(val.toString()),
        connection,
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
  };
}

export function useSlippageConfig() {
  const { slippage, setSlippage } = useContext(ConnectionContext);
  return { slippage, setSlippage };
}
