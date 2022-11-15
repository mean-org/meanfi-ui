import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { PreFooter } from '../../components/PreFooter';
import { consoleOut, isProd } from '../../middleware/ui';
import { useWallet } from '../../contexts/wallet';
import { DdcaClient } from '@mean-dao/ddca';
import { AppStateContext } from '../../contexts/appstate';
import { getTokenBySymbol, useLocalStorageState } from '../../middleware/utils';
import { getLiveRpc, RpcConfig } from '../../services/connections-hq';
import { Connection } from '@solana/web3.js';
import { useTranslation } from 'react-i18next';
import { IconExchange } from '../../Icons';
import { JupiterExchange, RecurringExchange } from '../../views';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { MEAN_TOKEN_LIST } from '../../constants/tokens';

type SwapOption = 'one-time' | 'recurring';

export const SwapView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { publicKey, wallet } = useWallet();
  const {
    splTokenList,
    recurringBuys,
    setRecurringBuys,
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const [loadingRecurringBuys, setLoadingRecurringBuys] = useState(false);
  const [queryFromMint, setQueryFromMint] = useState<string | null>(null);
  const [queryToMint, setQueryToMint] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<SwapOption>('one-time');

  // Connection management
  const [cachedRpcJson] = useLocalStorageState('cachedRpc');
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = cachedRpcJson as RpcConfig;
  const endpoint = mainnetRpc
    ? mainnetRpc.httpProvider
    : cachedRpc.httpProvider;

  const connection = useMemo(
    () =>
      new Connection(
        mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider,
        'confirmed',
      ),
    [cachedRpc.httpProvider, mainnetRpc],
  );

  /////////////////
  //  CALLBACKS  //
  /////////////////

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (!loadingRecurringBuys) {
      setLoadingRecurringBuys(true);

      const ddcaClient = new DdcaClient(
        mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider,
        wallet,
        { commitment: connection.commitment },
      );

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
    loadingRecurringBuys,
    cachedRpc.httpProvider,
    connection.commitment,
    setLoadingRecurringBuys,
    setRecurringBuys,
  ]);

  ///////////////
  //  Effects  //
  ///////////////

  // Get RPC endpoint
  useEffect(() => {
    (async () => {
      if (cachedRpc && cachedRpc.networkId !== 101) {
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          navigate('/service-unavailable');
        }
        setMainnetRpc(mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    })();
    return () => {};
  }, [cachedRpc, navigate]);

  // Load recurring buys once
  useEffect(() => {
    if (!loadingRecurringBuys) {
      reloadRecurringBuys();
    }

    return () => {};
  }, [loadingRecurringBuys, reloadRecurringBuys]);

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let from: TokenInfo | undefined = undefined;
    let to: TokenInfo | undefined = undefined;
    // Get from address from symbol passed via query string param
    if (params.has('from')) {
      const symbol = params.get('from');
      from = symbol
        ? symbol === 'SOL'
          ? getTokenByMintAddress(WRAPPED_SOL_MINT_ADDRESS)
          : getTokenBySymbol(symbol, splTokenList)
        : undefined;
    } else {
      from = MEAN_TOKEN_LIST.find(
        t => t.chainId === 101 && t.symbol === 'USDC',
      );
    }

    if (from) {
      setQueryFromMint(from.address);
    }

    // Get to as well
    if (params.has('to')) {
      const symbol = params.get('to');
      to = symbol ? getTokenBySymbol(symbol) : undefined;
    } else {
      to = MEAN_TOKEN_LIST.find(t => t.chainId === 101 && t.symbol === 'MEAN');
    }

    if (to) {
      setQueryToMint(to.address);
    }

    if (location.search.length) {
      consoleOut('params:', params.toString());
      consoleOut('queryFromMint:', from ? from.address : '-', 'blue');
      consoleOut('queryToMint:', to ? to.address : '-', 'blue');
    }
  }, [getTokenByMintAddress, location, splTokenList]);

  //////////////////////
  //  Event handling  //
  //////////////////////

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
  };

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
            <div className="button-tabset-container">
              <div
                className={`tab-button ${
                  currentTab === 'one-time' ? 'active' : ''
                }`}
                onClick={() => onTabChange('one-time')}
              >
                {t('swap.tabset.one-time')}
              </div>
              <div
                className={`tab-button ${
                  currentTab === 'recurring' ? 'active' : ''
                }`}
                onClick={() => onTabChange('recurring')}
              >
                {t('swap.tabset.recurring')}
              </div>
            </div>
            {/* One time exchange */}
            {currentTab === 'one-time' && (
              <JupiterExchange
                connection={connection}
                queryFromMint={queryFromMint}
                queryToMint={queryToMint}
              />
            )}
            {/* Repeating exchange */}
            {currentTab === 'recurring' && (
              <RecurringExchange
                connection={connection}
                endpoint={endpoint}
                queryFromMint={queryFromMint}
                queryToMint={queryToMint}
                onRefreshRequested={() => setLoadingRecurringBuys(false)}
              />
            )}
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
