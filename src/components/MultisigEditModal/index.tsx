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
import { TransactionFees } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { MultisigParticipants } from '../MultisigParticipants';
import { MultisigParticipant } from '../../models/multisig';
import { MAX_MULTISIG_PARTICIPANTS } from '../../constants';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigEditModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  multisigName?: string;
  multisigThreshold?: number;
  multisigParticipants?: MultisigParticipant[];
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);

  const [multisigLabel, setMultisigLabel] = useState('');
  const [multisigThreshold, setMultisigThreshold] = useState(0);
  const [inputOwners, setInputOwners] = useState<MultisigParticipant[] | undefined>(undefined);
  const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);

  // When modal goes visible, get passed-in owners to populate participants component
  // Also get threshold and labe (name)
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
    }
  }, [
    inputOwners,
    props.isVisible,
    props.multisigName,
    props.multisigParticipants,
    props.multisigThreshold
  ]);

  const hasOwnersChanges = useCallback(() => {
    if (inputOwners && multisigOwners) {
      if (JSON.stringify(inputOwners) != JSON.stringify(multisigOwners)) {
        return true;
      }
    }

    return false;
  }, [
    inputOwners,
    multisigOwners
  ]);

  const onAcceptModal = () => {
    props.handleOk({
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

  const onLabelInputValueChange = (e: any) => {
    setMultisigLabel(e.target.value);
  }

  const isFormValid = () => {
    return  multisigThreshold &&
            multisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
            multisigLabel &&
            multisigOwners.length >= multisigThreshold &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid()
      ? true
      : false;
  }

  const isOwnersListValid = () => {
    return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
  }

  const onThresholdInputValueChange = (e: any) => {
    const newValue = e.target.value;
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
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
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
              disabled={props.isBusy}
              onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
            />

            {hasOwnersChanges() && (
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
            <div className="transaction-progress">
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      props.nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
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

      <div className="row two-col-ctas mt-3 transaction-progress">
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
      </div>

    </Modal>
  );
};
