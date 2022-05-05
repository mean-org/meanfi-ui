import { TokenInfo } from "@solana/spl-token-registry";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress } from "../../utils/utils";
import { TokenDisplay } from "../TokenDisplay";
import { MarketInfo, RouteInfo } from "@jup-ag/core";
import BN from "bn.js";
import { useWallet } from "../../contexts/wallet";
import { toUsCurrency } from "../../utils/ui";

export const JupiterExchangeOutput = (props: {
  fromToken: TokenInfo | undefined;
  fromTokenAmount: string;
  toToken: TokenInfo | undefined;
  toTokenBalance?: string;
  toTokenAmount?: string;
  mintList?: any;
  onSelectToken: any;
  onSelectedRoute: any;
  onBalanceClick?: any;
  routes: RouteInfo[];
  showAllRoutes: boolean;
  onToggleShowFullRouteList: any;
  className?: string;
  disabled?: boolean;
  readonly?: boolean;
  isBusy?: boolean;
}) => {

  const { t } = useTranslation("common");
  const {
    coinPrices,
    loadingPrices,
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

  const getPricePerToken = (token: TokenInfo): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.address]
      ? coinPrices[token.address]
      : 0;
  }

  return (
    <>
      <div className={`well ${props.className} ${props.disabled ? 'disabled' : ''}`}>
        {/* Balance row */}
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            {publicKey ? (
              <>
                <span className="simplelink" onClick={props.onBalanceClick}>
                  {`${
                    props.toToken && props.toTokenBalance
                      ? getTokenAmountAndSymbolByTokenAddress(
                          parseFloat(props.toTokenBalance),
                          props.toToken.address,
                          true
                      )
                      : "0"
                  }`}
                </span>
                {props.toTokenBalance && (
                  <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={() => refreshPrices()}>
                    {`(~${
                      props.toToken && props.toTokenBalance
                        ? toUsCurrency(
                            parseFloat(props.toTokenBalance) * getPricePerToken(props.toToken as TokenInfo)
                          )
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
                ~{props.toToken && props.toTokenBalance
                  ? toUsCurrency(parseFloat(props.toTokenBalance) * getPricePerToken(props.toToken as TokenInfo))
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
            <span className={`add-on ${!props.readonly || !props.isBusy ? 'simplelink' : ''}`}>
              <TokenDisplay onClick={
                () => {
                  if (!props.readonly || !props.isBusy) {
                    props.onSelectToken();
                  }
                }}
                fullTokenInfo={props.toToken}
                mintAddress={props.toToken ? props.toToken.address : ''}
                name={props.toToken ? props.toToken.name : ''}
                className={!props.readonly || !props.isBusy ? 'simplelink' : ''}
                noTokenLabel={t('swap.token-select-destination')}
                showName={false}
                showCaretDown={!props.readonly || !props.isBusy}
              />
            </span>
          </div>
          <div className="right">
            {props.routes &&
             props.routes.length > 1 ? (
              <span>&nbsp;</span>
            ) : props.toTokenAmount ? (
              <div className="static-data-field text-right">
                {props.toTokenAmount}
              </div>
            ) : <span>&nbsp;</span>}
          </div>
        </div>

        {(props.routes &&
         props.routes.length > 0) && (
          <>
            <div className={`routes-container-max-size mb-1 ${props.showAllRoutes && props.routes.length > 2 ? 'vertical-scroll pr-2' : ''}`}>
              {props.routes.map((c: RouteInfo, index: number) => {
                const firstInfo =  props.routes[0];
                const lastInfo = props.routes[props.routes.length - 1];
                const decimals = props.toToken ? props.toToken.decimals : 6;
                const amountOut = toUiAmount(new BN(c.outAmount), decimals);
                const showBadge = props.routes.length > 1 && (firstInfo.outAmount || 0) > (lastInfo.outAmount || 0);
                const marketInfo = c.marketInfos;
                const labels = marketInfo.map(item => item.amm.label).join(' x ');
                const maxNumItems = props.showAllRoutes ? 10 : 2;

                if (index < maxNumItems) {
                  return (
                    <div
                      key={`${index}`}
                      className={
                        index === selectedRouteIndex
                          ? `swap-client-card ${props.isBusy ? 'no-pointer' : 'selected'}`
                          : `swap-client-card ${props.isBusy ? 'no-pointer' : ''}`
                      }
                      onClick={() => {
                        if (!props.isBusy) {
                          setSelectedRouteIndex(index);
                          props.onSelectedRoute(c);
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
                } else {
                  return null;
                }

              })}
            </div>
            <div className="flex-fixed-left align-items-center pl-1">
              {props.routes.length > 2 ? (
                <span
                  className={`left fg-secondary-60 ${props.isBusy ? 'no-pointer' : 'simplelink underline-on-hover'}`}
                  onClick={() => {
                    if (!props.isBusy) {
                      props.onToggleShowFullRouteList();
                    }
                  }}>
                  {props.showAllRoutes ? 'Show less' : 'Show more'}
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
