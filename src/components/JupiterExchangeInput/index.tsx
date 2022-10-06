import React, { useCallback, useContext } from 'react';
import { TokenInfo } from "models/SolanaTokenInfo";
import { useTranslation } from 'react-i18next';
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from 'contexts/wallet';
import { toUsCurrency } from 'middleware/ui';
import { formatThousands } from 'middleware/utils';
import { TokenDisplay } from 'components/TokenDisplay';

export const JupiterExchangeInput = (props: {
  token: TokenInfo | undefined;
  tokenBalance?: number;
  tokenAmount: string;
  onSelectToken: any;
  onInputChange?: any;
  onMaxAmount: any | undefined;
  onBalanceClick?: any;
  readonly?: boolean;
  disabled?: boolean;
  className?: string;
  hint?: string;
}) => {
    const {
        token,
        tokenBalance,
        tokenAmount,
        onSelectToken,
        onInputChange,
        onMaxAmount,
        onBalanceClick,
        readonly,
        disabled,
        className,
        hint,
    } = props;
    const { t } = useTranslation("common");
    const {
        loadingPrices,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        refreshPrices,
    } = useContext(AppStateContext);
    const { publicKey } = useWallet();

    const getTokenAmountValue = useCallback((amount?: number) => {
        if (!token || !amount) {
            return 0;
        }
        const price = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        return amount * price;
    }, [token]);

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
                            {token && tokenBalance !== undefined &&
                                formatThousands(
                                    tokenBalance,
                                    token.decimals,
                                    token.decimals
                                )
                            }
                            </span>
                            {tokenBalance && (
                                <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={() => refreshPrices()}>
                                    {`(~${
                                    token && tokenBalance
                                        ? toUsCurrency(getTokenAmountValue(tokenBalance))
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
                            ~{token && tokenAmount
                                ? toUsCurrency(getTokenAmountValue(parseFloat(tokenAmount)))
                                : "$0.00"
                            }
                            </span>
                        </>
                    ) : (
                        <span>~$0.00</span>
                    )}
                </div>
            </div>

            <div className="flex-fixed-left">
                <div className="left">
                    <span className={`add-on ${!readonly ? 'simplelink' : ''}`}>
                        <TokenDisplay onClick={
                            () => {
                                if (!readonly) {
                                    onSelectToken();
                                }
                            }}
                            fullTokenInfo={token}
                            mintAddress={token ? token.address : ''}
                            name={token ? token.name : ''}
                            className={!readonly ? 'simplelink' : ''}
                            noTokenLabel={t('swap.token-select-destination')}
                            showName={false}
                            showCaretDown={!readonly}
                        />
                        {publicKey && token && tokenBalance && onMaxAmount ? (
                            <div className="token-max simplelink" onClick={onMaxAmount}>MAX</div>
                        ) : null}
                    </span>
                </div>
                <div className="right">
                    <input
                        className="general-text-input text-right"
                        inputMode="decimal"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        onChange={onInputChange}
                        pattern="^[0-9]*[.,]?[0-9]*$"
                        placeholder="0.0"
                        minLength={1}
                        maxLength={79}
                        spellCheck="false"
                        readOnly={readonly ? true : false}
                        value={tokenAmount}
                    />
                </div>
            </div>

            {hint && (
                <div className="form-field-hint">{hint}</div>
            )}
        </div>
        </>
    );
};
