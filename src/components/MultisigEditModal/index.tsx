import React, { useCallback, useContext, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { MultisigParticipants } from '../MultisigParticipants';
import { MultisigParticipant, MultisigTransactionFees, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { MAX_MULTISIG_PARTICIPANTS } from '../../constants';
import { InputMean } from '../InputMean';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigEditModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: MultisigTransactionFees;
  multisigName?: string;
  multisigThreshold?: number;
  multisigAccounts: MultisigInfo[];
  multisigParticipants?: MultisigParticipant[];
  multisigPendingTxsAmount: number;
}) => {
  const { t } = useTranslation('common');
  const {
    selectedToken,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const [multisigTitle, setMultisigTitle] = useState('');
  const [multisigLabel, setMultisigLabel] = useState('');
  const [multisigThreshold, setMultisigThreshold] = useState(0);
  const [inputOwners, setInputOwners] = useState<MultisigParticipant[] | undefined>(undefined);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
  const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);

  // When modal goes visible, get passed-in owners to populate participants component
  // Also get threshold and label (name)
  useEffect(() => {
    if (props.isVisible) {
      if (props.multisigName) {
        setMultisigLabel(props.multisigName);
      }
      if (props.multisigThreshold) {
        setMultisigThreshold(props.multisigThreshold);
      }
      if (props.multisigParticipants && props.multisigParticipants.length > 0) {
        setMultisigOwners(props.multisigParticipants);
      }
      if (inputOwners === undefined) {
        setInputOwners(props.multisigParticipants);
      }
      if (props.multisigAccounts && props.multisigAccounts.length > 0) {
        const msAddresses = props.multisigAccounts.map(ms => ms.id.toBase58());
        setMultisigAddresses(msAddresses);
      }
    }
  }, [
    inputOwners,
    props.isVisible,
    props.multisigName,
    props.multisigAccounts,
    props.multisigThreshold,
    props.multisigParticipants,
  ]);

  const hasOwnersChanges = useCallback(() => {
    if (inputOwners && multisigOwners) {
      if (JSON.stringify(inputOwners) !== JSON.stringify(multisigOwners)) {
        return true;
      }
    }

    return false;
  }, [
    inputOwners,
    multisigOwners
  ]);

  const isFormDirty = useCallback(() => {
    return multisigLabel !== props.multisigName ||
           multisigThreshold !== props.multisigThreshold ||
           hasOwnersChanges()
  }, [
    multisigLabel,
    multisigThreshold,
    props.multisigName,
    props.multisigThreshold,
    hasOwnersChanges,
  ]);

  const onAcceptModal = () => {
    props.handleOk({
      title: multisigTitle,
      label: multisigLabel,
      threshold: multisigThreshold,
      owners: multisigOwners
    });
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setMultisigTitle('');
      setMultisigLabel('');
      setMultisigThreshold(0);
      setMultisigOwners([]);

    }, 50);

    setTransactionStatus({
        lastOperation: TransactionStatus.Iddle,
        currentOperation: TransactionStatus.Iddle
    });
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const onTitleInputValueChange = (e: any) => {
    setMultisigTitle(e.target.value);
  }
  
  const onLabelInputValueChange = (e: any) => {
    setMultisigLabel(e.target.value);
  }

  const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
    const items = arr.map(i => i.address);
    return new Set(items).size === items.length ? true : false;
  }

  const isFormValid = () => {
    return  multisigThreshold &&
            multisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
            multisigTitle &&
            multisigLabel &&
            multisigOwners.length >= multisigThreshold &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid() &&
            noDuplicateExists(multisigOwners)
      ? true
      : false;
  }

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  }

  const onThresholdInputValueChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setMultisigThreshold(0);
    } else if (isValidNumber(newValue)) {
      setMultisigThreshold(+newValue);
    }
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.update-multisig.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Proposal title */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.proposal-modal.title')}</div>
              <InputMean
                id="proposal-title-field"
                name="Title"
                className="w-100 general-text-input"
                onChange={onTitleInputValueChange}
                placeholder="Add a proposal title (required)"
                value={multisigTitle}
              />
            </div>

            {/* Multisig label */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-multisig.multisig-label-input-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="multisig-label-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      maxLength={32}
                      onChange={onLabelInputValueChange}
                      placeholder={t('multisig.create-multisig.multisig-label-placeholder')}
                      value={multisigLabel}
                    />
                  </div>
                </div>
                <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
              </div>
            </div>

            {/* Multisig threshold */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-multisig.multisig-threshold-input-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="multisig-threshold-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      pattern="^[0-9]*$"
                      onChange={onThresholdInputValueChange}
                      placeholder={t('multisig.create-multisig.multisig-threshold-placeholder')}
                      value={multisigThreshold}
                    />
                  </div>
                </div>
                {!multisigThreshold || +multisigThreshold < 1 ? (
                  <span className="form-field-error">
                    {t('multisig.create-multisig.multisig-threshold-input-empty')}
                  </span>
                ) : multisigThreshold > MAX_MULTISIG_PARTICIPANTS ? (
                  <span className="form-field-error">
                    {t('multisig.create-multisig.multisig-threshold-input-max')}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Multisig Owners selector */}
            <MultisigParticipants
              participants={multisigOwners}
              label={
                t('multisig.create-multisig.multisig-participants', {
                  numParticipants: multisigOwners.length,
                  maxParticipants: MAX_MULTISIG_PARTICIPANTS
                })
              }
              multisigAddresses={multisigAddresses}
              disabled={props.isBusy}
              onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
            />

            {isFormDirty() && props.multisigPendingTxsAmount > 0 && (
              <div className="font-size-100 fg-orange-red pl-1">{t('multisig.update-multisig.edit-not-allowed-message')}</div>
            )}

          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.update-multisig.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      props.transactionFees.networkFee + props.transactionFees.multisigFee + props.transactionFees.rentExempt,
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
        className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
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

      {!(props.isBusy && transactionStatus !== TransactionStatus.Iddle) && (
        <div className="row two-col-ctas mt-3 transaction-progress p-0">
          <div className={!isError(transactionStatus.currentOperation) ? "col-6" : "col-12"}>
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
          {!isError(transactionStatus.currentOperation) && (
            <div className="col-6">
              <Button
                className={props.isBusy ? 'inactive' : ''}
                block
                type="primary"
                shape="round"
                size="middle"
                disabled={!isFormValid()}
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
                  ? t('multisig.update-multisig.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? t('multisig.update-multisig.main-cta')
                    : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                      ? t('general.cta-finish')
                      : t('general.refresh')
                }
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
