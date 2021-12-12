import React from 'react';
import { useState } from 'react';
import { Button } from 'antd';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber, truncateFloat } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { consoleOut, percentage } from '../../utils/ui';
import { useWallet } from '../../contexts/wallet';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TokenInfo } from '@solana/spl-token-registry';

export const IdoDeposit = (props: {
  disabled: boolean;
  contributedAmount: number;
  totalMeanForSale: number;
  tokenPrice: number;
  tokenBalance: number;
  selectedToken: TokenInfo | undefined;
  maxFullyDilutedMarketCapAllowed: number;
  min: number;
  max: number;
}) => {
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
    const amount = depositAmount ? parseFloat(depositAmount) : 0;
    return props.selectedToken &&
           props.tokenBalance &&
           amount > 0 && amount >= props.min &&
           amount <= props.tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    const amount = depositAmount ? parseFloat(depositAmount) : 0;
    return !connected
      ? t('transactions.validation.not-connected')
      : !props.selectedToken || !props.tokenBalance
        ? t('transactions.validation.no-balance')
        : !amount
          ? t('transactions.validation.no-amount')
          : amount < props.min
            ? 'Balance too low'
            : amount > props.tokenBalance
              ? t('transactions.validation.amount-high')
              : t('transactions.validation.valid-approve');
  }

  const onExecuteDepositTx = () => {
    consoleOut('Exec deposit Tx...', '', 'blue');
  }

  const getDisplayAmount = (amount: any, addSymbol = false): string => {
    if (props.selectedToken) {
      const bareAmount = truncateFloat(amount, props.selectedToken.decimals);
      if (addSymbol) {
        return bareAmount + ' ' + props.selectedToken.symbol;
      }
      return bareAmount;
    }

    return '';
  }

  const getPercentualValueWithMaxCap = (percentualAmount: number, totalAmount: number) => {
    let retValue = 0;
    const cappedAmount = totalAmount <= props.max ? totalAmount : props.max;
    if (percentualAmount === 100) {
      retValue = cappedAmount;
    } else {
      retValue = percentage(percentualAmount, cappedAmount);
    }
    return retValue;
  }

  const setPercentualValue = (percentualAmount: number, totalAmount: number) => {
    let newValue = '';
    const cappedAmount = totalAmount <= props.max ? totalAmount : props.max;
    if (percentualAmount === 100) {
      newValue = getDisplayAmount(cappedAmount);
    } else {
      const partialAmount = percentage(percentualAmount, cappedAmount);
      newValue = getDisplayAmount(partialAmount);
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
        {props.selectedToken && (
          <div className="right token-group">
            <div
              className={`token-max ${connected ? 'simplelink' : 'disabled'}`}
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(
                  props.tokenBalance > props.min ? props.min : props.tokenBalance,
                  props.selectedToken ? props.selectedToken.address : '',
                  true)
              )}>
              MIN
            </div>
            <div
              className={`token-max ${connected ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(25, props.tokenBalance)}>
              25%
            </div>
            <div
              className={`token-max ${connected ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(50, props.tokenBalance)}>
              50%
            </div>
            <div
              className={`token-max ${connected ? 'simplelink' : 'disabled'}`}
              onClick={() => setPercentualValue(75, props.tokenBalance)}>
              75%
            </div>
            <div
              className={`token-max ${connected ? 'simplelink' : 'disabled'}`}
              onClick={() => setDepositAmount(
                getTokenAmountAndSymbolByTokenAddress(
                  props.tokenBalance > props.max ? props.max : props.tokenBalance,
                  props.selectedToken ? props.selectedToken.address : '',
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
              {props.selectedToken && (
                <TokenDisplay onClick={() => {}}
                  name={props.selectedToken.name}
                  showName={false}
                  symbol={props.selectedToken.symbol}
                  mintAddress={props.selectedToken.address}
                  icon={<img alt={`${props.selectedToken.name}`} width={20} height={20} src={props.selectedToken.logoURI} />}
                  showCaretDown={false}
                />
              )}
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
              {`${props.tokenBalance && props.selectedToken
                  ? getTokenAmountAndSymbolByTokenAddress(props.tokenBalance, props.selectedToken?.address, true)
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
      {props.selectedToken && (
        <div className="px-1 mb-2">
          {infoRow(
            'USDC Contributed',
            getTokenAmountAndSymbolByTokenAddress(
              props.contributedAmount,
              props.selectedToken.address,
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
              props.selectedToken.address
            )
          )}
          {infoRow(
            'Max Fully Diluted Market Cap Allowed',
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
