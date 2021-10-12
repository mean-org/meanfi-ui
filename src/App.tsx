import { Cluster, clusterApiUrl, Connection } from '@solana/web3.js';
import { Button } from 'antd';
import Layout, { Content } from 'antd/lib/layout/layout';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, customLogger } from '.';
import { Routes } from "./routes";
import "./App.less";
import { CountdownTimer } from './components/CountdownTimer';
import { environment } from './environments/environment';
import { getRpcApiEndpoint } from './utils/api';
import { useLocalStorageState } from './utils/utils';
import { IconDiscord, IconSolana } from './Icons';
import { consoleOut } from './utils/ui';
import { GET_RPC_API_ENDPOINT, InitStatus, NUM_RETRIES, RELOAD_TIMER, RETRY_TIMER, RpcConfig } from './models/connections-hq';

const meanFiHeaders = new Headers();
meanFiHeaders.append('X-Api-Version', '1.0');
const opts: RequestInit = {
  headers: meanFiHeaders
}

function App() {
  const { t } = useTranslation('common');
  const [canContinueLoadingApp, setCanContinueLoadingApp] = useState(false);
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [lastUsedRpc, setLastUsedRpc] = useLocalStorageState("lastUsedRpc");
  const [initStatus, setInitStatus] = useState<InitStatus>(InitStatus.LoadingApp);
  const [loadRpcConfigApiUrl, setLoadRpcConfigApiUrl] = useState('');
  const [fetchedRpc, setFetchedRpc] = useState<RpcConfig | undefined>(undefined);
  const [canFetch, setCanFetch] = useState(true);
  const [canTestEndpoint, setCanTestEndpoint] = useState(false);
  const [reloadDisabled, setReloadDisabled] = useState(true);
  const [retryCount, setRetryCount] = useState(0);

  const isLocal = (): boolean => {
    return window.location.hostname === 'localhost' ? true : false;
  }

  const restartInit = () => {
    if (initStatus !== InitStatus.NoNetwork) {
      consoleOut('Retry count', retryCount, 'blue');
      setInitStatus(InitStatus.LoadingApp);
      setLoadRpcConfigApiUrl('');
      setLastUsedRpc(undefined);
      setFetchedRpc(undefined);
      setCanTestEndpoint(false);
      setCanFetch(true);
    }
  }

  const enableReload = () => {
    setReloadDisabled(false);
  }

  const reloadPage = () => {
    consoleOut('Reloading page...');
    setLastUsedRpc(undefined);
    window.location.reload();
  }

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

  const getStatusMessage = (): string => {
    switch (initStatus) {
      case InitStatus.LoadingApp:
        return t('connection-hq.init-status-loading-app');
      case InitStatus.LoadAnotherRpcConfig:
        return lastUsedRpc
                ? t('connection-hq.init-status-try-saved-rpc-api')
                : t('connection-hq.init-status-load-rpc-api');
      case InitStatus.LoadRpcConfigError:
        return t('connection-hq.init-status-load-rpc-api-error');
      case InitStatus.LoadRpcConfigSuccess:
        return t('connection-hq.init-status-load-rpc-api-success');
      case InitStatus.TestRpcConfig:
        return t('connection-hq.init-status-test-rpc');
      case InitStatus.TestRpcError:
        return t('connection-hq.init-status-test-rpc-error');
      case InitStatus.TestRpcSuccess:
        return t('connection-hq.init-status-test-rpc-success');
      case InitStatus.Retry:
        return t('connection-hq.init-status-retrying');
      case InitStatus.NoNetwork:
        return t('connection-hq.init-status-network-down');
      default:
        return '';
    }
  }

  // Use the preferred theme or dark as a default
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  // Build fetch url
  useEffect(() => {
    if (isLocal()) {
      if (canFetch) {
        const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${getNetworkIdByRuntimeEnv()}`;
        setLoadRpcConfigApiUrl(url);
        setInitStatus(InitStatus.LoadAnotherRpcConfig);
      } else if (initStatus === InitStatus.TestRpcError) {
        if (canFetch) {
          const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${getNetworkIdByRuntimeEnv()}&previousRpcId=${(lastUsedRpc as RpcConfig).id}`;
          setLoadRpcConfigApiUrl(url);
          setInitStatus(InitStatus.LoadAnotherRpcConfig);
        }
      }
    } else {
      if (lastUsedRpc) {
        // Indicate further test
        if (initStatus !== InitStatus.TestRpcSuccess) {
          setInitStatus(InitStatus.TestRpcConfig);
          setTimeout(() => {
            setCanTestEndpoint(true);
          }, 50);
        }
      } else if (!lastUsedRpc) {
        // Build it
        if (canFetch) {
          const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${getNetworkIdByRuntimeEnv()}`;
          setLoadRpcConfigApiUrl(url);
          setInitStatus(InitStatus.LoadAnotherRpcConfig);
        }
      } else if (initStatus === InitStatus.TestRpcError) {
        // Build it
        if (canFetch) {
          const url = `${appConfig.getConfig().apiUrl}${GET_RPC_API_ENDPOINT}?networkId=${getNetworkIdByRuntimeEnv()}&previousRpcId=${(lastUsedRpc as RpcConfig).id}`;
          setLoadRpcConfigApiUrl(url);
          setInitStatus(InitStatus.LoadAnotherRpcConfig);
        }
      }
    }
  }, [
    canFetch,
    initStatus,
    lastUsedRpc
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
            setRetryCount(0);
            setTimeout(() => {
              setInitStatus(InitStatus.TestRpcConfig);
              setCanTestEndpoint(true);
            }, 100);
          } else {
            // The fetch config failed
            setFetchedRpc(undefined);
            setInitStatus(InitStatus.LoadRpcConfigError);
            setRetryCount(value => value + 1);
            setTimeout(() => {
              setInitStatus(InitStatus.Retry);
            }, 100);
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
          setRetryCount(value => value + 1);
          const solanaPublicApi: RpcConfig = {
            httpProvider: clusterApiUrl(getEndpointNameByRuntimeEnv()),
            id: 0,
            cluster: getEndpointNameByRuntimeEnv(),
            network: getNetworkNameByRuntimeEnv(),
            networkId: getNetworkIdByRuntimeEnv()
          };
          setLastUsedRpc(solanaPublicApi);
        });
    }
  }, [
    canFetch,
    initStatus,
    loadRpcConfigApiUrl,
    setLastUsedRpc
  ]);

  // Rule the retry behavior and limit
  useEffect(() => {
    if (initStatus === InitStatus.Retry && retryCount > NUM_RETRIES ) {
      setRetryCount(0);
      setInitStatus(InitStatus.NoNetwork);
    }
  }, [
    retryCount,
    initStatus
  ]);

  // Actually test the endpoint
  useEffect(() => {
    if (initStatus !== InitStatus.TestRpcConfig || !canTestEndpoint) { return; }

    const testGetRecentBlockhash = (rpcConfig: RpcConfig) => {
      try {
        const connection = new Connection(rpcConfig.httpProvider);
        if (connection) {
          connection.getRecentBlockhash()
          .then(response => {
            consoleOut('response:', response, 'blue');
            if (response && response.blockhash) {
              // Ok
              if (!lastUsedRpc || (lastUsedRpc && (lastUsedRpc as RpcConfig).httpProvider !== rpcConfig.httpProvider)) {
                setLastUsedRpc(rpcConfig);
              }
              setInitStatus(InitStatus.TestRpcSuccess);
              setTimeout(() => {
                setCanContinueLoadingApp(true);
              }, 100);
            } else {
              // This didn't work
              setInitStatus(InitStatus.TestRpcError);
            }
          })
          .catch(error => {
            console.error(error);
            // This didn't work either
            setInitStatus(InitStatus.TestRpcError);
            throw(error);
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

    if (fetchedRpc || lastUsedRpc) {
      setCanTestEndpoint(false);
      if (fetchedRpc) {
        testGetRecentBlockhash(fetchedRpc);
      } else {
        testGetRecentBlockhash((lastUsedRpc as RpcConfig));
      }
    }
  }, [
    fetchedRpc,
    initStatus,
    lastUsedRpc,
    canTestEndpoint,
    setLastUsedRpc
  ]);

  if (canContinueLoadingApp) {
    return <Routes />;
  } else {
    return (
      <Layout>
        <Content className="flex-center">
          <div className="loading-screen-container flex-center">
            <div className="flex-column flex-center">
              {initStatus !== InitStatus.NoNetwork && (
                <>
                <div className="loader-container">
                  <div className="app-loading">
                    <div className="logo" style={{display: 'none'}}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 245 238" fillRule="evenodd" clipRule="evenodd" strokeLinejoin="round" strokeMiterlimit="2">
                        <path d="M238.324 75l-115.818 30.654L6.689 75 0 128.402l47.946 122.08L122.515 313l74.55-62.518L245 128.402 238.324 75zm-21.414 29.042l3.168 25.313-42.121 107.268-26.849 22.511 37.922-120.286-48.471 12.465-8.881 107.524-9.176 24.128-9.174-24.128-8.885-107.524-48.468-12.465 37.922 120.286-26.85-22.511-42.118-107.268 3.167-25.313 94.406 24.998 94.408-24.998z" fill="url(#_Linear1)" transform="translate(0 -64)"/>
                        <defs>
                          <linearGradient id="_Linear1" x1="0" y1="0" x2="1" y2="0" gradientUnits="userSpaceOnUse" gradientTransform="matrix(0 238 -238 0 122.5 75)">
                            <stop offset="0" stopColor="#ff0017"/><stop offset="1" stopColor="#b7001c"/>
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <svg className="spinner" viewBox="25 25 50 50">
                      <circle className="path" cx="50" cy="50" r="20" fill="none" strokeWidth="2" strokeMiterlimit="10"/>
                    </svg>
                  </div>
                </div>
                <p className="loader-message">{getStatusMessage()}{initStatus === InitStatus.Retry && <CountdownTimer val={RETRY_TIMER} onFinished={restartInit}/>}</p>
                </>
              )}
              {initStatus === InitStatus.NoNetwork && (
                <>
                <h3 className="network-down-message">{getStatusMessage()}</h3>
                <div className="text-center">
                  <Button
                    type="primary"
                    size="large"
                    shape="round"
                    disabled={reloadDisabled}
                    onClick={() => reloadPage()}>
                    {reloadDisabled
                      ? <>
                        {t('general.reload-cta-disabled')}
                        <CountdownTimer val={RELOAD_TIMER} onFinished={enableReload}/>
                        </>
                      : t('general.reload-cta')
                    }
                  </Button>
                </div>
                <div className="bottom-links">
                  <div className="link">
                    <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href="https://status.solana.com/">
                      <IconSolana className="mean-svg-icons"/><span>Check network status</span>
                    </a>
                  </div>
                  <div className="link">
                    <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer" href="https://discord.meanfi.com/">
                      <IconDiscord className="mean-svg-icons"/><span>Report a problem</span>
                    </a>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>
        </Content>
        {isLocal() && (
          <div className="debug-footer">
            <span className="ml-1">
              lastUsedRpc:<span className="ml-1 font-bold fg-dark-active">{lastUsedRpc ? 'true' : 'false'}</span>
            </span>
            <span className="ml-1">
              initStatus:<span className="ml-1 font-bold fg-dark-active">{InitStatus[initStatus]}</span>
            </span>
            <span className="ml-1">
              loadRpcConfigApiUrl:<span className="ml-1 font-bold fg-dark-active">{loadRpcConfigApiUrl}</span>
            </span>
            <span className="ml-1">
              canFetch:<span className="ml-1 font-bold fg-dark-active">{canFetch ? 'true' : 'false'}</span>
            </span>
            <span className="ml-1">
              retryCount:<span className="ml-1 font-bold fg-dark-active">{retryCount}</span>
            </span>
            {initStatus === InitStatus.Retry && (
              <span className="ml-1">
                retryTimer:<span className="ml-1 font-bold fg-dark-active"><CountdownTimer val={RETRY_TIMER} /></span>
              </span>
            )}
          </div>
        )}
      </Layout>
    );
  }
}

export default App;
