import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Redirect, useLocation } from 'react-router-dom';
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";
import { getTokenBySymbol, TokenInfo } from '../../utils/tokens';
import { consoleOut } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { DdcaClient } from '@mean-dao/ddca';
import { AppStateContext } from '../../contexts/appstate';
import { useLocalStorageState } from '../../utils/utils';
import { getLiveRpc, RpcConfig } from '../../models/connections-hq';
import { Connection } from '@solana/web3.js';
import { environment } from '../../environments/environment';

export const SwapView = () => {
  const location = useLocation();
  const { publicKey, wallet } = useWallet();
  const {
    recurringBuys,
    setRecurringBuys,
  } = useContext(AppStateContext);
  const [loadingRecurringBuys, setLoadingRecurringBuys] = useState(false);
  const [queryFromMint, setQueryFromMint] = useState<string | null>(null);
  const [queryToMint, setQueryToMint] = useState<string | null>(null);
  const [redirect, setRedirect] = useState<string | null>(null);

  const isProd = (): boolean => {
    return environment === 'production';
  }

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

      ddcaClient.ListDdcas()
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

  return (
    <>
    {redirect && <Redirect to={redirect} />}
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box mb-3">
          <SwapUi connection={connection} queryFromMint={queryFromMint} queryToMint={queryToMint} />
        </div>
        {(recurringBuys && recurringBuys.length > 0 && isProd()) && (
          <div className="text-center mb-3">
            <Link to="/exchange-dcas"><span className="secondary-link">{`You have ${recurringBuys.length} recurring buys scheduled`}</span></Link>
          </div>
        )}
      </div>
    </div>
    <PreFooter />
    </>
  );
}
