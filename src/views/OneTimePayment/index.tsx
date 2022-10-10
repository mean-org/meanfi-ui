import {
  LoadingOutlined
} from "@ant-design/icons";
import { calculateActionFees, MSP, MSP_ACTIONS, TransactionFees } from '@mean-dao/msp';
import { PublicKey, Transaction } from "@solana/web3.js";
import { Button, Checkbox, DatePicker, Select } from "antd";
import { segmentAnalytics } from 'App';
import BN from 'bn.js';
import { TokenDisplay } from 'components/TokenDisplay';
import {
  ACCOUNTS_ROUTE_BASE_PATH,
  CUSTOM_TOKEN_NAME,
  DATEPICKER_FORMAT,
  MIN_SOL_BALANCE_REQUIRED,
  NO_FEES,
  SIMPLE_DATE_TIME_FORMAT,
  WRAPPED_SOL_MINT_ADDRESS
} from "constants/common";
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { useConnection, useConnectionConfig } from "contexts/connection";
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from "contexts/wallet";
import dateFormat from 'dateformat';
import { customLogger } from "index";
import { AppUsageEvent, SegmentStreamOTPTransferData } from 'middleware/segment-service';
import {
  addMinutes,
  consoleOut,
  disabledDate,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress
} from "middleware/ui";
import { cutNumber, formatAmount, formatThousands, getAmountFromLamports, getAmountWithSymbol, getTxIxResume, isValidNumber, toTokenAmount, toTokenAmountBn, toUiAmount } from "middleware/utils";
import { RecipientAddressInfo } from 'models/common-types';
import { EventType, OperationType, TransactionStatus } from "models/enums";
import { TokenInfo } from "models/SolanaTokenInfo";
import { OtpTxParams } from 'models/transfers';
import moment from "moment";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const { Option } = Select;

