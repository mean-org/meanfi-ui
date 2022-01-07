import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col, Radio } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useWallet } from '../../contexts/wallet';
import { percentage } from '../../utils/ui';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Stream } from '@mean-dao/msp';

export const StreamCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  content: JSX.Element;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
  canCloseTreasury?: boolean;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [closeTreasuryOption, setCloseTreasuryOption] = useState(true);

  const amITreasurer = useCallback((): boolean => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === publicKey.toBase58()) || (v2.version >= 2 && v2.treasurer === publicKey.toBase58())) {
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
        return v2.beneficiary === publicKey.toBase58() ? true : false;
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
          fee = percentage(fees.mspPercentFee, v2.withdrawableAmount) || 0;
        }
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    props.streamDetail,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback((): number => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (v1.version < 2) {
        return v1.escrowVestedAmount;
      } else {
        return v2.withdrawableAmount;
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
  ]);

  const getUnvested = useCallback((): number => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (v1.version < 2) {
        return v1.escrowUnvestedAmount;
      } else {
        return v2.fundsLeftInStream;
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
  ]);

  useEffect(() => {
    if (!feeAmount && props.transactionFees) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [
    feeAmount,
    props.transactionFees,
    getFeeAmount
  ]);

  const onAllocationReservedChanged = (e: any) => {
    setCloseTreasuryOption(e.target.value);
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
              getTokenAmountAndSymbolByTokenAddress(getWithdrawableAmount(), props.streamDetail.associatedToken as string)
            )}
            {amITreasurer() && infoRow(
              t('close-stream.return-unvested-amount') + ':',
              getTokenAmountAndSymbolByTokenAddress(getUnvested(), props.streamDetail.associatedToken as string)
            )}
            {amIBeneficiary() && getWithdrawableAmount() > 0 && infoRow(
              t('transactions.transaction-info.transaction-fee') + ':',
              `${feeAmount
                ? '~' + getTokenAmountAndSymbolByTokenAddress((feeAmount as number), props.streamDetail.associatedToken as string)
                : '0'
              }`
            )}
          </div>
        )}

        {props.canCloseTreasury && (
          <div className="mb-4 flex-fixed-right">
            <div className="form-label left">
              {t('treasuries.treasury-streams.close-stream-also-closes-treasury-label')}
            </div>
            <div className="right">
              <Radio.Group onChange={onAllocationReservedChanged} value={closeTreasuryOption}>
                <Radio value={true}>{t('general.yes')}</Radio>
                <Radio value={false}>{t('general.no')}</Radio>
              </Radio.Group>
            </div>
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
              onClick={() => props.handleOk(closeTreasuryOption)}>
              {t('close-stream.primary-cta')}
          </Button>
        </div>
      </div>

    </Modal>
  );
};
