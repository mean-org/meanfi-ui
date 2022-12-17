import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  PaymentStreaming,
  Stream,
  STREAM_STATUS_CODE,
  TransactionFees,
  AccountType,
  PaymentStreamingAccount,
} from '@mean-dao/payment-streaming';
import { PublicKey } from '@solana/web3.js';
import { Button, Col, Modal, Radio, Row } from 'antd';
import { InputMean } from 'components/InputMean';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { consoleOut, percentageBn } from 'middleware/ui';
import { getAmountWithSymbol, toUiAmount } from 'middleware/utils';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { StreamTreasuryType } from 'models/treasuries';
import { VestingContractCloseStreamOptions } from 'models/vesting';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const StreamCloseModal = (props: {
  canCloseTreasury?: boolean;
  content: JSX.Element;
  handleClose: any;
  handleOk: any;
  hasContractFinished: boolean;
  isVisible: boolean;
  mspClient: PaymentStreaming | undefined;
  selectedToken: TokenInfo | undefined;
  streamDetail: Stream | undefined;
  transactionFees: TransactionFees;
  isMultisigTreasury: boolean;
}) => {
  const {
    canCloseTreasury,
    content,
    handleClose,
    handleOk,
    hasContractFinished,
    isVisible,
    mspClient,
    selectedToken,
    streamDetail,
    transactionFees,
    isMultisigTreasury,
  } = props;
  const { splTokenList } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [closeTreasuryOption, setCloseTreasuryOption] = useState(false);
  const [streamTreasuryType, setStreamTreasuryType] = useState<StreamTreasuryType | undefined>(undefined);
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [treasuryDetails, setTreasuryDetails] = useState<PaymentStreamingAccount | undefined>(undefined);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | undefined>(undefined);
  const [streamState, setStreamState] = useState<STREAM_STATUS_CODE | undefined>(undefined);
  const [proposalTitle, setProposalTitle] = useState('');

  const getTreasuryTypeByTreasuryId = useCallback(
    async (treasuryId: string): Promise<StreamTreasuryType | undefined> => {
      if (!connection || !publicKey || !mspClient) {
        return undefined;
      }

      const treasueyPk = new PublicKey(treasuryId);

      try {
        const details = await mspClient.getAccount(treasueyPk);
        if (details) {
          setTreasuryDetails(details);
          consoleOut('treasuryDetails:', details, 'blue');
          const type = details.accountType;
          if (type === AccountType.Lock) {
            return 'locked';
          } else {
            return 'open';
          }
        } else {
          setTreasuryDetails(undefined);
          return 'unknown';
        }
      } catch (error) {
        console.error(error);
        return 'unknown';
      } finally {
        setLoadingTreasuryDetails(false);
      }
    },
    [publicKey, connection, mspClient],
  );

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && !localStreamDetail && streamDetail) {
      setStreamState(streamDetail.statusCode as STREAM_STATUS_CODE);
      setLocalStreamDetail(streamDetail);
    }
  }, [isVisible, localStreamDetail, streamDetail]);

  // Set account type
  useEffect(() => {
    if (isVisible && localStreamDetail) {
      consoleOut('fetching account details...', '', 'blue');
      getTreasuryTypeByTreasuryId(localStreamDetail.psAccount.toBase58()).then(value => {
        consoleOut('streamTreasuryType:', value, 'crimson');
        setStreamTreasuryType(value);
      });
    }
  }, [isVisible, localStreamDetail, getTreasuryTypeByTreasuryId]);

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
  }, [treasuryDetails, canCloseTreasury]);

  const amITreasurer = useCallback((): boolean => {
    return streamDetail && publicKey ? streamDetail.psAccountOwner.equals(publicKey) : false;
  }, [publicKey, streamDetail]);

  const amIBeneficiary = useCallback((): boolean => {
    if (streamDetail && publicKey) {
      return streamDetail.beneficiary.equals(publicKey) ? true : false;
    }
    return false;
  }, [publicKey, streamDetail]);

  const getFeeAmount = useCallback(
    (fees: TransactionFees): number => {
      let fee = 0;

      // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
      // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
      // must be used by adding the percentFee of the vested amount to the flat fee
      if (fees && streamDetail) {
        const isTreasurer = amITreasurer();
        const isBeneficiary = amIBeneficiary();
        if (isBeneficiary) {
          const wa = toUiAmount(streamDetail.withdrawableAmount, selectedToken?.decimals || 9);
          fee = (percentageBn(fees.mspPercentFee, wa, true) as number) || 0;
        } else if (isTreasurer) {
          fee = fees.mspFlatFee;
        }
      }
      return fee;
    },
    [streamDetail, selectedToken?.decimals, amIBeneficiary, amITreasurer],
  );

  const getWithdrawableAmount = useCallback(() => {
    if (streamDetail) {
      return toUiAmount(streamDetail.withdrawableAmount, selectedToken?.decimals || 9);
    }
    return '0';
  }, [streamDetail, selectedToken?.decimals]);

  const getUnvested = useCallback(() => {
    if (streamDetail) {
      return toUiAmount(streamDetail.fundsLeftInStream, selectedToken?.decimals || 9);
    }
    return '0';
  }, [streamDetail, selectedToken?.decimals]);

  // Set fee amount
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [feeAmount, transactionFees, getFeeAmount]);

  const onAcceptModal = () => {
    if (!streamDetail) {
      return;
    }

    const options: VestingContractCloseStreamOptions = {
      proposalTitle,
      closeTreasuryOption,
      vestedReturns: getWithdrawableAmount(),
      unvestedReturns: amITreasurer() ? getUnvested() : 0,
      feeAmount: amIBeneficiary() && streamDetail.withdrawableAmount.gtn(0) ? feeAmount || 0 : 0,
    };
    handleOk(options);
  };

  const onCloseTreasuryOptionChanged = (e: any) => {
    setCloseTreasuryOption(e.target.value);
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={10} className="text-right pr-1">
          {caption}
        </Col>
        <Col span={14} className="text-left pl-1 fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  const renderModalContent = () => {
    if (streamTreasuryType === 'locked' && streamState === STREAM_STATUS_CODE.Running) {
      return (
        // The user can't close the stream
        <div className="transaction-progress p-0">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{t('vesting.close-account.cant-close-stream-message')}</h4>
          <div className="mt-3">
            <Button type="primary" shape="round" size="large" onClick={handleClose}>
              {t('general.cta-close')}
            </Button>
          </div>
        </div>
      );
    } else {
      // Validation
      const isValidForm = (): boolean => {
        return !!proposalTitle || !isMultisigTreasury;
      };

      const getButtonLabel = () => {
        return !proposalTitle && isMultisigTreasury ? 'Add a proposal title' : t('close-stream.primary-cta');
      };

      return (
        // The normal stuff
        <div className="transaction-progress p-0">
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
          <h4 className="operation">{content}</h4>

          {/* Info */}
          {localStreamDetail && selectedToken && (
            <>
              <div className="p-2 mb-2">
                {hasContractFinished &&
                  infoRow(
                    t('close-stream.return-vested-amount') + ':',
                    getAmountWithSymbol(
                      getWithdrawableAmount(),
                      selectedToken.address,
                      false,
                      splTokenList,
                      selectedToken.decimals,
                    ),
                  )}
                {amITreasurer() &&
                  infoRow(
                    t('close-stream.return-unvested-amount') + ':',
                    getAmountWithSymbol(
                      getUnvested(),
                      selectedToken.address,
                      false,
                      splTokenList,
                      selectedToken.decimals,
                    ),
                  )}
                {amIBeneficiary() &&
                  localStreamDetail.withdrawableAmount.gtn(0) &&
                  infoRow(
                    t('transactions.transaction-info.transaction-fee') + ':',
                    `${feeAmount ? '~' + getAmountWithSymbol(feeAmount, selectedToken.address) : '0'}`,
                  )}
              </div>
            </>
          )}
          {/* Proposal title */}
          {isMultisigTreasury && (
            <div className="mb-3">
              <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
              <InputMean
                id="proposal-title-field"
                name="Title"
                className={`w-100 general-text-input`}
                onChange={(e: any) => {
                  setProposalTitle(e.target.value);
                }}
                placeholder="Add a proposal title (required)"
                value={proposalTitle}
              />
            </div>
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
            <Button className="mr-3" type="text" shape="round" size="large" onClick={handleClose}>
              {t('close-stream.secondary-cta')}
            </Button>
            <Button type="primary" shape="round" size="large" onClick={onAcceptModal} disabled={!isValidForm()}>
              {getButtonLabel()}
            </Button>
          </div>
        </div>
      );
    }
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('close-stream.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={handleOk}
      onCancel={handleClose}
      width={400}
    >
      {loadingTreasuryDetails ? (
        // The loading part
        <div className="transaction-progress p-0">
          <LoadingOutlined style={{ fontSize: 48 }} className="icon mt-0" spin />
          <h4 className="operation">{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : (
        renderModalContent()
      )}
    </Modal>
  );
};
