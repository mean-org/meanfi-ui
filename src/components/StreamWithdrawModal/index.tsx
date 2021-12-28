import React from 'react';
import { useEffect, useState } from "react";
import { Modal, Button, Row, Col } from "antd";
import { isValidNumber, shortenAddress, truncateFloat } from "../../utils/utils";
import { consoleOut, percentage } from "../../utils/ui";
import { StreamInfo, STREAM_STATE, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { useTranslation } from "react-i18next";
import { TokenInfo } from '@solana/spl-token-registry';
import { PublicKey } from '@solana/web3.js';
import { getStream } from '@mean-dao/money-streaming';
import { useConnection } from '../../contexts/connection';
import { notify } from '../../utils/notifications';

export const StreamWithdrawModal = (props: {
  startUpData: StreamInfo | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  selectedToken: TokenInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // TODO: Temp method to get withdraw amount up to the vested cliff amount
  const getMaxWithdrawAmount = (item: StreamInfo) => {
    let maxWithdrawableAmount = item.cliffVestAmount;
    if (item.cliffVestPercent > 0 && item.cliffVestPercent < 100) {
      maxWithdrawableAmount = (item.cliffVestPercent * item.allocationAssigned / 100);
    }
    return maxWithdrawableAmount;
  }

  useEffect(() => {
    const getStreamDetails = async (streamId: string) => {
      let streamPublicKey: PublicKey;
      streamPublicKey = new PublicKey(streamId as string);
      try {
        const detail = await getStream(connection, streamPublicKey);
        if (detail) {
          consoleOut('detail', detail);
          const max = getMaxWithdrawAmount(detail);
          setMaxAmount(max);
          // setMaxAmount(detail.escrowVestedAmount);
        } else {
          notify({
            message: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error(error);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
          type: "error"
        });
      } finally {
        setLoadingData(false);
      }
    }

    if (props.startUpData) {
      const max = getMaxWithdrawAmount(props.startUpData);
      if (props.startUpData.state === STREAM_STATE.Running) {
        setMaxAmount(max);
        // setMaxAmount(props.startUpData.escrowVestedAmount);
        setLoadingData(true);
        try {
          getStreamDetails(props.startUpData.id as string);
        } catch (error) {
          notify({
            message: t('notifications.error-title'),
            description: t('notifications.invalid-streamid-message') + '!',
            type: "error"
          });
        }
      } else {
        setMaxAmount(max);
        // setMaxAmount(props.startUpData.escrowVestedAmount);
      }
    }
  }, [
    t,
    connection,
    props.startUpData,
  ]);

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [feeAmount, props.transactionFees]);

  const onAcceptWithdrawal = () => {
    const isMaxAmount = getDisplayAmount(maxAmount) === getDisplayAmount(withdrawAmountInput)
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
    if (props.startUpData) {
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
    const newValue = e.target.value;
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
      if (fees.mspPercentFee) {
        fee = inputAmount ? percentage(fees.mspPercentFee, inputAmount) : 0;
      } else if (fees.mspFlatFee) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }

  // Validation

  const isValidInput = (): boolean => {
    return props.startUpData &&
      withdrawAmountInput &&
      parseFloat(withdrawAmountInput) <= parseFloat(getDisplayAmount(maxAmount)) &&
      parseFloat(withdrawAmountInput) > (feeAmount as number)
      ? true
      : false;
  }

  const getDisplayAmount = (amount: any, addSymbol = false): string => {
    if (props && props.startUpData && props.selectedToken) {
      const token = props.selectedToken;
      const bareAmount = truncateFloat(amount, token.decimals);
      if (addSymbol) {
        return token.name === 'Unknown' ? `${bareAmount} [${props.selectedToken.symbol}]` : `${bareAmount} ${props.selectedToken.symbol}`;
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
      <div className="well disabled">
        <div className="flex-fixed-right">
          <div className="left inner-label">{t('withdraw-funds.label-available-amount')}:</div>
          <div className="right">&nbsp;</div>
        </div>
        <div className="flex-fixed-right">
          <div className="left static-data-field">{props.startUpData && getDisplayAmount(maxAmount, true)}</div>
          <div className="right">&nbsp;</div>
        </div>
      </div>

      <div className={`well ${loadingData ? 'disabled' : ''}`}>
        <div className="flex-fixed-right">
          <div className="left inner-label">{t('withdraw-funds.label-input-amount')}</div>
          <div className="right">
            <div className="addon">
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
        </div>
        <div className="flex-fixed-right">
          <div className="left">
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
          </div>
          <div className="right">&nbsp;</div>
        </div>
        {parseFloat(withdrawAmountInput) > parseFloat(getDisplayAmount(maxAmount)) ? (
          <span className="form-field-error">
            {t('transactions.validation.amount-withdraw-high')}
          </span>
        ) : (null)}
      </div>

      {/* Info */}
      {props.selectedToken && (
        <div className="p-2 mb-2">
          {isValidInput() && infoRow(
            t('transactions.transaction-info.transaction-fee') + ':',
            `~${getDisplayAmount((feeAmount as number), true)}`
          )}
          {isValidInput() && infoRow(
            t('transactions.transaction-info.you-receive') + ':',
            `~${getDisplayAmount(parseFloat(withdrawAmountInput) - (feeAmount as number), true)}`
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
