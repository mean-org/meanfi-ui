import React, { useCallback, useContext, useEffect, useState } from 'react';
import './style.scss';
import { Modal, Button, Spin, Select } from 'antd';
import { useTranslation } from 'react-i18next';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { AppStateContext } from '../../contexts/appstate';
import { TransactionStatus } from '../../models/enums';
import { consoleOut, getTransactionOperationDescription, isValidAddress } from '../../utils/ui';
import { isError } from '../../utils/transactions';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionFees } from '@mean-dao/money-streaming';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, isValidNumber, shortenAddress, toUiAmount } from '../../utils/utils';
import { useConnection } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { PublicKey } from '@solana/web3.js';
import { MintLayout } from '@solana/spl-token';
import { MultisigVault } from '../../models/multisig';
import { FALLBACK_COIN_IMAGE } from '../../constants';
import { Identicon } from '../Identicon';
import { BN } from 'bn.js';

const { Option } = Select;
const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigTransferTokensModal = (props: {
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  isBusy: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  selectedVault: MultisigVault | undefined;
  assets: MultisigVault[]
}) => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const { publicKey } = useWallet();
  const {
    selectedToken,
    loadingPrices,
    effectiveRate,
    transactionStatus,
    getTokenByMintAddress,
    refreshPrices,
  } = useContext(AppStateContext);

  const [fromVault, setFromVault] = useState<MultisigVault>();
  const [fromMint, setFromMint] = useState<any>();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  // Resolves fromVault
  useEffect(() => {

    if (!props.isVisible || !connection || !publicKey || !props.assets || props.assets.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      const asset = props.selectedVault || props.assets[0];
      consoleOut('From asset:', asset, 'blue');
      setFromVault(asset);
    });

    return () => clearTimeout(timeout);

  }, [
    publicKey,
    connection,
    props.assets,
    props.isVisible,
    props.selectedVault,
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
            consoleOut('info:', info, 'blue');
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
      from: fromVault ? fromVault.address.toBase58() : '',
      amount: +amount,
      to: to
    });
  }

  const onCloseModal = () => {
    consoleOut('onCloseModal called!', '', 'crimson');
    props.handleClose();
  }

  const onVaultChanged = useCallback((e: any) => {
    
    if (props.assets && props.assets.length) {
      consoleOut("asset selected:", e, 'blue');
      const selectedFromVault = props.assets.filter(v => v.address.toBase58() === e)[0];
      setFromVault(selectedFromVault);
    }

  },[
    props.assets
  ]);

  const onMintToAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    const trimmedValue = inputValue.trim();
    setTo(trimmedValue);
  }

  const onMintAmountChange = (e: any) => {

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
      setAmount('');
    } else if (isValidNumber(newValue)) {
      setAmount(newValue);
    }
  };

  const isValidForm = (): boolean => {
    return (
      fromVault && fromMint &&
      to &&
      isValidAddress(fromVault.address.toBase58()) &&
      isValidAddress(to) &&
      amount &&
      +amount > 0 &&
      +amount <= toUiAmount(fromVault.amount, fromMint.decimals || 6)
    ) ? true : false;
  }

  const refreshPage = () => {
    props.handleClose();
    window.location.reload();
  }

  // Handler paste clipboard data
  const pasteHandler = (e: any) => {
    const getClipBoardData = e.clipboardData.getData('Text');
    const replaceCommaToDot = getClipBoardData.replace(",", "")
    const onlyNumbersAndDot = replaceCommaToDot.replace(/[^.\d]/g, '');

    console.log(onlyNumbersAndDot);
    

    setAmount(onlyNumbersAndDot.trim());
  }

  return (
    <Modal
      className="mean-modal simple-modal"
      title={<div className="modal-title">{t('multisig.transfer-tokens.modal-title')}</div>}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={onAcceptModal}
      onCancel={onCloseModal}
      width={props.isBusy || transactionStatus.currentOperation !== TransactionStatus.Iddle ? 380 : 480}>

      <div className={!props.isBusy ? "panel1 show" : "panel1 hide"}>

        {transactionStatus.currentOperation === TransactionStatus.Iddle ? (
          <>
            {/* Amount to transfer */}
            <div className="mb-3">
              <div className="form-label">{t('multisig.create-asset.token-label')}</div>
                <div className={`well ${props.isBusy ? 'disabled' : ''}`}>
                  {props.assets && props.assets.length > 0 && fromVault && fromMint && (
                    <>
                      <div className="info-label mb-0">
                        <div className="subtitle text-truncate">{shortenAddress(fromVault.address.toBase58(), 8)}</div>
                      </div>

                      <div className="flex-fixed-left transfer-proposal-select mt-0">
                      <div className="left">
                        <span className="add-on">
                          {props.assets && props.assets.length > 0 && fromVault && fromMint && (
                            <Select className={`token-selector-dropdown auto-height`} value={fromVault.address.toBase58()}
                              style={{width:"100%", maxWidth:'none'}}
                              onChange={onVaultChanged}
                              bordered={false}
                              showArrow={false}
                              dropdownRender={menu => (
                              <div>{menu}</div>
                            )}>
                              {props.assets.map((option: MultisigVault) => {
                                const token = getTokenByMintAddress(option.mint.toBase58());
                                const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                                  event.currentTarget.src = FALLBACK_COIN_IMAGE;
                                  event.currentTarget.className = "error";
                                };
                                return (
                                  <Option key={option.address.toBase58()} value={option.address.toBase58()}>
                                    <div className="option-container">
                                      <div className="transaction-list-row w-100">
                                        <div className="icon-cell">
                                          <div className="token-icon">
                                            {token && token.logoURI ? (
                                              <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                                            ) : (
                                              <Identicon address={option.mint.toBase58()} style={{
                                                width: "28px",
                                                display: "inline-flex",
                                                height: "26px",
                                                overflow: "hidden",
                                                borderRadius: "50%"
                                              }} />
                                            )}
                                          </div>
                                        </div>
                                        <div className="description-cell">
                                          <div className="title text-truncate">{token ? token.symbol : `${shortenAddress(option.mint.toBase58(), 4)}`}</div>
                                        </div>
                                        <div className="rate-cell">
                                          <div className="rate-amount text-uppercase">
                                            {getTokenAmountAndSymbolByTokenAddress(
                                              toUiAmount(new BN(option.amount), token?.decimals || 6),
                                              token ? token.address as string : '',
                                              true
                                            )}
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
                      <div className="right">
                        <input
                          className="general-text-input text-right"
                          inputMode="decimal"
                          autoComplete="off"
                          autoCorrect="off"
                          type="text"
                          onChange={onMintAmountChange}
                          pattern="^[0-9]*[.,]?[0-9]*$"
                          placeholder="0.0"
                          minLength={1}
                          maxLength={79}
                          spellCheck="false"
                          onPaste={pasteHandler}
                          value={amount}
                        />
                      </div>
                    </div>

                    <div className="flex-fixed-right">
                      <div className="left inner-label">
                        <span>{t('transactions.send-amount.label-right')}:</span>
                          <span>
                            {getTokenAmountAndSymbolByTokenAddress(
                              toUiAmount(new BN(fromVault.amount), fromVault?.decimals || 6),
                              fromVault ? fromVault.address.toBase58() as string : '',
                              true
                            )}
                        </span>
                      </div>

                      <div className="right inner-label">
                        <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                          ~${amount && effectiveRate
                            ? formatAmount(parseFloat(amount) * effectiveRate, 2)
                            : "0.00"}
                        </span>
                      </div>
                    </div>
                    {(fromVault && fromMint) && (
                      <>
                      {
                        +amount > toUiAmount(fromVault.amount, fromMint.decimals || 6) ? (
                          <span className="form-field-error">
                            {t('multisig.multisig-assets.validation-amount-high')}
                          </span>
                        ) : (null)
                      }
                      </>
                    )}
                  </>
                )}
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

            {/* explanatory paragraph */}
            <p>{t("multisig.multisig-assets.explanatory-paragraph")}</p>
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
                className={`extra-height ${props.isBusy ? 'inactive' : ''}`}
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
                    ? t('multisig.multisig-assets.main-cta')
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
