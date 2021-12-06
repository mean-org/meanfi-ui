import React, { useCallback, useEffect, useMemo } from 'react';
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, AutoComplete, DatePicker, Checkbox } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, getTxIxResume, isValidNumber, shortenAddress } from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import { consoleOut, disabledDate, getFormattedNumberToLocale, getIntervalFromSeconds, getPaymentRateOptionLabel, getRateIntervalInSeconds, getShortDate, getTransactionStatusForLogs, isToday, isValidAddress, PaymentRateTypeOption } from '../../utils/ui';
import { getTokenByMintAddress } from '../../utils/tokens';
import { LoadingOutlined, QrcodeOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { IconCaretDown, IconDownload, IconEdit, IconIncomingPaused, IconOutgoingPaused, IconTimer, IconUpload } from '../../Icons';
import { SelectOption } from '../../models/common-types';
import { AllocationType, OperationType, PaymentRateType, TransactionStatus } from '../../models/enums';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import moment from "moment";
import { useWallet } from '../../contexts/wallet';
import { StepSelector } from '../StepSelector';
import { DATEPICKER_FORMAT } from '../../constants';
import { Identicon } from '../Identicon';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { customLogger } from '../..';

const { Option } = Select;

export const TreasuryStreamCreateModal = (props: {
  associatedToken: string;
  connection: Connection;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  moneyStreamingClient: MoneyStreaming;
  nativeBalance: number;
  transactionFees: TransactionFees;
  treasuryDetails: TreasuryInfo | undefined;
  userBalances: any;
}) => {
  const { t } = useTranslation('common');
  const { wallet, publicKey, connected } = useWallet();
  const {
    tokenList,
    coinPrices,
    tokenBalance,
    selectedToken,
    effectiveRate,
    treasuryOption,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    isVerifiedRecipient,
    streamProgramAddress,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    setFromCoinAmount,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    refreshTokenBalance,
    setPaymentRateAmount,
    setTransactionStatus,
    setForceReloadTokens,
    setIsVerifiedRecipient,
    setPaymentRateFrequency,
    setSelectedTokenBalance,
  } = useContext(AppStateContext);
  const {
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
  } = useContext(TransactionStatusContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  /////////////////
  //   Getters   //
  /////////////////

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const getOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getPaymentRateOptionLabel(mappedValue, t)
            );
            options.push(item);
        }
        index++;
    }
    return options;
  }

  const getStepOneContinueButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.select-recipient')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : t('transactions.validation.valid-continue');
  }

  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.select-recipient')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(fromCoinAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : t('transactions.validation.valid-approve');
  }

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? t('transactions.validation.no-payment-rate')
      : rateAmount > tokenBalance
      ? t('transactions.validation.payment-rate-high')
      : '';
  }

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (props.isVisible && props.associatedToken) {
      const token = tokenList.find(t => t.address === props.associatedToken);
      if (token && token.address !== selectedToken?.address) {
        setSelectedToken(token);
      }
    }
  }, [
    tokenList,
    selectedToken,
    props.isVisible,
    props.associatedToken,
    setSelectedToken
  ]);

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  const handleRecipientAddressChange = (e: any) => {
    const inputValue = e.target.value as string;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setRecipientAddress(trimmedValue);
  }

  const handleRecipientAddressFocusIn = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleRecipientAddressFocusOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (newValue === '.') {
      setPaymentRateAmount(".");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  }

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getPricePerToken(token as TokenInfo));
    }
  }

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && props.treasuryDetails) {
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const beneficiary = new PublicKey(recipientAddress as string);
        const beneficiaryMint = new PublicKey(selectedToken?.address as string);
        const treasury = new PublicKey(props.treasuryDetails.id as string);
        const fundingAmount = parseFloat(fromCoinAmount as string);
        const rateAmount = parseFloat(paymentRateAmount as string);
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        const fromParsedDate = new Date(parsedDate);
        fromParsedDate.setHours(now.getHours());
        fromParsedDate.setMinutes(now.getMinutes());
        fromParsedDate.setSeconds(now.getSeconds());
        fromParsedDate.setMilliseconds(now.getMilliseconds());

        // Create a transaction
        const data = {
          wallet: publicKey.toBase58(),                               // wallet
          treasury: props.treasuryDetails.id,                         // treasury
          beneficiary: beneficiary.toBase58(),                        // beneficiary
          beneficiaryMint: beneficiaryMint.toBase58(),                // beneficiaryMint
          rateAmount: rateAmount,                                     // rateAmount
          rateIntervalInSeconds:
            getRateIntervalInSeconds(paymentRateFrequency),           // rateIntervalInSeconds
          startUtc: fromParsedDate,                                   // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          fundingAmount: fundingAmount                                // fundingAmount
        };
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', props.nativeBalance, 'blue');
        if (props.nativeBalance < props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(props.nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(props.transactionFees.blockchainFee + props.transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        }

        return await props.moneyStreamingClient.createStream(
          publicKey,                                                  // wallet
          treasury,                                                   // treasury
          beneficiary,                                                // beneficiary
          beneficiaryMint,                                            // beneficiaryMint
          rateAmount,                                                 // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),             // rateIntervalInSeconds
          fromParsedDate,                                             // startUtc
          recipientNote 
            ? recipientNote.trim()
            : undefined,                                              // streamName
            fundingAmount                                             // fundingAmount
        )
        .then(value => {
          consoleOut('createStream returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await props.connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.Create);
            setIsBusy(false);
            // TODO: cerrar esta talla
            // handleGoToStreamsClick();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && publicKey && recipientAddress === publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return connected &&
           selectedToken &&
           tokenBalance &&
           fromCoinAmount && parseFloat(fromCoinAmount) > 0 &&
           parseFloat(fromCoinAmount) <= tokenBalance
            ? true
            : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return isSendAmountValid() && paymentStartDate ? true : false;
  }

  const arePaymentSettingsValid = (): boolean => {
    let result = true;
    if (!paymentStartDate) {
      return false;
    }
    const rateAmount = parseFloat(paymentRateAmount || '0');
    if (!rateAmount) {
      result = false;
    }

    return result;
  }

  ///////////////
  // Rendering //
  ///////////////

  const paymentRateOptionsMenu = (
    <Menu>
      {getOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handlePaymentRateOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );

  return (
    <Modal
      className="mean-modal"
      title={<div className="modal-title">{t('treasuries.add-funds.modal-title')}</div>}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={props.handleClose}
      width={480}>
      <div>
        <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

        <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

          <div className="form-label">{t('transactions.recipient.label')}</div>
          <div className="well">
            <div className="flex-fixed-right">
              <div className="left position-relative">
                <span className="recipient-field-wrapper">
                  <input id="payment-recipient-field"
                    className="general-text-input"
                    autoComplete="on"
                    autoCorrect="off"
                    type="text"
                    onFocus={handleRecipientAddressFocusIn}
                    onChange={handleRecipientAddressChange}
                    onBlur={handleRecipientAddressFocusOut}
                    placeholder={t('transactions.recipient.placeholder')}
                    required={true}
                    spellCheck="false"
                    value={recipientAddress}/>
                  <span id="payment-recipient-static-field"
                        className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                    {recipientAddress || t('transactions.recipient.placeholder')}
                  </span>
                </span>
              </div>
              <div className="right">
                <div className="add-on simplelink" onClick={() => {}}>
                  <QrcodeOutlined />
                </div>
              </div>
            </div>
            {
              recipientAddress && !isValidAddress(recipientAddress) ? (
                <span className="form-field-error">
                  {t("transactions.validation.address-validation")}
                </span>
              ) : isAddressOwnAccount() ? (
                <span className="form-field-error">
                  {t('transactions.recipient.recipient-is-own-account')}
                </span>
              ) : (null)
            }
          </div>

          <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {(selectedToken && tokenList) && (
                    <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}>
                      {tokenList.map((option) => {
                        return (
                          <Option key={option.address} value={option.address}>
                            <div className="option-container">
                              <TokenDisplay onClick={() => {}}
                                mintAddress={option.address}
                                name={option.name}
                                showCaretDown={props.associatedToken ? false : true}
                              />
                              <div className="balance">
                                {props.userBalances && props.userBalances[option.address] > 0 && (
                                  <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                )}
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
                  onChange={handlePaymentRateAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={paymentRateAmount}
                />
              </div>
            </div>
            <div className="flex-fixed-right">
              <div className="left inner-label">
                <span>{t('transactions.send-amount.label-right')}:</span>
                <span>
                  {`${tokenBalance && selectedToken
                      ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                      : "0"
                  }`}
                </span>
              </div>
              <div className="right inner-label">&nbsp;</div>
            </div>
          </div>

          <div className="form-label">{t('transactions.rate-and-frequency.rate-label')}</div>
          <div className="well">
            <Dropdown
              overlay={paymentRateOptionsMenu}
              trigger={["click"]}>
              <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                <div className="left">
                  <span className="capitalize-first-letter">{getPaymentRateOptionLabel(paymentRateFrequency, t)}{" "}</span>
                </div>
                <div className="right">
                  <IconCaretDown className="mean-svg-icons" />
                </div>
              </span>
            </Dropdown>
          </div>

          <div className="form-label">{t('transactions.send-date.label')}</div>
          <div className="well">
            <div className="flex-fixed-right">
              <div className="left static-data-field">
                {isToday(paymentStartDate || '')
                  ? `${paymentStartDate} (${t('common:general.now')})`
                  : `${paymentStartDate}`}
              </div>
              <div className="right">
                <div className="add-on simplelink">
                  <DatePicker
                    size="middle"
                    bordered={false}
                    className="addon-date-picker"
                    aria-required={true}
                    allowClear={false}
                    disabledDate={disabledDate}
                    placeholder={t('transactions.send-date.placeholder')}
                    onChange={(value, date) => handleDateChange(date)}
                    value={moment(
                      paymentStartDate,
                      DATEPICKER_FORMAT
                    )}
                    format={DATEPICKER_FORMAT}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="form-label">{t('transactions.memo2.label')}</div>
          <div className="well">
            <div className="flex-fixed-right">
              <div className="left">
                <input
                  id="payment-memo-field"
                  className="w-100 general-text-input"
                  autoComplete="on"
                  autoCorrect="off"
                  type="text"
                  onChange={handleRecipientNoteChange}
                  placeholder={t('transactions.memo2.placeholder')}
                  spellCheck="false"
                  value={recipientNote}
                />
              </div>
            </div>
          </div>

          <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            onClick={onContinueButtonClick}
            disabled={!connected || !isValidAddress(recipientAddress) || isAddressOwnAccount() || !arePaymentSettingsValid()}>
            {getStepOneContinueButtonLabel()}
          </Button>

        </div>

        <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>

          {publicKey && recipientAddress && (
            <>
              <div className="flex-fixed-right">
                <div className="left">
                  <div className="form-label">{t('transactions.resume')}</div>
                </div>
                <div className="right">
                  <span className="flat-button change-button" onClick={() => setCurrentStep(0)}>
                    <IconEdit className="mean-svg-icons" />
                    <span>{t('general.cta-change')}</span>
                  </span>
                </div>
              </div>
              <div className="well">
                <div className="three-col-flexible-middle">
                  <div className="left flex-row">
                    <div className="flex-center">
                      <Identicon
                        address={isValidAddress(recipientAddress) ? recipientAddress : NATIVE_SOL_MINT.toBase58()}
                        style={{ width: "30", display: "inline-flex" }} />
                    </div>
                    <div className="flex-column pl-3">
                      <div className="address">
                        {publicKey && isValidAddress(recipientAddress)
                          ? shortenAddress(recipientAddress)
                          : t('transactions.validation.no-recipient')}
                      </div>
                      <div className="inner-label mt-0">{recipientNote || '-'}</div>
                    </div>
                  </div>
                  <div className="middle flex-center">
                    <div className="vertical-bar"></div>
                  </div>
                  <div className="right flex-column">
                    <div className="rate">
                      {selectedToken
                        ? getTokenAmountAndSymbolByTokenAddress(parseFloat(paymentRateAmount), selectedToken.address)
                        : '-'
                      }
                      {getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)}
                    </div>
                    <div className="inner-label mt-0">{paymentStartDate}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* <div className="mb-3 text-center">
            <div>{t('transactions.transaction-info.add-funds-repeating-payment-advice')}.</div>
            <div>{t('transactions.transaction-info.min-recommended-amount')}: <span className="fg-red">{getRecommendedFundingAmount()}</span></div>
          </div> */}

          <div className="form-label">{t('transactions.send-amount.label-amount')}</div>
          <div className="well">
            <div className="flex-fixed-left">
              <div className="left">
                <span className="add-on">
                  {(selectedToken && tokenList) && (
                    <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                            onChange={onTokenChange} bordered={false} showArrow={false}>
                      {tokenList.map((option) => {
                        return (
                          <Option key={option.address} value={option.address}>
                            <div className="option-container">
                              <TokenDisplay onClick={() => {}}
                                mintAddress={option.address}
                                name={option.name}
                                showCaretDown={props.associatedToken ? false : true}
                              />
                              <div className="balance">
                                {props.userBalances && props.userBalances[option.address] > 0 && (
                                  <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                )}
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
                  onChange={handleFromCoinAmountChange}
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.0"
                  minLength={1}
                  maxLength={79}
                  spellCheck="false"
                  value={fromCoinAmount}
                />
              </div>
            </div>
            <div className="flex-fixed-right">
              <div className="left inner-label">
                <span>{t('transactions.send-amount.label-right')}:</span>
                <span>
                  {`${tokenBalance && selectedToken
                      ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                      : "0"
                  }`}
                </span>
              </div>
              <div className="right inner-label">
                ~${fromCoinAmount && effectiveRate
                  ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                  : "0.00"}
              </div>
            </div>
          </div>

          <div className="mb-2">
            <Checkbox onChange={onIsVerifiedRecipientChange}>{t('transactions.verified-recipient-label')}</Checkbox>
          </div>

          <Button
            className={`main-cta ${isBusy ? 'inactive' : ''}`}
            block
            type="primary"
            shape="round"
            size="large"
            onClick={onTransactionStart}
            disabled={!connected || !isValidAddress(recipientAddress) || isAddressOwnAccount() || !arePaymentSettingsValid() || !areSendAmountSettingsValid() || !isVerifiedRecipient}>
            {isBusy && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            )}
            {isBusy
              ? t('treasuries.add-funds.main-cta-busy')
              : getTransactionStartButtonLabel()}
          </Button>
        </div>

      </div>

      {/* <div className="mb-3">
        <div className="form-label">{t('treasuries.add-funds.label')}</div>
        <div className={`well ${isBusy && 'disabled'}`}>
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on">
                {(selectedToken && tokenList) && (
                  <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address}
                          onChange={onTokenChange} bordered={false} showArrow={false}>
                    {tokenList.map((option) => {
                      return (
                        <Option key={option.address} value={option.address}>
                          <div className="option-container">
                            <TokenDisplay onClick={() => {}}
                              mintAddress={option.address}
                              name={option.name}
                              showCaretDown={props.associatedToken ? false : true}
                            />
                            <div className="balance">
                              {props.userBalances && props.userBalances[option.address] > 0 && (
                                <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                              )}
                            </div>
                          </div>
                        </Option>
                      );
                    })}
                  </Select>
                )}
                {selectedToken && tokenBalance ? (
                  <div
                    className="token-max simplelink"
                    onClick={() => setValue(
                      getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true)
                    )}>
                    MAX
                  </div>
                ) : null}
              </span>
            </div>
            <div className="right">
              <input
                id="topup-amount-field"
                className="general-text-input text-right"
                inputMode="decimal"
                autoComplete="off"
                autoCorrect="off"
                type="text"
                onChange={handleAmountChange}
                pattern="^[0-9]*[.,]?[0-9]*$"
                placeholder="0.0"
                minLength={1}
                maxLength={79}
                spellCheck="false"
                value={topupAmount}
              />
            </div>
          </div>
          <div className="flex-fixed-right">
            <div className="left inner-label">
              <span>{t('treasuries.add-funds.balance')}:</span>
              <span>
                {`${tokenBalance && selectedToken
                    ? getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">
              ~${topupAmount && effectiveRate
                ? formatAmount(parseFloat(topupAmount) * effectiveRate, 2)
                : "0.00"}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <div className="form-label">{t('treasuries.add-funds.allocation-label')}</div>
        <div className="well">
          <Dropdown overlay={allocationOptionsMenu} trigger={["click"]}>
            <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
              <div className="left">
                <span className="capitalize-first-letter">{allocationOptions.find(o => o.key === allocationOption)?.label}</span>
              </div>
              <div className="right">
                <IconCaretDown className="mean-svg-icons" />
              </div>
            </span>
          </Dropdown>
        </div>
      </div>

      {allocationOption === AllocationType.Specific && props.streamStats && props.streamStats.total > 0 && (
        <div className="mb-3">
          <div className="form-label">{t('treasuries.add-funds.allocation-select-stream-label')}</div>
          <div className="well">
            <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
              <div className="left mr-0">
                <AutoComplete
                  bordered={false}
                  style={{ width: '100%' }}
                  dropdownClassName="stream-select-dropdown"
                  options={renderStreamSelectOptions()}
                  placeholder={t('treasuries.add-funds.search-streams-placeholder')}
                  filterOption={(inputValue, option) => {
                    const originalItem = streamSummaries.find(i => i.streamName === option!.key);
                    return option!.value.indexOf(inputValue) !== -1 || originalItem?.streamName.indexOf(inputValue) !== -1
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )} */}
    </Modal>
  );
};
