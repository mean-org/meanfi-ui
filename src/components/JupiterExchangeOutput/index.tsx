import { MarketInfo, RouteInfo } from "@jup-ag/core";
import BN from "bn.js";
import { TokenDisplay } from "components/TokenDisplay";
import { AppStateContext } from "contexts/appstate";
import { useWallet } from "contexts/wallet";
import { toUsCurrency } from "middleware/ui";
import { formatAmount, formatThousands } from "middleware/utils";
import { TokenInfo } from "models/SolanaTokenInfo";
import { useCallback, useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export const JupiterExchangeOutput = (props: {
  className?: string;
  disabled?: boolean;
  fromToken: TokenInfo | undefined;
  isBusy?: boolean;
  mintList?: any;
  onBalanceClick?: any;
  onSelectToken: any;
  onSelectedRoute: any;
  onToggleShowFullRouteList: any;
  readonly?: boolean;
  routes: RouteInfo[];
  showAllRoutes: boolean;
  toToken: TokenInfo | undefined;
  toTokenAmount?: string;
  toTokenBalance?: number;
}) => {
  const {
    className,
    disabled,
    fromToken,
    isBusy,
    mintList,
    onBalanceClick,
    onSelectToken,
    onSelectedRoute,
    onToggleShowFullRouteList,
    readonly,
    routes,
    showAllRoutes,
    toToken,
    toTokenAmount,
    toTokenBalance,
  } = props;
  const { t } = useTranslation("common");
  const {
    loadingPrices,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    refreshPrices,
  } = useContext(AppStateContext);
  const { publicKey } = useWallet();
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | undefined>(undefined);

  const toUiAmount = (amount: BN, decimals: number) => {
    if (!amount || !decimals) {
        return 0;
    }
    return amount.toNumber() / 10 ** decimals;
  }

  const getTokenAmountValue = useCallback((amount?: number) => {
    if (!toToken || !amount) {
      return 0;
    }
    const price = getTokenPriceByAddress(toToken.address) || getTokenPriceBySymbol(toToken.symbol);
    return amount * price;
  }, [toToken]);

  useEffect(() => {

    if (!routes || !routes.length || selectedRouteIndex !== undefined) { return; }

    const timeout = setTimeout(() => {
      setSelectedRouteIndex(0);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    routes,
    selectedRouteIndex
  ]);

  const getOutputAmountDisplay = () => {
    if (routes && routes.length > 1) {
      return (<span>&nbsp;</span>);
    } else if (toTokenAmount) {
      return (
        <div className="static-data-field text-right">
          {toTokenAmount}
        </div>
      );
    } else {
      return (<span>&nbsp;</span>);
    }
  }

  return (
    <>
      <div className={`well ${className} ${disabled ? 'disabled' : ''}`}>
        {/* Balance row */}
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            {publicKey ? (
              <>
                <span className="simplelink" onClick={onBalanceClick}>
                  {toToken && toTokenBalance !== undefined &&
                    formatThousands(
                      toTokenBalance,
                      toToken.decimals,
                      toToken.decimals
                    )
                  }
                </span>
                {toTokenBalance && (
                  <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={() => refreshPrices()}>
                    {`(~${
                      toToken && toTokenBalance
                        ? toUsCurrency(getTokenAmountValue(toTokenBalance))
                        : "$0.00"
                    })`}
                  </span>
                )}
              </>
            ) : (
              <span className="balance-amount">0</span>
            )}
          </div>
          <div className="right inner-label">
          {publicKey ? (
            <>
              <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                ~{toToken && toTokenAmount
                  ? toUsCurrency(getTokenAmountValue(parseFloat(toTokenAmount)))
                  : "$0.00"
                }
              </span>
            </>
          ) : (
            <span>~$0.00</span>
          )}
          </div>
        </div>

        {/* Main row */}
        <div className="flex-fixed-left">
          <div className="left">
            <span className={`add-on ${!readonly || !isBusy ? 'simplelink' : ''}`}>
              <TokenDisplay onClick={
                () => {
                  if (!readonly || !isBusy) {
                    onSelectToken();
                  }
                }}
                fullTokenInfo={toToken}
                mintAddress={toToken ? toToken.address : ''}
                name={toToken ? toToken.name : ''}
                className={!readonly || !isBusy ? 'simplelink' : ''}
                noTokenLabel={t('swap.token-select-destination')}
                showName={false}
                showCaretDown={!readonly || !isBusy}
              />
            </span>
          </div>
          <div className="right">
            {getOutputAmountDisplay()}
          </div>
        </div>

        {(routes &&
         routes.length > 0) && (
          <>
            <div className={`routes-container-max-size mb-1 ${showAllRoutes && routes.length > 2 ? 'vertical-scroll pr-2' : ''}`}>
              {routes.map((c: RouteInfo, index: number) => {
                const firstInfo =  routes[0];
                const lastInfo = routes[routes.length - 1];
                const decimals = toToken ? toToken.decimals : 6;
                const amountOut = toUiAmount(new BN(c.outAmount), decimals);
                const showBadge = routes.length > 1 && (firstInfo.outAmount || 0) > (lastInfo.outAmount || 0);
                const marketInfo = c.marketInfos;
                const labels = marketInfo.map(item => item.amm.label).join(' x ');
                const maxNumItems = showAllRoutes ? 10 : 2;

                const getRouteClass = () => {
                  if (index === selectedRouteIndex) {
                    return `swap-client-card ${isBusy ? 'no-pointer' : 'selected'}`;
                  } else {
                    return `swap-client-card ${isBusy ? 'no-pointer' : ''}`;
                  }
                }

                if (index < maxNumItems) {
                  return (
                    <div
                      key={`${index}`}
                      className={getRouteClass()}
                      onClick={() => {
                        if (!isBusy) {
                          setSelectedRouteIndex(index);
                          onSelectedRoute(c);
                        }
                      }}>
                      <div className="card-content">
                        {index === 0 && showBadge && (
                          <span
                            className={`badge ${
                              index === selectedRouteIndex ? "bg-orange-red" : "disabled"
                            }`}>
                            {t('swap.routes-best-price-label')}
                          </span>
                        )}
                        <div className="highlight flex-column">
                          <span className="font-size-100 font-bold">
                            {labels || ''}
                          </span>
                          <div className="font-size-75">
                            {marketInfo.map((value: MarketInfo, idx: number) => {
                              const tokenIn = fromToken;
                              const tokenOut = mintList[value.outputMint.toBase58()] as TokenInfo;
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
                } else {
                  return null;
                }

              })}
            </div>
            <div className="flex-fixed-left align-items-center pl-1">
              {routes.length > 2 ? (
                <span
                  className={`left fg-secondary-60 ${isBusy ? 'no-pointer' : 'simplelink underline-on-hover'}`}
                  onClick={() => {
                    if (!isBusy) {
                      onToggleShowFullRouteList();
                    }
                  }}>
                  {showAllRoutes ? 'Show less' : 'Show more'}
                </span>
              ) : (
                <div className="left">&nbsp;</div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
