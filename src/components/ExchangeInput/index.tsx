import React, { useContext } from 'react';
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from 'react-i18next';
import { IconCaretDown } from "../../Icons";
import { Identicon } from "../Identicon";
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount } from '../../utils/utils';
import { useWallet } from '../../contexts/wallet';

export const ExchangeInput = (props: {
  token: TokenInfo | undefined;
  tokenBalance: string;
  tokenAmount: string;
  onSelectToken: any;
  onInputChange?: any;
  onMaxAmount: any | undefined;
  translationId: string;
  readonly?: boolean;
  inputPosition: "left" | "right";
  inputLabel: string;
}) => {
  const { t } = useTranslation("common");
  const { coinPrices } = useContext(AppStateContext);
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
            <span className="field-label-left">{props.inputLabel || ' '}</span>
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
                            <span className="balance-amount">
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
                    <div className="token-selector simplelink" onClick={props.onSelectToken}>
                        <>
                        {props.token ? (
                            <>
                                <div className="token-icon" style={{marginRight:'8px'}} >
                                    {props.token.logoURI ? (
                                        <img alt={`${props.token.name}`} width={20} height={20} src={props.token.logoURI}/>
                                    ) : (
                                        <Identicon
                                        address={props.token.address}
                                        style={{ width: "24", display: "inline-flex" }}
                                        />
                                    )}
                                </div>
                                <div className="token-symbol">{props.token.symbol}</div>
                            </>
                        ) : (
                            <span className="notoken-label">{t(`swap.token-select-${props.translationId}`)}</span>
                        )}
                        <span className="field-caret-down">
                            <IconCaretDown className="mean-svg-icons" />
                        </span>
                        </>
                    </div>
                </div>
            </span>
        </div>
    </div>
  );
};
