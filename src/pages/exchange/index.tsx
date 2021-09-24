import { Alert } from 'antd';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";
import { environment } from '../../environments/environment';
import { getTokenBySymbol, TokenInfo } from '../../utils/tokens';
import { consoleOut } from '../../utils/ui';

export const SwapView = () => {
  const { t } = useTranslation("common");
  const location = useLocation();
  const [queryFromMint, setQueryFromMint] = useState<string | null>(null);
  const [queryToMint, setQueryToMint] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let from: TokenInfo | null = null;
    let to: TokenInfo | null = null;
    // Get fromMint address from symbol passed via query string param
    if (params.has('fromMint')) {
      const symbol = params.get('fromMint');
      from = symbol ? getTokenBySymbol(symbol) : null;
      if (from) {
        setQueryFromMint(from.address);
      }
    }
    // Get toMint as well
    if (params.has('toMint')) {
      const symbol = params.get('toMint');
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

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        {environment !== 'production' && (
          <div className="notifications">
            <Alert
              message={t('swap.exchange-warning')}
              type="warning"
              showIcon
            />
          </div>
        )}
        <div className="place-transaction-box">
          <SwapUi queryFromMint={queryFromMint} queryToMint={queryToMint} />
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );
}
