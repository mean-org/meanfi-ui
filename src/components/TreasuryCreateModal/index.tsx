import React, { useCallback, useContext, useEffect } from 'react';
import { useState } from 'react';
import { Modal, Button, Spin, Radio, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { AppStateContext } from '../../contexts/appstate';
import { TreasuryCreateOptions, TreasuryTypeOption } from '../../models/treasuries';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees, TreasuryType } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress, shortenAddress } from '../../utils/utils';
import { MultisigV2 } from '../../models/multisig';
import { Identicon } from '../Identicon';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const TreasuryCreateModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedMultisig: MultisigV2 | undefined;
  multisigAccounts: MultisigV2[];
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const [treasuryName, setTreasuryName] = useState('');
  const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);
  const [localSelectedMultisig, setLocalSelectedMultisig] = useState<MultisigV2 | undefined>(undefined);
  const [enableMultisigTreasuryOption, setEnableMultisigTreasuryOption] = useState(true);

  // When modal goes visible, preset the appropriate value for multisig treasury switch
  useEffect(() => {
    if (props.isVisible && props.selectedMultisig) {
      setEnableMultisigTreasuryOption(true);
      setLocalSelectedMultisig(props.selectedMultisig);
    } else {
      setEnableMultisigTreasuryOption(false);
      setLocalSelectedMultisig(props.multisigAccounts[0]);
    }
  }, [
    props.isVisible,
    props.selectedMultisig,
    props.multisigAccounts,
  ]);

  const onAcceptModal = () => {
    const options: TreasuryCreateOptions = {
      treasuryName,
      treasuryType: treasuryOption ? treasuryOption.type : TreasuryType.Open,
      multisigId: enableMultisigTreasuryOption && localSelectedMultisig ? localSelectedMultisig.id.toBase58() : ''
    };
    props.handleOk(options);
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

  const onCloseTreasuryOptionChanged = (e: any) => {
    setEnableMultisigTreasuryOption(e.target.value);
  }

  const onMultisigChanged = useCallback((e: any) => {
    
    if (props.multisigAccounts && props.multisigAccounts.length > 0) {
      consoleOut("multisig selected:", e, 'blue');
      const ms = props.multisigAccounts.filter(v => v.id.toBase58() === e)[0];
      setLocalSelectedMultisig(ms);
    }

  },[
    props.multisigAccounts
  ]);

  const renderMultisigSelectItems = () => {
    return (
      <div className="flex-fixed-left">
        <div className="left">
          <span className="add-on">
            {(props.multisigAccounts && props.multisigAccounts.length > 0) && (
              <Select className={`token-selector-dropdown auto-height`} value={localSelectedMultisig ? localSelectedMultisig.id.toBase58() : undefined}
                  style={{width:400, maxWidth:'none'}}
                  onChange={onMultisigChanged} bordered={false} showArrow={false}>
                {props.multisigAccounts.map((option: MultisigV2) => {
                  return (
                    <Option key={option.id.toBase58()} value={option.id.toBase58()}>
                      <div className="option-container">
                        <div className={`transaction-list-row w-100`}>
                          <div className="icon-cell">
                            <Identicon address={option.id} style={{ width: "30", display: "inline-flex" }} />
                          </div>
                          <div className="description-cell">
                            <div className="title text-truncate">
                              {option.label}
                            </div>
                            <div className="subtitle text-truncate">{shortenAddress(option.address.toBase58(), 8)}</div>
                          </div>
                          <div className="description-cell text-right">
                            <div className="subtitle">
                            {
                              t('multisig.multisig-accounts.pending-transactions', {
                                txs: option.pendingTxsAmount
                              })
                            }
                            </div>
                          </div>
                        </div>
                      </div>
                    </Option>
                  );
                })}
              </Select>
            )}
          </span>
        </div>
      </div>
    );
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

            {/* Multisig Treasury checkbox */}
            {props.multisigAccounts.length > 0 && (
              <div className="mb-2 flex-row align-items-center">
                <span className="form-label w-auto mb-0">{t('treasuries.create-treasury.multisig-treasury-switch-label')}</span>
                {/* <a className="simplelink" href="https://docs.meanfi.com/" target="_blank" rel="noopener noreferrer">
                  <Button
                    className="info-icon-button"
                    type="default"
                    shape="circle">
                    <InfoCircleOutlined />
                  </Button>
                </a> */}
                <Radio.Group className="ml-2" onChange={onCloseTreasuryOptionChanged} value={enableMultisigTreasuryOption}>
                  <Radio value={true}>{t('general.yes')}</Radio>
                  <Radio value={false}>{t('general.no')}</Radio>
                </Radio.Group>
              </div>
            )}

            {(enableMultisigTreasuryOption && props.multisigAccounts.length > 0) && (
              <>
                <div className="mb-3">
                  <div className="form-label">{t('treasuries.create-treasury.multisig-selector-label')}</div>
                  <div className="well">
                    {renderMultisigSelectItems()}
                  </div>
                </div>
              </>
            )}

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
                  ? enableMultisigTreasuryOption && props.multisigAccounts.length > 0
                    ? t('treasuries.create-treasury.create-multisig-cta')
                    : t('treasuries.create-treasury.main-cta')
                  : t('general.refresh')
              }
            </Button>
          </div>
        </div>
      )}

    </Modal>
  );
};
