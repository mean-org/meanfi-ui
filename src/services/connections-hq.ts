import { ENV } from "@solana/spl-token-registry";
import { Cluster, clusterApiUrl, Connection } from "@solana/web3.js";
import { appConfig } from "..";
import { requestOptions } from "../constants";
import { environment } from "../environments/environment";
import { getRpcApiEndpoint } from "../middleware/api";

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
    httpProvider: "https://ssc-dao.genesysgo.net/", // Setting the default (fallback endpoint) to genesysgo
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
    case 'staging':
      return DEFAULT_RPCS[2];
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
    return connection.getLatestBlockhashAndContext("confirmed")
      .then((response: any) => {
        const rpcTestPassed = response && response.value && !response.value.err ? true : false;
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
  const rpcConfig = await getRpcApiEndpoint(url, requestOptions);
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
    const newRpc = (await getLiveRpc()) ?? getDefaultRpc();
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
