import { LoadingOutlined, WarningFilled, WarningOutlined } from "@ant-design/icons";
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { MSP, Stream, STREAM_STATUS, Treasury, TreasuryType } from '@mean-dao/msp';
import { PublicKey } from '@solana/web3.js';
import { Button, Col, Modal, Radio, Row } from 'antd';
import { InputMean } from 'components/InputMean';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { consoleOut, percentage, percentageBn } from 'middleware/ui';
import { getAmountWithSymbol, toUiAmount } from 'middleware/utils';
import { MeanFiAccountType, TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { StreamTreasuryType } from 'models/treasuries';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const StreamCloseModal = (props: {
  canCloseTreasury?: boolean;
  content: JSX.Element;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  mspClient: MoneyStreaming | MSP | undefined;
  selectedToken: TokenInfo | undefined;
  streamDetail: Stream | StreamInfo | undefined;
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
  const {
    theme,
    splTokenList,
    accountAddress,
    selectedAccount,
    setTransactionStatus,
  } = useContext(AppStateContext);
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

  const isMultisigContext = useMemo(() => {
    if (publicKey && accountAddress && selectedAccount.type === MeanFiAccountType.Multisig) {
      return true;
    }
    return false;
  }, [publicKey && accountAddress, selectedAccount]);

  const getTreasuryTypeByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !mspClient) { return undefined; }

    const mspInstance = streamVersion < 2 ? mspClient as MoneyStreaming : mspClient as MSP;
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
    mspClient,
  ]);

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && !localStreamDetail && streamDetail) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if (streamDetail.version < 2) {
        setStreamState(v1.state);
      } else {
        setStreamState(v2.status as STREAM_STATUS);
      }
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
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      consoleOut('fetching treasury details...', '', 'blue');
      getTreasuryTypeByTreasuryId(
        localStreamDetail.version < 2 ? v1.treasuryAddress as string : v2.treasury.toBase58(),
        localStreamDetail.version
      ).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value)});
    }
  }, [
    isVisible,
    localStreamDetail,
    getTreasuryTypeByTreasuryId
  ]);

  // Set closeTreasuryOption accordingly
  useEffect(() => {
    if (!canCloseTreasury && treasuryDetails) {
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
    canCloseTreasury
  ]);

  const amITreasurer = useCallback((): boolean => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;
      if ((localStreamDetail.version < 2 && v1.treasurerAddress === publicKey.toBase58()) || (v2.version >= 2 && v2.treasurer.equals(publicKey))) {
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
      if (localStreamDetail.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary.equals(publicKey) ? true : false;
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
      const isTreasurer = amITreasurer();
      const isBeneficiary = amIBeneficiary();
      if (isBeneficiary) {
        if (localStreamDetail.version < 2) {
          fee = percentage(fees.mspPercentFee, v1.escrowVestedAmount) || 0;
        } else {
          const wa = toUiAmount(v2.withdrawableAmount, selectedToken?.decimals || 9);
          fee = percentageBn(fees.mspPercentFee, wa, true) as number || 0;
        }
      } else if (isTreasurer) {
        fee = fees.mspFlatFee;
      }
    }
    return fee;
  }, [
    selectedToken,
    localStreamDetail,
    amIBeneficiary,
    amITreasurer,
  ]);

  const getWithdrawableAmount = useCallback(() => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;

      if (localStreamDetail.version < 2) {
        return v1.escrowVestedAmount;
      } else {
        return toUiAmount(v2.withdrawableAmount, selectedToken?.decimals || 9);
      }
    }
    return 0;
  }, [
    publicKey,
    selectedToken,
    localStreamDetail,
  ]);

  const getUnvested = useCallback(() => {
    if (localStreamDetail && publicKey) {
      const v1 = localStreamDetail as StreamInfo;
      const v2 = localStreamDetail as Stream;

      if (localStreamDetail.version < 2) {
        return v1.escrowUnvestedAmount;
      } else {
        return toUiAmount(v2.fundsLeftInStream, selectedToken?.decimals || 9);
      }
    }
    return 0;
  }, [
    publicKey,
    selectedToken,
    localStreamDetail,
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
    handleOk({
      title: proposalTitle,
      closeTreasuryOption,
      vestedReturns: getWithdrawableAmount(),
      unvestedReturns: amITreasurer() ? getUnvested() : 0,
      feeAmount: amIBeneficiary() && getWithdrawableAmount() > 0 ? feeAmount : 0
    });
  }

  const onCloseModal = () => {
    handleClose();
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
        <Col span={10} className="text-right pr-1">{caption}</Col>
        <Col span={14} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
  }

  const renderLoading = () => {
    return (
      <div className="transaction-progress p-0">
        <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
        <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
      </div>
    );
  }

  const renderCannotCloseStream = () => {
    return (
      <div className="transaction-progress p-0">
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
    );
  }

  const renderCloseStream = () => {
    return (
      <div className="transaction-progress p-0">
        <div className="text-center">
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className="icon mt-0 fg-warning" />
          )}
        </div>
        <div className="mb-2 fg-warning operation">
          <span>{content}</span>
        </div>

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
              {amIBeneficiary() && getWithdrawableAmount() > 0 && infoRow(
                t('transactions.transaction-info.transaction-fee') + ':',
                `${feeAmount
                  ? '~' + getAmountWithSymbol(feeAmount, selectedToken.address)
                  : '0'
                }`
              )}
            </div>
            <div className="operation">{t("close-stream.context-treasurer-aditional-message")}</div>
          </>
        )}

        {canCloseTreasury && treasuryDetails && !treasuryDetails.autoClose && (
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
        {isMultisigContext && (
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
          <Button
            block
            type="primary"
            shape="round"
            size="large"
            disabled={isMultisigContext && !isValidForm()}
            onClick={onAcceptModal}>
            {isMultisigContext ? getTransactionStartButtonLabel() : t('close-stream.primary-cta')}
          </Button>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (loadingTreasuryDetails) {
      return renderLoading();
    } else if (streamTreasuryType === "locked" && streamState !== STREAM_STATUS.Paused) {
      return renderCannotCloseStream();
    } else {
      return renderCloseStream();
    }
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{isMultisigContext ? "Propose close stream" : t('close-stream.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onCancel={onCloseModal}
      width={400}>

      {renderContent()}

    </Modal>
  );
};
