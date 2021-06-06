import { Button, Modal, DatePicker, Spin } from "antd";
import { QrcodeOutlined, LoadingOutlined, CheckOutlined, WarningOutlined } from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnectionConfig } from "../../../contexts/connection";
import { useMarkets } from "../../../contexts/market";
import { IconCaretDown, IconSort } from "../../../Icons";
import { formatAmount, isValidNumber } from "../../../utils/utils";
import { Identicon } from "../../../components/Identicon";
import { getPrices } from "../../../utils/api";
import { DATEPICKER_FORMAT, PRICE_REFRESH_TIMEOUT } from "../../../constants";
import { QrScannerModal } from "../../../components/QrScannerModal";
import { TransactionStatus } from "../../../models/enums";
import {
  convertLocalDateToUTCIgnoringTimezone,
  getAmountWithTokenSymbol,
  getTransactionOperationDescription
} from "../../../utils/ui";
import moment from "moment";
import { useWallet } from "../../../contexts/wallet";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming } from "../../../money-streaming/money-streaming";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const OneTimePayment = () => {
  const today = new Date().toLocaleDateString();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const connectionConfig = useConnectionConfig();
  const { connected, wallet } = useWallet();
  const {
    contract,
    tokenList,
    selectedToken,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    transactionStatus,
    setCurrentScreen,
    setSelectedToken,
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount,
    setTransactionStatus,
    setLastCreatedTransactionSignature
  } = useContext(AppStateContext);

  const [previousChain, setChain] = useState("");
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);
  const [isBusy, setIsBusy] = useState(false);

  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [effectiveRate, setEffectiveRate] = useState<number>(0);

  const [shouldLoadTokens, setShouldLoadTokens] = useState(true);

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
    const parsedDate = Date.parse(date);
    console.log('Parsed date:', parsedDate);
    let utcDate = new Date(parsedDate);

    const utcDateWithoutTz = convertLocalDateToUTCIgnoringTimezone(utcDate);
    console.log('utcDate from parsed date:', utcDate.toLocaleDateString());
    console.log('convertLocalDateToUTCIgnoringTimezone =>');
    console.log('utcDateWithoutTz.toString()', utcDateWithoutTz.toString());
    console.log('utcDateWithoutTz.toISOString()', utcDateWithoutTz.toISOString());
    console.log('utcDateWithoutTz.toUTCString()', utcDateWithoutTz.toUTCString());
    console.log('utcDateWithoutTz.toDateString()', utcDateWithoutTz.toDateString());
    console.log('utcDateWithoutTz.toLocaleString()', utcDateWithoutTz.toLocaleString());
    console.log('utcDateWithoutTz.toLocaleDateString()', utcDateWithoutTz.toLocaleDateString());
  }

  // Set to reload prices every 30 seconds
  const setPriceTimer = () => {
    setTimeout(() => {
      setShouldLoadCoinPrices(true);
    }, PRICE_REFRESH_TIMEOUT);
  };

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
    }, 100);
  }

  const handleRecipientAddressFocusOut = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  // Effect to load coin prices
  useEffect(() => {
    const getCoinPrices = async () => {
      setShouldLoadCoinPrices(false);
      try {
        await getPrices()
          .then((prices) => {
            console.log("Coin prices:", prices);
            setCoinPrices(prices);
            setEffectiveRate(
              prices[(selectedToken as TokenInfo).symbol] ? prices[(selectedToken as TokenInfo).symbol] : 0
            );
          })
          .catch(() => setCoinPrices(null));
      } catch (error) {
        setCoinPrices(null);
      }
    };

    if (shouldLoadCoinPrices && selectedToken) {
      getCoinPrices();
      setPriceTimer();
    }

    return () => {
      clearTimeout();
    };
  }, [
    coinPrices,
    shouldLoadCoinPrices,
    selectedToken,
    setEffectiveRate
  ]);

  // Effect signal token list reload on network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      console.log(`cluster:`, connectionConfig.env);
      if (!shouldLoadTokens) {
        setShouldLoadTokens(true);
      }
    }

    return () => {};
  }, [
    previousChain,
    connectionConfig,
    shouldLoadTokens,
    setShouldLoadTokens,
  ]);

  // Effect to handle onMarket event
  useEffect(() => {
    const refreshTotal = () => {};

    const dispose = marketEmitter.onMarket(() => {
      refreshTotal();
    });

    refreshTotal();

    return () => {
      dispose();
    };
  }, [marketEmitter, midPriceInUSD, connectionConfig.tokenMap]);

  // Effect signal token list reload on wallet connected status change
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        // TODO: Find how to wait for the accounts' list to be populated to avoit setTimeout
        setTimeout(() => {
          setShouldLoadTokens(true);
          setSelectedToken(tokenList[0]);
        }, 1000);
      } else {
        setSelectedToken(undefined);
        setShouldLoadTokens(true);
      }
      setPreviousWalletConnectState(connected);
    }

    return () => {
      clearTimeout();
    };
  }, [
    connected,
    shouldLoadTokens,
    previousWalletConnectState,
    tokenList,
    setSelectedToken,
    setShouldLoadTokens,
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
  const areSendAmountSettingsValid = (): boolean => {
    return connected &&
           selectedToken &&
           selectedToken?.balance &&
           fromCoinAmount &&
           parseFloat(fromCoinAmount) <= selectedToken?.balance
            ? true
            : false;
  }

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? "Connect your wallet"
      : !selectedToken || !selectedToken.balance
      ? "No balance"
      : !recipientAddress
      ? "Select recipient"
      : !fromCoinAmount
      ? "Enter amount"
      : parseFloat(fromCoinAmount) > selectedToken.balance
      ? "Amount exceeds your balance"
      : !paymentStartDate
      ? "Set a valid date"
      : "Approve on your wallet";
  }

  // Main action

  const onTransactionStart = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log("Start transaction for contract type:", contract?.name);
        console.log('Wallet address:', wallet?.publicKey?.toBase58());
        const senderPubkey = wallet.publicKey as PublicKey;

        console.log('Beneficiary address:', recipientAddress);
        const destPubkey = new PublicKey(recipientAddress as string);

        console.log('associatedToken:', selectedToken?.address);
        const associatedToken = new PublicKey(selectedToken?.address as string);

        const parsedDate = Date.parse(paymentStartDate as string);
        console.log('parsed paymentStartDate:', parsedDate);
        let fromParsedDate = new Date(parsedDate);
        console.log('UTC date input (local):', fromParsedDate.toUTCString());
        const utcDate = convertLocalDateToUTCIgnoringTimezone(fromParsedDate);
        console.log('UTC date (without timezone):', fromParsedDate.toUTCString());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        // Create a transaction
        const data = {
          treasurer: senderPubkey,                                        // treasurer
          beneficiary: destPubkey,                                        // beneficiary
          treasury: null,                                                 // treasury
          associatedToken: associatedToken,                               // associatedToken
          rateAmount: parseFloat(fromCoinAmount as string),               // rateAmount
          rateIntervalInSeconds: 0,                                       // rateIntervalInSeconds
          startUtc: utcDate,                                              // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : contract?.name.trim(),                                      // streamName
          fundingAmount: parseFloat(fromCoinAmount as string)             // fundingAmount
        };
        console.log('data:', data);
        return await moneyStream.getCreateStreamTransaction(
          senderPubkey,                                     // treasurer
          destPubkey,                                       // beneficiary
          null,                                             // treasury
          associatedToken,                                  // associatedToken
          parseFloat(fromCoinAmount as string),             // rateAmount
          0,                                                // rateIntervalInSeconds
          utcDate,                                          // startUtc
          recipientNote
            ? recipientNote.trim()
            : contract?.name.trim(),                        // streamName
          parseFloat(fromCoinAmount as string)              // fundingAmount
        )
        .then(value => {
          console.log('getCreateStreamTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.CreateTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('getCreateStreamTransaction error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.CreateTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransaction(wallet, transaction)
        .then(signed => {
          console.log('signTransaction returned a signed transaction:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransaction = signed;
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
        return moneyStream.sendSignedTransaction(signedTransaction)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
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
      return await moneyStream.confirmTransaction(signature)
        .then(result => {
          console.log('confirmTransaction result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          // Save transaction
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
          // Save signature to the state
          setLastCreatedTransactionSignature(signature);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const resetContractValues = () => {
    const today = new Date().toLocaleDateString();
    setFromCoinAmount('');
    setRecipientAddress('');
    setRecipientNote('');
    setPaymentStartDate(today);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = 'Executing transaction';
    } else {
      if (transactionStatus.lastOperation === TransactionStatus.Iddle &&
          transactionStatus.currentOperation === TransactionStatus.Iddle) {
        title = null;
      } else if (transactionStatus.lastOperation === TransactionStatus.TransactionFinished) {
        title = 'Transaction completed'
      } else {
        title = null;
      }
    }
    return title;
  }

  const isSuccess = () => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  return (
    <>
      {/* Recipient */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Recipient</span>
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
              placeholder="Public address or ENS"
              required={true}
              spellCheck="false"
              value={recipientAddress}/>
            <span id="payment-recipient-static-field"
                  className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
              {recipientAddress || 'Public address or ENS'}
            </span>
          </span>
          <div className="addon-right simplelink" onClick={showQrScannerModal}>
            <QrcodeOutlined />
          </div>
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
            Send ~${fromCoinAmount && effectiveRate
              ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
              : "0.00"}
            <IconSort className="mean-svg-icons usd-switcher fg-red" />
            <span className="fg-red">USD</span>
          </span>
          <span className="field-label-right">
            <span>Balance:</span>
            <span className="balance-amount">
              {`${
                selectedToken?.balance
                  ? formatAmount(selectedToken.balance, selectedToken.symbol === 'SOL' ? selectedToken.decimals : 2)
                  : "Unknown"
            }`}
            </span>
            <span>
              (~$
              {selectedToken?.balance && effectiveRate
                ? formatAmount(selectedToken.balance * effectiveRate, 2)
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
                {selectedToken.balance && (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
                      setFromCoinAmount(
                        formatAmount(
                          selectedToken.balance as number,
                          selectedToken.decimals
                        )
                      )
                    }>
                    MAX
                  </div>
                )}
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
        title={<div className="modal-title">Select a token</div>}
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
                setEffectiveRate(
                  coinPrices && coinPrices[token.symbol]
                    ? coinPrices[token.symbol]
                    : 0
                );
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
            <p>Loading...</p>
          )}
        </div>
      </Modal>

      {/* Optional note */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Memo</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="input-left">
            <input
              className="w-100 general-text-input"
              autoComplete="on"
              autoCorrect="off"
              type="text"
              onChange={handleRecipientNoteChange}
              placeholder="Add an optional note"
              spellCheck="false"
              value={recipientNote} />
          </span>
        </div>
      </div>

      {/* Send date */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Send on</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="field-select-left">
            {paymentStartDate === today ? `${paymentStartDate} (today)` : `${paymentStartDate}`}
          </span>
          <div className="addon-right">
            <DatePicker
              size="middle"
              bordered={false}
              className="addon-date-picker"
              aria-required={true}
              allowClear={false}
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
      <div className="text-center p-2">
        {selectedToken && effectiveRate
          ? `1 ${selectedToken.symbol} = $${formatAmount(effectiveRate, 2)}`
          : "--"}
      </div>
      {/* Action button */}
      <Button
        className="main-cta"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={!recipientAddress || !paymentStartDate || !areSendAmountSettingsValid()}>
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
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">Sending {getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)}...</p>
              <div className="indication">Confirm this transaction in your wallet</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">{getAmountWithTokenSymbol(fromCoinAmount, selectedToken as TokenInfo)} was sent successfully.</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={handleGoToStreamsClick}>
                View Stream
              </Button>
            </>
          ) : (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={closeTransactionModal}>
                Dismiss
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
