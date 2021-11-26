import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useWallet } from '../../contexts/wallet';
import { consoleOut, isLocal, percentage } from '../../utils/ui';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees } from '@mean-dao/money-streaming/lib/types';

export const StreamCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  streamDetail: StreamInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  const getFeeAmount = useCallback((fees: TransactionFees): number => {
    let fee = 0;
    const isAddressMyAccount = (addr: string): boolean => {
      return publicKey && addr && addr === publicKey.toBase58() ? true : false;
    }
    // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
    // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
    // must be used by adding the percentFee of the vested amount to the flat fee
    if (fees && props.streamDetail) {
      const amItreasurer = isAddressMyAccount(props.streamDetail.treasurerAddress as string);
      const amIbeneficiary = isAddressMyAccount(props.streamDetail.beneficiaryAddress as string);
      if (amIbeneficiary) {
        fee = percentage(fees.mspPercentFee, props.streamDetail.escrowVestedAmount) || 0;
      } else if (amItreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    publicKey,
    props.streamDetail
  ]);

  const isUserTreasurer = (): boolean => {
    if (publicKey && props.streamDetail) {
      const me = publicKey.toBase58();
      const treasurer = props.streamDetail.treasurerAddress as string;
      return treasurer === me ? true : false;
    }
    return false;
  }

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [
    feeAmount,
    props.transactionFees,
    getFeeAmount
  ]);

  useEffect(() => {
    if (props.tokenBalance) {
      consoleOut('tokenBalance:', props.tokenBalance, 'orange');
    }
  }, [
    props.tokenBalance
  ]);

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
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('close-stream.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={400}>
      <div className="transaction-progress">
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        <h4 className="operation">{props.content}</h4>

        {/* Info */}
        {props.streamDetail && props.streamDetail.associatedToken && (
          <div className="p-2 mb-2">
            {infoRow(
              t('close-stream.return-vested-amount') + ':',
              getTokenAmountAndSymbolByTokenAddress(props.streamDetail.escrowVestedAmount, props.streamDetail.associatedToken as string)
            )}
            {isUserTreasurer() && infoRow(
              t('close-stream.return-unvested-amount') + ':',
              getTokenAmountAndSymbolByTokenAddress(props.streamDetail.escrowUnvestedAmount, props.streamDetail.associatedToken as string)
            )}
            {infoRow(
              t('transactions.transaction-info.transaction-fee') + ':',
              `${feeAmount
                ? '~' + getTokenAmountAndSymbolByTokenAddress((feeAmount as number), props.streamDetail.associatedToken as string)
                : '0'
              }`
            )}
            {isLocal() && (
              <p className="localdev-label">Token balance: {getTokenAmountAndSymbolByTokenAddress(props.tokenBalance, props.streamDetail.associatedToken as string)}</p>
            )}
          </div>
        )}

        <div className="mt-3">
          <Button
              className="mr-3"
              type="text"
              shape="round"
              size="large"
              onClick={props.handleClose}>
              {t('close-stream.secondary-cta')}
          </Button>
          <Button
              type="primary"
              shape="round"
              size="large"
              disabled={props.tokenBalance < (feeAmount || 0)}
              onClick={props.handleOk}>
              {props.tokenBalance >= (feeAmount || 0) ? t('close-stream.primary-cta') : t('transactions.validation.amount-low')}
          </Button>
        </div>
      </div>

    </Modal>
  );
};
