import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PreFooter } from 'components/PreFooter';
import { consoleOut, isLocal, isProd } from 'middleware/ui';
import { useWallet } from 'contexts/wallet';
import { DdcaClient } from '@mean-dao/ddca';
import { AppStateContext } from 'contexts/appstate';
import { getTokenBySymbol, useLocalStorageState } from 'middleware/utils';
import { getLiveRpc, RpcConfig } from 'services/connections-hq';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { useTranslation } from 'react-i18next';
import { IconExchange } from 'Icons';
import { RecurringExchange } from 'views';
import { WRAPPED_SOL_MINT_ADDRESS } from 'constants/common';
import { MEAN_TOKEN_LIST } from 'constants/tokens';

export const SwapView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const { splTokenList, recurringBuys, setRecurringBuys, getTokenByMintAddress } = useContext(AppStateContext);
  const [loadingRecurringBuys, setLoadingRecurringBuys] = useState(false);
  const [queryFromMint, setQueryFromMint] = useState<string | undefined>(undefined);
  const [queryToMint, setQueryToMint] = useState<string | undefined>(undefined);

  // Connection management
  const [cachedRpcJson] = useLocalStorageState('cachedRpc');
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = cachedRpcJson as RpcConfig;

  // Select, Connect to and test the network
  useEffect(() => {
    if (!isProd()) {
      setMainnetRpc(null);
      console.log('This is not PROD!', 'Moving out...');
      return;
    }

    if (cachedRpc.networkId === 101) {
      setMainnetRpc(cachedRpc);
      console.log('Cached RPC is not mainnet!', 'Setting up connection...');
      return;
    }

    const forcefullyGetMainNetRpc = async () => {
      if (cachedRpc.networkId === 101) {
        console.log('Trying to get an RPC provider...');
        let debugRpc: RpcConfig | null = null;
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          console.log('Could not get an RPC provider for mainnet!', 'Service unavailable');
          navigate('/service-unavailable');
        }
        if (isLocal()) {
          console.log('Setting up a debug RPC provider...');
          debugRpc = {
            ...mainnetRpc,
            httpProvider: process.env.REACT_APP_TRITON_ONE_DEBUG_RPC ?? clusterApiUrl('mainnet-beta'),
          } as RpcConfig;
        }
        setMainnetRpc(debugRpc ?? mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    };

    forcefullyGetMainNetRpc();

    return () => {};
  }, [cachedRpc, navigate]);

  const endpoint = useMemo(() => {
    if (!mainnetRpc) {
      return undefined;
    }

    return mainnetRpc.httpProvider;
  }, [mainnetRpc]);

  // Set and cache connection
  const connection = useMemo(() => (endpoint ? new Connection(endpoint, 'confirmed') : undefined), [endpoint]);

  /////////////////
  //  CALLBACKS  //
  /////////////////

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback(() => {
    if (!publicKey || !connection) {
      return;
    }

    if (!loadingRecurringBuys) {
      setLoadingRecurringBuys(true);

      const ddcaClient = new DdcaClient(mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider, wallet, {
        commitment: connection.commitment,
      });

      ddcaClient
        .listDdcas()
        .then(ddcas => {
          consoleOut('ddcas:', ddcas, 'blue');
          setRecurringBuys(ddcas);
        })
        .catch(err => {
          console.error(err);
        });
    }
  }, [
    wallet,
    publicKey,
    mainnetRpc,
    connection,
    loadingRecurringBuys,
    cachedRpc.httpProvider,
    setLoadingRecurringBuys,
    setRecurringBuys,
  ]);

  ///////////////
  //  Effects  //
  ///////////////

  // Load recurring buys once
  useEffect(() => {
    if (connection && !loadingRecurringBuys) {
      reloadRecurringBuys();
    }

    return () => {};
  }, [connection, loadingRecurringBuys, reloadRecurringBuys]);

  // Get FROM address from symbol passed via query string param
  const getSourceFromParams = useCallback(
    (params: URLSearchParams) => {
      if (params.has('from')) {
        const symbol = params.get('from');
        if (!symbol) return undefined;
        if (symbol === 'SOL') {
          return getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS);
        }
        return getTokenBySymbol(symbol, splTokenList);
      } else {
        return MEAN_TOKEN_LIST.find(t => t.chainId === 101 && t.symbol === 'USDC');
      }
    },
    [getTokenByMintAddress, splTokenList],
  );

  // Get TO address from symbol passed via query string param
  const getDestinationFromParams = useCallback((params: URLSearchParams) => {
    if (params.has('to')) {
      const symbol = params.get('to');
      if (!symbol) return undefined;
      return getTokenBySymbol(symbol);
    } else {
      return MEAN_TOKEN_LIST.find(t => t.chainId === 101 && t.symbol === 'MEAN');
    }
  }, []);

  // Parse query params
  useEffect(() => {
    if (!connection) {
      return;
    }

    const params = new URLSearchParams(location.search);
    const from = getSourceFromParams(params);
    const to = getDestinationFromParams(params);

    if (from) {
      setQueryFromMint(from.address);
    }

    if (to) {
      setQueryToMint(to.address);
    }

    if (location.search.length) {
      consoleOut('params:', params.toString());
      consoleOut('queryFromMint:', from ? from.address : '-', 'blue');
      consoleOut('queryToMint:', to ? to.address : '-', 'blue');
    }
  }, [connection, getDestinationFromParams, getSourceFromParams, location.search]);

  /////////////////
  //  Rendering  //
  /////////////////

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconExchange className="mean-svg-icons" />
              <div>{t('swap.screen-title')}</div>
            </div>
            <div className="subtitle">{t('swap.screen-subtitle')}</div>
          </div>
          <div className="place-transaction-box mb-3">
            <RecurringExchange
              connection={connection}
              endpoint={endpoint}
              queryFromMint={queryFromMint}
              queryToMint={queryToMint}
              onRefreshRequested={() => setLoadingRecurringBuys(false)}
            />
          </div>
          {publicKey && recurringBuys && recurringBuys.length > 0 && isProd() && (
            <div className="text-center mb-3">
              <Link to="/exchange-dcas">
                <span className="secondary-link">{`You have ${recurringBuys.length} recurring buys scheduled`}</span>
              </Link>
            </div>
          )}
        </div>
      </div>
      <PreFooter />
    </>
  );
};
