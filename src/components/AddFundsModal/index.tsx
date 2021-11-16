import React from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { IconSort } from "../../Icons";
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { Identicon } from '../Identicon';
import { percentage } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';

export const AddFundsModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  transactionFees: TransactionFees;
}) => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate
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

  const getFeeAmount = (amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (props && props.transactionFees) {
      if (props.transactionFees.mspPercentFee) {
        fee = percentage(props.transactionFees.mspPercentFee, inputAmount);
      } else if (props.transactionFees.mspFlatFee) {
        fee = props.transactionFees.mspFlatFee;
      }
    }
    return fee;
  }

  // Validation

  const isValidInput = (): boolean => {
    return selectedToken &&
           tokenBalance &&
           topupAmount && parseFloat(topupAmount) > 0 &&
           parseFloat(topupAmount) <= tokenBalance &&
           parseFloat(topupAmount) > getFeeAmount(topupAmount)
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
      : tokenBalance < getFeeAmount(topupAmount)
      ? t('transactions.validation.amount-low')
      : t('transactions.validation.valid-approve');
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
      <div className="mb-3">
        <div className="transaction-field mb-1">
          <div className="transaction-field-row">
            <span className="field-label-left" style={{marginBottom: '-6px'}}>
              {t('add-funds.label')} ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
              <IconSort className="mean-svg-icons usd-switcher fg-red" />
              <span className="fg-red">USD</span>
            </span>
            <span className="field-label-right">
              <span>{t('add-funds.label-right')}:</span>
              <span className="balance-amount">
                {`${selectedToken && tokenBalance
                  ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                  : "0"
                }`}
              </span>
              <span className="balance-amount">
                (~$
                {tokenBalance && effectiveRate
                  ? formatAmount(tokenBalance as number * effectiveRate, 2)
                  : "0.00"})
              </span>
            </span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="input-left">
              <input
                id="topup-amount-field"
                className="general-text-input"
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
            </span>
            {selectedToken && (
              <div className="addon-right">
                <div className="token-group">
                  {selectedToken && (
                    <div
                      className="token-max simplelink"
                      onClick={() => {
                        setValue(
                          getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true)
                        );
                      }}>
                      MAX
                    </div>
                  )}
                  <div className="token-selector">
                    <div className="token-icon">
                      {selectedToken.logoURI ? (
                        <img
                          alt={`${selectedToken.name}`}
                          width={20}
                          height={20}
                          src={selectedToken.logoURI}
                        />
                      ) : (
                        <Identicon
                          address={selectedToken.address}
                          style={{ width: "24", display: "inline-flex" }}
                        />
                      )}
                    </div>
                    <div className="token-symbol">{selectedToken.symbol}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="transaction-field-row">
            <span className="field-label-left">{
              parseFloat(topupAmount) > tokenBalance
                ? (<span className="fg-red">{t('transactions.validation.amount-high')}</span>)
                : (<span>&nbsp;</span>)
            }</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
        </div>
      </div>

      {/* Info */}
      {selectedToken && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.transaction-fee') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress(getFeeAmount(topupAmount), selectedToken?.address)}`
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.beneficiary-receives') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress(parseFloat(topupAmount) - getFeeAmount(topupAmount), selectedToken?.address)}`
          )}
        </div>
      )}

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
