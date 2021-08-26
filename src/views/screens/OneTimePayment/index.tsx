import { Button, Modal, DatePicker, Spin, Row, Col } from "antd";
import {
  CheckOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection, useConnectionConfig } from "../../../contexts/connection";
import { IconCaretDown, IconSort } from "../../../Icons";
import { formatAmount, getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../../utils/utils";
import { Identicon } from "../../../components/Identicon";
import { DATEPICKER_FORMAT, WRAPPED_SOL_MINT_ADDRESS } from "../../../constants";
import { QrScannerModal } from "../../../components/QrScannerModal";
import { TransactionStatus } from "../../../models/enums";
import {
  disabledDate,
  getAmountWithTokenSymbol,
  getTransactionOperationDescription,
  getTxFeeAmount,
  isToday,
  percentage
} from "../../../utils/ui";
import moment from "moment";
import { useWallet } from "../../../contexts/wallet";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming } from "money-streaming/lib/money-streaming";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";
import { useNativeAccount } from "../../../contexts/accounts";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const OneTimePayment = () => {
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { connected, wallet } = useWallet();
  const {
    contract,
    tokenList,
    selectedToken,
    tokenBalance,
    effectiveRate,
    coinPrices,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    transactionStatus,
    streamProgramAddress,
    previousWalletConnectState,
    setCurrentScreen,
    setSelectedToken,
    resetContractValues,
    setSelectedTokenBalance,
    setEffectiveRate,
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount,
    setTransactionStatus,
    setSelectedStream,
    refreshStreamList,
    refreshTokenBalance,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');

  const [isBusy, setIsBusy] = useState(false);
  const [isScheduledPayment, setIsScheduledPayment] = useState(false);
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  useEffect(() => {
    if (account?.lamports !== previousBalance) {
      // Refresh token balance
      refreshTokenBalance();
      // Update previous balance
      setPreviousBalance(account.lamports);
    }
  }, [account, previousBalance, refreshTokenBalance]);

  const [otpFees, setOtpFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.oneTimePayment);
    }
    if (!otpFees.mspPercentFee) {
      getTransactionFees().then(values => {
        setOtpFees(values);
        console.log("otpFees:", values);
      });
    }
  }, [connection, otpFees]);

  const getFeeAmount = (amount: any): number => {
    let fee = 0;
    let inputAmount = amount ? parseFloat(amount) : 0;
    if (otpFees) {
      if (otpFees.mspPercentFee) {
        fee = percentage(otpFees.mspPercentFee, inputAmount);
      } else if (otpFees.mspFlatFee) {
        fee = otpFees.mspFlatFee;
      }
    }
    return fee;
  }

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);

  // Recipient Selector modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Transaction execution modal
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

  // Event handling

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      resetContractValues();
    }
  }

  const handleGoToStreamsClick = () => {
    resetContractValues();
    setSelectedStream(undefined);
    closeTransactionModal();
    refreshStreamList(true);
    setCurrentScreen("streams");
  };

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const handleRecipientAddressChange = (e: any) => {
    setRecipientAddress(e.target.value);
  }

  const handleRecipientNoteChange = (e: any) => {
    setRecipientNote(e.target.value);
  }

  const handleRecipientAddressFocusIn = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const handleRecipientAddressFocusOut = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  // Effect auto-select token on wallet connect and clear balance on disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        setSelectedTokenBalance(0);
      }
      setPreviousWalletConnectState(connected);
    } else if (!connected) {
      setSelectedTokenBalance(0);
    }

    return () => {
      clearTimeout();
    };
  }, [
    connected,
    previousWalletConnectState,
    tokenList,
    setSelectedToken,
    setSelectedTokenBalance,
    setPreviousWalletConnectState,
  ]);

  useEffect(() => {
    const resizeListener = () => {
      var NUM_CHARS = 4;
      var ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (var i = 0; i < ellipsisElements.length; ++i){
        var e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          var text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  // Validation

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && wallet.publicKey && recipientAddress === wallet.publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return connected &&
           selectedToken &&
           tokenBalance &&
           fromCoinAmount && parseFloat(fromCoinAmount) > 0 &&
           parseFloat(fromCoinAmount) <= tokenBalance &&
           // parseFloat(fromCoinAmount) <= tokenBalance - getFeeAmount(fromCoinAmount) &&
           parseFloat(fromCoinAmount) > getFeeAmount(fromCoinAmount)
            ? true
            : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return isSendAmountValid() && paymentStartDate ? true : false;
  }

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
      ? t('transactions.validation.no-recipient')
      : !selectedToken || !tokenBalance
      ? t('transactions.validation.no-balance')
      : !fromCoinAmount || !isValidNumber(fromCoinAmount) || !parseFloat(fromCoinAmount)
      ? t('transactions.validation.no-amount')
      : parseFloat(fromCoinAmount) > tokenBalance
      ? t('transactions.validation.amount-high')
      : tokenBalance < getFeeAmount(fromCoinAmount)
      ? t('transactions.validation.amount-low')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : t('transactions.validation.valid-approve');
  }

  // Main action

  const onTransactionStart = async () => {
    let transactions: Transaction[];
    let signedTransactions: Transaction[];
    let signatures: any[];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.env, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log("Start transaction for contract type:", contract?.name);
        console.log('Beneficiary address:', recipientAddress);

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const beneficiary = new PublicKey(recipientAddress as string);
        console.log('associatedToken:', selectedToken?.address);
        const associatedToken = new PublicKey(selectedToken?.address as string);
        const amount = parseFloat(fromCoinAmount as string);
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        console.log('Parsed paymentStartDate:', parsedDate);
        let fromParsedDate = new Date(parsedDate);
        if (fromParsedDate.getDate() === now.getDate()) {
          setIsScheduledPayment(false);
        } else {
          setIsScheduledPayment(true);
        }
        fromParsedDate.setHours(now.getHours());
        fromParsedDate.setMinutes(now.getMinutes());
        console.log('Local time added to parsed date!');
        console.log('fromParsedDate.toString()', fromParsedDate.toString());
        console.log('fromParsedDate.toUTCString()', fromParsedDate.toUTCString());

        // Create a transaction
        const data = {
          wallet: wallet,
          treasurerMint: associatedToken,                                             // treasurerMint
          beneficiary: beneficiary,                                                   // beneficiary
          associatedToken: associatedToken,                                           // beneficiaryMint
          amount: amount,                                                             // fundingAmount
          fromParsedDate: fromParsedDate,                                             // startUtc
          recipientNote: recipientNote
            ? recipientNote.trim()
            : undefined                                                               // streamName
        };
        console.log('data:', data);

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        console.log('tokenBalance:', tokenBalance);
        const myApplicableFees = getTxFeeAmount(otpFees, fromCoinAmount);
        console.log('myApplicableFees:', myApplicableFees);
        console.log('Amount required:', amount + myApplicableFees);
        if (tokenBalance < (amount + myApplicableFees)) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          return false;
        }

        return await moneyStream.oneTimePayment(
          wallet,
          associatedToken,                                            // treasurerMint
          beneficiary,                                                // beneficiary
          associatedToken,                                            // beneficiaryMint
          amount,                                                     // fundingAmount
          fromParsedDate,                                             // startUtc
          recipientNote
            ? recipientNote.trim()
            : undefined                                               // streamName
        )
        .then(value => {
          console.log('oneTimePaymentTransactions returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactions = value;
          return true;
        })
        .catch(error => {
          console.log('oneTimePaymentTransactions error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransactions(wallet, transactions)
        .then(signed => {
          console.log('signTransaction returned a signed transaction:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransactions = signed;
          return true;
        })
        .catch(error => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return moneyStream.sendSignedTransactions(...signedTransactions)
          .then(sig => {
            console.log('sendSignedTransactions returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signatures = sig;
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await moneyStream.confirmTransactions(...signatures)
        .then(result => {
          console.log('confirmTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    // Lets hit it
    if (wallet) {
      showTransactionModal();
      const create = await createTx();
      console.log('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else { setIsBusy(false); }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = t('transactions.status.modal-title-executing-transaction');
    } else {
      if (transactionStatus.lastOperation === TransactionStatus.Iddle &&
          transactionStatus.currentOperation === TransactionStatus.Iddle) {
        title = null;
      } else if (transactionStatus.lastOperation === TransactionStatus.TransactionFinished) {
        title = t('transactions.status.modal-title-transaction-completed');
      } else {
        title = null;
      }
    }
    return title;
  }

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const infoRow = (caption: string, value: string) => {
    return (
      <Row>
        <Col span={12} className="text-right pr-1">{caption}</Col>
        <Col span={12} className="text-left pl-1 fg-secondary-70">{value}</Col>
      </Row>
    );
  }

  return (
    <>
      {/* Recipient */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">{t('transactions.recipient.label')}</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left recipient-field-wrapper">
            <input id="payment-recipient-field"
              className="w-100 general-text-input"
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
          <div className="addon-right simplelink" onClick={showQrScannerModal}>
            <QrcodeOutlined />
          </div>
        </div>
        <div className="transaction-field-row">
          <span className="field-label-left">
            {isAddressOwnAccount() ? (
              <span className="fg-red">{t('transactions.recipient.recipient-is-own-account')}</span>
            ) : (
              <span>&nbsp;</span>
            )}
          </span>
          <span className="field-label-right">&nbsp;</span>
        </div>
      </div>
      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}

      {/* Send amount */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left" style={{marginBottom: '-6px'}}>
            {t('transactions.send-amount.label')} ~${fromCoinAmount && effectiveRate
              ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
              : "0.00"}
            <IconSort className="mean-svg-icons usd-switcher fg-red" />
            <span className="fg-red">USD</span>
          </span>
          <span className="field-label-right">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span className="balance-amount">
              {`${tokenBalance && selectedToken
                  ? formatAmount(tokenBalance, selectedToken.symbol === 'SOL' ? selectedToken.decimals : 2)
                  : "0"
            }`}
            </span>
            <span>
              (~$
              {tokenBalance && effectiveRate
                ? formatAmount(tokenBalance * effectiveRate, 2)
                : "0.00"})
            </span>
          </span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
            <input
              className="general-text-input"
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
          </span>
          {selectedToken && (
            <div className="addon-right">
              <div className="token-group">
                {tokenBalance ? (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
                      setFromCoinAmount(
                        getTokenAmountAndSymbolByTokenAddress(tokenBalance, selectedToken.address, true, true)
                      )
                    }>
                    MAX
                  </div>
                ) : null}
                <div
                  className="token-selector simplelink"
                  onClick={showTokenSelector}>
                  <div className="token-icon">
                    {selectedToken.logoURI ? (
                      <img
                        alt={`${selectedToken.name}`}
                        width={20}
                        height={20}
                        src={selectedToken.logoURI}
                      />
                    ) : (
                      <Identicon
                        address={selectedToken.address}
                        style={{ width: "24", display: "inline-flex" }}
                      />
                    )}
                  </div>
                  <div className="token-symbol">{selectedToken.symbol}</div>
                </div>
              </div>
            </div>
          )}
          <span className="field-caret-down">
            <IconCaretDown className="mean-svg-icons" />
          </span>
        </div>
      </div>

      {/* Token selection modal */}
      <Modal
        className="mean-modal unpadded-content"
        visible={isTokenSelectorModalVisible}
        title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
        onCancel={onCloseTokenSelector}
        width={450}
        footer={null}>
        <div className="token-list">
          {/* Loop through the tokens */}
          {selectedToken && tokenList ? (
            tokenList.map((token, index) => {
              const onClick = function () {
                setSelectedToken(token);
                console.log("token selected:", token.symbol);
                setEffectiveRate(getPricePerToken(token));
                onCloseTokenSelector();
              };
              return (
                <div
                  key={index + 100}
                  onClick={onClick}
                  className={`token-item ${
                    selectedToken && selectedToken.address === token.address
                      ? "selected"
                      : "simplelink"
                  }`}>
                  <div className="token-icon">
                    {token.logoURI ? (
                      <img
                        alt={`${token.name}`}
                        width={24}
                        height={24}
                        src={token.logoURI}
                      />
                    ) : (
                      <Identicon
                        address={token.address}
                        style={{ width: "24", display: "inline-flex" }}
                      />
                    )}
                  </div>
                  <div className="token-description">
                    <div className="token-symbol">{token.symbol}</div>
                    <div className="token-name">{token.name}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <p>{t('general.loading')}...</p>
          )}
        </div>
      </Modal>

      {/* Optional note */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">{t('transactions.memo.label')}</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
            <input
              id="payment-memo-field"
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              onChange={handleRecipientNoteChange}
              placeholder={t('transactions.memo.placeholder')}
              spellCheck="false"
              value={recipientNote} />
          </span>
        </div>
      </div>

      {/* Send date */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">{t('transactions.send-date.label')}</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="field-select-left">
            {isToday(paymentStartDate || '')
              ? `${paymentStartDate} (${t('common:general.today')})`
              : `${paymentStartDate}`}
          </span>
          <div className="addon-right">
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

      {/* Info */}
      {selectedToken && (
        <div className="p-2 mb-2">
          {infoRow(
            `1 ${selectedToken.symbol}:`,
            effectiveRate ? `$${formatAmount(effectiveRate, 2)}` : "--"
          )}
          {isSendAmountValid() && infoRow(
            t('transactions.transaction-info.transaction-fee') + ':',
            `${areSendAmountSettingsValid()
              ? '~' + getTokenAmountAndSymbolByTokenAddress(getFeeAmount(fromCoinAmount), selectedToken?.address)
              : '0'
            }`
          )}
          {isSendAmountValid() && infoRow(
            t('transactions.transaction-info.recipient-receives') + ':',
            `${areSendAmountSettingsValid()
              ? '~' + getTokenAmountAndSymbolByTokenAddress(parseFloat(fromCoinAmount) - getFeeAmount(fromCoinAmount), selectedToken?.address)
              : '0'
            }`
          )}
        </div>
      )}

      {/* Action button */}
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={!recipientAddress || isAddressOwnAccount() || !paymentStartDate || !areSendAmountSettingsValid()}>
        {getTransactionStartButtonLabel()}
      </Button>
      {/* Transaction execution modal */}
      <Modal
        className="mean-modal"
        maskClosable={false}
        afterClose={onAfterTransactionModalClosed}
        visible={isTransactionModalVisible}
        title={getTransactionModalTitle()}
        onCancel={closeTransactionModal}
        width={280}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus, t)}</h4>
              <p className="operation">{t('transactions.status.tx-send-operation')} {getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)}...</p>
              <div className="indication">{t('transactions.status.instructions')}</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus, t)}</h4>
              <p className="operation">{getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)} {t('transactions.status.tx-send-operation-success')}.</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={isScheduledPayment ? handleGoToStreamsClick : closeTransactionModal}>
                {isScheduledPayment ? t('transactions.status.cta-view-stream') : t('general.cta-close')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(tokenBalance, WRAPPED_SOL_MINT_ADDRESS, true)} SOL`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(getComputedFees(otpFees), WRAPPED_SOL_MINT_ADDRESS, true)} SOL`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              )}
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={closeTransactionModal}>
                {t('general.cta-dismiss')}
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
