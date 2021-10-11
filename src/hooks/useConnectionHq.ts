import { Cluster, clusterApiUrl, Connection } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { appConfig, customLogger } from '..';
import { environment } from '../environments/environment';
import { GET_RPC_API_ENDPOINT, InitStatus, RpcConfig } from '../models/connections-hq';
import { getRpcApiEndpoint } from '../utils/api';
import { consoleOut } from '../utils/ui';

const meanFiHeaders = new Headers();
meanFiHeaders.append('X-Api-Version', '1.0');
const opts: RequestInit = {
    headers: meanFiHeaders
}

const useConnectionHq = (networkId: number) => {
    const [initStatus, setInitStatus] = useState<InitStatus>(InitStatus.LoadingApp);
    const [selectedRpcEndpoint, setSelectedRpcEndpoint] = useState<RpcConfig | undefined>(undefined);
    const [loadRpcConfigApiUrl, setLoadRpcConfigApiUrl] = useState('');
    const [fetchedRpc, setFetchedRpc] = useState<RpcConfig | undefined>(undefined);
    const [canFetch, setCanFetch] = useState(true);
    const [canTestEndpoint, setCanTestEndpoint] = useState(false);

    const getEndpointNameByRuntimeEnv = (): Cluster => {
        switch (environment) {
            case 'local':
            case 'development':
                return "devnet";
            case 'staging':
                return "testnet";
            case 'production':
            default:
                return "mainnet-beta";
        }
    }

    const getNetworkIdByRuntimeEnv = (): number => {
        switch (environment) {
            case 'production':
                return 101;
            case 'staging':
                return 102;
            default:
                return 103;
        }
    }

    const getNetworkNameByRuntimeEnv = (): string => {
        switch (environment) {
            case 'production':
                return 'Mainnet Beta';
            case 'staging':
                return 'Testnet';
            default:
                return 'Devnet';
        }
    }

    // const getStatusMessage = (): string => {
    //     switch (initStatus) {
    //         case InitStatus.LoadingApp:
    //             return 'Loading app';
    //         case InitStatus.LoadAnotherRpcConfig:
    //             return selectedRpcEndpoint
    //                 ? 'Connecting to RPC API'
    //                 : 'Trying alternate RPC API';
    //         case InitStatus.LoadRpcConfigError:
    //             return 'Could not load RPC API';
    //         case InitStatus.LoadRpcConfigSuccess:
    //             return 'RPC API endpoint loaded';
    //         case InitStatus.TestRpcConfig:
    //             return 'Testing selected cluster endpoint';
    //         case InitStatus.TestRpcError:
    //             return 'Failed testing selected cluster endpoint';
    //         case InitStatus.TestRpcSuccess:
    //             return 'Selected cluster endpoint works';
    //         case InitStatus.Retry:
    //             return 'Retrying';
    //         case InitStatus.NoNetwork:
    //             return 'Network down or congestion detected';
    //         default:
    //             return '';
    //     }
    // }

    // Build fetch url
    useEffect(() => {
        if (selectedRpcEndpoint) {
            // Indicate further test
            if (initStatus !== InitStatus.TestRpcSuccess) {
                setInitStatus(InitStatus.TestRpcConfig);
                setCanTestEndpoint(true);
            }
        } else if (!selectedRpcEndpoint) {
            // Build it
            if (canFetch) {
                const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${networkId}`;
                setLoadRpcConfigApiUrl(url);
                setInitStatus(InitStatus.LoadAnotherRpcConfig);
            }
        } else if (initStatus === InitStatus.TestRpcError) {
            // Build it
            if (canFetch) {
                const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${networkId}&previousRpcId=${(selectedRpcEndpoint as RpcConfig).id || 0}`;
                setLoadRpcConfigApiUrl(url);
                setInitStatus(InitStatus.LoadAnotherRpcConfig);
            }
        }

        return () => { };
    }, [
        networkId,
        canFetch,
        initStatus,
        selectedRpcEndpoint
    ]);

    // Load server config
    useEffect(() => {
        if (initStatus === InitStatus.LoadAnotherRpcConfig && canFetch) {
            setCanFetch(false);
            getRpcApiEndpoint(loadRpcConfigApiUrl, opts)
                .then((item: any | null) => {
                    if (item) {
                        consoleOut('Server rpcConfig:', item, 'blue');
                        setInitStatus(InitStatus.LoadRpcConfigSuccess);
                        setFetchedRpc(item);
                        // Indicate start testing
                        setInitStatus(InitStatus.TestRpcConfig);
                        setCanTestEndpoint(true);
                    } else {
                        // The fetch config failed
                        setFetchedRpc(undefined);
                        setInitStatus(InitStatus.LoadRpcConfigError);
                    }
                })
                .catch(error => {
                    const customError = {
                        api: appConfig.getConfig().apiUrl,
                        endpoint: GET_RPC_API_ENDPOINT,
                        statusText: error.toString()
                    };
                    customLogger.logError('MeanFi API failure. Using defaul Solana public API', customError);
                    setInitStatus(InitStatus.LoadRpcConfigError);
                    const solanaPublicApi: RpcConfig = {
                        httpProvider: clusterApiUrl(getEndpointNameByRuntimeEnv()),
                        id: 0,
                        cluster: getEndpointNameByRuntimeEnv(),
                        network: getNetworkNameByRuntimeEnv(),
                        networkId: getNetworkIdByRuntimeEnv()
                    };
                    setSelectedRpcEndpoint(solanaPublicApi);
                });
        }

        return () => { };
    }, [
        canFetch,
        initStatus,
        loadRpcConfigApiUrl,
        setSelectedRpcEndpoint
    ]);

    // Actually test the endpoint
    useEffect(() => {
        if (initStatus === InitStatus.TestRpcConfig && canTestEndpoint) {

            const testGetRecentBlockhash = (rpcConfig: RpcConfig) => {
                try {
                    const connection = new Connection(rpcConfig.httpProvider);
                    if (connection) {
                        connection.getRecentBlockhash()
                            .then(response => {
                                consoleOut('response:', response, 'blue');
                                if (response && response.blockhash) {
                                    // Ok
                                    if (!selectedRpcEndpoint || (selectedRpcEndpoint && (selectedRpcEndpoint as RpcConfig).httpProvider !== rpcConfig.httpProvider)) {
                                        setSelectedRpcEndpoint(rpcConfig);
                                    }
                                    setInitStatus(InitStatus.TestRpcSuccess);
                                } else {
                                    // This didn't work
                                    setInitStatus(InitStatus.TestRpcError);
                                }
                            })
                            .catch(error => {
                                console.error(error);
                                // This didn't work either
                                setInitStatus(InitStatus.TestRpcError);
                            });
                    } else {
                        // Connection constructor didn't work at all (like when bad url is given) not sure of this
                        setInitStatus(InitStatus.TestRpcError);
                    }
                } catch (error) {
                    console.error(error);
                    // Menos que menos
                    setInitStatus(InitStatus.TestRpcError);
                }
            }
    
            if (fetchedRpc || selectedRpcEndpoint) {
                setCanTestEndpoint(false);
                if (fetchedRpc) {
                    testGetRecentBlockhash(fetchedRpc);
                } else {
                    testGetRecentBlockhash((selectedRpcEndpoint as RpcConfig));
                }
            }
        }

        return () => { };
    }, [
        fetchedRpc,
        initStatus,
        selectedRpcEndpoint,
        canTestEndpoint,
        setSelectedRpcEndpoint
    ]);

    const isSuccessful = initStatus === InitStatus.TestRpcSuccess ? true : false;

    return {selectedRpcEndpoint, isSuccessful} as const;
};

export default useConnectionHq;
