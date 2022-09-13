import React, { useContext } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col } from 'antd';
import { WarningFilled, WarningOutlined } from "@ant-design/icons";
import { useWallet } from '../../contexts/wallet';
import { percentage, percentageBn } from '../../middleware/ui';
import { getAmountWithSymbol, toUiAmount } from '../../middleware/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { Stream } from '@mean-dao/msp';
import { InputMean } from '../InputMean';
import { useSearchParams } from 'react-router-dom';
import { AppStateContext } from '../../contexts/appstate';

export const StreamPauseModal = (props: {
  handleClose: any;
  handleOk: any;
  tokenBalance: number;
  content: JSX.Element;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  transactionFees: TransactionFees;
}) => {
  const {
    theme,
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { publicKey } = useWallet();
  const [searchParams] = useSearchParams();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [proposalTitle, setProposalTitle] = useState('');

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const param = getQueryAccountType();

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
      const token = getTokenByMintAddress(props.streamDetail.associatedToken as string);
      const isTreasurer = amITreasurer();
      const isBeneficiary = amIBeneficiary();
      if (isBeneficiary) {
        if (v1.version < 2) {
          fee = percentage(fees.mspPercentFee, v1.escrowVestedAmount) || 0;
        } else {
          const wa = toUiAmount(v2.withdrawableAmount, token?.decimals || 6);
          fee = percentageBn(fees.mspPercentFee, wa, true) as number || 0;
        }
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    props.streamDetail,
    getTokenByMintAddress,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback(() => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;

      const token = getTokenByMintAddress(props.streamDetail.associatedToken as string);

      if (v1.version < 2) {
        return v1.escrowVestedAmount;
      } else {
        return toUiAmount(v2.withdrawableAmount, token?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
    getTokenByMintAddress
  ]);

  const getUnvested = useCallback(() => {
    if (props.streamDetail && publicKey) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;

      const token = getTokenByMintAddress(props.streamDetail.associatedToken as string);

      if (v1.version < 2) {
        return v1.escrowUnvestedAmount;
      } else {
        return toUiAmount(v2.fundsLeftInStream, token?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    props.streamDetail,
    getTokenByMintAddress
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

  const isValidForm = (): boolean => {
    return proposalTitle
      ? true
      : false;
  }

  const getTransactionStartButtonLabel = () => {
    return !proposalTitle
      ? 'Add a proposal title'
      : "Sign proposal"
  }

  const onAcceptModal = () => {
    props.handleOk(proposalTitle);
    setTimeout(() => {
      setProposalTitle('');
    }, 50);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
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
      title={<div className="modal-title">{param === "multisig" ? "Propose pause stream" : t('streams.pause-stream-modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onCancel={onCloseModal}
      width={400}>

      <div className="transaction-progress p-0">
        {/* <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" /> */}
        <div className="text-center">
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
          )}
        </div>
        <div className="mb-2 fg-warning">
          <span>{props.content}</span>
        </div>
        {/* <h4>{props.content}</h4> */}

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

        {/* Proposal title */}
        {param === "multisig" && (
          <div className="mb-3">
            <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
            <InputMean
              id="proposal-title-field"
              name="Title"
              className="w-100 general-text-input"
              onChange={onTitleInputValueChange}
              placeholder="Add a proposal title (required)"
              value={proposalTitle}
            />
          </div>
        )}

        <div className="mt-3">
          {/* <Button
              className="mr-3"
              type="text"
              shape="round"
              size="large"
              onClick={onCloseModal}>
              {t('close-stream.secondary-cta')}
          </Button> */}
          <Button
            block
            type="primary"
            shape="round"
            size="large"
            disabled={param === "multisig" && !isValidForm()}
            onClick={() => onAcceptModal()}>
            {param === "multisig" ? getTransactionStartButtonLabel() : t('streams.pause-stream-cta')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
