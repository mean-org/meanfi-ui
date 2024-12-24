import { type Cluster, type ConnectionConfig, clusterApiUrl } from '@solana/web3.js';
import { TRANSACTION_STATUS_RETRY_TIMEOUT } from 'constants/common';
import { environment } from 'environments/environment';
import { ChainID } from 'models/enums';

export const RELOAD_TIMER = 60;

export interface RpcConfig {
  cluster: Cluster | 'local-validator';
  httpProvider: string;
  networkId: number;
  id: number;
  network?: string;
}

const ironForgeApiUrl = process.env.REACT_APP_IRONFORGE_API_URL ?? '';
const ironForgeApiKey = process.env.REACT_APP_IRONFORGE_API_KEY ?? '';
const ironForgeApiAccessToken = process.env.REACT_APP_IRONFORGE_API_ACCESS_TOKEN ?? '';
const ironForgeHeader = ironForgeApiAccessToken
  ? {
      'x-ironforge-auth-token': ironForgeApiAccessToken,
    }
  : undefined;

export const failsafeConnectionConfig: ConnectionConfig = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: TRANSACTION_STATUS_RETRY_TIMEOUT,
  disableRetryOnRateLimit: true,
};

export const DEFAULT_RPCS: RpcConfig[] = [
  {
    cluster: 'mainnet-beta',
    httpProvider: clusterApiUrl('mainnet-beta'),
    networkId: ChainID.MainnetBeta,
    network: 'Mainnet Beta',
    id: 0,
  },
  {
    cluster: 'testnet',
    httpProvider: clusterApiUrl('testnet'),
    networkId: ChainID.Testnet,
    network: 'Testnet',
    id: 0,
  },
  {
    cluster: 'devnet',
    httpProvider: clusterApiUrl('devnet'),
    networkId: ChainID.Devnet,
    network: 'Devnet',
    id: 0,
  },
  {
    cluster: 'local-validator',
    httpProvider: 'http://localhost:8899',
    networkId: ChainID.LocalValidator,
    network: 'Local Validator',
    id: 0,
  },
];

export const getDefaultRpc = (): RpcConfig => {
  switch (environment) {
    case 'local_validator':
      return DEFAULT_RPCS[3];
    case 'local':
    case 'development':
    case 'staging':
      return DEFAULT_RPCS[2];
    default:
      return DEFAULT_RPCS[0];
  }
};

export const getIronforgeEnvironment = () => {
  switch (environment) {
    case 'production':
      return 'mainnet';
    case 'local':
    case 'development':
    case 'staging':
      return 'devnet';
    default:
      return '';
  }
};

export const refreshCachedRpc = async () => {
  const ironforgeEnvironment = getIronforgeEnvironment();
  const newRpc = getDefaultRpc();
  if (ironforgeEnvironment && ironForgeApiUrl) {
    newRpc.httpProvider = `${ironForgeApiUrl}${ironforgeEnvironment}?apiKey=${ironForgeApiKey}`;
    failsafeConnectionConfig.httpHeaders = ironForgeHeader;
  }

  window.localStorage.setItem('cachedRpc', JSON.stringify(newRpc));
  return newRpc;
};
