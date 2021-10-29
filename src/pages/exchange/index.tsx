import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Redirect, useLocation } from 'react-router-dom';
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";
import { getTokenBySymbol, TokenInfo } from '../../utils/tokens';
import { consoleOut, isProd } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { DdcaClient } from '@mean-dao/ddca';
import { AppStateContext } from '../../contexts/appstate';
import { useLocalStorageState } from '../../utils/utils';
import { getLiveRpc, RpcConfig } from '../../models/connections-hq';
import { Connection } from '@solana/web3.js';
import { useTranslation } from 'react-i18next';
import { IconExchange } from '../../Icons';
import { RepeatingSwapUi } from '../../components/RepeatingSwapUi';

type SwapOption = "one-time" | "recurring";

export const SwapView = () => {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { publicKey, wallet } = useWallet();
  const {
    recurringBuys,
    setRecurringBuys,
  } = useContext(AppStateContext);
  const [loadingRecurringBuys, setLoadingRecurringBuys] = useState(false);
  const [queryFromMint, setQueryFromMint] = useState<string | null>(null);
  const [queryToMint, setQueryToMint] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<SwapOption>("one-time");

  // Parse query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let from: TokenInfo | null = null;
    let to: TokenInfo | null = null;
    // Get from address from symbol passed via query string param
    if (params.has('from')) {
      const symbol = params.get('from');
      from = symbol ? getTokenBySymbol(symbol) : null;
      if (from) {
        setQueryFromMint(from.address);
      }
    }
    // Get to as well
    if (params.has('to')) {
      const symbol = params.get('to');
      to = symbol ? getTokenBySymbol(symbol) : null;
      if (to) {
        setQueryToMint(to.address);
      }
    }
    if (location.search.length) {
      consoleOut('params:', params.toString());
      consoleOut('queryFromMint:', from ? from.address : '-', 'blue');
      consoleOut('queryToMint:', to ? to.address : '-', 'blue');
    }
  }, [location]);

  // Connection management
  const [cachedRpcJson] = useLocalStorageState("cachedRpc");
  const [mainnetRpc, setMainnetRpc] = useState<RpcConfig | null>(null);
  const cachedRpc = (cachedRpcJson as RpcConfig);
  const endpoint = mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider;

  useEffect(() => {
    (async () => {
      if (cachedRpc && cachedRpc.networkId !== 101) {
        const mainnetRpc = await getLiveRpc(101);
        if (!mainnetRpc) {
          setRedirect('/service-unavailable');
        }
        setMainnetRpc(mainnetRpc);
      } else {
        setMainnetRpc(null);
      }
    })();
    return () => { }
  }, [cachedRpc]);

  const connection = useMemo(() => new Connection(mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider, "confirmed"),
    [cachedRpc.httpProvider, mainnetRpc]);

  // Gets the recurring buys on demmand
  const reloadRecurringBuys = useCallback(() => {
    if (!publicKey) {
      return;
    }

    if (!loadingRecurringBuys) {
      setLoadingRecurringBuys(true);

      const ddcaClient = new DdcaClient(mainnetRpc ? mainnetRpc.httpProvider : cachedRpc.httpProvider, wallet, { commitment: connection.commitment });

      ddcaClient.listDdcas()
        .then(ddcas => {
          consoleOut('ddcas:', ddcas, 'blue');
          setRecurringBuys(ddcas);
        }).catch(err => {
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
    setRecurringBuys
  ]);

  // Load recurring buys once if the list is empty
  useEffect(() => {
    if (!loadingRecurringBuys) {
      reloadRecurringBuys();
    }

    return () => {};
  }, [
    loadingRecurringBuys,
    reloadRecurringBuys
  ]);

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
  }

  return (
    <>
      {redirect && <Redirect to={redirect} />}
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconExchange className="mean-svg-icons" />
              <div>{t('swap.screen-title')}</div>
            </div>
            <div className="subtitle">
              {t('swap.screen-subtitle')}
            </div>
          </div>
          <div className="place-transaction-box mb-3">
            <div className="button-tabset-container">
              <div className={`tab-button ${currentTab === "one-time" ? 'active' : ''}`} onClick={() => onTabChange("one-time")}>
                {t('swap.tabset.one-time')}
              </div>
              <div className={`tab-button ${currentTab === "recurring" ? 'active' : ''}`} onClick={() => onTabChange("recurring")}>
                {t('swap.tabset.recurring')}
              </div>
            </div>
            {/* One time exchange */}
            {
              currentTab === "one-time" && (
                <SwapUi
                  connection={connection}
                  queryFromMint={queryFromMint}
                  queryToMint={queryToMint}
                />
              )
            }
            {/* Repeating exchange */}
            {
              currentTab === "recurring" && (
                <RepeatingSwapUi
                  connection={connection}
                  endpoint={endpoint}
                  queryFromMint={queryFromMint}
                  queryToMint={queryToMint}
                />
              )
            }
          </div>
          {recurringBuys && recurringBuys.length > 0 && isProd() && (
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
}
