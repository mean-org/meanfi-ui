import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TransactionFees } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { Button, Modal, Spin } from 'antd';

import { InputMean } from 'components/InputMean';
import { AppStateContext } from 'contexts/appstate';
import { useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { BPF_LOADER_UPGRADEABLE_PID, NATIVE_SOL_MINT } from 'middleware/ids';
import { isError } from 'middleware/transactions';
import { getTransactionOperationDescription, isValidAddress } from 'middleware/ui';
import { getAmountWithSymbol } from 'middleware/utils';
import { TransactionStatus } from 'models/enums';
import { SetProgramAuthPayload } from 'models/multisig';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface Props {
  handleClose: any;
  handleOk: any;
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
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  };

  const onProgramChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setProgramId(trimmedValue);
  };

  const onNewAuthChanged = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setNewAuthAddress(trimmedValue);
  };

  const isValidForm = (): boolean => {
    return programId &&
      (proposalTitle || !isMultisigTreasury) &&
      newAuthAddress &&
      programDataAddress &&
      isValidAddress(programId) &&
      isValidAddress(newAuthAddress) &&
      isValidAddress(programDataAddress)
      ? true
      : false;
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
      : transactionStatus.currentOperation === TransactionStatus.Iddle
      ? t('multisig.set-program-authority.main-cta')
      : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
      ? t('general.cta-finish')
      : t('general.refresh');
  };

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.set-program-authority.modal-title')}</div>}
      footer={null}
      open={isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}
    >
      <div className={!isBusy ? 'panel1 show' : 'panel1 hide'}>
        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
            {isMultisigTreasury && (
              <>
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
              </>
            )}
            {/* Program address */}
            <div className="form-label">{t('multisig.upgrade-program.program-address-label')}</div>
            <div className={`well ${baseProgramId ? 'disabled' : ''}`}>
              <input
                id="token-address-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onProgramChange}
                placeholder={t('multisig.upgrade-program.program-address-placeholder')}
                required={true}
                spellCheck="false"
                value={programId}
              />
              {programId && !isValidAddress(programId) && (
                <span className="form-field-error">{t('transactions.validation.address-validation')}</span>
              )}
            </div>
            {/* New authority address */}
            <div className="form-label">{t('multisig.set-program-authority.new-authority-input-label')}</div>
            <div className="well">
              <input
                id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onNewAuthChanged}
                placeholder={t('multisig.set-program-authority.new-authority-input-placeholder')}
                required={true}
                spellCheck="false"
                value={newAuthAddress}
              />
              {newAuthAddress && !isValidAddress(newAuthAddress) && (
                <span className="form-field-error">{t('transactions.validation.address-validation')}</span>
              )}
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.upgrade-program.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58()),
                    feeAmount: getAmountWithSymbol(
                      transactionFees.blockchainFee + transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58(),
                    ),
                  })}
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
            </div>
          </>
        )}
      </div>

      <div
        className={
          isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? 'panel2 show' : 'panel2 hide'
        }
      >
        {isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle && (
          <div className="transaction-progress">
            <Spin indicator={bigLoadingIcon} className="icon mt-0" />
            <h4 className="font-bold mb-1">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
              <div className="indication">{t('transactions.status.instructions')}</div>
            )}
          </div>
        )}
      </div>

      <div className="row two-col-ctas mt-3 transaction-progress p-0">
        <div className="col-6">
          <Button
            block
            type="text"
            shape="round"
            size="middle"
            className={isBusy ? 'inactive' : ''}
            onClick={() => (isError(transactionStatus.currentOperation) ? onAcceptModal() : onCloseModal())}
          >
            {isError(transactionStatus.currentOperation) ? t('general.retry') : t('general.cta-close')}
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={isBusy ? 'inactive' : ''}
            block
            type="primary"
            shape="round"
            size="middle"
            disabled={!isValidForm()}
            onClick={() => {
              if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
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
