import { ENV } from "@solana/spl-token-registry";
import { Cluster, clusterApiUrl, Connection } from "@solana/web3.js";
import { appConfig } from "..";
import { requestOptions } from "../constants";
import { environment } from "../environments/environment";
import { getRpcApiEndpoint } from "../utils/api";
import { consoleOut } from "../utils/ui";

export enum InitStatus {
  LoadingApp = 0,
  LoadAnotherRpcConfig = 1,
  LoadRpcConfigSuccess = 2,
  LoadRpcConfigError = 3,
  TestRpcConfig = 4,
  TestRpcSuccess = 5,
  TestRpcError = 6,
  Retry = 7,
  NoNetwork = 8
}

export interface RpcConfig {
  cluster: Cluster;
  httpProvider: string;
  networkId: number;
  id: number,
  network?: string;
}

export const RETRY_TIMER = 10;
export const NUM_RETRIES = 3;
export const RELOAD_TIMER = 60;
export const GET_RPC_API_ENDPOINT = '/meanfi-rpcs';


export const DEFAULT_RPCS: RpcConfig[] = [
  {
    cluster: "mainnet-beta",
    httpProvider: clusterApiUrl("mainnet-beta"),
    networkId: ENV.MainnetBeta,
    network: 'Mainnet Beta',
    id: 0
  },
  {
    cluster: "testnet",
    httpProvider: clusterApiUrl("testnet"),
    networkId: ENV.Testnet,
    network: 'Testnet',
    id: 0
  },
  {
    cluster: "devnet",
    httpProvider: clusterApiUrl("devnet"),
    networkId: ENV.Devnet,
    network: 'Devnet',
    id: 0
  }
];

export const getDefaultRpc = (): RpcConfig => {
  switch (environment) {
    case 'local':
    case 'development':
      return DEFAULT_RPCS[2];
    case 'staging':
      return DEFAULT_RPCS[1];
    case 'production':
    default:
      return DEFAULT_RPCS[0];
  }
}

export const isRpcLive = async (rpcConfig: RpcConfig): Promise<boolean> => {
  try {
    const connection = new Connection(rpcConfig.httpProvider);
    if (!connection) {
      return false;
    }
    return connection.getRecentBlockhashAndContext()
      .then((response: any) => {
        const rpcTestPassed = response && response.value && !response.value.err ? true : false;
        console.log(`Response valid for rpc: ${rpcConfig.httpProvider}`, rpcTestPassed);
        return rpcTestPassed;
      })
      .catch(error => {
        console.error(error);
        return false;
      });
  } catch (error) {
    console.error(error);
    return false;
  }
}

export const getLiveRpc = async (networkId?: number, previousRpcId?: number): Promise<RpcConfig | null> => {

  networkId = networkId ?? getDefaultRpc().networkId;
  const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${networkId}&previousRpcId=${previousRpcId || 0}`;
  let rpcConfig = await getRpcApiEndpoint(url, requestOptions);
  if (rpcConfig === null) {
    return null;
  }

  const isLive = await isRpcLive(rpcConfig);

  if (isLive) {
    return rpcConfig;
  }

  return await getLiveRpc(networkId, rpcConfig.id);
}

export const refreshCachedRpc = async () => {
  const cachedRpcJson = window.localStorage.getItem('cachedRpc');
  if (!cachedRpcJson) {
    let newRpc = (await getLiveRpc()) ?? getDefaultRpc();
    window.localStorage.setItem('cachedRpc', JSON.stringify(newRpc));
    return;
  }

  const cachedRpc = JSON.parse(cachedRpcJson) as RpcConfig;
  const isLive = await isRpcLive(cachedRpc);
  if (!cachedRpc || !isLive) {
    const newRpc = (await getLiveRpc()) ?? getDefaultRpc();
    window.localStorage.setItem('cachedRpc', JSON.stringify(newRpc));
  }
}
