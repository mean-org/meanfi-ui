import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Modal, Button, Spin, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { getTokenAmountAndSymbolByTokenAddress, isValidNumber } from '../../utils/utils';
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { PublicKey } from '@solana/web3.js';
import { MintLayout } from '@solana/spl-token';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigTransferTokensModal = (props: {
  handleClose: any;
  handleOk: any;
  handleAfterClose: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  vaults: any[]

}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    transactionStatus,
    setTransactionStatus

  } = useContext(AppStateContext);

  const [fromVault, setFromVault] = useState<any>();
  const [fromMint, setFromMint] = useState<any>();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  // Resolves fromVault
  useEffect(() => {

    if (!props.isVisible || !connection || !publicKey || !props.vaults || !props.vaults.length) {
      return;
    }

    const timeout = setTimeout(() => {
      console.log('modal vaults', props.vaults);
      setFromVault(props.vaults[0]);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    props.isVisible,
    props.vaults,
    publicKey
  ]);

  // Resolves fromMint
  useEffect(() => {

    if (!props.isVisible || !connection || !publicKey || !fromVault) {
      return;
    }

    const timeout = setTimeout(() => {
      connection.getAccountInfo(new PublicKey(fromVault.mint))
        .then(info => {
          if (info) {
            console.log('info', info);
            const mintInfo = MintLayout.decode(info.data);
            setFromMint(mintInfo);
          }
        })
        .catch(err => console.error(err));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    fromVault,
    publicKey,
    props.isVisible
  ])

  const onAcceptModal = () => {
    props.handleOk({
      from: fromVault.address.toBase58(),
      amount: +amount,
      to: to
    });
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {

    setTimeout(() => {
      setFromVault(undefined);
      setTo('');
      setAmount('');
    }, 50);

    props.handleAfterClose();
  }

  const onVaultChanged = useCallback((e: any) => {
    
    if (props.vaults && props.vaults.length) {
      consoleOut("vault selected:", e, 'blue');
      const selectedFromVault = props.vaults.filter(v => v.address.toBase58() === e)[0];
      setFromVault(selectedFromVault);
    }

  },[
    props.vaults
  ]);

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
  }

  const onMintAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setAmount('');
    } else if (isValidNumber(newValue)) {
      setAmount(newValue);
    }
  };

  const isValidForm = (): boolean => {
    return (
      fromVault &&
      to &&
      isValidAddress(fromVault.address.toBase58()) &&
      isValidAddress(to) &&
      amount &&
      +amount > 0
    ) ? true : false;
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.transfer-tokens.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Transfer from */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-vault.token-label')}</div>
              <div className={`well ${props.isBusy && 'disabled'}`}>
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on">
                      {props.vaults && props.vaults.length > 0 && fromVault && fromMint && (
                        <Select className={`token-selector-dropdown`} value={fromVault.address.toBase58()}
                            style={{width:400, maxWidth:'none'}}
                            onChange={onVaultChanged} bordered={false} showArrow={false}
                            dropdownRender={menu => (
                            <div>{menu}</div>
                          )}>
                          {props.vaults.map((option: any) => {
                            return (
                              <Option key={option.address.toBase58()} value={option.address.toBase58()}>
                                <div className="option-container">
                                  {/* <TokenDisplay onClick={() => {}}
                                    mintAddress={fromMint.address}
                                    name={option.address.toBase58()}
                                    showCaretDown={false}
                                  /> */}
                                  {option.address.toBase58()}
                                </div>
                              </Option>
                            );
                          })}
                        </Select>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {/* Transfer to */}
            <div className="form-label">{t('multisig.transfer-tokens.transfer-to-label')}</div>
            <div className="well">
              <input id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onMintToAddressChange}
                placeholder={t('multisig.transfer-tokens.transfer-to-placeholder')}
                required={true}
                spellCheck="false"
                value={to}/>
              {to && !isValidAddress(to) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
            </div>
            {/* amount */}
            <div className="form-label">{t('multisig.transfer-tokens.transfer-amount-label')}</div>
            <div className="well">
              <input
                className="general-text-input"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={onMintAmountChange}
                pattern="^[0-9]*$"
                placeholder={t('multisig.transfer-tokens.transfer-amount-placeholder')}
                minLength={1}
                spellCheck="false"
                value={amount}
              />
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.transfer-tokens.success-message')}</h4>
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
              ? t('multisig.transfer-tokens.main-cta-busy')
              : transactionStatus.currentOperation === TransactionStatus.Iddle
                ? t('multisig.transfer-tokens.main-cta')
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