export const OneTimePayment = (props: {
  onOpenTokenSelector: any;
  selectedToken?: TokenInfo;
  transferCompleted?: any;
  userBalances: any;
}) => {
  const {
    onOpenTokenSelector,
    selectedToken,
    transferCompleted,
    userBalances,
  } = props;
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, publicKey, wallet } = useWallet();
  const {
    splTokenList,
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
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    setFromCoinAmount,
    setSelectedStream,
    setRecipientNote,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [fixedScheduleValue, setFixedScheduleValue] = useState(0);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));
  const [recipientAddressInfo, setRecipientAddressInfo] = useState<RecipientAddressInfo>({ type: '', mint: '', owner: '' });
  const [otpFees, setOtpFees] = useState<TransactionFees>(NO_FEES);

  const isNative = useMemo(() => {
    return selectedToken && selectedToken.address === NATIVE_SOL.address
      ? true
      : false;
  }, []);

  const isScheduledPayment = useCallback((): boolean => {
    const now = new Date();
    const parsedDate = Date.parse(paymentStartDate as string);
    const fromParsedDate = new Date(parsedDate);
    return fromParsedDate.getDate() > now.getDate() ? true : false;
  }, [paymentStartDate]);

  const getFeeAmount = useCallback(() => {
    return isScheduledPayment() ? otpFees.blockchainFee + otpFees.mspFlatFee : otpFees.blockchainFee;
  }, [isScheduledPayment, otpFees.blockchainFee, otpFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    const feeAmount = getFeeAmount();
    return feeAmount > MIN_SOL_BALANCE_REQUIRED
      ? feeAmount
      : MIN_SOL_BALANCE_REQUIRED;

  }, [getFeeAmount]);

  const getMaxAmount = useCallback(() => {
    const amount = nativeBalance - getMinSolBlanceRequired();
    return amount > 0 ? amount : 0;
  }, [getMinSolBlanceRequired, nativeBalance]);

  const getDisplayAmount = useCallback((amount: BN) => {
    if (selectedToken) {
      return getAmountWithSymbol(
        toUiAmount(amount, selectedToken.decimals),
        selectedToken.address,
        true,
        splTokenList,
        selectedToken.decimals
      );
    }
    return '0';
  }, [selectedToken, splTokenList]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(fromCoinAmount) * price;
  }, [fromCoinAmount, selectedToken, getTokenPriceByAddress, getTokenPriceBySymbol]);

  const recordTxConfirmation = useCallback((signature: string, success = true) => {
    const event = success ? AppUsageEvent.TransferOTPCompleted : AppUsageEvent.TransferOTPFailed;
    segmentAnalytics.recordEvent(event, { signature: signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const path = window.location.pathname;
    if (!path.startsWith(ACCOUNTS_ROUTE_BASE_PATH)) {
      return;
    }

    consoleOut("onTxConfirmed event executed:", item, 'crimson');
    setIsBusy(false);
    resetTransactionStatus();
    resetContractValues();
    setIsVerifiedRecipient(false);
    setSelectedStream(undefined);
    if (item && item.operationType === OperationType.Transfer && item.extras === 'scheduled') {
      recordTxConfirmation(item.signature, true);
    }
  }, [
    setIsVerifiedRecipient,
    resetTransactionStatus,
    recordTxConfirmation,
    resetContractValues,
    setSelectedStream,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxTimedout event executed:", item, 'crimson');
    if (item && item.operationType === OperationType.Transfer) {
      recordTxConfirmation(item.signature, false);
    }
    setIsBusy(false);
    resetTransactionStatus();
  }, [recordTxConfirmation, resetTransactionStatus]);

  const getInputAmountBn = useCallback(() => {
    if (!selectedToken || !fromCoinAmount) {
      return new BN(0);
    }

    return parseFloat(fromCoinAmount) > 0
      ? toTokenAmountBn(fromCoinAmount, selectedToken.decimals)
      : new BN(0);
  }, [fromCoinAmount, selectedToken]);


  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return calculateActionFees(connection, MSP_ACTIONS.createStreamWithFunds);
    }
    if (!otpFees.mspFlatFee) {
      getTransactionFees().then(values => {
        setOtpFees(values);
        consoleOut("otpFees:", values);
      });
    }
  }, [connection, otpFees]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Keep token balance updated
  useEffect(() => {

    if (!connection || !publicKey || !userBalances || !selectedToken) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));
      return;
    }

    const timeout = setTimeout(() => {
      const balance = userBalances[selectedToken.address] as number;
      setSelectedTokenBalance(balance);
      const balanceBn = toTokenAmount(balance, selectedToken.decimals);
      setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [connection, publicKey, selectedToken, userBalances]);

  // Fetch and store information about the destination address
  useEffect(() => {

    if (!connection) { return; }

    const getInfo = async (address: string) => {
      try {
        const accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
        consoleOut('accountInfo:', accountInfo, 'blue');
        return accountInfo;
      } catch (error) {
        console.error(error);
        return null;
      }
    }

    if (recipientAddress && isValidAddress(recipientAddress)) {
      let type = '';
      let mint = '';
      let owner = '';
      getInfo(recipientAddress)
      .then(info => {
        if (info) {
          if ((info as any).data["program"] &&
              (info as any).data["program"] === "spl-token" &&
              (info as any).data["parsed"] &&
              (info as any).data["parsed"]["type"]) {
            type = (info as any).data["parsed"]["type"];
          }
          if ((info as any).data["program"] &&
              (info as any).data["program"] === "spl-token" &&
              (info as any).data["parsed"] &&
              (info as any).data["parsed"]["type"] &&
              (info as any).data["parsed"]["type"] === "account") {
            mint = (info as any).data["parsed"]["info"]["mint"];
            owner = (info as any).data["parsed"]["info"]["owner"];
          }
        }
        setRecipientAddressInfo({
          type,
          mint,
          owner
        });
      })
    }
  }, [connection, recipientAddress]);

  // Hook on wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setSelectedTokenBalance(0);
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
      }
    } else if (!connected) {
      setSelectedTokenBalance(0);
    }

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setSelectedTokenBalance,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
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

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      setCanSubscribe(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /////////////////////////////
  //  Events and validation  //
  /////////////////////////////

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

  const handleRecipientAddressFocusInOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  }

  const getRecipientAddressValidation = () => {
    if (recipientAddressInfo.type === "mint") {
      return 'Recipient cannot be a mint address'
    } else if (recipientAddressInfo.type === "account" &&
               recipientAddressInfo.mint &&
               recipientAddressInfo.mint === selectedToken?.address &&
               recipientAddressInfo.owner === publicKey?.toBase58()) {
      return 'Recipient cannot be the selected token mint';
    }
    return '';
  }

  const isRecipientAddressValid = () => {
    if (recipientAddressInfo.type === "mint") {
      return false;
    }
    if (recipientAddressInfo.type === "account" &&
               recipientAddressInfo.mint &&
               recipientAddressInfo.mint === selectedToken?.address &&
               recipientAddressInfo.owner === publicKey?.toBase58()) {
      return false;
    }
    return true;
  }

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isAddressOwnAccount = (): boolean => {
    return recipientAddress && wallet && publicKey && recipientAddress === publicKey.toBase58()
           ? true : false;
  }

  const isSendAmountValid = (): boolean => {
    if (!selectedToken) { return false; }

    const inputAmount = getInputAmountBn();

    return connected &&
           inputAmount.gtn(0) &&
           tokenBalanceBn.gtn(0) &&
           nativeBalance >= getMinSolBlanceRequired() &&
           ((selectedToken.address === NATIVE_SOL.address && parseFloat(fromCoinAmount) <= getMaxAmount()) ||
            (selectedToken.address !== NATIVE_SOL.address && tokenBalanceBn.gte(inputAmount)))
    ? true
    : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    const inputAmount = getInputAmountBn();
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (!recipientAddress || isAddressOwnAccount()) {
      return t('transactions.validation.select-recipient');
    } else if (!isRecipientAddressValid() || !isValidAddress(recipientAddress)) {
      return 'Invalid recipient address';
    } else if (!selectedToken || tokenBalanceBn.isZero()) {
      return t('transactions.validation.no-balance');
    } else if (!fromCoinAmount || !isValidNumber(fromCoinAmount) || inputAmount.isZero()) {
      return t('transactions.validation.no-amount');
    } else if (((isNative && parseFloat(fromCoinAmount) > getMaxAmount()) ||
                (!isNative && tokenBalanceBn.lt(inputAmount)))) {
      return t('transactions.validation.amount-high');
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    } else if (!recipientNote) {
      return t('transactions.validation.memo-empty');
    } else if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    } else if (nativeBalance < getMinSolBlanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getFeeAmount(), 4) });
    } else {
      return t('transactions.validation.valid-approve');
    }
  }

  const getMainCtaLabel = () => {
    if (isBusy) {
      if (isScheduledPayment()) {
        return t('streams.create-new-stream-cta-busy');
      } else {
        return t('transactions.status.cta-start-transfer-busy');
      }
    } else {
      return getTransactionStartButtonLabel();
    }
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

    const otpTx = async (data: OtpTxParams) => {

      if (!endpoint || !streamV2ProgramAddress) { return null; }

      // Init a streaming operation
      const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

      if (!isScheduledPayment()) {
        return msp.transfer(
          new PublicKey(data.wallet),                                      // sender
          new PublicKey(data.beneficiary),                                 // beneficiary
          new PublicKey(data.associatedToken),                             // beneficiaryMint
          data.amount                                                      // amount
        )
      }

      return msp.scheduledTransfer(
        new PublicKey(data.wallet),                                      // treasurer
        new PublicKey(data.beneficiary),                                 // beneficiary
        new PublicKey(data.associatedToken),                             // beneficiaryMint
        data.amount,                                                     // amount
        data.startUtc,                                                   // startUtc
        data.recipientNote,                                              // streamName
        false                                                            // feePayedByTreasurer
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
      const beneficiary = new PublicKey(recipientAddress);
      consoleOut('associatedToken:', selectedToken.address);
      const associatedToken = new PublicKey(selectedToken.address);
      const amount = toTokenAmount(fromCoinAmount, selectedToken.decimals, true);
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
      const data: OtpTxParams = {
        wallet: publicKey.toBase58(),
        beneficiary: beneficiary.toBase58(),                                        // beneficiary
        associatedToken: associatedToken.toBase58(),                                // beneficiaryMint
        amount: amount as string,                                                   // fundingAmount
        startUtc: startUtc,                                                         // startUtc
        recipientNote: recipientNote
          ? recipientNote.trim()
          : ''                                                                      // streamName
      };

      consoleOut('data:', data, 'blue');
      const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

      // Report event to Segment analytics
      const segmentData: SegmentStreamOTPTransferData = {
        asset: selectedToken?.symbol,
        assetPrice: price,
        amount: parseFloat(fromCoinAmount),
        beneficiary: data.beneficiary,
        startUtc: dateFormat(startUtc, SIMPLE_DATE_TIME_FORMAT),
        valueInUsd: price * parseFloat(fromCoinAmount)
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

      const result = await otpTx(data)
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
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return wallet.signTransaction(transaction)
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
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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
        return connection
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
            setIsBusy(false);
            resetTransactionStatus();
            resetContractValues();
            setIsVerifiedRecipient(false);
            transferCompleted();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  }, [
    wallet,
    endpoint,
    publicKey,
    connection,
    selectedToken,
    recipientNote,
    isWhitelisted,
    nativeBalance,
    fromCoinAmount,
    paymentStartDate,
    recipientAddress,
    fixedScheduleValue,
    transactionCancelled,
    streamV2ProgramAddress,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    resetContractValues,
    isScheduledPayment,
    transferCompleted,
    getFeeAmount,
  ]);

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onFixedScheduleValueChange = (value: any) => {
    setFixedScheduleValue(value);
  }

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
                  onFocus={handleRecipientAddressFocusInOut}
                  onChange={handleRecipientAddressChange}
                  onBlur={handleRecipientAddressFocusInOut}
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
              <span>&nbsp;</span>
            </div>
          </div>
            {recipientAddress && !isValidAddress(recipientAddress) && (
              <span className="form-field-error">
                {t('transactions.validation.address-validation')}
              </span>
            )}
            {isAddressOwnAccount() && (
              <span className="form-field-error">
                {t('transactions.recipient.recipient-is-own-account')}
              </span>
            )}
            {recipientAddress && !isRecipientAddressValid() && (
              <span className="form-field-error">
                {getRecipientAddressValidation()}
              </span>
            )}
        </div>

        {/* Send amount */}
        <div className="form-label">{t('transactions.send-amount.label')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                {selectedToken && (
                  <>
                    <TokenDisplay onClick={() => onOpenTokenSelector()}
                      mintAddress={selectedToken.address}
                      showCaretDown={true}
                      showName={selectedToken.name === CUSTOM_TOKEN_NAME || selectedToken.address === WRAPPED_SOL_MINT_ADDRESS ? true : false}
                      fullTokenInfo={selectedToken}
                    />
                  </>
                )}
                {selectedToken && tokenBalanceBn.gtn(getMinSolBlanceRequired()) ? (
                  <div className="token-max simplelink" onClick={() =>
                    {
                      console.log('decimals:', selectedToken.decimals);
                      if (selectedToken.address === NATIVE_SOL.address) {
                        const amount = nativeBalance - getMinSolBlanceRequired();
                        setFromCoinAmount(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
                      } else {
                        setFromCoinAmount(toUiAmount(tokenBalanceBn, selectedToken.decimals));
                      }
                    }}>
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
                {getDisplayAmount(tokenBalanceBn)}
              </span>
            </div>
            <div className="right inner-label">
              <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                ~${fromCoinAmount
                  ? formatAmount(getTokenPrice(), 2)
                  : "0.00"}
              </span>
            </div>
          </div>
          {selectedToken && selectedToken.address === NATIVE_SOL.address && (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
            <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
          )}
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
                  defaultValue={moment(
                    paymentStartDate,
                    DATEPICKER_FORMAT
                  )}
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
          disabled={
            !connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient
          }>
          {isBusy && (
            <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
          )}
          {getMainCtaLabel()}
        </Button>
      </div>
    </>
  );
};
