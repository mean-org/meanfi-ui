import React, { useContext, useEffect, useState } from 'react';
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from 'react-i18next';
import { IconCaretDown } from "../../Icons";
import { Identicon } from "../Identicon";
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount } from '../../utils/utils';

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
}) => {
    const { t } = useTranslation("common");
    const { coinPrices } = useContext(AppStateContext);
    const [selectedClient, setSelectedClient] = useState<any | undefined>(undefined);

    useEffect(() => {
        if (!selectedClient && props.clients && props.clients.length) {
            setSelectedClient(props.clients[0]);
        }
    }, [
        selectedClient,
        props.clients
    ]);

    // useEffect(() => {
    //     if (props.clients && props.clients.length &&
    //         (!selectedClient || selectedClient.exchangeInfo.fromAmm !== props.clients[0].exchangeInfo.fromAmm)) {
    //         setSelectedClient(props.clients[0]);
    //     }
    // }, [
    //     selectedClient,
    //     props.clients
    // ]);

    const getPricePerToken = (token: TokenInfo): number => {
        const tokenSymbol = token.symbol.toUpperCase();
        const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

        return coinPrices && coinPrices[symbol]
            ? coinPrices[symbol]
            : 0;
    }

    const getSavings = (): number => {
        const exchangeInfos = props.clients.filter(i => i.exchangeInfo);
        const showBadge = exchangeInfos.length > 1 && exchangeInfos[0].exchangeInfo.amountOut > exchangeInfos[1].exchangeInfo.amountOut;
        const savings = showBadge ? exchangeInfos[0].exchangeInfo.amountOut - exchangeInfos[exchangeInfos.length - 1].exchangeInfo.amountOut : 0;
        return savings;
    }

    return (
        <>
        <div className="well">
            {/* Balance row */}
            <div className="flex-fixed-right">
                <div className="left inner-label">
                    <span>{t('transactions.send-amount.label-right')}:</span>
                    <span>{`${props.toToken && props.toTokenBalance
                        ? props.toTokenBalance
                        : "0"}`}
                    </span>
                    {props.toTokenBalance && (
                        <span className="balance-amount">
                            {`(~$${props.toToken && props.toTokenBalance
                                ? formatAmount(parseFloat(props.toTokenBalance) * getPricePerToken(props.toToken as TokenInfo), 2)
                                : "0.00"
                            })`}
                        </span>
                    )}
                </div>
                <div className="right inner-label">
                    <span>~${props.toToken && props.toTokenBalance
                        ? formatAmount(parseFloat(props.toTokenBalance) * getPricePerToken(props.toToken as TokenInfo), 2)
                        : "0.00"}
                    </span>
                </div>
            </div>

            {/* Main row */}
            <div className="flex-fixed-left">
                <div className="left">
                    <span className="add-on simplelink">
                        <div className="token-selector" onClick={props.onSelectToken}>
                            {props.toToken ? (
                                <>
                                    <div className="token-icon" style={{marginRight:'8px'}} >
                                        {props.toToken.logoURI ? (
                                            <img alt={`${props.toToken.name}`} width={20} height={20} src={props.toToken.logoURI}/>
                                        ) : (
                                            <Identicon
                                            address={props.toToken.address}
                                            style={{ width: "24", display: "inline-flex" }}
                                            />
                                        )}
                                    </div>
                                    <div className="token-symbol">{props.toToken.symbol}</div>
                                </>
                            ) : (
                                <span className="notoken-label">{t('swap.token-select-destination')}</span>
                            )}
                            <span className="flex-center">
                                <IconCaretDown className="mean-svg-icons" />
                            </span>
                        </div>
                    </span>
                </div>
                <div className="right">
                    {props.toTokenAmount && props.clients && props.clients.length > 0 ? (
                        <span>&nbsp;</span>
                    ) : (
                        <div className="static-data-field text-right">{props.toTokenAmount}</div>
                    )}
                </div>
            </div>

            {(props.toTokenAmount && props.clients && props.clients.length > 0) && (
                <div className="mt-2">
                    {props.clients.map((client: any, index: number) => {
                        if (client.exchangeInfo) {
                            const fromAmount = parseFloat(props.fromTokenAmount);
                            const amountOut = client.exchangeInfo.amountOut * fromAmount;
                            // Savings
                            const showBadge = props.clients.length > 1 && props.clients[0].exchangeInfo.amountOut > props.clients[1].exchangeInfo.amountOut;
                            const selected = selectedClient && selectedClient.exchangeInfo.fromAmm === client.exchangeInfo.fromAmm ? true : false;
                            return (
                                <div key={`${index}`} className={selected ? 'swap-client-card selected' : 'swap-client-card'} onClick={() => {
                                    setSelectedClient(client);
                                    props.onSelectedClient(client);
                                }}>
                                    <div className="card-content">
                                        {(index === 0 && showBadge) && (
                                            <span className={`badge ${selected ? 'bg-orange-red' : 'disabled'}`}>{t('swap.clients-label-savings')}: {formatAmount(getSavings(), props.toToken?.decimals || 2)}</span>
                                        )}
                                        <div className="highlight flex-column">
                                            <span className="font-size-100 font-bold">{client.exchangeInfo.fromAmm}</span>
                                            {/* TODO: Update route when routes are available */}
                                            <span>{props.fromToken?.symbol} → {props.toToken?.symbol}</span>
                                        </div>
                                        <div className="amount">{formatAmount(amountOut, props.toToken?.decimals || 2)}</div>
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
