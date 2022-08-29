import React from 'react';
import { useEffect, useState } from "react";
import { Modal, Button, Row, Col } from "antd";
import {
  getTokenAmountAndSymbolByTokenAddress,
  getTokenDecimals,
  getTokenSymbol,
  isValidNumber
} from "../../middleware/utils";
import { DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { percentage } from "../../middleware/ui";
import { useTranslation } from "react-i18next";

export const DdcaWithdrawModal = (props: {
  ddcaDetails: DdcaDetails | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  useEffect(() => {
    if (props.ddcaDetails) {
      setMaxAmount(props.ddcaDetails.toBalance);
    }
  }, [props]);

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [feeAmount, props.transactionFees]);

  const onAcceptWithdrawal = () => {
    const isMaxAmount = getDisplayAmount(maxAmount) === getDisplayAmount(+withdrawAmountInput)
      ? true : false;
    setWithdrawAmountInput('');
    props.handleOk(isMaxAmount ? maxAmount : withdrawAmountInput);
  };

  const onCloseModal = () => {
    setWithdrawAmountInput('');
    props.handleClose();
  }

  const setValue = (value: string) => {
    setWithdrawAmountInput(value);
  };

  const setPercentualValue = (value: number) => {
    let newValue = '';
    let fee = 0;
    if (props.ddcaDetails) {
      if (value === 100) {
        fee = getFeeAmount(props.transactionFees, maxAmount)
        newValue = getDisplayAmount(maxAmount);
      } else {
        const partialAmount = percentage(value, maxAmount);
        fee = getFeeAmount(props.transactionFees, partialAmount)
        newValue = getDisplayAmount(partialAmount);
      }
    }
    setValue(newValue);
    setFeeAmount(fee);
  }

  const handleWithdrawAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = props.ddcaDetails
      ? getTokenDecimals(props.ddcaDetails.toMint as string)
      : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setValue("");
    } else if (newValue === '.') {
      setValue(".");
    } else if (isValidNumber(newValue)) {
      setValue(newValue);
      setFeeAmount(getFeeAmount(props.transactionFees, newValue));
    }
  };

  const getFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
      if (fees.percentFee) {
        fee = inputAmount ? percentage(fees.percentFee, inputAmount) : 0;
      } else if (fees.flatFee) {
        fee = fees.flatFee;
      }
    }
    return fee;
  }

  // Validation

  const isValidInput = (): boolean => {
    return props.ddcaDetails &&
      withdrawAmountInput &&
      parseFloat(withdrawAmountInput) <= parseFloat(getDisplayAmount(maxAmount)) &&
      parseFloat(withdrawAmountInput) > (feeAmount as number)
      ? true
      : false;
  }

  const getDisplayAmount = (amount: number, addSymbol = false): string => {
    if (props && props.ddcaDetails) {
      const bareAmount = amount.toFixed(getTokenDecimals(props.ddcaDetails.toMint as string));
      if (addSymbol) {
        return bareAmount + ' ' + getTokenSymbol(props.ddcaDetails.toMint as string);
      }
      return bareAmount;
    }

    return '';
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
      title={<div className="modal-title">{t('withdraw-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptWithdrawal}
      onCancel={onCloseModal}
      width={480}>
      <div className="mb-3">
        <div className="transaction-field disabled">
          <div className="transaction-field-row">
            <span className="field-label-left">{t('withdraw-funds.label-available-amount')}</span>
            <span className="field-label-right">&nbsp;</span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="field-select-left">
              {props.ddcaDetails && getDisplayAmount(maxAmount, true)}
            </span>
          </div>
        </div>

        <div className="transaction-field mb-1">
          <div className="transaction-field-row">
            <span className="field-label-left">{t('withdraw-funds.label-input-amount')}</span>
            <span className="field-label-right">{t('withdraw-funds.label-input-right')}</span>
          </div>
          <div className="transaction-field-row main-row">
            <span className="input-left">
              <input
                className="general-text-input"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleWithdrawAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={withdrawAmountInput}
              />
            </span>
            <div className="addon-right">
              <div className="token-group">
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(25)}>
                  25%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(50)}>
                  50%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(75)}>
                  75%
                </div>
                <div
                  className="token-max simplelink"
                  onClick={() => setPercentualValue(100)}>
                  100%
                </div>
              </div>
            </div>
          </div>
          <div className="transaction-field-row">
            <span className="field-label-left">
              {props.ddcaDetails && parseFloat(withdrawAmountInput) > parseFloat(getDisplayAmount(maxAmount)) ? (
                <span className="fg-red">
                  {t('transactions.validation.amount-withdraw-high')}
                </span>
              ) : (
                <span>&nbsp;</span>
              )}
            </span>
            <span className="field-label-right">&nbsp;</span>
          </div>
        </div>
      </div>

      {/* Info */}
      {props.ddcaDetails && props.ddcaDetails.toMint && (
        <div className="p-2 mb-2">
          {isValidInput() && infoRow(
            t('transactions.transaction-info.transaction-fee') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress((feeAmount as number), props.ddcaDetails.toMint as string)}`
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.you-receive') + ':',
            `~${getTokenAmountAndSymbolByTokenAddress(parseFloat(withdrawAmountInput) - (feeAmount as number), props.ddcaDetails.toMint as string)}`
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
        onClick={onAcceptWithdrawal}>
        {isValidInput() ? t('transactions.validation.valid-start-withdrawal') : t('transactions.validation.invalid-amount')}
      </Button>
    </Modal>
  );
};
