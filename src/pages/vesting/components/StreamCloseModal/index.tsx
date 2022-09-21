import React, { useContext } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Button, Row, Col, Radio } from 'antd';
import { ExclamationCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { useTranslation } from 'react-i18next';
import { MSP, Stream, STREAM_STATUS, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { TokenInfo } from '@solana/spl-token-registry';
import { PublicKey } from '@solana/web3.js';
import { useConnection } from '../../../../contexts/connection';
import { useWallet } from '../../../../contexts/wallet';
import { StreamTreasuryType } from '../../../../models/treasuries';
import { consoleOut, percentageBn } from '../../../../middleware/ui';
import { getAmountWithSymbol, toUiAmount } from '../../../../middleware/utils';
import { VestingContractCloseStreamOptions } from '../../../../models/vesting';
import { AppStateContext } from '../../../../contexts/appstate';

export const StreamCloseModal = (props: {
  canCloseTreasury?: boolean;
  content: JSX.Element;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  mspClient: MSP | undefined;
  selectedToken: TokenInfo | undefined;
  streamDetail: Stream | undefined;
  transactionFees: TransactionFees;
}) => {
  const {
    canCloseTreasury,
    content,
    handleClose,
    handleOk,
    isVisible,
    mspClient,
    selectedToken,
    streamDetail,
    transactionFees,
  } = props;
  const { splTokenList } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [closeTreasuryOption, setCloseTreasuryOption] = useState(false);
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | undefined>(undefined);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | undefined>(undefined);
  const [streamState, setStreamState] = useState<STREAM_STATUS | undefined>(undefined);

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !mspClient) { return undefined; }

    const treasueyPk = new PublicKey(treasuryId);

    try {
      const details = await mspClient.getTreasury(treasueyPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
        const type = details.treasuryType;
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
    mspClient,
  ]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && !localStreamDetail && streamDetail) {
      setStreamState(streamDetail.status as STREAM_STATUS);
      setLocalStreamDetail(streamDetail);
    }
  }, [
    isVisible,
    localStreamDetail,
    streamDetail,
  ]);

  // Set treasury type
  useEffect(() => {
    if (isVisible && localStreamDetail) {
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(localStreamDetail.treasury.toBase58())
      .then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value)
      });
    }
  }, [
    isVisible,
    localStreamDetail,
    getTreasuryTypeByTreasuryId
  ]);

  // Set closeTreasuryOption accordingly
  useEffect(() => {
    if (!canCloseTreasury && treasuryDetails) {
      if (treasuryDetails.totalStreams > 1) {
        setCloseTreasuryOption(false);
      } else if (treasuryDetails.totalStreams === 1 && treasuryDetails.autoClose) {
        setCloseTreasuryOption(true);
      } else {
        setCloseTreasuryOption(false);
      }
    }
  }, [
    treasuryDetails,
    canCloseTreasury
  ]);

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

  // Set fee amount
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [
    feeAmount,
    transactionFees,
    getFeeAmount
  ]);

  const onAcceptModal = () => {
    if (!streamDetail) { return; }

    const options: VestingContractCloseStreamOptions = {
      closeTreasuryOption,
      vestedReturns: getWithdrawableAmount(),
      unvestedReturns: amITreasurer() ? getUnvested() : 0,
      feeAmount: amIBeneficiary() && streamDetail.withdrawableAmount.gtn(0) ? (feeAmount || 0) : 0
    }
    handleOk(options);
  }

  const onCloseTreasuryOptionChanged = (e: any) => {
    setCloseTreasuryOption(e.target.value);
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={10} className="text-right pr-1">{caption}</Col>
        <Col span={14} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('close-stream.modal-title')}</div>}
      footer={null}
      visible={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}>

      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress p-0">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : streamTreasuryType === "locked" && streamState === STREAM_STATUS.Running ? (
        // The user can't close the stream
        <div className="transaction-progress p-0">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{t('vesting.close-account.cant-close-stream-message')}</h4>
          <div className="mt-3">
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={handleClose}>
                {t('general.cta-close')}
            </Button>
          </div>
        </div>
      ) : (
        // The normal stuff
        <div className="transaction-progress p-0">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{content}</h4>

          {/* Info */}
          {localStreamDetail && selectedToken && (
            <>
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
                {amIBeneficiary() && localStreamDetail.withdrawableAmount.gtn(0) && infoRow(
                  t('transactions.transaction-info.transaction-fee') + ':',
                  `${feeAmount
                    ? '~' + getAmountWithSymbol((feeAmount as number), selectedToken.address)
                    : '0'
                  }`
                )}
              </div>
            </>
          )}

          {canCloseTreasury && treasuryDetails && !treasuryDetails.autoClose && (
            <div className="mt-3 flex-fixed-right">
              <div className="form-label left m-0 p-0">
                {t('vesting.close-account.close-stream-also-closes-account-label')}
              </div>
              <div className="right">
                <Radio.Group onChange={onCloseTreasuryOptionChanged} value={closeTreasuryOption}>
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
                onClick={handleClose}>
                {t('close-stream.secondary-cta')}
            </Button>
            <Button
                type="primary"
                shape="round"
                size="large"
                onClick={onAcceptModal}>
                {t('close-stream.primary-cta')}
            </Button>
          </div>
        </div>
      )}

    </Modal>
  );
};
