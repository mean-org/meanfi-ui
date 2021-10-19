import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { useWallet } from '../../contexts/wallet';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { DdcaDetails, TransactionFees } from '@mean-dao/ddca';
import { environment } from '../../environments/environment';

export const DdcaCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  content: JSX.Element;
  isVisible: boolean;
  ddcaDetails: DdcaDetails | undefined;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
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
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        <h4 className="operation">{props.content}</h4>

        {/* Info */}

        {/* {props.ddcaDetails && props.ddcaDetails.associatedToken && (
          <div className="p-2 mb-2">
            {infoRow(
              t('transactions.transaction-info.transaction-fee') + ':',
              `${feeAmount
                ? '~' + getTokenAmountAndSymbolByTokenAddress((feeAmount as number), streamDetail.associatedToken as string)
                : '0'
              }`
            )}
            {environment === 'local' && (
              <p className="localdev-label">Token balance: {getTokenAmountAndSymbolByTokenAddress(tokenBalance, streamDetail.associatedToken as string)}</p>
            )}
          </div>
        )} */}

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
