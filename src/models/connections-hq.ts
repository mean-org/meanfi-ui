import { Cluster } from "@solana/web3.js";

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

export interface ConnectionEndpoint {
    cluster: Cluster;
    httpProvider: string;
    networkId: number;
}

export interface RpcConfig extends ConnectionEndpoint {
    id: number,
    network?: string;
}

export const RETRY_TIMER = 10;
export const NUM_RETRIES = 3;
export const RELOAD_TIMER = 60;
export const GET_RPC_API_ENDPOINT = '/meanfi-rpcs';
