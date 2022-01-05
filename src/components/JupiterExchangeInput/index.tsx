import React, { useContext } from 'react';
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount } from '../../utils/utils';
import { useWallet } from '../../contexts/wallet';
import { TokenDisplay } from '../TokenDisplay';

export const JupiterExchangeInput = (props: {
  token: TokenInfo | undefined;
  tokenBalance: string;
  tokenAmount: string;
  onSelectToken: any;
  onInputChange?: any;
  onMaxAmount: any | undefined;
  onPriceClick: any;
  translationId: string;
  readonly?: boolean;
  inputPosition: "left" | "right";
  inputLabel: string;
}) => {
    const { t } = useTranslation("common");
    const {
        coinPrices,
        loadingPrices,
    } = useContext(AppStateContext);
    const { connected } = useWallet();

    const getPricePerToken = (token: TokenInfo): number => {
        const tokenSymbol = token.symbol.toUpperCase();
        const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

        return coinPrices && coinPrices[symbol]
        ? coinPrices[symbol]
        : 0;
    }

    return (
        <div className="transaction-field mb-0">
            <div className={`transaction-field-row ${props.inputPosition === "right" ? 'reverse' : '' }`}>
                <span className="field-label-left">
                    <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={props.onPriceClick}>
                    {props.inputLabel || "0.00"}
                    </span>
                </span>
                <span className="field-label-right">
                    {connected && (
                        <>
                            <span>{t('transactions.send-amount.label-right')}:</span>
                            <span className="balance-amount">
                                {`${props.token && props.tokenBalance
                                    ? props.tokenBalance
                                    : "0"
                                }`}
                            </span>
                            {props.tokenBalance && (
                                <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={props.onPriceClick}>
                                    {`(~$${props.token && props.tokenBalance
                                        ? formatAmount(parseFloat(props.tokenBalance) * getPricePerToken(props.token as TokenInfo), 2)
                                        : "0.00"
                                    })`}
                                </span>
                            )}
                        </>
                    )}
                </span>
            </div>
            <div className={`transaction-field-row ${props.inputPosition === "left" ? 'main-row' : 'main-row reverse' }`}>
                <div className="input-control">
                    <input
                        className="general-text-input"
                        inputMode="decimal"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        onChange={props.onInputChange}
                        pattern="^[0-9]*[.,]?[0-9]*$"
                        placeholder="0.0"
                        minLength={1}
                        maxLength={79}
                        spellCheck="false"
                        readOnly={props.readonly ? true : false}
                        value={props.tokenAmount} />
                </div>
                <span className="add-ons">
                    <div className={`token-group ${props.inputPosition === "right" ? 'flex-row-reverse' : ''}`}>
                        {props.token && props.tokenBalance && props.onMaxAmount && props.translationId === 'source' ? (
                            <div className="token-max simplelink" onClick={props.onMaxAmount}>MAX</div>
                        ) : null}
                        <TokenDisplay onClick={props.onSelectToken}
                            fullTokenInfo={props.token}
                            mintAddress={props.token ? props.token.address : ''}
                            name={props.token ? props.token.name : ''}
                            className="simplelink"
                            noTokenLabel={t(`swap.token-select-${props.translationId}`)}
                            showName={false}
                            showCaretDown={true}
                        />
                    </div>
                </span>
            </div>
        </div>
    );
};
