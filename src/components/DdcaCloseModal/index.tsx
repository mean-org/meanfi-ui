import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { getTokenAmountAndSymbolByTokenAddress } from '../../middleware/utils';
import { useTranslation } from 'react-i18next';
import { DdcaDetails, TransactionFees } from '@mean-dao/ddca';

export const DdcaCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  content: JSX.Element;
  isVisible: boolean;
  ddcaDetails: DdcaDetails | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  const getFeeAmount = useCallback((fees: TransactionFees): number => {
    let fee = 0;
    if (fees && props.ddcaDetails) {
      fee = fees.flatFee;
    }
    return fee;
  }, [
    props.ddcaDetails
  ]);

  useEffect(() => {
    if (!feeAmount && props.transactionFees && props.ddcaDetails) {
      setFeeAmount(getFeeAmount(props.transactionFees));
    }
  }, [
    feeAmount,
    props.ddcaDetails,
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
      title={<div className="modal-title">{t('ddcas.close-ddca.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={400}>
      <div className="transaction-progress">
        <h4 className="operation">{props.content}</h4>

        {/* Info */}
        {props.ddcaDetails && props.ddcaDetails.fromBalance && (
          <div className="p-2 mb-2">
            {infoRow(
              'Amount left:',
              getTokenAmountAndSymbolByTokenAddress(props.ddcaDetails.fromBalance, props.ddcaDetails.fromMint)
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
              {t('ddcas.close-ddca.secondary-cta')}
          </Button>
          <Button
              type="primary"
              shape="round"
              size="large"
              // disabled={tokenBalance < (feeAmount || 0)}
              onClick={props.handleOk}>
              {t('ddcas.close-ddca.primary-cta')}
          </Button>
        </div>
      </div>

    </Modal>
  );
};
