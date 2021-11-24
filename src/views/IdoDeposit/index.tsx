import React from 'react';
import { useContext, useState } from 'react';
import { Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber, truncateFloat } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { consoleOut, percentage } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { useWallet } from '../../contexts/wallet';

export const IdoDeposit = (props: {
  disabled: boolean;
  contributedAmount: number;
  totalMeanForSale: number;
  tokenPrice: number;
  maxFullyDilutedMarketCapAllowed: number;
  min: number;
  max: number;
}) => {
  const {
    selectedToken,
    tokenBalance
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { connected } = useWallet();
  const [depositAmount, setDepositAmount] = useState<string>('');

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setDepositAmount("");
    } else if (newValue === '.') {
      setDepositAmount(".");
    } else if (isValidNumber(newValue)) {
      setDepositAmount(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           depositAmount && parseFloat(depositAmount) > 0 &&
           parseFloat(depositAmount) <= tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !depositAmount || !isValidNumber(depositAmount) || !parseFloat(depositAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(depositAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : t('transactions.validation.valid-approve');
  }

  const onExecuteDepositTx = () => {
    consoleOut('Exec deposit Tx...', '', 'blue');
  }

  const getDisplayAmount = (amount: any, addSymbol = false): string => {
    if (selectedToken) {
      const bareAmount = truncateFloat(amount, selectedToken.decimals);
      if (addSymbol) {
        return bareAmount + ' ' + selectedToken.symbol;
      }
      return bareAmount;
    }

    return '';
  }

  const setPercentualValue = (percentualAmount: number, totalAmount: number) => {
    let newValue = '';
    if (percentualAmount === 100) {
      newValue = getDisplayAmount(totalAmount);
    } else {
      const partialAmount = percentage(percentualAmount, totalAmount);
      if (partialAmount <= props.max) {
        newValue = getDisplayAmount(partialAmount);
      } else {
        newValue = getDisplayAmount(props.max);
      }
    }
    setDepositAmount(newValue);
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <div className="flex-fixed-right line-height-180">
        <div className="left inner-label">
          <span>{caption}</span>
        </div>
        <div className="right value-display">
          <span>{value}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Top up amount */}
      <div className="flex-fixed-right mb-1">
        <div className="left">
          <div className="form-label">Amount</div>
        </div>
        {selectedToken && (
          <div className="right token-group">
            <div
              className={`token-max simplelink ${tokenBalance < props.min && 'disabled'}`}
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(props.min, selectedToken.address, true)
              )}>
              MIN
            </div>
            <div
              className="token-max simplelink"
              onClick={() => setPercentualValue(25, tokenBalance)}>
              25%
            </div>
            <div
              className="token-max simplelink"
              onClick={() => setPercentualValue(50, tokenBalance)}>
              50%
            </div>
            <div
              className="token-max simplelink"
              onClick={() => setPercentualValue(75, tokenBalance)}>
              75%
            </div>
            <div
              className="token-max simplelink"
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(
                  tokenBalance <= props.max ? tokenBalance : props.max,
                  selectedToken.address,
                  true
                )
              )}>
              100%
            </div>
          </div>
        )}
      </div>
      <div className="well mb-1">
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              <div className="token-selector">
                <div className="token-icon">
                  {selectedToken?.logoURI ? (
                    <img alt={`${selectedToken.name}`} width={20} height={20} src={selectedToken.logoURI} />
                  ) : (
                    <Identicon address={selectedToken?.address} style={{ width: "24", display: "inline-flex" }} />
                  )}
                </div>
                <div className="token-symbol">{selectedToken?.symbol}</div>
              </div>
            </span>
          </div>
          <div className="right">
            <input
              id="topup-amount-field"
              className="general-text-input text-right"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={depositAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('add-funds.label-right')}:</span>
            <span>
              {`${tokenBalance && selectedToken
                  ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">&nbsp;</div>
        </div>
      </div>
      <div className="flex-fixed-right mb-2">
        <div className="left form-label">
          <span>Min: {props.min} - Max: {formatAmount(props.max, 2, true)}</span>
        </div>
        <div className="right inner-label">&nbsp;</div>
      </div>

      {/* Info */}
      {selectedToken && (
        <div className="px-1 mb-2">
          {infoRow(
            'USDC Contributed',
            getTokenAmountAndSymbolByTokenAddress(
              props.contributedAmount,
              selectedToken.address,
              true
            )
          )}
          {infoRow(
            'Total MEAN for sale',
            getTokenAmountAndSymbolByTokenAddress(
              props.totalMeanForSale,
              '',
              true
            )
          )}
          {infoRow(
            'Implied token price',
            getTokenAmountAndSymbolByTokenAddress(
              props.tokenPrice,
              selectedToken.address
            )
          )}
          {infoRow(
            'Implied token price',
            formatAmount(
              props.maxFullyDilutedMarketCapAllowed,
              2,
              true
            )
          )}
        </div>
      )}

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={props.disabled || !isValidInput()}
        onClick={onExecuteDepositTx}>
        {getTransactionStartButtonLabel()}
      </Button>
    </>
  );
};
