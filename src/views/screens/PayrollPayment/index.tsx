import { Button, Modal, Menu, Dropdown, DatePicker, Divider, Spin } from "antd";
import {
  CheckOutlined,
  LoadingOutlined,
  QrcodeOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnectionConfig } from "../../../contexts/connection";
import { IconCaretDown, IconSort } from "../../../Icons";
import {
  formatAmount,
  isValidNumber,
} from "../../../utils/utils";
import { Identicon } from "../../../components/Identicon";
import { DATEPICKER_FORMAT } from "../../../constants";
import { QrScannerModal } from "../../../components/QrScannerModal";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../../../models/enums";
import {
  disabledDate,
  getAmountWithTokenSymbol,
  getFairPercentForInterval,
  getOptionsFromEnum,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTimesheetRequirementOptionLabel,
  getTransactionOperationDescription
} from "../../../utils/ui";
import moment from "moment";
import { useWallet } from "../../../contexts/wallet";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming } from "../../../money-streaming/money-streaming";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";
import { environment } from "../../../environments/environment";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const PayrollPayment = () => {
  const today = new Date().toLocaleDateString();
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
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    timeSheetRequirement,
    streamProgramAddress,
    setCurrentScreen,
    setSelectedToken,
    resetContractValues,
    setSelectedTokenBalance,
    setEffectiveRate,
    setRecipientAddress,
    setRecipientNote,
    setPaymentStartDate,
    setFromCoinAmount,
    setPaymentRateAmount,
    setPaymentRateFrequency,
    setTransactionStatus,
    setTimeSheetRequirement,
    setSelectedStream,
    refreshStreamList
  } = useContext(AppStateContext);

  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);
  const [isBusy, setIsBusy] = useState(false);
  const [isScheduledPayment, setIsScheduledPayment] = useState(false);
  const [destinationToken, setDestinationToken] = useState<TokenInfo>();

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => setTokenSelectorModalVisibility(false), []);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState('payer');

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
      setSelectedStream(undefined);
      refreshStreamList(true);
      setCurrentScreen("streams");
    }
  }

  const handleGoToStreamsClick = () => {
    resetContractValues();
    refreshStreamList(true);
    closeTransactionModal();
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
    }, 100);
  }

  const handleRecipientAddressFocusOut = (e: any) => {
    setTimeout(() => {
      triggerWindowResize();
    }, 100);
  }

  const handlePaymentRateAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setPaymentRateAmount("");
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  }

  // Effect to set a default beneficiary token
  useEffect(() => {

    if (tokenList && selectedToken) {
      // Preset a token for the beneficiary account
      if (!destinationToken) {
        setDestinationToken(selectedToken);
      }
    }

    return () => {};
  }, [
    tokenList,
    selectedToken,
    destinationToken
  ]);

  // Effect auto-select token on wallet connect and clear balance on disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        // TODO: Find how to wait for the accounts' list to be populated to avoit setTimeout
        setTimeout(() => {
          setSelectedToken(tokenList[0]);
        }, 1000);
      } else {
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
      var NUM_CHARS = 6;
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

  const areSendAmountSettingsValid = (): boolean => {
    return connected &&
           selectedToken &&
           tokenBalance &&
           fromCoinAmount &&
           parseFloat(fromCoinAmount) <= tokenBalance
            ? true
            : false;
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

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    return !connected
      ? "Connect your wallet"
      : !selectedToken || !tokenBalance
      ? "No balance"
      : !recipientAddress || isAddressOwnAccount()
      ? "Select recipient"
      : !fromCoinAmount
      ? "Enter amount"
      : parseFloat(fromCoinAmount) > tokenBalance
      ? "Amount exceeds your balance"
      : !paymentStartDate
      ? "Set a valid date"
      : !arePaymentSettingsValid()
      ? getPaymentSettingsModalButtonLabel()
      : "Approve on your wallet";
  }

  const getPaymentSettingsModalButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');
    return !rateAmount
      ? "Add payment rate"
      : rateAmount > parseFloat(fromCoinAmount || '0')
      ? "Review payment rate"
      // : paymentRateFrequency === PaymentRateType.Other && !paymentRateInterval
      // ? 'Select a valid interval'
      : '';
  }

  const getPaymentRateLabel = (
    rate: PaymentRateType,
    amount: string | undefined
  ): string => {
    let label: string;
    label = `${selectedToken ? getAmountWithTokenSymbol(amount, selectedToken) : '--'}`;
    switch (rate) {
      case PaymentRateType.PerMinute:
        label += " per minute";
        break;
      case PaymentRateType.PerHour:
        label += " per hour";
        break;
      case PaymentRateType.PerDay:
        label += " per day";
        break;
      case PaymentRateType.PerWeek:
        label += " per week";
        break;
      case PaymentRateType.PerMonth:
        label += " per month";
        break;
      case PaymentRateType.PerYear:
        label += " per year";
        break;
      default:
        break;
    }
    return label;
  };

  const getRecommendedFundingAmount = () => {
    const rateAmount = parseFloat(paymentRateAmount as string);
    const percent = getFairPercentForInterval(paymentRateFrequency);
    const recommendedMinAmount = percent * rateAmount || 0;
    const formatted = formatAmount(recommendedMinAmount, selectedToken?.decimals, true);

    // String to obtain: 0.21 SOL (10%).
    return `${parseFloat(formatted).toString()} ${selectedToken?.symbol}.`;
  }
  // Prefabrics

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

  const renderAvailableTokenList = (
    <>
      {destinationToken && tokenList ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            setDestinationToken(token);
            if (environment !== 'production') {
              setSelectedToken(token);
            }
            console.log("token selected:", token);
            onCloseTokenSelector();
          };
          return (
            <div key={index + 100} onClick={onClick} className={`token-item ${
                destinationToken && destinationToken.address === token.address
                  ? "selected"
                  : "simplelink"
              }`}>
              <div className="token-icon">
                {token.logoURI ? (
                  <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} />
                ) : (
                  <Identicon address={token.address} style={{ width: "24", display: "inline-flex" }} />
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
    </>
  );

  const renderUserTokenList = (
    <>
      {selectedToken && tokenList ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            setSelectedToken(token);
            if (environment !== 'production') {
              setDestinationToken(token);
            }
            console.log("token selected:", token);
            setEffectiveRate(
              coinPrices && coinPrices[token.symbol]
                ? coinPrices[token.symbol]
                : 0
            );
            onCloseTokenSelector();
          };
          return (
            <div key={index + 100} onClick={onClick} className={`token-item ${
                selectedToken && selectedToken.address === token.address
                  ? "selected"
                  : "simplelink"
              }`}>
              <div className="token-icon">
                {token.logoURI ? (
                  <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} />
                ) : (
                  <Identicon address={token.address} style={{ width: "24", display: "inline-flex" }} />
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
    </>
  );

  const timeSheetRequirementOptionsMenu = (
    <Menu>
      <Menu.Item
        key={TimesheetRequirementOption[0]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.NotRequired)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.NotRequired)}
      </Menu.Item>
      <Menu.Item
        key={TimesheetRequirementOption[1]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.SubmitTimesheets)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.SubmitTimesheets)}
      </Menu.Item>
      <Menu.Item
        key={TimesheetRequirementOption[2]}
        onClick={() => setTimeSheetRequirement(TimesheetRequirementOption.ClockinClockout)}>
        {getTimesheetRequirementOptionLabel(TimesheetRequirementOption.ClockinClockout)}
      </Menu.Item>
    </Menu>
  );

  // Main action

  const onTransactionStart = async () => {
    let transactions: Transaction[];
    let signedTransactions: Transaction[];
    let signatures: any[];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log("Start transaction for contract type:", contract?.name);
        console.log('Wallet address:', wallet?.publicKey?.toBase58());

        console.log('treasurerMint:', selectedToken?.address);
        const treasurerMint = new PublicKey(selectedToken?.address as string);

        console.log('Beneficiary address:', recipientAddress);
        const beneficiary = new PublicKey(recipientAddress as string);

        console.log('beneficiaryMint:', destinationToken?.address);
        const beneficiaryMint = new PublicKey(destinationToken?.address as string);

        const amount = parseFloat(fromCoinAmount as string);
        const rateAmount = parseFloat(paymentRateAmount as string);
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

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        // Create a transaction
        const data = {
          wallet: wallet,                                             // wallet
          beneficiary: beneficiary,                                   // beneficiary
          treasurerMint: treasurerMint,                               // treasurerMint
          beneficiaryMint: beneficiaryMint,                           // beneficiaryMint
          rateAmount: rateAmount,                                     // rateAmount
          rateIntervalInSeconds:
            getRateIntervalInSeconds(paymentRateFrequency),           // rateIntervalInSeconds
          startUtc: fromParsedDate,                                   // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          fundingAmount: amount                                       // fundingAmount
        };
        console.log('data:', data);
        return await moneyStream.createStream(
          wallet,                                                     // wallet
          undefined,                                                  // treasury
          beneficiary,                                                // beneficiary
          treasurerMint,                                              // treasurerMint
          beneficiaryMint,                                            // beneficiaryMint
          rateAmount,                                                 // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),             // rateIntervalInSeconds
          fromParsedDate,                                             // startUtc
          recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          amount                                                      // fundingAmount
        )
        .then(value => {
          console.log('getCreateStreamTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactions = value;
          return true;
        })
        .catch(error => {
          console.log('getCreateStreamTransaction error:', error);
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
          console.log('signTransactions returned a signed transaction:', signed);
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

  const isError = () => {
    return transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
           transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
           ? true
           : false;
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
        <div className="transaction-field-row">
          <span className="field-label-left">
            {isAddressOwnAccount() ? (
              <span className="fg-red">Cannot send to your own account</span>
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

      {/* Memo */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Memo / Subject</span>
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
              placeholder="What is this payment for?"
              spellCheck="false"
              value={recipientNote} />
          </span>
        </div>
      </div>

      {/* Receive rate and frequency */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left cell-1">Recipient receives</span>
          <span className="field-label-left cell-2 flex-center">&nbsp;</span>
          <span className="field-label-left cell-3">Rate and frequency</span>
          <span className="field-label-left cell-4">&nbsp;</span>
        </div>
        <div className="transaction-field-row main-row">
          <span className="addon-left cell-1">
            <div className="token-selector simplelink" onClick={() => {
              setSubjectTokenSelection('beneficiary');
              showTokenSelector();
            }}>
              <div className="token-icon">
                {destinationToken?.logoURI ? (
                  <img alt={`${destinationToken.name}`} width={20} height={20} src={destinationToken.logoURI} />
                ) : (
                  <Identicon address={destinationToken?.address} style={{ width: "24", display: "inline-flex" }} />
                )}
              </div>
              <div className="token-symbol">{destinationToken?.symbol}</div>
              <span className="flex-center">
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </div>
          </span>
          <span className="static-field-text cell-2 flex-center">
            <span className="symbol-at">@</span>
          </span>
          <span className="static-field-text cell-3">
            <input
              className="general-text-input"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              required={true}
              onChange={handlePaymentRateAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={paymentRateAmount}
            />
          </span>
          <span className="static-field-text cell-4">
            <Dropdown
              overlay={paymentRateOptionsMenu}
              trigger={["click"]}>
              <span className="dropdown-trigger no-decoration flex-center">
                {getPaymentRateOptionLabel(paymentRateFrequency)}{" "}
                <IconCaretDown className="mean-svg-icons" />
              </span>
            </Dropdown>
          </span>
        </div>
      </div>

      {/* Timesheet requirement */}
      <div className="transaction-field">
        <div className="transaction-field-row">
          <span className="field-label-left">Timesheet requirement</span>
          <span className="field-label-right">&nbsp;</span>
        </div>
        <Dropdown
          overlay={timeSheetRequirementOptionsMenu}
          trigger={["click"]}>
          <div className="transaction-field-row main-row simplelink">
            <span className="field-select-left">
              {getTimesheetRequirementOptionLabel(timeSheetRequirement)}
            </span>
            <span className="field-caret-down">
              <IconCaretDown className="mean-svg-icons" />
            </span>
          </div>
        </Dropdown>
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
              disabledDate={disabledDate}
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

      <Divider plain></Divider>

      <div className="mb-3 text-center">
        <div>You must add funds to start the repeating payment.</div>
        <div>Recommended minimum amount: <span className="fg-red">{getRecommendedFundingAmount()}</span></div>
      </div>

      {/* Send amount */}
      <div className="transaction-field mb-1">
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
              {`${selectedToken && tokenBalance
                  ? formatAmount(tokenBalance as number, selectedToken.symbol === 'SOL' ? selectedToken.decimals : 2)
                  : "0"
              }`}
            </span>
            <span>
              (~$
              {tokenBalance && effectiveRate
                ? formatAmount(tokenBalance as number * effectiveRate, 2)
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
                {selectedToken && (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
                      setFromCoinAmount(
                        formatAmount(
                          tokenBalance as number,
                          selectedToken.decimals
                        )
                      )
                    }>
                    MAX
                  </div>
                )}
                <div className="token-selector simplelink" onClick={() => {
                    setSubjectTokenSelection('payer');
                    showTokenSelector();
                  }}>
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
          {subjectTokenSelection === 'payer' ? renderUserTokenList : renderAvailableTokenList}
        </div>
      </Modal>

      {/* Info */}
      <div className="text-center mb-1">
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
        disabled={!recipientAddress || isAddressOwnAccount() || !arePaymentSettingsValid() || !areSendAmountSettingsValid()}>
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
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)}</h5>
              <div className="indication">Confirm this transaction in your wallet</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">Your money stream for {getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)} was started successfully.</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={handleGoToStreamsClick}>
                View Stream
              </Button>
            </>
          ) : isError() ? (
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
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">Working, please wait...</h4>
            </>
          )}
        </div>
      </Modal>
    </>
  );
};
