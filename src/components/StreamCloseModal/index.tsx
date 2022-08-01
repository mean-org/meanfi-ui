import React, { useContext } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col, Radio } from 'antd';
import { ExclamationCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from "@ant-design/icons";
import { useWallet } from '../../contexts/wallet';
import { consoleOut, percentage } from '../../utils/ui';
import { getAmountWithSymbol, toUiAmount } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { MSP, Stream, STREAM_STATUS, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import { useConnection } from '../../contexts/connection';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { useSearchParams } from 'react-router-dom';
import { StreamTreasuryType } from '../../models/treasuries';
import { AppStateContext } from '../../contexts/appstate';
import { InputMean } from '../InputMean';
import { TransactionStatus } from '../../models/enums';

export const StreamCloseModal = (props: {
  handleClose: any;
  handleOk: any;
  content: JSX.Element;
  isVisible: boolean;
  streamDetail: Stream | StreamInfo | undefined;
  mspClient: MoneyStreaming | MSP | undefined;
  transactionFees: TransactionFees;
  canCloseTreasury?: boolean;
}) => {
  const {
    theme,
    setTransactionStatus,
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [closeTreasuryOption, setCloseTreasuryOption] = useState(false);
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [streamState, setStreamState] = useState<STREAM_STATE | STREAM_STATUS | undefined>(undefined);
  const [proposalTitle, setProposalTitle] = useState("");

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !props.mspClient) { return undefined; }

    const mspInstance = streamVersion < 2 ? props.mspClient as MoneyStreaming : props.mspClient as MSP;
    const treasuryPk = new PublicKey(treasuryId);

    try {
      const details = await mspInstance.getTreasury(treasuryPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
        const v1 = details as TreasuryInfo;
        const v2 = details as Treasury;
        const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
        const type = isNewTreasury ? v2.treasuryType : v1.type;
        if (type === TreasuryType.Lock) {
          return "locked";
        } else {
          return "open";
        }
      } else {
        setTreasuryDetails(undefined);
        return "unknown";
      }
    } catch (error) {
      console.error(error);
      return "unknown";
    } finally {
      setLoadingTreasuryDetails(false);
    }

  }, [
    publicKey,
    connection,
    props.mspClient,
  ]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (props.isVisible && !localStreamDetail && props.streamDetail) {
      const v1 = props.streamDetail as StreamInfo;
      const v2 = props.streamDetail as Stream;
      if (props.streamDetail.version < 2) {
        setStreamState(v1.state as STREAM_STATE);
      } else {
        setStreamState(v2.status as STREAM_STATUS);
      }
      setLocalStreamDetail(props.streamDetail);
    }
  }, [
    props.isVisible,
    localStreamDetail,
    props.streamDetail,
  ]);

  // Set treasury type
  useEffect(() => {
    if (props.isVisible && localStreamDetail) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(
        localStreamDetail.version < 2 ? v1.treasuryAddress as string : v2.treasury as string,
        localStreamDetail.version
      ).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value)});
    }
  }, [
    props.isVisible,
    localStreamDetail,
    getTreasuryTypeByTreasuryId
  ]);

  // Set closeTreasuryOption accordingly
  useEffect(() => {
    if (!props.canCloseTreasury && treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      if (isNewTreasury) {
        if (v2.totalStreams > 1) {
          setCloseTreasuryOption(false);
        } else if (v2.totalStreams === 1 && v2.autoClose) {
          setCloseTreasuryOption(true);
        } else {
          setCloseTreasuryOption(false);
        }
      } else {
        if (v1.streamsAmount > 1) {
          setCloseTreasuryOption(false);
        } else if (v1.streamsAmount === 1 && v1.autoClose) {
          setCloseTreasuryOption(true);
        } else {
          setCloseTreasuryOption(false);
        }
      }
    }
  }, [
    treasuryDetails,
    props.canCloseTreasury
  ]);

  const amITreasurer = useCallback((): boolean => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === publicKey.toBase58()) || (v2.version >= 2 && v2.treasurer === publicKey.toBase58())) {
        return true;
      }
    }
    return false;
  }, [
    publicKey,
    localStreamDetail,
  ]);

  const amIBeneficiary = useCallback((): boolean => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary === publicKey.toBase58() ? true : false;
      }
    }
    return false;
  }, [
    publicKey,
    localStreamDetail
  ]);

  const getFeeAmount = useCallback((fees: TransactionFees): number => {
    let fee = 0;

    // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
    // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
    // must be used by adding the percentFee of the vested amount to the flat fee
    if (fees && localStreamDetail) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      const token = getTokenByMintAddress(localStreamDetail.associatedToken as string);
      const isTreasurer = amITreasurer();
      const isBeneficiary = amIBeneficiary();
      if (isBeneficiary) {
        if (v1.version < 2) {
          fee = percentage(fees.mspPercentFee, v1.escrowVestedAmount) || 0;
        } else {
          const wa = toUiAmount(new BN(v2.withdrawableAmount), token?.decimals || 6);
          fee = percentage(fees.mspPercentFee, wa) || 0;
        }
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    localStreamDetail,
    getTokenByMintAddress,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback((): number => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;

      const token = getTokenByMintAddress(localStreamDetail.associatedToken as string);

      if (v1.version < 2) {
        return v1.escrowVestedAmount;
      } else {
        return toUiAmount(new BN(v2.withdrawableAmount), token?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    localStreamDetail,
    getTokenByMintAddress

  ]);

  const getUnvested = useCallback((): number => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;

      const token = getTokenByMintAddress(localStreamDetail.associatedToken as string);

      if (v1.version < 2) {
        return v1.escrowUnvestedAmount;
      } else {
        return toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6);
      }
    }
    return 0;
  }, [
    publicKey,
    localStreamDetail,
    getTokenByMintAddress
  ]);

  // Set fee amount
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
    props.handleOk({
      title: proposalTitle,
      closeTreasuryOption,
      vestedReturns: getWithdrawableAmount(),
      unvestedReturns: amITreasurer() ? getUnvested() : 0,
      feeAmount: amIBeneficiary() && getWithdrawableAmount() > 0 ? feeAmount : 0
    });
  }

  const onCloseModal = () => {
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setProposalTitle("");
    });

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const onCloseTreasuryOptionChanged = (e: any) => {
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

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{param === "multisig" ? "Propose close stream" : t('close-stream.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onCancel={onCloseModal}
      width={400}>

      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress p-0">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : streamTreasuryType === "locked" && streamState !== STREAM_STATUS.Paused ? (
        // The user can't close the stream
        <div className="transaction-progress p-0">
          {/* Warning icon */}
          {/* <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" /> */}
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
          )}
          <h4 className="operation">{t('close-stream.cant-close-message')}</h4>
          <div className="mt-3">
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={onCloseModal}>
                {t('general.cta-close')}
            </Button>
          </div>
        </div>
      ) : (
        // The normal stuff
        <div className="transaction-progress p-0">
          {/* Warning icon */}
          {/* <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" /> */}
          <div className="text-center">
            {theme === 'light' ? (
              <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
            ) : (
              <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
            )}
          </div>
          <div className="mb-2 fg-warning operation">
            <span>{props.content}</span>
          </div>
          {/* <h4 className="operation">{props.content}</h4> */}

          {/* Info */}
          {localStreamDetail && localStreamDetail.associatedToken && (
            <>
              <div className="p-2 mb-2">
                {infoRow(
                  t('close-stream.return-vested-amount') + ':',
                  getAmountWithSymbol(getWithdrawableAmount(), localStreamDetail.associatedToken as string)
                )}
                {amITreasurer() && infoRow(
                  t('close-stream.return-unvested-amount') + ':',
                  getAmountWithSymbol(getUnvested(), localStreamDetail.associatedToken as string)
                )}
                {amIBeneficiary() && getWithdrawableAmount() > 0 && infoRow(
                  t('transactions.transaction-info.transaction-fee') + ':',
                  `${feeAmount
                    ? '~' + getAmountWithSymbol((feeAmount as number), localStreamDetail.associatedToken as string)
                    : '0'
                  }`
                )}
              </div>
              <div className="operation">{t("close-stream.context-treasurer-aditional-message")}</div>
            </>
          )}

          {props.canCloseTreasury && treasuryDetails && !treasuryDetails.autoClose && (
            <div className="mt-3 flex-fixed-right">
              <div className="form-label left m-0 p-0">
                {t('treasuries.treasury-streams.close-stream-also-closes-treasury-label')}
              </div>
              <div className="right">
                <Radio.Group onChange={onCloseTreasuryOptionChanged} value={closeTreasuryOption}>
                  <Radio value={true}>{t('general.yes')}</Radio>
                  <Radio value={false}>{t('general.no')}</Radio>
                </Radio.Group>
              </div>
            </div>
          )}

          {/* Proposal title */}
          {param === "multisig" && (
            <div className="mb-3 mt-3">
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
                onClick={props.handleClose}>
                {t('close-stream.secondary-cta')}
            </Button> */}
            <Button
              block
              type="primary"
              shape="round"
              size="large"
              disabled={param === "multisig" && !isValidForm()}
              onClick={onAcceptModal}>
              {param === "multisig" ? getTransactionStartButtonLabel() : t('close-stream.primary-cta')}
            </Button>
          </div>
        </div>
      )}

    </Modal>
  );
};
