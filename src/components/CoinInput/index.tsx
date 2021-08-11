import { TokenInfo } from "@solana/spl-token-registry";
import { useTranslation } from 'react-i18next';
import { IconCaretDown } from "../../Icons";
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { Identicon } from "../Identicon";

export const CoinInput = (props: {
  token: TokenInfo;
  tokenBalance: number;
  tokenAmount: string;
  onSelectToken: any;
  onInputChange: any;
  onMaxAmount: any;
  translationId: string;
}) => {
  const { t } = useTranslation('common');

  return (
    <>
        <div className="transaction-field mb-1">
        <div className="transaction-field-row">
            <span className="field-label-left">{t(`swap.input-label-${props.translationId}`)}</span>
            <span className="field-label-right">
                <span>{t('transactions.send-amount.label-right')}:</span>
                <span className="balance-amount">
                    {`${props.token && props.tokenBalance
                        ? getTokenAmountAndSymbolByTokenAddress(props.tokenBalance, props.token.address, true, true)
                        : "0"
                    }`}
                </span>
            </span>
        </div>
        <div className="transaction-field-row main-row">
            <span className="input-left">
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
                value={props.tokenAmount} />
            </span>
            <div className="addon-right">
                <div className="token-group">
                    {props.token && props.tokenBalance && props.translationId === 'source' ? (
                        <div className="token-max simplelink" onClick={props.onMaxAmount}>MAX</div>
                    ) : null}
                    <div className="token-selector simplelink" onClick={props.onSelectToken}>
                        {props.token ? (
                            <>
                                <div className="token-icon">
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
                    </div>
                </div>
            </div>
            <span className="field-caret-down">
                <IconCaretDown className="mean-svg-icons" />
            </span>
        </div>
        </div>
    </>
  );
};
