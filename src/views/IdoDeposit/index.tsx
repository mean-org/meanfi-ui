import React from 'react';
import { useContext, useState } from 'react';
import { Button, Row, Col } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber, truncateFloat } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { consoleOut, percentage } from '../../utils/ui';
import { Identicon } from '../../components/Identicon';
import { useWallet } from '../../contexts/wallet';

export const IdoDeposit = (props: {
  disabled: boolean;
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
      newValue = getDisplayAmount(partialAmount);
    }
    setDepositAmount(newValue);
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">{caption}</Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
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
                getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true)
              )}>
              100%
            </div>
          </div>
        )}
      </div>
      <div className="well">
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

      {/* Info */}
      {/* {selectedToken && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
        </div>
      )} */}

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
