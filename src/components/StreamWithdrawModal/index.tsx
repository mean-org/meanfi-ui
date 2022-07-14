import React, { useCallback, useContext } from 'react';
import { useEffect, useState } from "react";
import { Modal, Button, Row, Col } from "antd";
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { isValidNumber, shortenAddress, toUiAmount } from "../../utils/utils";
import { consoleOut, percentage } from "../../utils/ui";
import { StreamInfo, STREAM_STATE, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { useTranslation } from "react-i18next";
import { TokenInfo } from '@solana/spl-token-registry';
import { PublicKey } from '@solana/web3.js';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { MSP, Stream, STREAM_STATUS } from '@mean-dao/msp';
import { AppStateContext } from '../../contexts/appstate';
import { BN } from 'bn.js';
import { openNotification } from '../Notifications';
import { CUSTOM_TOKEN_NAME, WRAPPED_SOL_MINT_ADDRESS } from '../../constants';
import { StreamWithdrawData } from '../../models/streams';

export const StreamWithdrawModal = (props: {
  startUpData: Stream | StreamInfo | undefined;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  selectedToken: TokenInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();
  const { wallet, publicKey } = useWallet();
  const {
    streamProgramAddress,
    streamV2ProgramAddress,
  } = useContext(AppStateContext);
  const [withdrawAmountInput, setWithdrawAmountInput] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<number>(0);
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [feePayedByTreasurer, setFeePayedByTreasurer] = useState(false);

  useEffect(() => {

    if (!wallet || !publicKey) { return; }

    const getStreamDetails = async (streamId: string, client: MSP | MoneyStreaming) => {
      const streamPublicKey = new PublicKey(streamId as string);
      try {
        const detail = await client.getStream(streamPublicKey);
        if (detail) {
          consoleOut('detail', detail);
          const v1 = detail as StreamInfo;
          const v2 = detail as Stream;
          let max = 0;
          if (v1.version < 2) {
            max = v1.escrowVestedAmount;
          } else {
            max = toUiAmount(new BN(v2.withdrawableAmount), props.selectedToken?.decimals || 6);
            setFeePayedByTreasurer(v2.feePayedByTreasurer);
          }
          setMaxAmount(max);
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error(error);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
          type: "error"
        });
      } finally {
        setLoadingData(false);
      }
    }

    if (props.startUpData) {
      const v1 = props.startUpData as StreamInfo;
      const v2 = props.startUpData as Stream;
      let max = 0;
      if (v1.version < 2) {
        max = v1.escrowVestedAmount;
        if (v1.state === STREAM_STATE.Running) {
          setMaxAmount(max);
          setLoadingData(true);
          try {
            const ms = new MoneyStreaming(endpoint, streamProgramAddress, "confirmed");
            getStreamDetails(v1.id as string, ms);
          } catch (error) {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.invalid-streamid-message') + '!',
              type: "error"
            });
          }
        } else {
          setMaxAmount(max);
        }
      } else {
        max = toUiAmount(new BN(v2.withdrawableAmount), props.selectedToken?.decimals || 6);
        if (v2.status === STREAM_STATUS.Running) {
          setMaxAmount(max);
          setLoadingData(true);
          try {
            const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");
            getStreamDetails(v2.id as string, msp);
          } catch (error) {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.invalid-streamid-message') + '!',
              type: "error"
            });
          }
        } else {
          setMaxAmount(max);
          setFeePayedByTreasurer(v2.feePayedByTreasurer);
        }
      }
    }

  }, [
    t,
    publicKey,
    wallet,
    endpoint,
    props.startUpData,
    streamProgramAddress,
    streamV2ProgramAddress,
    props.selectedToken?.decimals
  ]);

  const getFeeAmount = useCallback((fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
      if (fees.mspPercentFee) {
        fee = inputAmount ? percentage(fees.mspPercentFee, inputAmount) : 0;
      } else if (fees.mspFlatFee) {
        fee = fees.mspFlatFee;
      }
    }
    return feePayedByTreasurer ? 0 : fee;
  }, [feePayedByTreasurer]);

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [
    feeAmount,
    props.transactionFees,
    getFeeAmount
  ]);

  const onAcceptWithdrawal = () => {
    const isMaxAmount = getDisplayAmount(maxAmount) === getDisplayAmount(+withdrawAmountInput)
      ? true : false;
    setWithdrawAmountInput('');
    const withdrawData: StreamWithdrawData = {
      token: props.selectedToken ? props.selectedToken.symbol || '-' : '-',
      amount: isMaxAmount ? `${maxAmount}` : withdrawAmountInput,
      inputAmount: parseFloat(withdrawAmountInput),
      fee: feeAmount || 0,
      receiveAmount: parseFloat(withdrawAmountInput) - (feeAmount as number)
    };
    props.handleOk(withdrawData);
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
    let newValue = e.target.value;

    const decimals = props.selectedToken ? props.selectedToken.decimals : 0;
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

  // Validation

  const isValidInput = (): boolean => {
    return props.startUpData &&
      withdrawAmountInput &&
      parseFloat(withdrawAmountInput) <= parseFloat(getDisplayAmount(maxAmount)) &&
      parseFloat(withdrawAmountInput) > (feeAmount as number)
      ? true
      : false;
  }

  const getDisplayAmount = (amount: number, addSymbol = false): string => {
    if (props && props.startUpData && props.selectedToken) {
      const token = props.selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
        ? Object.assign({}, props.selectedToken, {
            symbol: 'SOL'
          }) as TokenInfo
        : props.selectedToken;
      const bareAmount = amount.toFixed(token.decimals);
      if (addSymbol) {
        return token.name === CUSTOM_TOKEN_NAME ? `${bareAmount} [${props.selectedToken.symbol}]` : `${bareAmount} ${token ? token.symbol : props.selectedToken.symbol}`;
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
