import React from 'react';
import { Button, Modal, Menu, Dropdown, DatePicker, Checkbox } from "antd";
import {
  LoadingOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { IconCaretDown, IconEdit } from "../../Icons";
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTxIxResume,
  isValidNumber,
  shortenAddress,
  toTokenAmount,
} from "../../utils/utils";
import { Identicon } from "../../components/Identicon";
import { DATEPICKER_FORMAT, SIMPLE_DATE_TIME_FORMAT } from "../../constants";
import { QrScannerModal } from "../../components/QrScannerModal";
import { EventType, OperationType, PaymentRateType, TransactionStatus } from "../../models/enums";
import {
  consoleOut,
  disabledDate,
  getAmountWithTokenSymbol,
  getFairPercentForInterval,
  getIntervalFromSeconds,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  PaymentRateTypeOption
} from "../../utils/ui";
import moment from "moment";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TokenInfo } from "@solana/spl-token-registry";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { useTranslation } from "react-i18next";
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { customLogger } from '../..';
import { StepSelector } from '../../components/StepSelector';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { useNavigate } from 'react-router-dom';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from '../../contexts/transaction-status';
import { TokenDisplay } from '../../components/TokenDisplay';
import { TextInput } from '../../components/TextInput';
import { TokenListItem } from '../../components/TokenListItem';
import { calculateActionFees, MSP, MSP_ACTIONS, TransactionFees } from "@mean-dao/msp";
import { AppUsageEvent, SegmentStreamRPTransferData } from '../../utils/segment-service';
import { segmentAnalytics } from '../../App';
import dateFormat from 'dateformat';
import { NATIVE_SOL } from '../../utils/tokens';

