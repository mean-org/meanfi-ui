import React from 'react';
import { useContext, useState } from 'react';
import { Modal, Button } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { TokenDisplay } from '../TokenDisplay';

export const StreamAddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  transactionFees: TransactionFees;
}) => {
  const {
    loadingPrices,
    selectedToken,
    tokenBalance,
    effectiveRate,
    refreshPrices,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [topupAmount, setTopupAmount] = useState<string>('');

  const onAcceptTopup = () => {
    props.handleOk(topupAmount);
  }

  const setValue = (value: string) => {
    setTopupAmount(value);
  }

  const handleAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (newValue === '.') {
      setValue(".");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
    }
  };

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance
            ? true
            : false;
  }

  const getTransactionStartButtonLabel = (): string => {
    return !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !topupAmount || !isValidNumber(topupAmount) || !parseFloat(topupAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(topupAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : t('transactions.validation.valid-approve');
  }

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptTopup}
      onCancel={props.handleClose}
      afterClose={() => setValue('')}
      width={480}>

      {/* Top up amount */}
      <div className="form-label">{t('add-funds.label')}</div>
      <div className="well">
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                  showCaretDown={false}
                />
              )}
              {selectedToken && tokenBalance ? (
                <div
                  className="token-max simplelink"
                  onClick={() => setValue(tokenBalance.toFixed(selectedToken.decimals))}>
                  MAX
                </div>
              ) : null}
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
              value={topupAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('add-funds.label-right')}:</span>
            <span>
              {`${tokenBalance && selectedToken
                  ? getTokenAmountAndSymbolByTokenAddress(
                      tokenBalance,
                      selectedToken?.address,
                      true
                    )
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>

      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!isValidInput()}
        onClick={onAcceptTopup}>
        {getTransactionStartButtonLabel()}
      </Button>
    </Modal>
  );
};
