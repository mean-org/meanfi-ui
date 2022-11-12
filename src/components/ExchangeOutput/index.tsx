import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount } from '../../middleware/utils';
import { TokenInfo } from '@mean-dao/hybrid-liquidity-ag/lib/types';
import { TokenDisplay } from '../TokenDisplay';

export const ExchangeOutput = (props: {
  fromToken: TokenInfo | undefined;
  fromTokenAmount: string;
  toToken: TokenInfo | undefined;
  toTokenBalance: string;
  toTokenAmount: string;
  onSelectToken: any;
  onSelectedClient: any;
  inputLabel: string;
  clients: any[];
  showLpList: boolean;
}) => {
  const { t } = useTranslation('common');
  const { loadingPrices, getTokenPriceBySymbol, refreshPrices } =
    useContext(AppStateContext);
  const [selectedClient, setSelectedClient] = useState<any>();
  const [savings, setSavings] = useState(0);

  useEffect(() => {
    if (!props.clients || !props.clients.length) {
      return;
    }

    const timeout = setTimeout(() => {
      setSelectedClient(props.clients[0]);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [props.clients]);

  useEffect(() => {
    if (!props.clients || !props.clients.length) {
      return;
    }

    const timeout = setTimeout(() => {
      if (props.clients.length === 1) {
        setSavings(0);
        return;
      }

      const exchangeInfos = props.clients
        .filter(c => c.exchange)
        .map(c => c.exchange);

      const firstInfo = exchangeInfos[0];
      const lastInfo = exchangeInfos[exchangeInfos.length - 1];
      const fromAmount = parseFloat(props.fromTokenAmount);
      const bestAmountOut = fromAmount * (firstInfo?.outPrice || 0);
      const worstAmountOut = fromAmount * (lastInfo?.outPrice || 0);
      const showBadge =
        exchangeInfos.length > 1 && bestAmountOut > worstAmountOut;
      const saveAmount = showBadge ? bestAmountOut - worstAmountOut : 0;

      setSavings(saveAmount);
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [props.clients, props.fromTokenAmount]);

  // useEffect(() => {
  //     if (props.clients && props.clients.length &&
  //         (!selectedClient || selectedClient.exchangeInfo.fromAmm !== props.clients[0].exchangeInfo.fromAmm)) {
  //         setSelectedClient(props.clients[0]);
  //     }
  // }, [
  //     selectedClient,
  //     props.clients
  // ]);

  return (
    <>
      <div className="well">
        {/* Balance row */}
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${
                props.toToken && props.toTokenBalance
                  ? props.toTokenBalance
                  : '0'
              }`}
            </span>
            {props.toTokenBalance && (
              <span
                className={`balance-amount ${
                  loadingPrices
                    ? 'click-disabled fg-orange-red pulsate'
                    : 'simplelink'
                }`}
                onClick={() => refreshPrices()}
              >
                {`(~$${
                  props.toToken && props.toTokenBalance
                    ? formatAmount(
                        parseFloat(props.toTokenBalance) *
                          getTokenPriceBySymbol(props.toToken.symbol),
                        2,
                      )
                    : '0.00'
                })`}
              </span>
            )}
          </div>
          <div className="right inner-label">
            <span
              className={
                loadingPrices
                  ? 'click-disabled fg-orange-red pulsate'
                  : 'simplelink'
              }
              onClick={() => refreshPrices()}
            >
              ~$
              {props.toToken && props.toTokenBalance
                ? formatAmount(
                    parseFloat(props.toTokenBalance) *
                      getTokenPriceBySymbol(props.toToken.symbol),
                    2,
                  )
                : '0.00'}
            </span>
          </div>
        </div>

        {/* Main row */}
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on simplelink">
              <TokenDisplay
                onClick={props.onSelectToken}
                mintAddress={props.toToken ? props.toToken.address : ''}
                name={props.toToken ? props.toToken.name : ''}
                className="simplelink"
                noTokenLabel={t('swap.token-select-destination')}
                showName={false}
                showCaretDown={true}
              />
            </span>
          </div>
          <div className="right">
            {props.showLpList &&
            props.toTokenAmount &&
            props.clients &&
            props.clients.length > 1 ? (
              <span>&nbsp;</span>
            ) : (
              <div className="static-data-field text-right">
                {props.toTokenAmount}
              </div>
            )}
          </div>
        </div>

        {props.fromTokenAmount &&
          props.showLpList &&
          props.clients &&
          props.clients.length > 0 && (
            <div className="mt-2" style={{ marginTop: '2rem' }}>
              {props.clients.map((c: any, index: number) => {
                if (c.exchange) {
                  const fromAmount = parseFloat(props.fromTokenAmount);
                  const amountOut = c.exchange.amountOut * fromAmount;
                  const firstInfo = props.clients[0].exchange;
                  const lastInfo =
                    props.clients[props.clients.length - 1].exchange;

                  // Savings
                  const showBadge =
                    props.clients.length > 1 &&
                    (firstInfo.amountOut || 0) > (lastInfo?.amountOut || 0);
                  let selected =
                    selectedClient &&
                    selectedClient.exchange.fromAmm === c.exchange.fromAmm;

                  if (selected && selectedClient.pool && c.pool) {
                    selected = selectedClient.pool.name === c.pool.name;
                  }

                  return (
                    <div
                      key={`${index}`}
                      className={
                        selected
                          ? 'swap-client-card selected'
                          : 'swap-client-card'
                      }
                      onClick={() => {
                        setSelectedClient(c);
                        props.onSelectedClient(c);
                      }}
                    >
                      <div className="card-content">
                        {index === 0 && showBadge && (
                          <span
                            className={`badge ${
                              selected ? 'bg-orange-red' : 'disabled'
                            }`}
                          >
                            {t('swap.routes-best-price-label')}:{' '}
                            {formatAmount(
                              savings,
                              props.toToken?.decimals || 2,
                            )}
                          </span>
                        )}
                        <div className="highlight flex-column">
                          <span className="font-size-100 font-bold">
                            {c.exchange.fromAmm}
                          </span>
                          {/* TODO: Update route when routes are available */}
                          <span>
                            {props.fromToken?.symbol} → {props.toToken?.symbol}
                          </span>
                        </div>
                        <div className="amount">
                          {formatAmount(
                            amountOut,
                            props.toToken?.decimals || 2,
                          )}
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return null;
                }
              })}
            </div>
          )}
      </div>
    </>
  );
};
