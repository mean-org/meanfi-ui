import { type Cluster, Connection } from '@solana/web3.js';
import React, { useContext, useMemo, type ReactNode } from 'react';
import { ChainID } from 'src/models/enums';
import { environment } from '../environments/environment';
import { useLocalStorageState } from '../middleware/utils';
import { DEFAULT_RPCS, type RpcConfig, failsafeConnectionConfig } from '../services/connections-hq';

const DEFAULT = DEFAULT_RPCS[0].httpProvider;

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
  cluster: Cluster | 'local-validator';
}

const ConnectionContext = React.createContext<ConnectionProviderConfig>({
  endpoint: DEFAULT,
  connection: new Connection(DEFAULT, 'confirmed'),
  cluster: DEFAULT_RPCS[0].cluster,
});

interface Props {
  children: ReactNode;
}

export function ConnectionProvider({ children }: Props) {
  const [cachedRpcJson] = useLocalStorageState('cachedRpc');
  const cachedRpc = cachedRpcJson as RpcConfig;

  const connection = useMemo(() => new Connection(cachedRpc.httpProvider, failsafeConnectionConfig), [cachedRpc]);

  return (
    <ConnectionContext.Provider
      value={{
        endpoint: cachedRpc.httpProvider,
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
