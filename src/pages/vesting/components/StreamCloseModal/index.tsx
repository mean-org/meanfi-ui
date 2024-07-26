import { ExclamationCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  type PaymentStreaming,
  STREAM_STATUS_CODE,
  type Stream,
  type TransactionFees,
} from '@mean-dao/payment-streaming';
import { Button, Col, Modal, Radio, type RadioChangeEvent, Row } from 'antd';
import { InputMean } from 'components/InputMean';
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from 'contexts/wallet';
import { percentageBn } from 'middleware/ui';
import { getAmountWithSymbol, toUiAmount } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { VestingContractCloseStreamOptions } from 'models/vesting';
import { useGetVestingContract } from 'query-hooks/vestingContract';
import { type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const StreamCloseModal = (props: {
  canCloseTreasury?: boolean;
  content: ReactNode;
  handleClose: () => void;
  handleOk: (options: VestingContractCloseStreamOptions) => void;
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
  const { publicKey } = useWallet();
  const [feeAmount, setFeeAmount] = useState<number | null>(null);
  const [closeTreasuryOption, setCloseTreasuryOption] = useState(false);
  const [localStreamDetail, setLocalStreamDetail] = useState<Stream | undefined>(undefined);
  const [streamState, setStreamState] = useState<STREAM_STATUS_CODE | undefined>(undefined);
  const [proposalTitle, setProposalTitle] = useState('');

  const { vestingContract, loadingVestingContract } = useGetVestingContract({
    vestingAccountId: streamDetail?.psAccount.toBase58() || undefined,
    tokenStreamingV2: mspClient,
  });

  // Read and keep the input copy of the stream
  useEffect(() => {
    if (isVisible && streamDetail) {
      setStreamState(streamDetail.statusCode as STREAM_STATUS_CODE);
      setLocalStreamDetail(streamDetail);
    }
  }, [isVisible, streamDetail]);

  // Set closeTreasuryOption accordingly
  useEffect(() => {
    if (!canCloseTreasury && vestingContract) {
      if (vestingContract.totalStreams > 1) {
        setCloseTreasuryOption(false);
      } else if (vestingContract.totalStreams === 1 && vestingContract.autoClose) {
        setCloseTreasuryOption(true);
      } else {
        setCloseTreasuryOption(false);
      }
    }
  }, [vestingContract, canCloseTreasury]);

  const amITreasurer = useCallback((): boolean => {
    return localStreamDetail && publicKey ? localStreamDetail.psAccountOwner.equals(publicKey) : false;
  }, [publicKey, localStreamDetail]);

  const amIBeneficiary = useCallback((): boolean => {
    if (localStreamDetail && publicKey) {
      return !!localStreamDetail.beneficiary.equals(publicKey);
    }
    return false;
  }, [publicKey, localStreamDetail]);

  const getFeeAmount = useCallback(
    (fees: TransactionFees): number => {
      // If the Treasurer is initializing the CloseStream Tx, mspFlatFee must be used
      // If the Beneficiary is initializing the CloseStream Tx, both mspFlatFee and mspPercentFee
      // must be used by adding the percentFee of the vested amount to the flat fee
      if (fees && localStreamDetail) {
        const isTreasurer = amITreasurer();
        const isBeneficiary = amIBeneficiary();
        if (isBeneficiary) {
          const wa = toUiAmount(localStreamDetail.withdrawableAmount, selectedToken?.decimals || 9);
          return (percentageBn(fees.mspPercentFee, wa, true) as number) || 0;
        }
        if (isTreasurer) {
          return fees.mspFlatFee;
        }
      }

      return 0;
    },
    [localStreamDetail, selectedToken?.decimals, amIBeneficiary, amITreasurer],
  );

  const getWithdrawableAmount = useCallback(() => {
    if (localStreamDetail) {
      return toUiAmount(localStreamDetail.withdrawableAmount, selectedToken?.decimals || 9);
    }
    return '0';
  }, [localStreamDetail, selectedToken?.decimals]);

  const getUnvested = useCallback(() => {
    if (localStreamDetail) {
      return toUiAmount(localStreamDetail.fundsLeftInStream, selectedToken?.decimals || 9);
    }
    return '0';
  }, [localStreamDetail, selectedToken?.decimals]);

  // Set fee amount
  useEffect(() => {
    if (!feeAmount && transactionFees) {
      setFeeAmount(getFeeAmount(transactionFees));
    }
  }, [feeAmount, transactionFees, getFeeAmount]);

  const onAcceptModal = () => {
    if (!localStreamDetail) {
      return;
    }

    const options: VestingContractCloseStreamOptions = {
      proposalTitle,
      closeTreasuryOption,
      vestedReturns: getWithdrawableAmount(),
      unvestedReturns: amITreasurer() ? getUnvested() : 0,
      feeAmount: amIBeneficiary() && localStreamDetail.withdrawableAmount.gtn(0) ? feeAmount || 0 : 0,
    };
    handleOk(options);
  };

  const onCloseTreasuryOptionChanged = (e: RadioChangeEvent) => {
    setCloseTreasuryOption(e.target.value);
  };

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={10} className='text-right pr-1'>
          {caption}
        </Col>
        <Col span={14} className='text-left pl-1 fg-secondary-70'>
          {value}
        </Col>
      </Row>
    );
  };

  const renderModalContent = () => {
    if (streamState === STREAM_STATUS_CODE.Running) {
      return (
        // The user can't close the stream
        <div className='transaction-progress p-0'>
          <ExclamationCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
          <h4 className='operation'>{t('vesting.close-account.cant-close-stream-message')}</h4>
          <div className='mt-3'>
            <Button type='primary' shape='round' size='large' onClick={handleClose}>
              {t('general.cta-close')}
            </Button>
          </div>
        </div>
      );
    }

    // Validation
    const isValidForm = (): boolean => {
      return !!proposalTitle || !isMultisigTreasury;
    };

    const getButtonLabel = () => {
      return !proposalTitle && isMultisigTreasury ? 'Add a proposal title' : t('close-stream.primary-cta');
    };

    return (
      // The normal stuff
      <div className='transaction-progress p-0'>
        <ExclamationCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
        <h4 className='operation'>{content}</h4>

        {/* Info */}
        {localStreamDetail && selectedToken && (
          <div className='p-2 mb-2'>
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
                `${t('close-stream.return-unvested-amount')}:`,
                getAmountWithSymbol(getUnvested(), selectedToken.address, false, splTokenList, selectedToken.decimals),
              )}
            {amIBeneficiary() &&
              localStreamDetail.withdrawableAmount.gtn(0) &&
              infoRow(
                `${t('transactions.transaction-info.transaction-fee')}:`,
                feeAmount ? `~${getAmountWithSymbol(feeAmount, selectedToken.address)}` : '0',
              )}
          </div>
        )}
        {/* Proposal title */}
        {isMultisigTreasury ? (
          <div className='mb-3'>
            <div className='form-label text-left'>{t('multisig.proposal-modal.title')}</div>
            <InputMean
              id='proposal-title-field'
              name='Title'
              className={'w-100 general-text-input'}
              onChange={value => {
                setProposalTitle(value);
              }}
              placeholder='Add a proposal title (required)'
              value={proposalTitle}
            />
          </div>
        ) : null}
        {canCloseTreasury && vestingContract && !vestingContract.autoClose && (
          <div className='mt-3 flex-fixed-right'>
            <div className='form-label left m-0 p-0'>
              {t('vesting.close-account.close-stream-also-closes-account-label')}
            </div>
            <div className='right'>
              <Radio.Group onChange={onCloseTreasuryOptionChanged} value={closeTreasuryOption}>
                <Radio value={true}>{t('general.yes')}</Radio>
                <Radio value={false}>{t('general.no')}</Radio>
              </Radio.Group>
            </div>
          </div>
        )}

        <div className='mt-3'>
          <Button className='mr-3' type='text' shape='round' size='large' onClick={handleClose}>
            {t('close-stream.secondary-cta')}
          </Button>
          <Button type='primary' shape='round' size='large' onClick={onAcceptModal} disabled={!isValidForm()}>
            {getButtonLabel()}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('close-stream.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={handleClose}
      width={400}
    >
      {loadingVestingContract ? (
        // The loading part
        <div className='transaction-progress p-0'>
          <LoadingOutlined style={{ fontSize: 48 }} className='icon mt-0' spin />
          <h4 className='operation'>{t('close-stream.loading-treasury-message')}</h4>
        </div>
      ) : (
        renderModalContent()
      )}
    </Modal>
  );
};
