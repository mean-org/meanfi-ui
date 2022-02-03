import React, { useContext } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { AppStateContext } from '../../contexts/appstate';
import { TreasuryTypeOption } from '../../models/treasuries';
import { TransactionStatus } from '../../models/enums';
import { getTransactionOperationDescription } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);

  const onAcceptModal = () => {
    props.handleOk(treasuryName);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTreasuryName('');
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

  const onInputValueChange = (e: any) => {
    setTreasuryName(e.target.value);
  }

  const handleSelection = (option: TreasuryTypeOption) => {
    setTreasuryOption(option);
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('treasuries.create-treasury.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Treasury name */}
            <div className="mb-3">
              <div className="form-label">{t('treasuries.create-treasury.treasury-name-input-label')}</div>
              <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                <div className="flex-fixed-right">
                  <div className="left">
                    <input
                      id="treasury-name-field"
                      className="w-100 general-text-input"
                      autoComplete="off"
                      autoCorrect="off"
                      type="text"
                      maxLength={32}
                      onChange={onInputValueChange}
                      placeholder={t('treasuries.create-treasury.treasury-name-placeholder')}
                      value={treasuryName}
                    />
                  </div>
                </div>
                <div className="form-field-hint">I.e. "My company payroll", "Seed round vesting", etc.</div>
              </div>
            </div>

            {/* Treasury type selector */}
            <div className="items-card-list vertical-scroll">
              {TREASURY_TYPE_OPTIONS.map(option => {
                return (
                  <div key={`${option.translationId}`} className={`item-card ${option.type === treasuryOption?.type
                    ? "selected"
                    : option.disabled
                      ? "disabled"
                      : ""
                  }`}
                  onClick={() => {
                    if (!option.disabled) {
                      handleSelection(option);
                    }
                  }}>
                    <div className="checkmark"><CheckOutlined /></div>
                    <div className="item-meta">
                      <div className="item-name">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-name`)}</div>
                      <div className="item-description">{t(`treasuries.create-treasury.treasury-type-options.${option.translationId}-description`)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('treasuries.create-treasury.success-message')}</h4>
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

      <div className={props.isBusy && transactionStatus.currentOperation !== TransactionStatus.Iddle ? "panel2 show" : "panel2 hide"}>
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

      {/**
       * NOTE: CTAs block may be required or not when Tx status is Finished!
       * I choose to set transactionStatus.currentOperation to TransactionStatus.TransactionFinished
       * and auto-close the modal after 1s. If we chose to NOT auto-close the modal
       * Uncommenting the commented lines below will do it!
       */}
      {transactionStatus.currentOperation !== TransactionStatus.TransactionFinished && (
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
              disabled={!treasuryName}
              onClick={() => {
                if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
                  onAcceptModal();
                // } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
                //   onCloseModal();
                } else {
                  refreshPage();
                }
              }}>
              {/* {props.isBusy && (
                <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
              )} */}
              {props.isBusy
                ? t('treasuries.create-treasury.main-cta-busy')
                : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? t('treasuries.create-treasury.main-cta')
                // : transactionStatus.currentOperation === TransactionStatus.TransactionFinished
                // ? t('general.cta-finish')
                : t('general.refresh')
              }
            </Button>
          </div>
        </div>
      )}

    </Modal>
  );
};
