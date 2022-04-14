import React from 'react';
import { Button, Modal, DatePicker, Checkbox, Select } from "antd";
import {
  LoadingOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { formatAmount, formatThousands, getAmountWithSymbol, getTxIxResume, isValidNumber, toTokenAmount } from "../../utils/utils";
import { DATEPICKER_FORMAT, SIMPLE_DATE_TIME_FORMAT } from "../../constants";
import { QrScannerModal } from "../../components/QrScannerModal";
import { EventType, OperationType, TransactionStatus } from "../../models/enums";
import {
  addMinutes,
  consoleOut,
  disabledDate,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress
} from "../../utils/ui";
import moment from "moment";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { useTranslation } from "react-i18next";
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { customLogger } from '../..';
import { confirmationEvents, TransactionStatusContext, TransactionStatusInfo } from '../../contexts/transaction-status';
import { useNavigate } from 'react-router-dom';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TextInput } from '../../components/TextInput';
import { TokenListItem } from '../../components/TokenListItem';
import { calculateActionFees, MSP, MSP_ACTIONS, TransactionFees } from '@mean-dao/msp';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent, SegmentStreamOTPTransferData } from '../../utils/segment-service';
import dateFormat from 'dateformat';
import { NATIVE_SOL } from '../../utils/tokens';

const { Option } = Select;

