import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import type { TransactionFees } from '@mean-dao/money-streaming';
import { PublicKey } from '@solana/web3.js';
import { Button, Modal, Spin } from 'antd';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWallet } from 'src/contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useConnection } from '../../contexts/connection';
import { SOL_MINT } from '../../middleware/ids';
import { isError } from '../../middleware/transactions';
import { getTransactionOperationDescription, isValidAddress } from '../../middleware/ui';
import { getAmountWithSymbol } from '../../middleware/utils';
import { TransactionStatus } from '../../models/enums';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

interface MultisigUpgradeIDLParams {
  programAddress: string;
  programIDLAddress: string;
  idlBufferAddress: string;
}

interface MultisigUpgradeIDLModalProps {
  handleClose: () => void;
  handleOk: (params: MultisigUpgradeIDLParams) => void;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  inputProgramId?: string;
}

export const MultisigUpgradeIDLModal = ({
  handleClose,
  handleOk,
  isVisible,
  isBusy,
  nativeBalance,
  transactionFees,
  inputProgramId,
}: MultisigUpgradeIDLModalProps) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const { transactionStatus, setTransactionStatus } = useContext(AppStateContext);

  const [programId, setProgramId] = useState('');
  const [programIDLAddress, setProgramIDLAddress] = useState('');
  const [idlBufferAddress, setIDLBufferAddress] = useState('');

  // Get propgram ID from inpus
  useEffect(() => {
    if (isVisible && inputProgramId) {
      if (isValidAddress(inputProgramId)) {
        setProgramId(inputProgramId);
      }
    }
  }, [inputProgramId, isVisible]);

  const idlAddress = useCallback(async (programId: PublicKey) => {
    const [base] = PublicKey.findProgramAddressSync([], programId);
    return await PublicKey.createWithSeed(base, 'anchor:idl', programId);
  }, []);

  // Resolves programIDLAddress
  useEffect(() => {
    if (!isVisible || !connection || !publicKey || !programId || !isValidAddress(programId)) {
      return;
    }

    const timeout = setTimeout(() => {
      const programAddress = new PublicKey(programId);
      idlAddress(programAddress)
        .then(programIDLAddress => setProgramIDLAddress(programIDLAddress.toBase58()))
        .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [connection, programId, isVisible, publicKey, idlAddress]);

  const onAcceptModal = () => {
    const params: MultisigUpgradeIDLParams = {
      programAddress: programId,
      programIDLAddress: programIDLAddress,
      idlBufferAddress: idlBufferAddress,
    };

    handleOk(params);
  };

  const onCloseModal = () => {
    handleClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setProgramId('');
      setProgramIDLAddress('');
      setIDLBufferAddress('');
    }, 50);

    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const onProgramChange = (e: string) => {
    const inputValue = e;
    const trimmedValue = inputValue.trim();
    setProgramId(trimmedValue);
  };

  const onBufferAccountChange = (e: string) => {
    const inputValue = e;
    const trimmedValue = inputValue.trim();
    setIDLBufferAddress(trimmedValue);
  };

  const isValidForm = (): boolean => {
    return !!(
      programId &&
      idlBufferAddress &&
      programIDLAddress &&
      isValidAddress(programId) &&
      isValidAddress(idlBufferAddress) &&
      isValidAddress(programIDLAddress)
    );
  };

  const refreshPage = () => {
    handleClose();
    window.location.reload();
  };

  return (
    <Modal
      className='mean-modal simple-modal'
      title={<div className='modal-title'>Upgrade IDL</div>}
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
            {/* Program address */}
            <div className='form-label'>{t('multisig.upgrade-program.program-address-label')}</div>
            <div className={`well ${inputProgramId ? 'disabled' : ''}`}>
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
            {/* IDL Buffer address */}
            <div className='form-label'>New IDL Buffer</div>
            <div className='well'>
              <input
                id='mint-to-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onChange={e => onBufferAccountChange(e.target.value)}
                placeholder={t('multisig.upgrade-program.buffer-account-placeholder')}
                required={true}
                spellCheck='false'
                value={idlBufferAddress}
              />
              {idlBufferAddress && !isValidAddress(idlBufferAddress) && (
                <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
              )}
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className='transaction-progress'>
              <CheckOutlined style={{ fontSize: 48 }} className='icon mt-0' />
              <h4 className='font-bold'>IDL upgraded successfully</h4>
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
            {isBusy
              ? t('multisig.upgrade-program.main-cta-busy')
              : transactionStatus.currentOperation === TransactionStatus.Idle
                ? 'Upgrade IDL'
                : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                  ? t('general.cta-finish')
                  : t('general.refresh')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
