import { Cluster, clusterApiUrl, ConnectionConfig } from '@solana/web3.js';
import { environment } from '../environments/environment';
import { ChainID } from '../models/enums';
import { TRANSACTION_STATUS_RETRY_TIMEOUT } from 'constants/common';

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

export const failsafeConnectionConfig: ConnectionConfig = {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: TRANSACTION_STATUS_RETRY_TIMEOUT,
  disableRetryOnRateLimit: true,
  httpHeaders: {
    'x-ironforge-auth-token': ironForgeApiAccessToken,
  },
};

export const RETRY_TIMER = 10;
export const NUM_RETRIES = 3;
export const RELOAD_TIMER = 60;
export const GET_RPC_API_ENDPOINT = '/meanfi-rpcs';

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
    case 'production':
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

export const getFallBackRpcEndpoint = () => {
  const ironforgeEnvironment = getIronforgeEnvironment();
  const defaultEndpoint = getDefaultRpc();

  const endpoint =
    ironforgeEnvironment === 'mainnet'
      ? process.env.REACT_APP_FALLBACK_MAINNET_RPC_URL ?? ''
      : process.env.REACT_APP_FALLBACK_DEVNET_RPC_URL ?? '';

  if (endpoint) {
    return { ...defaultEndpoint, httpProvider: endpoint } as RpcConfig;
  } else {
    return defaultEndpoint;
  }
};

export const refreshCachedRpc = async () => {
  const ironforgeEnvironment = getIronforgeEnvironment();

  // Process special case when debugging from localhost
  // valid for devnet or mainnet but the variable REACT_APP_TRITON_ONE_DEBUG_RPC
  // on the .env files needs to contain the rpc url
  // if (isLocal()) {
  //   console.log('env:', process.env);
  //   const endpoint =
  //     ironforgeEnvironment === 'mainnet'
  //       ? process.env.REACT_APP_FALLBACK_MAINNET_RPC_URL ?? ''
  //       : process.env.REACT_APP_FALLBACK_DEVNET_RPC_URL ?? '';
  //   if (endpoint) {
  //     const debugRpc = { ...getDefaultRpc(), httpProvider: endpoint } as RpcConfig;
  //     window.localStorage.setItem('cachedRpc', JSON.stringify(debugRpc));
  //     return;
  //   }
  //   console.warn('No RPC preset in environment!');
  //   console.error(
  //     'RPC selection error:',
  //     'You are running from localhost but your .env variable REACT_APP_TRITON_ONE_DEBUG_RPC does nt contain an RPC url to work with! Switching to defaults...',
  //   );
  // }

  const newRpc = getDefaultRpc();
  if (ironforgeEnvironment && ironForgeApiUrl) {
    newRpc.httpProvider = `${ironForgeApiUrl}${ironforgeEnvironment}?apiKey=${ironForgeApiKey}`;
  }

  window.localStorage.setItem('cachedRpc', JSON.stringify(newRpc));
};