export const RepeatingPayment = (props: { inModal: boolean; }) => {
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
    recipientAddress,
    recipientNote,
    paymentStartDate,
    fromCoinAmount,
    paymentRateAmount,
    paymentRateFrequency,
    transactionStatus,
    isVerifiedRecipient,
    streamV2ProgramAddress,
    previousWalletConnectState,
    refreshPrices,
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
    setIsVerifiedRecipient,
    setPaymentRateFrequency,
    setSelectedTokenBalance,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
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
  const [currentStep, setCurrentStep] = useState(0);
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

  const [repeatingPaymentFees, setRepeatingPaymentFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  useEffect(() => {
    getTransactionFees(MSP_ACTIONS.createStreamWithFunds).then(value => {
      setRepeatingPaymentFees(value);
      consoleOut("repeatingPaymentFees:", value, 'orange');
    });
  }, [
    repeatingPaymentFees.mspFlatFee,
    getTransactionFees,
  ]);

  const resetTransactionStatus = useCallback(() => {

    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });

  }, [
    setTransactionStatus
  ]);

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

  const handleGoToStreamsClick = useCallback(() => {
    resetContractValues();
    setCurrentStep(0);
    navigate("/accounts/streams");
  }, [navigate, resetContractValues]);

  const recordTxConfirmation = useCallback((signature: string, success = true) => {
    let event: any;
    event = success ? AppUsageEvent.TransferRecurringCompleted : AppUsageEvent.TransferRecurringFailed;
    segmentAnalytics.recordEvent(event, { signature: signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxConfirmed event executed:", item, 'crimson');
    // If we have the item, record success and remove it from the list
    if (item && item.operationType === OperationType.Transfer) {
      recordTxConfirmation(item.signature, true);
      handleGoToStreamsClick();
    }
    setIsBusy(false);
    resetTransactionStatus();
  }, [
    recordTxConfirmation,
    handleGoToStreamsClick,
    resetTransactionStatus,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxTimedout event executed:", item, 'crimson');
    // If we have the item, record failure and remove it from the list
    if (item) {
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

  const handlePaymentRateAmountChange = (e: any) => {

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
    tokenList
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

  const getFeeAmount = useCallback(() => {
    return repeatingPaymentFees.blockchainFee + repeatingPaymentFees.mspFlatFee;
  }, [repeatingPaymentFees.blockchainFee, repeatingPaymentFees.mspFlatFee]);

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || ! effectiveRate) {
      return 0;
    }

    return parseFloat(fromCoinAmount) * effectiveRate;
  }, [effectiveRate, fromCoinAmount]);

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

  // Ui helpers
  const getStepOneContinueButtonLabel = (): string => {
    return !connected
      ? t('transactions.validation.not-connected')
      : !recipientAddress || isAddressOwnAccount()
        ? t('transactions.validation.select-recipient')
        : !selectedToken || !tokenBalance
          ? t('transactions.validation.no-balance')
          : !paymentStartDate
            ? t('transactions.validation.no-valid-date')
            : !recipientNote
              ? t('transactions.validation.memo-empty')
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
      : !recipientNote
      ? t('transactions.validation.memo-empty')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : nativeBalance < getFeeAmount()
      ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getFeeAmount(), 4) })
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

  const getPaymentRateLabel = useCallback((
    rate: PaymentRateType,
    amount: string | undefined
  ): string => {
    let label: string;
    label = `${selectedToken ? getAmountWithTokenSymbol(amount, selectedToken) : '--'}`;
    switch (rate) {
      case PaymentRateType.PerMinute:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-minute')}`;
        break;
      case PaymentRateType.PerHour:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-hour')}`;
        break;
      case PaymentRateType.PerDay:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-day')}`;
        break;
      case PaymentRateType.PerWeek:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-week')}`;
        break;
      case PaymentRateType.PerMonth:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-month')}`;
        break;
      case PaymentRateType.PerYear:
        label += ` ${t('transactions.rate-and-frequency.payment-rates.per-year')}`;
        break;
      default:
        break;
    }
    return label;
  }, [selectedToken, t]);

  const getRecommendedFundingAmount = () => {
    const rateAmount = parseFloat(paymentRateAmount as string);
    const percent = getFairPercentForInterval(paymentRateFrequency);
    const recommendedMinAmount = percent * rateAmount || 0;
    const formatted = formatAmount(recommendedMinAmount, selectedToken?.decimals, true);

    // String to obtain: 0.21 SOL (10%).
    return `${parseFloat(formatted).toString()} ${selectedToken?.symbol}`;
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

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
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

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && selectedToken) {
        consoleOut('Wallet address:', wallet?.publicKey?.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        consoleOut('Beneficiary address:', recipientAddress);
        const beneficiary = new PublicKey(recipientAddress as string);
        consoleOut('beneficiaryMint:', selectedToken.address);
        const associatedToken = new PublicKey(selectedToken.address as string);
        const amount = toTokenAmount(parseFloat(fromCoinAmount as string), selectedToken.decimals);
        const rateAmount = toTokenAmount(parseFloat(paymentRateAmount as string), selectedToken.decimals);
        const now = new Date();
        const parsedDate = Date.parse(paymentStartDate as string);
        const startUtc = new Date(parsedDate);
        startUtc.setHours(now.getHours());
        startUtc.setMinutes(now.getMinutes());
        startUtc.setSeconds(now.getSeconds());
        startUtc.setMilliseconds(now.getMilliseconds());

        consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
        consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
        consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
        consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

        // Create a transaction
        const data = {
          wallet: wallet.publicKey.toBase58(),                        // wallet
          treasury: 'undefined',                                      // treasury
          beneficiary: beneficiary.toBase58(),                        // beneficiary
          associatedToken: associatedToken.toBase58(),                // mint
          rateAmount: rateAmount,                                     // rateAmount
          rateIntervalInSeconds:
            getRateIntervalInSeconds(paymentRateFrequency),           // rateIntervalInSeconds
          startUtc: startUtc,                                         // startUtc
          streamName: recipientNote
            ? recipientNote.trim()
            : undefined,                                              // streamName
          allocation: amount,                                         // allocation
          feePayedByTreasurer: false // TODO: Should come from the UI
        };
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamRPTransferData = {
          asset: selectedToken?.symbol,
          assetPrice: effectiveRate,
          allocation: parseFloat(fromCoinAmount as string),
          beneficiary: data.beneficiary,
          startUtc: dateFormat(data.startUtc, SIMPLE_DATE_TIME_FORMAT),
          rateAmount: parseFloat(paymentRateAmount as string),
          interval: getPaymentRateOptionLabel(paymentRateFrequency),
          feePayedByTreasurer: data.feePayedByTreasurer
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        consoleOut('repeatingPaymentFees:', getFeeAmount(), 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        // Init a streaming operation
        const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

        return await msp.streamPayment(
          publicKey,                                                  // treasurer
          beneficiary,                                                // beneficiary
          associatedToken,                                            // mint
          recipientNote,                                              // streamName
          amount,                                                     // allocationAssigned
          rateAmount,                                                 // rateAmount
          getRateIntervalInSeconds(paymentRateFrequency),             // rateIntervalInSeconds
          startUtc,                                                   // startUtc
          0,                                                          // cliffVestAmount
          0,                                                          // cliffVestPercent
          false // TODO: (feePayedByTreasurer)
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
          customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
            customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringSigned, {
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
          customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
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
        customLogger.logError('Repeating Payment transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      let created: boolean;
      created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamCreate,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Send ${getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfuly sent ${getPaymentRateLabel(paymentRateFrequency, paymentRateAmount)}`
            });
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
    nativeBalance,
    recipientNote,
    selectedToken,
    effectiveRate,
    fromCoinAmount,
    recipientAddress,
    paymentStartDate,
    paymentRateAmount,
    paymentRateFrequency,
    transactionCancelled,
    streamV2ProgramAddress,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    setTransactionStatus,
    getPaymentRateLabel,
    getFeeAmount
  ]);

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onGoToWrap = () => {
    onCloseTokenSelector();
    navigate('/wrap');
  }


  ///////////////////
  //   Rendering   //
  ///////////////////

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
      <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

      <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

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

        {/* Receive rate */}
        <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
                {selectedToken && (
                  <TokenDisplay onClick={() => showTokenSelector()}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showName={false}
                    showCaretDown={true}
                  />
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
                    ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                    : "0"
                }`}
              </span>
            </div>
            <div className="right inner-label">&nbsp;</div>
          </div>
        </div>

        {/* Receive frequency */}
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

        {/* Memo */}
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
                maxLength={32}
                onChange={handleRecipientNoteChange}
                placeholder={t('transactions.memo2.placeholder')}
                spellCheck="false"
                value={recipientNote}
              />
            </div>
          </div>
        </div>

        {/* Continue button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onContinueButtonClick}
          disabled={!connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid()}>
          {getStepOneContinueButtonLabel()}
        </Button>

      </div>

      <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>

        {/* Summary */}
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

        <div className="mb-3 text-center">
          <div>{t('transactions.transaction-info.add-funds-repeating-payment-advice')}.</div>
          <div>{t('transactions.transaction-info.min-recommended-amount')}: <span className="fg-orange-red">{getRecommendedFundingAmount()}</span></div>
        </div>

        {/* Add funds */}
        <div className="form-label">{t('transactions.send-amount.label-amount')}</div>
        <div className="well">
          <div className="flex-fixed-left">
            <div className="left">
              <span className="add-on simplelink">
              {selectedToken && (
                <TokenDisplay onClick={() => showTokenSelector()}
                    mintAddress={selectedToken.address}
                    name={selectedToken.name}
                    showName={false}
                    showCaretDown={true}
                  />
                )}
                {selectedToken && tokenBalance ? (
                  <div
                    className="token-max simplelink"
                    onClick={() =>
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
          disabled={!connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid() ||
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

      {/* QR scan modal */}
      {isQrScannerModalVisible && (
        <QrScannerModal
          isVisible={isQrScannerModalVisible}
          handleOk={onAcceptQrScannerModal}
          handleClose={closeQrScannerModal}/>
      )}

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
                id="token-search-rp"
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
    </>
  );
};
