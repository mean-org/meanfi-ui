import React, { useContext } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { TokenInfo } from 'models/SolanaTokenInfo';
import { useTranslation } from 'react-i18next';
import { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Stream } from '@mean-dao/msp';
import { useWallet } from '../../../../contexts/wallet';
import { percentageBn } from '../../../../middleware/ui';
import { getAmountWithSymbol, toUiAmount } from '../../../../middleware/utils';
import { AppStateContext } from '../../../../contexts/appstate';

export const StreamPauseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  selectedToken: TokenInfo | undefined;
  streamDetail: Stream | undefined;
  transactionFees: TransactionFees;
}) => {
  const {
    handleClose,
    handleOk,
    tokenBalance,
    content,
    isVisible,
    selectedToken,
    streamDetail,
    transactionFees,
  } = props;
  const { splTokenList } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);

  const amITreasurer = useCallback((): boolean => {
    if (streamDetail && publicKey) {
      return streamDetail.treasurer.equals(publicKey) ? true : false;
    }
    return false;
  }, [
    publicKey,
    streamDetail,
  ]);

  const amIBeneficiary = useCallback((): boolean => {
    if (streamDetail && publicKey) {
      return streamDetail.beneficiary.equals(publicKey) ? true : false;
    }
    return false;
  }, [
    publicKey,
    streamDetail
  ]);

  const getFeeAmount = useCallback((fees: TransactionFees): number => {
    let fee = 0;

    // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
    // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
    // must be used by adding the percentFee of the vested amount to the flat fee
    if (fees && streamDetail) {
      const isTreasurer = amITreasurer();
      const isBeneficiary = amIBeneficiary();
      if (isBeneficiary) {
        const wa = toUiAmount(streamDetail.withdrawableAmount, selectedToken?.decimals || 9);
        fee = percentageBn(fees.mspPercentFee, wa, true) as number || 0;
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    streamDetail,
    selectedToken?.decimals,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback(() => {
    if (streamDetail) {
      return toUiAmount(streamDetail.withdrawableAmount, selectedToken?.decimals || 9);
    }
    return '0';
  }, [
    streamDetail,
    selectedToken?.decimals
  ]);

  const getUnvested = useCallback(() => {
    if (streamDetail) {
      return toUiAmount(streamDetail.fundsLeftInStream, selectedToken?.decimals || 9);
    }
    return '0';
  }, [
    streamDetail,
    selectedToken?.decimals
  ]);

  // Setup fees
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [
    feeAmount,
    transactionFees,
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
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}>

      <div className="transaction-progress">
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
        <h4>{content}</h4>

        {/* Info */}
        {streamDetail && selectedToken && (
          <div className="p-2 mb-2">
            {infoRow(
              t('close-stream.return-vested-amount') + ':',
              getAmountWithSymbol(
                getWithdrawableAmount(),
                selectedToken.address,
                false,
                splTokenList,
                selectedToken.decimals
              )
            )}
            {amITreasurer() && infoRow(
              t('close-stream.return-unvested-amount') + ':',
              getAmountWithSymbol(
                getUnvested(),
                selectedToken.address,
                false,
                splTokenList,
                selectedToken.decimals
              )
            )}
          </div>
        )}

        <div className="mt-3">
          <Button
              className="mr-3"
              type="text"
              shape="round"
              size="large"
              onClick={handleClose}>
              {t('close-stream.secondary-cta')}
          </Button>
          <Button
              type="primary"
              shape="round"
              size="large"
              onClick={handleOk}>
              {t('streams.pause-stream-cta')}
          </Button>
        </div>
      </div>

    </Modal>
  );
};
