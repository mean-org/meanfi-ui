import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { TransactionFees } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { Button, Modal, Spin } from 'antd';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InputMean } from 'src/components/InputMean';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import { BPF_LOADER_UPGRADEABLE_PID, SOL_MINT } from 'src/middleware/ids';
import { isError } from 'src/middleware/transactions';
import { getTransactionOperationDescription, isValidAddress } from 'src/middleware/ui';
import { getAmountWithSymbol } from 'src/middleware/utils';
import { TransactionStatus } from 'src/models/enums';
import type { SetProgramAuthPayload } from 'src/models/multisig';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  handleClose: () => void;
  handleOk: (params: SetProgramAuthPayload) => void;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  programId?: string;
  isMultisigTreasury: boolean;
}
export const MultisigSetProgramAuthModal = ({
  handleClose,
  handleOk,
  isVisible,
  isBusy,
  nativeBalance,
  transactionFees,
  programId: baseProgramId,
  isMultisigTreasury,
}: Props) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { transactionStatus, setTransactionStatus } = useContext(AppStateContext);

  const [programId, setProgramId] = useState('');
  const [programDataAddress, setProgramDataAddress] = useState('');
  const [newAuthAddress, setNewAuthAddress] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');

  // Get propgram ID from inputs
  useEffect(() => {
    if (isVisible && baseProgramId) {
      if (isValidAddress(baseProgramId)) {
        setProgramId(baseProgramId);
      }
    }
  }, [baseProgramId, isVisible]);

  // Resolves programDataAddress
  useEffect(() => {
    if (!isVisible || !connection || !publicKey || !programId || !isValidAddress(programId)) {
      return;
    }

    const timeout = setTimeout(() => {
      try {
        const programAddress = new PublicKey(programId);
        const [programDataAddress] = PublicKey.findProgramAddressSync(
          [programAddress.toBuffer()],
          BPF_LOADER_UPGRADEABLE_PID,
        );
        setProgramDataAddress(programDataAddress.toBase58());
      } catch (error) {
        console.error(error);
      }
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [programId, publicKey, connection, isVisible]);

  const onAcceptModal = () => {
    const params: SetProgramAuthPayload = {
      proposalTitle,
      programAddress: programId,
      programDataAddress: programDataAddress,
      newAuthAddress: newAuthAddress,
    };
    handleOk(params);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setProgramId('');
      setProgramDataAddress('');
      setNewAuthAddress('');
    }, 50);

    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const onProgramChange = (value: string) => {
    const trimmedValue = value.trim();
    setProgramId(trimmedValue);
  };

  const onNewAuthChanged = (value: string) => {
    const trimmedValue = value.trim();
    setNewAuthAddress(trimmedValue);
  };

  const isValidForm = (): boolean => {
    return !!(
      programId &&
      (proposalTitle || !isMultisigTreasury) &&
      newAuthAddress &&
      programDataAddress &&
      isValidAddress(programId) &&
      isValidAddress(newAuthAddress) &&
      isValidAddress(programDataAddress)
    );
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  const getButtonLabel = () => {
    return isBusy
      ? t('multisig.set-program-authority.main-cta-busy')
      : !proposalTitle && isMultisigTreasury
        ? 'Add a proposal title'
        : !newAuthAddress
          ? 'Add an upgrade authority'
          : transactionStatus.currentOperation === TransactionStatus.Idle
            ? t('multisig.set-program-authority.main-cta')
            : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
              ? t('general.cta-finish')
              : t('general.refresh');
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>{t('multisig.set-program-authority.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Idle ? 380 : 480}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Idle ? (
          <>
            {/* Proposal title */}
            {isMultisigTreasury && (
              <>
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
              </>
            )}
            {/* Program address */}
            <div className='form-label'>{t('multisig.upgrade-program.program-address-label')}</div>
            <div className={`well ${baseProgramId ? 'disabled' : ''}`}>
              <input
                id='token-address-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onChange={e => onProgramChange(e.target.value)}
                placeholder={t('multisig.upgrade-program.program-address-placeholder')}
                required={true}
                spellCheck='false'
                value={programId}
              />
              {programId && !isValidAddress(programId) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
            </div>
            {/* New authority address */}
            <div className='form-label'>{t('multisig.set-program-authority.new-authority-input-label')}</div>
            <div className='well'>
              <input
                id='mint-to-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onChange={e => onNewAuthChanged(e.target.value)}
                placeholder={t('multisig.set-program-authority.new-authority-input-placeholder')}
                required={true}
                spellCheck='false'
                value={newAuthAddress}
              />
              {newAuthAddress && !isValidAddress(newAuthAddress) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className='transaction-progress'>
              <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              <h4 className='font-bold'>{t('multisig.upgrade-program.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className='transaction-progress'>
              <InfoCircleOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className='mb-4'>
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                    feeAmount: getAmountWithSymbol(
                      transactionFees.blockchainFee + transactionFees.mspFlatFee,
                      SOL_MINT.toBase58(),
                    ),
                  })}
                </h4>
              ) : (
                <h4 className='font-bold mb-3'>
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Idle && (
          <div className='transaction-progress'>
            <Spin indicator={bigLoadingIcon} className='icon mt-0' />
            <h4 className='font-bold mb-1'>
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className='indication'>{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      <div className='row two-col-ctas mt-3 transaction-progress p-0'>
        <div className='col-6'>
          <Button
            block
            type='text'
            shape='round'
            size='middle'
            className={isBusy ? 'inactive' : ''}
            onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
          >
            {isError(transactionStatus.currentOperation) ? t('general.retry') : t('general.cta-close')}
          </Button>
        </div>
        <div className='col-6'>
          <Button
            className={isBusy ? 'inactive' : ''}
            block
            type='primary'
            shape='round'
            size='middle'
            disabled={!isValidForm()}
            onClick={() => {
              if (transactionStatus.currentOperation === TransactionStatus.Idle) {
                onAcceptModal();
              } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                onCloseModal();
              } else {
                refreshPage();
              }
            }}
          >
            {getButtonLabel()}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