export const OneTimePayment = () => {
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, publicKey, wallet } = useWallet();
  const {
    tokenList,
    selectedToken,
    tokenBalance,
    effectiveRate,
    coinPrices,
    loadingPrices,
    isWhitelisted,
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    transactionStatus,
    isVerifiedRecipient,
    streamV2ProgramAddress,
    previousWalletConnectState,
    refreshPrices,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    setFromCoinAmount,
    setSelectedStream,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    refreshTokenBalance,
    setTransactionStatus,
    setIsVerifiedRecipient,
    setSelectedTokenBalance,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TransactionStatusContext);
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [tokenFilter, setTokenFilter] = useState("");
  const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
  const [fixedScheduleValue, setFixedScheduleValue] = useState(0);
  const [canSubscribe, setCanSubscribe] = useState(true);

  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Automatically update all token balances
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      connection.getTokenAccountsByOwner(
        publicKey, 
        { programId: TOKEN_PROGRAM_ID }, 
        connection.commitment
      )
      .then(response => {
        for (let acc of response.value) {
          const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
          const address = decoded.mint.toBase58();
          const itemIndex = tokenList.findIndex(t => t.address === address);
          if (itemIndex !== -1) {
            balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
          } else {
            balancesMap[address] = 0;
          }
        }
      })
      .catch(error => {
        console.error(error);
        for (let t of tokenList) {
          balancesMap[t.address] = 0;
        }
      })
      .finally(() => setUserBalances(balancesMap));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    tokenList,
    accounts,
    publicKey
  ]);

  const [otpFees, setOtpFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return await calculateActionFees(connection, MSP_ACTIONS.createStreamWithFunds);
    }
    if (!otpFees.mspFlatFee) {
      getTransactionFees().then(values => {
        setOtpFees(values);
        consoleOut("otpFees:", values);
      });
    }
  }, [connection, otpFees]);

  const isScheduledPayment = useCallback((): boolean => {
    const now = new Date();
    const parsedDate = Date.parse(paymentStartDate as string);
    const fromParsedDate = new Date(parsedDate);
    return fromParsedDate.getDate() > now.getDate() ? true : false;
  }, [paymentStartDate]);

  const getFeeAmount = useCallback(() => {
    return isScheduledPayment() ? otpFees.blockchainFee + otpFees.mspFlatFee : otpFees.blockchainFee;
  }, [isScheduledPayment, otpFees.blockchainFee, otpFees.mspFlatFee]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || ! effectiveRate) {
      return 0;
    }

    return parseFloat(fromCoinAmount) * effectiveRate;
  }, [effectiveRate, fromCoinAmount]);

  // Token selection modal
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const showTokenSelector = useCallback(() => setTokenSelectorModalVisibility(true), []);
  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    if (tokenFilter && !isValidAddress(tokenFilter)) {
      setTokenFilter('');
    }
  }, [tokenFilter]);

  // Recipient Selector modal
  const [isQrScannerModalVisible, setIsQrScannerModalVisibility] = useState(false);
  const showQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(true), []);
  const closeQrScannerModal = useCallback(() => setIsQrScannerModalVisibility(false), []);
  const onAcceptQrScannerModal = () => {
    triggerWindowResize();
    closeQrScannerModal();
  };

  // Event handling

  const recordTxConfirmation = useCallback((signature: string, success = true) => {
    let event: any;
    event = success ? AppUsageEvent.TransferOTPCompleted : AppUsageEvent.TransferOTPFailed;
    segmentAnalytics.recordEvent(event, { signature: signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TransactionStatusInfo) => {
    consoleOut("onTxConfirmed event executed:", item, 'crimson');
    if (item && item.operationType === OperationType.Transfer && item.extras === 'scheduled') {
      recordTxConfirmation(item.signature, true);
      navigate("/accounts/streams");
    }
    setIsBusy(false);
    resetTransactionStatus();
    resetContractValues();
    setIsVerifiedRecipient(false);
    setSelectedStream(undefined);
  }, [
    navigate,
    setSelectedStream,
    resetContractValues,
    recordTxConfirmation,
    resetTransactionStatus,
    setIsVerifiedRecipient,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TransactionStatusInfo) => {
    consoleOut("onTxTimedout event executed:", item, 'crimson');
    if (item && item.operationType === OperationType.Transfer) {
      recordTxConfirmation(item.signature, false);
    }
    setIsBusy(false);
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  const handleFromCoinAmountChange = (e: any) => {

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

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
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

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback((searchString: string) => {

    if (!tokenList) {
      return;
    }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
          t.name.toLowerCase().includes(searchString.toLowerCase()) ||
          t.address.toLowerCase().includes(searchString.toLowerCase())
        );
      };

      let showFromList = !searchString 
        ? tokenList
        : tokenList.filter((t: any) => filter(t));

      setFilteredTokenList(showFromList);

    });

    return () => { 
      clearTimeout(timeout);
    }
    
  }, [
    tokenList,
  ]);

  const onInputCleared = useCallback(() => {
    setTokenFilter('');
    updateTokenListByFilter('');
  },[
    updateTokenListByFilter
  ]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const newValue = e.target.value;
    setTokenFilter(newValue);
    updateTokenListByFilter(newValue);

  },[
    updateTokenListByFilter
  ]);

  // Hook on wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setSelectedTokenBalance(0);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setUserBalances(undefined);
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
      }
    } else if (!connected) {
      setSelectedTokenBalance(0);
    }

    return () => {
      clearTimeout();
    };

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setSelectedTokenBalance,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Reset results when the filter is cleared
  useEffect(() => {
    if (tokenList && tokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
      updateTokenListByFilter(tokenFilter);
    }
  }, [
    tokenList,
    tokenFilter,
    filteredTokenList,
    updateTokenListByFilter
  ]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
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

  // Setup event listeners
  useEffect(() => {
    if (publicKey && canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [
    publicKey,
    canSubscribe,
    onTxConfirmed,
    onTxTimedout,
  ]);

  //////////////////
  //  Validation  //
  //////////////////

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && wallet.publicKey && recipientAddress === wallet.publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    return  connected &&
            selectedToken &&
            tokenBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  // Ui helpers
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
      : !recipientNote
      ? t('transactions.validation.memo-empty')
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : nativeBalance < getFeeAmount()
      ? t('transactions.validation.insufficient-balance-needed', { balance: getFeeAmount() })
      : t('transactions.validation.valid-approve');
  }

  // Main action

  const onTransactionStart = useCallback(async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const otpTx = async (data: any) => {

      if (!endpoint || !streamV2ProgramAddress) { return null; }
      
      // Init a streaming operation
      const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

      if (!isScheduledPayment()) {
        return await msp.transfer(
          new PublicKey(data.wallet),                                      // sender
          new PublicKey(data.beneficiary),                                 // beneficiary
          new PublicKey(data.associatedToken),                             // beneficiaryMint
          data.amount                                                      // amount
        )
      }

      return await msp.scheduledTransfer(
        new PublicKey(data.wallet),                                      // treasurer
        new PublicKey(data.beneficiary),                                 // beneficiary
        new PublicKey(data.associatedToken),                             // beneficiaryMint
        data.amount,                                                     // amount
        data.startUtc,                                                   // startUtc
        data.recipientNote,
        false // TODO: (feePayedByTreasurer) This should come from the UI
      );
    }

    const createTx = async (): Promise<boolean> => {

      if (!wallet || !publicKey || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', wallet?.publicKey?.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      consoleOut('Beneficiary address:', recipientAddress);
      const beneficiary = new PublicKey(recipientAddress as string);
      consoleOut('associatedToken:', selectedToken.address);
      const associatedToken = new PublicKey(selectedToken.address as string);
      const amount = toTokenAmount(parseFloat(fromCoinAmount as string), selectedToken.decimals);
      const now = new Date();
      const parsedDate = Date.parse(paymentStartDate as string);
      let startUtc = new Date(parsedDate);
      startUtc.setHours(now.getHours());
      startUtc.setMinutes(now.getMinutes());
      startUtc.setSeconds(now.getSeconds());
      startUtc.setMilliseconds(now.getMilliseconds());

      // If current user is in the whitelist and we have an amount of minutes to add
      // to the current date selection, calculate it!
      if (isWhitelisted && fixedScheduleValue > 0) {
        startUtc = addMinutes(startUtc, fixedScheduleValue);
      }

      consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
      consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
      consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
      consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

      // Create a transaction
      const data = {
        wallet: publicKey.toBase58(),
        beneficiary: beneficiary.toBase58(),                                        // beneficiary
        associatedToken: associatedToken.toBase58(),                                // beneficiaryMint
        amount: amount,                                                             // fundingAmount
        startUtc: startUtc,                                                         // startUtc
        recipientNote: recipientNote
          ? recipientNote.trim()
          : undefined                                                               // streamName
      };

      consoleOut('data:', data, 'blue');

      // Report event to Segment analytics
      const segmentData: SegmentStreamOTPTransferData = {
        asset: selectedToken?.symbol,
        assetPrice: effectiveRate,
        amount: parseFloat(fromCoinAmount as string),
        beneficiary: data.beneficiary,
        startUtc: dateFormat(startUtc, SIMPLE_DATE_TIME_FORMAT)
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      consoleOut('otpFee:', getFeeAmount(), 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      let result = await otpTx(data)
        .then(value => {
          if (!value) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            });
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
            return false;
          }
          consoleOut('oneTimePayment returned transaction:', value);
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
          console.error('oneTimePayment error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPSigned, {
            signature,
            encodedTx
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
          customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        console.error("Cannot sign transaction! Wallet not found!");
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
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
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('One-Time Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && selectedToken) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const signed = await signTx();
        consoleOut('signed:', signed);
        if (signed && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            if (isScheduledPayment()) {
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.Transfer,
                finality: "confirmed",
                txInfoFetchStatus: "fetching",
                loadingTitle: "Confirming transaction",
                loadingMessage: `Schedule transfer for ${formatThousands(
                  parseFloat(fromCoinAmount),
                  selectedToken.decimals
                )} ${selectedToken.symbol}`,
                completedTitle: "Transaction confirmed",
                completedMessage: `Transfer successfully Scheduled!`,
                extras: 'scheduled'
              });
            } else {
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.Transfer,
                finality: "confirmed",
                txInfoFetchStatus: "fetching",
                loadingTitle: "Confirming transaction",
                loadingMessage: `Sending ${formatThousands(
                  parseFloat(fromCoinAmount),
                  selectedToken.decimals
                )} ${selectedToken.symbol}`,
                completedTitle: "Transaction confirmed",
                completedMessage: `Successfully sent ${formatThousands(
                  parseFloat(fromCoinAmount),
                  selectedToken.decimals
                )} ${selectedToken.symbol}`,
              });
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished
            });
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    endpoint,
    publicKey,
    connection,
    recipientNote,
    isWhitelisted,
    nativeBalance,
    selectedToken,
    fromCoinAmount,
    paymentStartDate,
    recipientAddress,
    fixedScheduleValue,
    transactionCancelled,
    streamV2ProgramAddress,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    setTransactionStatus,
    isScheduledPayment,
    getFeeAmount,
  ]);

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onFixedScheduleValueChange = (value: any) => {
    setFixedScheduleValue(value);
  }

  const onGoToWrap = () => {
    onCloseTokenSelector();
    navigate('/wrap');
  }

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const renderTokenList = (
    <>
      {(filteredTokenList && filteredTokenList.length > 0) && (
        filteredTokenList.map((token, index) => {

          if (token.address === NATIVE_SOL.address) {
            return null;
          }

          const onClick = function () {
            setSelectedToken(token);
            consoleOut("token selected:", token.symbol, 'blue');
            setEffectiveRate(getPricePerToken(token));
            onCloseTokenSelector();
          };

          return (
            <TokenListItem
              key={token.address}
              name={token.name || 'Unknown'}
              mintAddress={token.address}
              className={selectedToken && selectedToken.address === token.address ? "selected" : "simplelink"}
              onClick={onClick}
              balance={connected && userBalances && userBalances[token.address] > 0 ? userBalances[token.address] : 0}
            />
          );
        })
      )}
    </>
  );

  return (
    <>
      <div className="contract-wrapper">

        {/* Recipient */}
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
              <div className="add-on simplelink" onClick={showQrScannerModal}>
                <QrcodeOutlined />
              </div>
            </div>
          </div>
          {
            recipientAddress && !isValidAddress(recipientAddress) ? (
              <span className="form-field-error">
                {t('transactions.validation.address-validation')}
              </span>
            ) : isAddressOwnAccount() ? (
              <span className="form-field-error">
                {t('transactions.recipient.recipient-is-own-account')}
              </span>
            ) : (null)
          }
        </div>

        {/* Send amount */}
        <div className="form-label">{t('transactions.send-amount.label')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                {selectedToken && (
                  <TokenDisplay onClick={() => showTokenSelector()}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showCaretDown={true}
                  />
                )}
                {selectedToken && tokenBalance ? (
                  <div className="token-max simplelink" onClick={() =>
                      setFromCoinAmount(
                        tokenBalance.toFixed(selectedToken.decimals)
                      )
                    }>
                    MAX
                  </div>
                ) : null}
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
                    ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">
              <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                ~${fromCoinAmount && effectiveRate
                  ? formatAmount(getTokenPrice(), 2)
                  : "0.00"}
              </span>
            </div>
          </div>
        </div>

        {/* Optional note */}
        <div className="form-label">{t('transactions.memo.label')}</div>
        <div className="well">
          <div className="flex-fixed-right">
            <div className="left">
              <input
                id="payment-memo-field"
                className="w-100 general-text-input"
                autoComplete="on"
                autoCorrect="off"
                type="text"
                maxLength={32}
                onChange={handleRecipientNoteChange}
                placeholder={t('transactions.memo.placeholder')}
                spellCheck="false"
                value={recipientNote}
              />
            </div>
          </div>
        </div>

        {/* Send date */}
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
                  ) as any}
                  format={DATEPICKER_FORMAT}
                />
              </div>
            </div>
          </div>
        </div>

        {isWhitelisted && (
          <>
            <div className="form-label">Schedule transfer for: (For dev team only)</div>
              <div className="well">
                <Select value={fixedScheduleValue} bordered={false} onChange={onFixedScheduleValueChange} style={{ width: '100%' }}>
                  <Option value={0}>No fixed scheduling</Option>
                  <Option value={5}>5 minutes from now</Option>
                  <Option value={10}>10 minutes from now</Option>
                  <Option value={15}>15 minutes from now</Option>
                  <Option value={20}>20 minutes from now</Option>
                  <Option value={30}>30 minutes from now</Option>
                </Select>
              <div className="form-field-hint">Selecting a value will override your date selection</div>
            </div>
          </>
        )}

        {/* Confirm recipient address is correct Checkbox */}
        <div className="mb-2">
          <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
        </div>

        {/* Action button */}
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={!isValidAddress(recipientAddress) ||
            !isMemoValid() ||
            isAddressOwnAccount() ||
            !paymentStartDate ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient ||
            nativeBalance < getFeeAmount()
          }>
          {isBusy && (
            <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {isBusy
            ? t('transactions.status.cta-start-transfer-busy')
            : getTransactionStartButtonLabel()
          }
        </Button>
      </div>

      {/* Token selection modal */}
      {isTokenSelectorModalVisible && (
        <Modal
          className="mean-modal unpadded-content"
          visible={isTokenSelectorModalVisible}
          title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
          onCancel={onCloseTokenSelector}
          width={450}
          footer={null}>
          <div className="token-selector-wrapper">
            <div className="token-search-wrapper">
              <TextInput
                id="token-search-otp"
                value={tokenFilter}
                allowClear={true}
                extraClass="mb-2"
                onInputClear={onInputCleared}
                placeholder={t('token-selector.search-input-placeholder')}
                onInputChange={onTokenSearchInputChange} />
            </div>
            <div className="flex-row align-items-center fg-secondary-60 mb-2 px-1">
              <span>{t('token-selector.looking-for-sol')}</span>&nbsp;
              <span className="simplelink underline" onClick={onGoToWrap}>{t('token-selector.wrap-sol-first')}</span>
            </div>
            <div className="token-list vertical-scroll">
              {filteredTokenList.length > 0 && renderTokenList}
              {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
                <TokenListItem
                  key={tokenFilter}
                  name="Unknown"
                  mintAddress={tokenFilter}
                  className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
                  onClick={() => {
                    const uknwnToken: TokenInfo = {
                      address: tokenFilter,
                      name: 'Unknown',
                      chainId: 101,
                      decimals: 6,
                      symbol: '',
                    };
                    setSelectedToken(uknwnToken);
                    consoleOut("token selected:", uknwnToken, 'blue');
                    setEffectiveRate(0);
                    onCloseTokenSelector();
                  }}
                  balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
                />
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}
    </>
  );
};
