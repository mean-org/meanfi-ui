import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { TokenInfo } from '@solana/spl-token-registry';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Stream } from '@mean-dao/msp';
import { useWallet } from '../../../../contexts/wallet';
import { percentage, percentageBn } from '../../../../utils/ui';
import { getAmountWithSymbol, toUiAmount2 } from '../../../../utils/utils';

export const StreamPauseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  selectedToken: TokenInfo | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  const amITreasurer = useCallback((): boolean => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === publicKey.toBase58()) || (v2.version >= 2 && v2.treasurer.equals(publicKey))) {
        return true;
      }
    }
    return false;
  }, [
    publicKey,
    props.streamDetail,
  ]);

  const amIBeneficiary = useCallback((): boolean => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary.equals(publicKey) ? true : false;
      }
    }
    return false;
  }, [
    publicKey,
    props.streamDetail
  ]);

  const getFeeAmount = useCallback((fees: TransactionFees): number => {
    let fee = 0;

    // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
    // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
    // must be used by adding the percentFee of the vested amount to the flat fee
    if (fees && props.streamDetail) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      const isTreasurer = amITreasurer();
      const isBeneficiary = amIBeneficiary();
      if (isBeneficiary) {
        if (v1.version < 2) {
          fee = percentage(fees.mspPercentFee, v1.escrowVestedAmount) || 0;
        } else {
          const wa = toUiAmount2(v2.withdrawableAmount, props.selectedToken?.decimals || 6);
          fee = percentageBn(fees.mspPercentFee, wa, true) as number || 0;
        }
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    props.streamDetail,
    props.selectedToken?.decimals,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback(() => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (v1.version < 2) {
        return v1.escrowVestedAmount;
      } else {
        return toUiAmount2(v2.withdrawableAmount, props.selectedToken?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
    props.selectedToken?.decimals
  ]);

  const getUnvested = useCallback(() => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (v1.version < 2) {
        return v1.escrowUnvestedAmount;
      } else {
        return toUiAmount2(v2.fundsLeftInStream, props.selectedToken?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
    props.selectedToken?.decimals
  ]);

  // Setup fees
  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [
    feeAmount,
    props.transactionFees,
    getFeeAmount
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
      title={<div className="modal-title">{t('streams.pause-stream-modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={400}>

      <div className="transaction-progress">
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        <h4>{props.content}</h4>

        {/* Info */}
        {props.streamDetail && props.streamDetail.associatedToken && (
          <div className="p-2 mb-2">
            {infoRow(
              t('close-stream.return-vested-amount') + ':',
              getAmountWithSymbol(getWithdrawableAmount(), props.streamDetail.associatedToken as string)
            )}
            {amITreasurer() && infoRow(
              t('close-stream.return-unvested-amount') + ':',
              getAmountWithSymbol(getUnvested(), props.streamDetail.associatedToken as string)
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
              onClick={props.handleOk}>
              {t('streams.pause-stream-cta')}
          </Button>
        </div>
      </div>

    </Modal>
  );
};
