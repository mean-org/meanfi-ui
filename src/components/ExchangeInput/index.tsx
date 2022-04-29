import React, { useContext } from 'react';
import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { useWallet } from '../../contexts/wallet';
import { TokenDisplay } from '../TokenDisplay';
import { toUsCurrency } from '../../utils/ui';

export const ExchangeInput = (props: {
  token: TokenInfo | undefined;
  tokenBalance: string;
  tokenAmount: string;
  onSelectToken: any;
  onInputChange?: any;
  onMaxAmount: any | undefined;
  onPriceClick: any;
  onBalanceClick?: any;
  readonly?: boolean;
  className?: string;
}) => {
    const { t } = useTranslation("common");
    const {
        coinPrices,
        loadingPrices,
        refreshPrices,
    } = useContext(AppStateContext);
    const { publicKey } = useWallet();

    const getPricePerToken = (token: TokenInfo): number => {
        if (!token || !coinPrices) { return 0; }

        return coinPrices && coinPrices[token.address]
            ? coinPrices[token.address]
            : 0;
    }

    return (
        <>
            <div className={`well ${props.className || ''}`}>

                {/* Balance row */}
                <div className="flex-fixed-right">
                    <div className="left inner-label">
                        <span>{t('transactions.send-amount.label-right')}:</span>
                        {publicKey ? (
                            <>
                                <span className="simplelink" onClick={props.onBalanceClick}>
                                {`${
                                    props.token && props.tokenBalance
                                    ? getTokenAmountAndSymbolByTokenAddress(
                                        parseFloat(props.tokenBalance),
                                        props.token.address,
                                        true
                                    )
                                    : "0"
                                }`}
                                </span>
                                {props.tokenBalance && (
                                    <span className={`balance-amount ${loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}`} onClick={() => refreshPrices()}>
                                        {`(~${
                                        props.token && props.tokenBalance
                                            ? toUsCurrency(
                                                parseFloat(props.tokenBalance) * getPricePerToken(props.token as TokenInfo)
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
                                ~{props.token && props.tokenBalance
                                    ? toUsCurrency(parseFloat(props.tokenBalance) * getPricePerToken(props.token as TokenInfo))
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
                        <span className={`add-on ${!props.readonly ? 'simplelink' : ''}`}>
                            <TokenDisplay onClick={
                                () => {
                                    if (!props.readonly) {
                                        props.onSelectToken();
                                    }
                                }}
                                fullTokenInfo={props.token}
                                mintAddress={props.token ? props.token.address : ''}
                                name={props.token ? props.token.name : ''}
                                className={!props.readonly ? 'simplelink' : ''}
                                noTokenLabel={t('swap.token-select-destination')}
                                showName={false}
                                showCaretDown={!props.readonly}
                            />
                            {publicKey && props.token && props.tokenBalance && props.onMaxAmount ? (
                                <div className="token-max simplelink" onClick={props.onMaxAmount}>MAX</div>
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
                            onChange={props.onInputChange}
                            pattern="^[0-9]*[.,]?[0-9]*$"
                            placeholder="0.0"
                            minLength={1}
                            maxLength={79}
                            spellCheck="false"
                            readOnly={props.readonly ? true : false}
                            value={props.tokenAmount}
                        />
                    </div>
                </div>

            </div>
        </>
    );
};
