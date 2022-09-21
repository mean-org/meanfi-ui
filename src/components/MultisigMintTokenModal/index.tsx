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
import { formatThousands, getAmountWithSymbol, isValidNumber, shortenAddress } from '../../middleware/utils';
import { MintTokensInfo, MultisigMint } from '../../models/multisig';
import { Identicon } from '../Identicon';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigMintTokenModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedMint: MultisigMint | undefined;
}) => {
  const { t } = useTranslation('common');
  const {
    transactionStatus,
  } = useContext(AppStateContext);
  const [tokenAddress, setTokenAddress] = useState('');
  const [mintToAddress, setMintToAddress] = useState('');
  const [mintAmount, setMintAmount] = useState('');

  // Store selectedMint address when modal goes visible
  useEffect(() => {
    if (props.isVisible && props.selectedMint) {
      setTokenAddress(props.selectedMint.address.toBase58());
    }
  }, [
    props.isVisible,
    props.selectedMint
  ]);

  const onAcceptModal = () => {
    props.handleOk({
      tokenAddress: tokenAddress,
      amount: +mintAmount,
      mintTo: mintToAddress
    } as MintTokensInfo);
  }

  const onCloseModal = () => {
    props.handleClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setTokenAddress('');
      setMintToAddress('');
      setMintAmount('');
    }, 50);
  }

  const onTokenAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTokenAddress(trimmedValue);
  }

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setMintToAddress(trimmedValue);
  }

  const onMintAmountChange = (e: any) => {
    let newValue = e.target.value;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];
    if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }
    if (newValue === null || newValue === undefined || newValue === "") {
      setMintAmount('');
    } else if (isValidNumber(newValue)) {
      setMintAmount(newValue);
    }
  };

  const isValidForm = (): boolean => {
    return tokenAddress &&
            mintToAddress &&
            isValidAddress(tokenAddress) &&
            isValidAddress(mintToAddress) &&
            mintAmount &&
            parseFloat(mintAmount) > 0
      ? true
      : false;
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  const renderMint = (item: MultisigMint) => {
    return (
      <div className="transaction-list-row no-pointer">
        <div className="icon-cell">
          <div className="token-icon">
            <Identicon address={item.address} style={{
              width: "28px",
              display: "inline-flex",
              height: "26px",
              overflow: "hidden",
              borderRadius: "50%"
            }} />
          </div>
        </div>
        <div className="description-cell">
          <div className="title text-truncate">{shortenAddress(item.address, 8)}</div>
          <div className="subtitle text-truncate">decimals: {item.decimals}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount text-uppercase">{formatThousands(item.supply, item.decimals)}</div>
          <div className="interval">supply</div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.mint-tokens.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      open={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Token address */}
            {/* <div className="form-label">{t('multisig.mint-tokens.token-address-label')}</div>
            <div className="well">
              <input id="token-address-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onTokenAddressChange}
                placeholder={t('multisig.mint-tokens.token-address-placeholder')}
                required={true}
                spellCheck="false"
                value={tokenAddress}/>
              {tokenAddress && !isValidAddress(tokenAddress) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
            </div> */}

            {props.selectedMint && (
              <div className="mb-3">
                <div className="form-label">{t('multisig.multisig-mints.selected-mint-label')}</div>
                <div className="well">
                  {renderMint(props.selectedMint)}
                </div>
              </div>
            )}

            {/* Mint To Address */}
            <div className="form-label">{t('multisig.mint-tokens.mint-to-label')}</div>
            <div className="well">
              <input id="mint-to-field"
                className="general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                onChange={onMintToAddressChange}
                placeholder={t('multisig.mint-tokens.mint-to-placeholder')}
                required={true}
                spellCheck="false"
                value={mintToAddress}/>
              {mintToAddress && !isValidAddress(mintToAddress) && (
                <span className="form-field-error">
                  {t('transactions.validation.address-validation')}
                </span>
              )}
            </div>
            {/* Mint amount */}
            <div className="form-label">{t('multisig.mint-tokens.mint-amount-label')}</div>
            <div className="well">
              <input
                className="general-text-input"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={onMintAmountChange}
                pattern="^[0-9]*$"
                placeholder={t('multisig.mint-tokens.mint-amount-placeholder')}
                minLength={1}
                spellCheck="false"
                value={mintAmount}
              />
            </div>
          </>
        ) : transactionStatus.currentOperation === TransactionStatus.TransactionFinished ? (
          <>
            <div className="transaction-progress">
              <CheckOutlined style={{ fontSize: 48 }} className="icon mt-0" />
              <h4 className="font-bold">{t('multisig.mint-tokens.success-message')}</h4>
            </div>
          </>
        ) : (
          <>
            <div className="transaction-progress p-0">
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
                  ? t('multisig.mint-tokens.main-cta-busy')
                  : transactionStatus.currentOperation === TransactionStatus.Iddle
                    ? t('multisig.mint-tokens.main-cta')
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
