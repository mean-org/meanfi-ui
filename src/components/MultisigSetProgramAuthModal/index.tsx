import React, { useContext, useEffect, useState } from 'react';
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { getTransactionOperationDescription, isValidAddress } from '../../middleware/ui';
import { isError } from '../../middleware/transactions';
import { NATIVE_SOL_MINT } from '../../middleware/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { getAmountWithSymbol } from '../../middleware/utils';
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { PublicKey } from '@solana/web3.js';
import { SetProgramAuthPayload } from 'models/multisig';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigSetProgramAuthModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  programId?: string;
}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus
  } = useContext(AppStateContext);

  const [programId, setProgramId] = useState('');
  const [programDataAddress, setProgramDataAddress] = useState('');
  const [newAuthAddress, setNewAuthAddress] = useState('');

  // Get propgram ID from inpus
  useEffect(() => {
    if (props.isVisible && props.programId) {
      if (isValidAddress(props.programId)) {
        setProgramId(props.programId);
      }
    }
  }, [
    props.programId,
    props.isVisible
  ]);

  // Resolves programDataAddress
  useEffect(() => {

    if (!props.isVisible || !connection || !publicKey || !programId || !isValidAddress(programId)) {
      return;
    }

    const timeout = setTimeout(() => {
      const programAddress = new PublicKey(programId);
      const BPF_LOADER_UPGRADEABLE_PID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
      PublicKey.findProgramAddress(
        [programAddress.toBuffer()],
        BPF_LOADER_UPGRADEABLE_PID
      )
      .then((result: any) => {
        const programDataAddress = result[0];
        setProgramDataAddress(programDataAddress.toBase58());
      })
      .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    programId,
    publicKey,
    connection,
    props.isVisible
  ]);

  const onAcceptModal = () => {
    const params: SetProgramAuthPayload = {
      programAddress: programId,
      programDataAddress: programDataAddress,
      newAuthAddress: newAuthAddress,
    };
    props.handleOk(params);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setProgramId('');
      setProgramDataAddress('');
      setNewAuthAddress('');
      
    }, 50);
    
    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const onProgramChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setProgramId(trimmedValue);
  }

  const onNewAuthChanged = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setNewAuthAddress(trimmedValue);
  }

  const isValidForm = (): boolean => {
    return (
      programId &&
      newAuthAddress &&
      programDataAddress &&
      isValidAddress(programId) &&
      isValidAddress(newAuthAddress) &&
      isValidAddress(programDataAddress)
    )
      ? true
      : false;
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.set-program-authority.modal-title')}</div>}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Program address */}
            <div className="form-label">{t('multisig.upgrade-program.program-address-label')}</div>
            <div className={`well ${props.programId ? 'disabled' : ''}`}>
              <input id="token-address-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onProgramChange}
                placeholder={t('multisig.upgrade-program.program-address-placeholder')}
                required={true}
                spellCheck="false"
                value={programId}/>
              {programId && !isValidAddress(programId) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
            </div>
            {/* New authority address */}
            <div className="form-label">{t('multisig.set-program-authority.new-authority-input-label')}</div>
            <div className="well">
              <input id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onNewAuthChanged}
                placeholder={t('multisig.set-program-authority.new-authority-input-placeholder')}
                required={true}
                spellCheck="false"
                value={newAuthAddress}/>
              {newAuthAddress && !isValidAddress(newAuthAddress) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
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
                    accountBalance: getAmountWithSymbol(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getAmountWithSymbol(
                      props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
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
          props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle 
            ? "panel2 show" 
            : "panel2 hide"
          }>          
        {props.isBusy && transactionStatus !== TransactionStatus.Iddle && (
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
            className={props.isBusy ? 'inactive' : ''}
            onClick={() => isError(transactionStatus.currentOperation)
              ? onAcceptModal()
              : onCloseModal()}>
            {isError(transactionStatus.currentOperation)
              ? t('general.retry')
              : t('general.cta-close')
            }
          </Button>
        </div>
        <div className="col-6">
          <Button
            className={props.isBusy ? 'inactive' : ''}
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
            }}>
            {props.isBusy
              ? t('multisig.set-program-authority.main-cta-busy')
              : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? t('multisig.set-program-authority.main-cta')
                : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                  ? t('general.cta-finish')
                  : t('general.refresh')
            }
          </Button>
        </div>
      </div>

    </Modal>
  );
};
