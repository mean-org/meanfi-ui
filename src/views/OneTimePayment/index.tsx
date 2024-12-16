import { LoadingOutlined } from '@ant-design/icons';
import {
  ACTION_CODES,
  NATIVE_SOL_MINT,
  type ScheduleTransferTransactionAccounts,
  type TransactionFees,
  type TransferTransactionAccounts,
  calculateFeesForAction,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { type AccountInfo, type ParsedAccountData, PublicKey, type Transaction } from '@solana/web3.js';
import { Button, Checkbox, DatePicker, type DatePickerProps, Select } from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import dateFormat from 'dateformat';
import dayjs from 'dayjs';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { segmentAnalytics } from 'src/App';
import {
  CUSTOM_TOKEN_NAME,
  DATEPICKER_FORMAT,
  MIN_SOL_BALANCE_REQUIRED,
  NO_FEES,
  SIMPLE_DATE_TIME_FORMAT,
  WRAPPED_SOL_MINT_ADDRESS,
} from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { openNotification } from 'src/components/Notifications';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection, useConnectionConfig } from 'src/contexts/connection';
import { TxConfirmationContext, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import { customLogger } from 'src/main';
import { SOL_MINT } from 'src/middleware/ids';
import { AppUsageEvent, type SegmentStreamOTPTransferData } from 'src/middleware/segment-service';
import { composeTxWithPrioritizationFees, sendTx, signTx } from 'src/middleware/transactions';
import {
  addMinutes,
  consoleOut,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  priorDatesDisabled,
} from 'src/middleware/ui';
import {
  cutNumber,
  formatAmount,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  isValidNumber,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount,
} from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { RecipientAddressInfo } from 'src/models/common-types';
import { EventType, OperationType, TransactionStatus } from 'src/models/enums';
import type { OtpTxParams } from 'src/models/transfers';
import useStreamingClient from 'src/query-hooks/streamingClient';
import type { LooseObject } from 'src/types/LooseObject';

const { Option } = Select;

interface OneTimePaymentProps {
  onOpenTokenSelector: () => void;
  selectedToken?: TokenInfo;
  transferCompleted?: () => void;
  userBalances: LooseObject;
}

export const OneTimePayment = ({
  onOpenTokenSelector,
  selectedToken,
  transferCompleted,
  userBalances,
}: OneTimePaymentProps) => {
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
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
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
  const [recipientAddressInfo, setRecipientAddressInfo] = useState<RecipientAddressInfo>({
    type: '',
    mint: '',
    owner: '',
  });
  const [otpFees, setOtpFees] = useState<TransactionFees>(NO_FEES);

  const { tokenStreamingV2 } = useStreamingClient();

  const isNative = useMemo(() => {
    return !!(selectedToken && selectedToken.address === NATIVE_SOL.address);
  }, [selectedToken]);

  const isScheduledPayment = useCallback((): boolean => {
    const now = new Date();
    const parsedDate = Date.parse(paymentStartDate as string);
    const fromParsedDate = new Date(parsedDate);
    return fromParsedDate.getDate() > now.getDate();
  }, [paymentStartDate]);

  const isTestingScheduledOtp = useMemo(() => {
    return isWhitelisted && fixedScheduleValue > 0;
  }, [fixedScheduleValue, isWhitelisted]);

  const dayjsDefautDate = useMemo(
    () => (paymentStartDate ? dayjs(paymentStartDate, DATEPICKER_FORMAT) : dayjs()),
    [paymentStartDate],
  );

  const getFeeAmount = useCallback(() => {
    return isScheduledPayment() ? otpFees.blockchainFee + otpFees.mspFlatFee : otpFees.blockchainFee;
  }, [isScheduledPayment, otpFees.blockchainFee, otpFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    const feeAmount = getFeeAmount();
    return feeAmount > MIN_SOL_BALANCE_REQUIRED ? feeAmount : MIN_SOL_BALANCE_REQUIRED;
  }, [getFeeAmount]);

  const getMaxAmount = useCallback(() => {
    const amount = nativeBalance - getMinSolBlanceRequired();
    return amount > 0 ? amount : 0;
  }, [getMinSolBlanceRequired, nativeBalance]);

  const getDisplayAmount = useCallback(
    (amount: BN) => {
      if (selectedToken) {
        return getAmountWithSymbol(
          toUiAmount(amount, selectedToken.decimals),
          selectedToken.address,
          true,
          splTokenList,
          selectedToken.decimals,
        );
      }
      return '0';
    },
    [selectedToken, splTokenList],
  );

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

    return Number.parseFloat(fromCoinAmount) * price;
  }, [fromCoinAmount, selectedToken, getTokenPriceByAddress]);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: event can be any type
    (param: any) => {
      consoleOut('onTxConfirmed event executed:', param, 'crimson');
      setIsBusy(false);
      resetTransactionStatus();
      resetContractValues();
      setIsVerifiedRecipient(false);
      setSelectedStream(undefined);
    },
    [setIsVerifiedRecipient, resetTransactionStatus, resetContractValues, setSelectedStream],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const getInputAmountBn = useCallback(() => {
    if (!selectedToken || !fromCoinAmount) {
      return new BN(0);
    }

    return Number.parseFloat(fromCoinAmount) > 0 ? toTokenAmountBn(fromCoinAmount, selectedToken.decimals) : new BN(0);
  }, [fromCoinAmount, selectedToken]);

  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    const getTransactionFees = async (): Promise<TransactionFees> => {
      return calculateFeesForAction(ACTION_CODES.CreateStreamWithFunds);
    };
    if (!otpFees.mspFlatFee) {
      getTransactionFees().then(values => {
        setOtpFees(values);
        consoleOut('otpFees:', values);
      });
    }
  }, [otpFees]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance]);

  // Keep token balance updated
  useEffect(() => {
    if (!connection || !publicKey || !userBalances || !selectedToken) {
      setSelectedTokenBalance(0);
      setSelectedTokenBalanceBn(new BN(0));
      return;
    }

    const balance = userBalances[selectedToken.address] as number;
    setSelectedTokenBalance(balance);
    const balanceBn = toTokenAmount(balance, selectedToken.decimals);
    setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
  }, [connection, publicKey, selectedToken, userBalances]);

  // Fetch and store information about the destination address
  useEffect(() => {
    if (!connection) {
      return;
    }

    const getInfo = async (address: string) => {
      try {
        const accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
        consoleOut('accountInfo:', accountInfo, 'blue');
        return accountInfo;
      } catch (error) {
        console.error(error);
        return null;
      }
    };

    if (recipientAddress && isValidAddress(recipientAddress)) {
      let type = '';
      let mint = '';
      let owner = '';
      getInfo(recipientAddress).then(info => {
        if (info) {
          const asParsedAccountInfo = info as AccountInfo<ParsedAccountData>;
          if (
            asParsedAccountInfo.data.program &&
            asParsedAccountInfo.data.program === 'spl-token' &&
            asParsedAccountInfo.data.parsed &&
            asParsedAccountInfo.data.parsed.type
          ) {
            type = asParsedAccountInfo.data.parsed.type;
          }
          if (
            asParsedAccountInfo.data.program &&
            asParsedAccountInfo.data.program === 'spl-token' &&
            asParsedAccountInfo.data.parsed &&
            asParsedAccountInfo.data.parsed.type &&
            asParsedAccountInfo.data.parsed.type === 'account'
          ) {
            mint = asParsedAccountInfo.data.parsed.info.mint;
            owner = asParsedAccountInfo.data.parsed.info.owner;
          }
        }
        setRecipientAddressInfo({
          type,
          mint,
          owner,
        });
      });
    }
  }, [connection, recipientAddress]);

  // Window resize listener
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll('.overflow-ellipsis-middle');
      for (const element of ellipsisElements) {
        const e = element as HTMLElement;
        if (e.offsetWidth < e.scrollWidth) {
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
    };
  }, []);

  // Setup event listeners
  useEffect(() => {
    if (!(publicKey && canSubscribe)) {
      return;
    }

    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> OneTimePayment', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
    confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
    consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
  }, [publicKey, canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> OneTimePayment', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
    };
  }, []);

  /////////////////////////////
  //  Events and validation  //
  /////////////////////////////

  const handleFromCoinAmountChange = (e: string) => {
    let newValue = e;

    const decimals = selectedToken ? selectedToken.decimals : 0;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = +splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === '') {
      setFromCoinAmount('');
    } else if (newValue === '.') {
      setFromCoinAmount('.');
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  };

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  };

  const handleRecipientNoteChange = (value: string) => {
    setRecipientNote(value);
  };

  const handleRecipientAddressChange = (value: string) => {
    const trimmedValue = value.trim();
    setRecipientAddress(trimmedValue);
  };

  const handleRecipientAddressFocusInOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  };

  const getRecipientAddressValidation = () => {
    if (recipientAddressInfo.type === 'mint') {
      return 'Recipient cannot be a mint address';
    }
    if (
      recipientAddressInfo.type === 'account' &&
      recipientAddressInfo.mint &&
      recipientAddressInfo.mint === selectedToken?.address &&
      recipientAddressInfo.owner === publicKey?.toBase58()
    ) {
      return 'Recipient cannot be the selected token mint';
    }

    return '';
  };

  const isRecipientAddressValid = () => {
    if (recipientAddressInfo.type === 'mint') {
      return false;
    }
    if (
      recipientAddressInfo.type === 'account' &&
      recipientAddressInfo.mint &&
      recipientAddressInfo.mint === selectedToken?.address &&
      recipientAddressInfo.owner === publicKey?.toBase58()
    ) {
      return false;
    }
    return true;
  };

  const isMemoValid = (): boolean => {
    if (isScheduledPayment() && !recipientNote) {
      return false;
    }

    return recipientNote.length <= 32;
  };

  const isAddressOwnAccount = (): boolean => publicKey?.toBase58() === recipientAddress;

  const isSendAmountValid = (): boolean => {
    if (!selectedToken) {
      return false;
    }

    const inputAmount = getInputAmountBn();

    return !!(
      connected &&
      inputAmount.gtn(0) &&
      tokenBalanceBn.gtn(0) &&
      nativeBalance >= getMinSolBlanceRequired() &&
      ((selectedToken.address === NATIVE_SOL.address && Number.parseFloat(fromCoinAmount) <= getMaxAmount()) ||
        (selectedToken.address !== NATIVE_SOL.address && tokenBalanceBn.gte(inputAmount)))
    );
  };

  const areSendAmountSettingsValid = (): boolean => {
    return !!(paymentStartDate && isSendAmountValid());
  };

  // Ui helpers
  const getTransactionStartButtonLabel = (): string => {
    const inputAmount = getInputAmountBn();
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (!recipientAddress || isAddressOwnAccount()) {
      return t('transactions.validation.select-recipient');
    }
    if (!isRecipientAddressValid() || !isValidAddress(recipientAddress)) {
      return 'Invalid recipient address';
    }
    if (!selectedToken || tokenBalanceBn.isZero()) {
      return t('transactions.validation.no-balance');
    }
    if (!fromCoinAmount || !isValidNumber(fromCoinAmount) || inputAmount.isZero()) {
      return t('transactions.validation.no-amount');
    }
    if (
      (isNative && Number.parseFloat(fromCoinAmount) > getMaxAmount()) ||
      (!isNative && tokenBalanceBn.lt(inputAmount))
    ) {
      return t('transactions.validation.amount-high');
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (isScheduledPayment() && !recipientNote) {
      return t('transactions.validation.memo-empty');
    }
    if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    }
    if (nativeBalance < getMinSolBlanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', {
        balance: formatThousands(getFeeAmount(), 4),
      });
    }

    return t('transactions.validation.valid-approve');
  };

  const getMainCtaLabel = () => {
    if (isBusy) {
      if (isScheduledPayment()) {
        return t('streams.create-new-stream-cta-busy');
      }

      return t('transactions.status.cta-start-transfer-busy');
    }

    return getTransactionStartButtonLabel();
  };

  // Main action

  const onStartTransaction = useCallback(async () => {
    let transaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const otpTx = async (data: OtpTxParams) => {
      if (!endpoint || !publicKey) {
        return null;
      }

      if (!isScheduledPayment() && !isTestingScheduledOtp) {
        const accounts: TransferTransactionAccounts = {
          feePayer: publicKey, // feePayer
          sender: new PublicKey(data.wallet), // sender
          beneficiary: new PublicKey(data.beneficiary), // beneficiary
          mint: new PublicKey(data.associatedToken), // mint
        };
        const { transaction } = await tokenStreamingV2.buildTransferTransaction(
          accounts, // accounts
          data.amount, // amount
        );

        return await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);
      }

      const accounts: ScheduleTransferTransactionAccounts = {
        feePayer: publicKey, // feePayer
        beneficiary: new PublicKey(data.beneficiary), // beneficiary
        owner: new PublicKey(data.wallet), // owner
        mint: new PublicKey(data.associatedToken), // mint
      };
      const { transaction } = await tokenStreamingV2.buildScheduleTransferTransaction(
        accounts, // accounts
        data.amount, // amount
      );

      return transaction;
    };

    const createTx = async (): Promise<boolean> => {
      if (!wallet || !publicKey || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('One-Time Payment transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('Wallet address:', publicKey?.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      consoleOut('Beneficiary address:', recipientAddress);
      const beneficiary = new PublicKey(recipientAddress);
      consoleOut('associatedToken:', selectedToken.address);
      const associatedToken =
        selectedToken.address === SOL_MINT.toBase58() // && isScheduledPayment()
          ? NATIVE_SOL_MINT // imported from SDK
          : new PublicKey(selectedToken.address);
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
        consoleOut(`Adding ${fixedScheduleValue} minutes to current time`, '...', 'blue');
        startUtc = addMinutes(startUtc, fixedScheduleValue);
      }

      consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
      consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
      consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
      consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

      // Create a transaction
      const data: OtpTxParams = {
        wallet: publicKey.toBase58(),
        beneficiary: beneficiary.toBase58(), // beneficiary
        associatedToken: associatedToken.toBase58(), // beneficiaryMint
        amount: amount as string, // fundingAmount
        startUtc: startUtc, // startUtc
        recipientNote: recipientNote ? recipientNote.trim() : '', // streamName
      };

      consoleOut('data:', data, 'blue');
      const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

      // Report event to Segment analytics
      const segmentData: SegmentStreamOTPTransferData = {
        asset: selectedToken?.symbol,
        assetPrice: price,
        amount: Number.parseFloat(fromCoinAmount),
        beneficiary: data.beneficiary,
        startUtc: dateFormat(startUtc, SIMPLE_DATE_TIME_FORMAT),
        valueInUsd: price * Number.parseFloat(fromCoinAmount),
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data,
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: '',
      });

      consoleOut('otpFee:', getFeeAmount(), 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      const result = await otpTx(data)
        .then(value => {
          if (!value) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            });
            customLogger.logError('One-Time Payment transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, {
              transcript: transactionLog,
            });
            return false;
          }
          consoleOut('oneTimePayment returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value),
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('oneTimePayment error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('One-Time Payment transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferOTPFailed, {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey && selectedToken) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled && transaction) {
        const txTitle = isScheduledPayment() ? 'Scheduled Transfer' : 'One Time Transfer';
        const sign = await signTx(txTitle, wallet.adapter, publicKey, transaction as Transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx(txTitle, connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            if (isScheduledPayment()) {
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.Transfer,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Scheduled transfer for ${formatThousands(
                  Number.parseFloat(fromCoinAmount),
                  selectedToken.decimals,
                )} ${selectedToken.symbol}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: 'Transfer successfully Scheduled!',
                extras: 'scheduled',
              });
            } else {
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.Transfer,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Sending ${formatThousands(
                  Number.parseFloat(fromCoinAmount),
                  selectedToken.decimals,
                )} ${selectedToken.symbol}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully sent ${formatThousands(
                  Number.parseFloat(fromCoinAmount),
                  selectedToken.decimals,
                )} ${selectedToken.symbol}`,
              });
            }
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished,
            });
            setIsBusy(false);
            resetTransactionStatus();
            resetContractValues();
            setIsVerifiedRecipient(false);
            transferCompleted?.();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-sending-transaction'),
            type: 'error',
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
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
    tokenStreamingV2,
    paymentStartDate,
    recipientAddress,
    fixedScheduleValue,
    transactionCancelled,
    isTestingScheduledOtp,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    setTransactionStatus,
    resetContractValues,
    isScheduledPayment,
    transferCompleted,
    getFeeAmount,
    t,
  ]);

  const onDateChange: DatePickerProps['onChange'] = (_date, dateString) => {
    handleDateChange(dateString as string);
  };

  const onIsVerifiedRecipientChange = (e: CheckboxChangeEvent) => {
    setIsVerifiedRecipient(e.target.checked);
  };

  const onFixedScheduleValueChange = (value: number) => {
    setFixedScheduleValue(value);
  };

  return (
    <div className='contract-wrapper'>
      {/* Recipient */}
      <div className='form-label'>{t('transactions.recipient.label')}</div>
      <div className='well'>
        <div className='flex-fixed-right'>
          <div className='left position-relative'>
            <span className='recipient-field-wrapper'>
              <input
                id='payment-recipient-field'
                className='general-text-input'
                autoComplete='on'
                autoCorrect='off'
                type='text'
                onFocus={handleRecipientAddressFocusInOut}
                onChange={e => handleRecipientAddressChange(e.target.value)}
                onBlur={handleRecipientAddressFocusInOut}
                placeholder={t('transactions.recipient.placeholder')}
                required={true}
                spellCheck='false'
                value={recipientAddress}
              />
              <span
                id='payment-recipient-static-field'
                className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}
              >
                {recipientAddress || t('transactions.recipient.placeholder')}
              </span>
            </span>
          </div>
          <div className='right'>
            <span>&nbsp;</span>
          </div>
        </div>
        {recipientAddress && !isValidAddress(recipientAddress) && (
          <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
        )}
        {isAddressOwnAccount() && (
          <span className='form-field-error'>{t('transactions.recipient.recipient-is-own-account')}</span>
        )}
        {recipientAddress && !isRecipientAddressValid() && (
          <span className='form-field-error'>{getRecipientAddressValidation()}</span>
        )}
      </div>

      {/* Send amount */}
      <div className='form-label'>{t('transactions.send-amount.label')}</div>
      <div className='well'>
        <div className='flex-fixed-left'>
          <div className='left'>
            <span className='add-on simplelink'>
              {selectedToken && (
                <TokenDisplay
                  onClick={onOpenTokenSelector}
                  mintAddress={selectedToken.address}
                  showCaretDown={true}
                  showName={
                    selectedToken.name === CUSTOM_TOKEN_NAME || selectedToken.address === WRAPPED_SOL_MINT_ADDRESS
                  }
                  fullTokenInfo={selectedToken}
                />
              )}
              {selectedToken && tokenBalanceBn.gtn(getMinSolBlanceRequired()) ? (
                <div
                  className='token-max simplelink'
                  onKeyDown={() => {}}
                  onClick={() => {
                    console.log('decimals:', selectedToken.decimals);
                    if (selectedToken.address === NATIVE_SOL.address) {
                      const amount = nativeBalance - getMinSolBlanceRequired();
                      setFromCoinAmount(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
                    } else {
                      setFromCoinAmount(toUiAmount(tokenBalanceBn, selectedToken.decimals));
                    }
                  }}
                >
                  MAX
                </div>
              ) : null}
            </span>
          </div>
          <div className='right'>
            <input
              className='general-text-input text-right'
              inputMode='decimal'
              autoComplete='off'
              autoCorrect='off'
              type='text'
              onChange={e => handleFromCoinAmountChange(e.target.value)}
              pattern='^[0-9]*[.,]?[0-9]*$'
              placeholder='0.0'
              minLength={1}
              maxLength={79}
              spellCheck='false'
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className='flex-fixed-right'>
          <div className='left inner-label'>
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>{getDisplayAmount(tokenBalanceBn)}</span>
          </div>
          <div className='right inner-label'>
            <span
              className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
              onKeyDown={() => {}}
              onClick={() => refreshPrices()}
            >
              ~${fromCoinAmount ? formatAmount(getTokenPrice(), 2) : '0.00'}
            </span>
          </div>
        </div>
        {selectedToken &&
          selectedToken.address === NATIVE_SOL.address &&
          (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
            <div className='form-field-error'>{t('transactions.validation.minimum-balance-required')}</div>
          )}
      </div>

      {/* Optional note */}
      <div className='form-label'>{t('transactions.memo.label')}</div>
      <div className='well'>
        <div className='flex-fixed-right'>
          <div className='left'>
            <input
              id='payment-memo-field'
              className='w-100 general-text-input'
              autoComplete='on'
              autoCorrect='off'
              type='text'
              maxLength={32}
              onChange={e => handleRecipientNoteChange(e.target.value)}
              placeholder={t('transactions.memo.placeholder')}
              spellCheck='false'
              value={recipientNote}
            />
          </div>
        </div>
      </div>

      {/* Send date */}
      <div className='form-label'>{t('transactions.send-date.label')}</div>
      <div className='well'>
        <div className='flex-fixed-right'>
          <div className='left static-data-field'>
            {isToday(paymentStartDate || '')
              ? `${paymentStartDate} (${t('common:general.now')})`
              : `${paymentStartDate}`}
          </div>
          <div className='right'>
            <div className='add-on simplelink'>
              <DatePicker
                size='middle'
                variant='borderless'
                className='addon-date-picker'
                aria-required={true}
                allowClear={false}
                showNow={false}
                disabledDate={priorDatesDisabled}
                placeholder={t('transactions.send-date.placeholder')}
                onChange={onDateChange}
                value={dayjsDefautDate}
                format={DATEPICKER_FORMAT}
              />
            </div>
          </div>
        </div>
      </div>

      {isWhitelisted && (
        <>
          <div className='form-label'>Schedule transfer for: (For dev team only)</div>
          <div className='well'>
            <Select
              value={fixedScheduleValue}
              variant='borderless'
              onChange={value => onFixedScheduleValueChange(value)}
              style={{ width: '100%' }}
            >
              <Option value={0}>No fixed scheduling</Option>
              <Option value={5}>5 minutes from now</Option>
              <Option value={10}>10 minutes from now</Option>
              <Option value={15}>15 minutes from now</Option>
              <Option value={20}>20 minutes from now</Option>
              <Option value={30}>30 minutes from now</Option>
            </Select>
            <div className='form-field-hint'>Selecting a value will override your date selection</div>
          </div>
        </>
      )}

      {/* Confirm recipient address is correct Checkbox */}
      <div className='mb-2'>
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
          {t('transfers.verified-recipient-disclaimer')}
        </Checkbox>
      </div>

      {/* Action button */}
      <Button
        className={`main-cta ${isBusy ? 'inactive' : ''}`}
        block
        type='primary'
        shape='round'
        size='large'
        onClick={onStartTransaction}
        disabled={
          !connected ||
          !isMemoValid() ||
          !isValidAddress(recipientAddress) ||
          isAddressOwnAccount() ||
          !areSendAmountSettingsValid() ||
          !isVerifiedRecipient
        }
      >
        {isBusy && (
          <span className='mr-1'>
            <LoadingOutlined style={{ fontSize: '16px' }} />
          </span>
        )}
        {getMainCtaLabel()}
      </Button>
    </div>
  );
};
