import { TokenInfo } from "@solana/spl-token-registry";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { formatAmount } from "../../utils/utils";
import { TokenDisplay } from "../TokenDisplay";
import { MarketInfo, RouteInfo } from "@jup-ag/core";
import BN from "bn.js";

export const JupiterExchangeOutput = (props: {
  fromToken: TokenInfo | undefined;
  fromTokenAmount: string;
  toToken: TokenInfo | undefined;
  toTokenBalance?: string;
  toTokenAmount?: string;
  mintList?: any;
  onSelectToken: any;
  onSelectedRoute: any;
  routes: RouteInfo[];
  showRoutes: boolean;
  className?: string;
  readonly?: boolean;
}) => {

  const { t } = useTranslation("common");
  const {
    coinPrices,
    loadingPrices,
    refreshPrices,
  } = useContext(AppStateContext);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | undefined>(undefined);
  const [savings, setSavings] = useState(0);

  const toUiAmount = (amount: BN, decimals: number) => {
    if (!amount || !decimals) {
        return 0;
    }
    return amount.toNumber() / 10 ** decimals;
  }

  useEffect(() => {

    if (!props.routes || !props.routes.length || selectedRouteIndex !== undefined) { return; }

    const timeout = setTimeout(() => {
      setSelectedRouteIndex(0);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    props.routes,
    selectedRouteIndex
  ]);

  // Calculate savings
  useEffect(() => {

    if (!props.routes || !props.routes.length || !props.toToken) {
      return;
    }

    if (props.routes.length === 1) {
      setSavings(0);
      return;
    }

    const firstInfo =  props.routes[0];
    const lastInfo = props.routes[props.routes.length - 1];
    const bestAmountOut = toUiAmount(new BN(firstInfo.outAmount), props.toToken.decimals);
    const worstAmountOut = toUiAmount(new BN(lastInfo.outAmount), props.toToken.decimals);
    const showBadge = props.routes.length > 1 && bestAmountOut > worstAmountOut;
    const saveAmount = showBadge ? bestAmountOut - worstAmountOut : 0;

    setSavings(saveAmount);

  }, [
    props.routes,
    props.toToken,
  ]);

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === "W" ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol] ? coinPrices[symbol] : 0;
  };

  return (
    <>
      <div className={`well ${props.className || ''}`}>
        {/* Balance row */}
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t("transactions.send-amount.label-right")}:</span>
            <span>
              {`${
                props.toToken && props.toTokenBalance
                  ? props.toTokenBalance
                  : "0"
              }`}
            </span>
            {props.toTokenBalance && (
              <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={() => refreshPrices()}>
                {`(~$${
                  props.toToken && props.toTokenBalance
                    ? formatAmount(
                        parseFloat(props.toTokenBalance) *
                          getPricePerToken(props.toToken as TokenInfo),
                        2
                      )
                    : "0.00"
                })`}
              </span>
            )}
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${props.toToken && props.toTokenBalance
                ? formatAmount(parseFloat(props.toTokenBalance) * getPricePerToken(props.toToken as TokenInfo), 2)
                : "0.00"
              }
            </span>
          </div>
        </div>

        {/* Main row */}
        <div className="flex-fixed-left">
          <div className="left">
            <span className={`add-on ${!props.readonly ? 'simplelink' : ''}`}>
              <TokenDisplay onClick={
                () => {
                  if (!props.readonly) {
                    props.onSelectToken();
                  }
                }}
                fullTokenInfo={props.toToken}
                mintAddress={props.toToken ? props.toToken.address : ''}
                name={props.toToken ? props.toToken.name : ''}
                className={!props.readonly ? 'simplelink' : ''}
                noTokenLabel={t('swap.token-select-destination')}
                showName={false}
                showCaretDown={!props.readonly}
              />
            </span>
          </div>
          <div className="right">
            {props.showRoutes &&
             props.routes &&
             props.routes.length > 1 ? (
              <span>&nbsp;</span>
            ) : props.toTokenAmount ? (
              <div className="static-data-field text-right">
                {props.toTokenAmount}
              </div>
            ) : <span>&nbsp;</span>}
          </div>
        </div>

        {(props.showRoutes &&
         props.routes &&
         props.routes.length > 0) && (
          <div className={`routes-container-max-size ${props.routes.length > 4 ? 'vertical-scroll pr-2' : ''}`}>
            {props.routes.map((c: RouteInfo, index: number) => {
              const firstInfo =  props.routes[0];
              const lastInfo = props.routes[props.routes.length - 1];
              const decimals = props.toToken ? props.toToken.decimals : 6;
              const amountOut = toUiAmount(new BN(c.outAmount), decimals);
              const showBadge = props.routes.length > 1 && (firstInfo.outAmount || 0) > (lastInfo.outAmount || 0);
              const marketInfo = c.marketInfos;
              const labels = marketInfo.map(item => item.marketMeta.amm.label).join(' x ');

              return (
                <div
                  key={`${index}`}
                  className={
                    index === selectedRouteIndex
                      ? "swap-client-card selected"
                      : "swap-client-card"
                  }
                  onClick={() => {
                    setSelectedRouteIndex(index);
                    props.onSelectedRoute(c);
                  }}>
                  <div className="card-content">
                    {index === 0 && showBadge && (
                      <span
                        className={`badge ${
                          index === selectedRouteIndex ? "bg-orange-red" : "disabled"
                        }`}>
                        {t("swap.clients-label-savings")}:{" "}
                        {formatAmount(savings, decimals)}
                      </span>
                    )}
                    <div className="highlight flex-column">
                      <span className="font-size-100 font-bold">
                        {labels || ''}
                      </span>
                      <div className="font-size-75">
                        {marketInfo.map((value: MarketInfo, idx: number) => {
                          const tokenIn = props.fromToken;
                          const tokenOut = props.mintList[value.outputMint.toBase58()] as TokenInfo;
                          return (
                            <span key={`route-${idx}`}>
                              {(idx === 0 && tokenIn) && (
                                <span>{tokenIn.symbol}</span>
                              )}
                              {tokenOut && (
                                <>
                                  <span className="route-separator">→</span>
                                  <span>{tokenOut.symbol}</span>
                                </>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="amount">
                      {formatAmount(amountOut, decimals)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};
