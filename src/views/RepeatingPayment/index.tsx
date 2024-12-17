import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import {
  ACTION_CODES,
  NATIVE_SOL_MINT,
  type StreamPaymentTransactionAccounts,
  type TransactionFees,
  calculateFeesForAction,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { type AccountInfo, type ParsedAccountData, PublicKey, type Transaction } from '@solana/web3.js';
import { Button, Checkbox, DatePicker, type DatePickerProps, Dropdown } from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import dateFormat from 'dateformat';
import dayjs from 'dayjs';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { segmentAnalytics } from 'src/App';
import { IconCaretDown, IconEdit } from 'src/Icons';
import {
  DATEPICKER_FORMAT,
  MIN_SOL_BALANCE_REQUIRED,
  NO_FEES,
  SIMPLE_DATE_TIME_FORMAT,
} from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import { Identicon } from 'src/components/Identicon';
import { InfoIcon } from 'src/components/InfoIcon';
import { openNotification } from 'src/components/Notifications';
import { StepSelector } from 'src/components/StepSelector';
import { TokenDisplay } from 'src/components/TokenDisplay';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { TxConfirmationContext, type TxConfirmationInfo, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import useWindowSize from 'src/hooks/useWindowResize';
import { customLogger } from 'src/main';
import { SOL_MINT } from 'src/middleware/ids';
import { sendTx, signTx } from 'src/middleware/transactions';
import {
  consoleOut,
  getIntervalFromSeconds,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  priorDatesDisabled,
  toUsCurrency,
} from 'src/middleware/ui';
import {
  cutNumber,
  displayAmountWithSymbol,
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  isValidNumber,
  shortenAddress,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount,
} from 'src/middleware/utils';
import { PaymentRateTypeOption } from 'src/models/PaymentRateTypeOption';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { RecipientAddressInfo } from 'src/models/common-types';
import { EventType, OperationType, PaymentRateType, TransactionStatus } from 'src/models/enums';
import useStreamingClient from 'src/query-hooks/streamingClient';
import { AppUsageEvent, type SegmentStreamRPTransferData } from 'src/services/segment-service';
import type { LooseObject } from 'src/types/LooseObject';

interface RepeatingPaymentProps {
  onOpenTokenSelector: () => void;
  selectedToken?: TokenInfo;
  transferCompleted?: () => void;
  userBalances: LooseObject;
}

export const RepeatingPayment = ({
  onOpenTokenSelector,
  selectedToken,
  transferCompleted,
  userBalances,
}: RepeatingPaymentProps) => {
  const connection = useConnection();
  const { connected, publicKey, wallet } = useWallet();
  const {
    splTokenList,
    loadingPrices,
    recipientNote,
    fromCoinAmount,
    recipientAddress,
    paymentStartDate,
    paymentRateAmount,
    transactionStatus,
    isVerifiedRecipient,
    paymentRateFrequency,
    setPaymentRateFrequency,
    setIsVerifiedRecipient,
    getTokenPriceByAddress,
    setPaymentRateAmount,
    setTransactionStatus,
    resetContractValues,
    setRecipientAddress,
    setPaymentStartDate,
    setFromCoinAmount,
    setRecipientNote,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const { width } = useWindowSize();
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [canSubscribe, setCanSubscribe] = useState(true);
  const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
  const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));
  const [recipientAddressInfo, setRecipientAddressInfo] = useState<RecipientAddressInfo>({
    type: '',
    mint: '',
    owner: '',
  });
  const [repeatingPaymentFees, setRepeatingPaymentFees] = useState<TransactionFees>(NO_FEES);

  const { tokenStreamingV2 } = useStreamingClient();

  const isNative = useMemo(() => !!(selectedToken && selectedToken.address === NATIVE_SOL.address), [selectedToken]);

  const dayjsDefautDate = useMemo(
    () => (paymentStartDate ? dayjs(paymentStartDate, DATEPICKER_FORMAT) : dayjs()),
    [paymentStartDate],
  );

  const getTransactionFees = useCallback(async (action: ACTION_CODES): Promise<TransactionFees> => {
    return calculateFeesForAction(action);
  }, []);

  const getFeeAmount = useCallback(() => {
    return repeatingPaymentFees.blockchainFee + repeatingPaymentFees.mspFlatFee;
  }, [repeatingPaymentFees.blockchainFee, repeatingPaymentFees.mspFlatFee]);

  const getMinSolBlanceRequired = useCallback(() => {
    const feeAmount = getFeeAmount();
    return feeAmount > MIN_SOL_BALANCE_REQUIRED ? feeAmount : (MIN_SOL_BALANCE_REQUIRED as number);
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

  // Event handling

  const handleGoToStreamsClick = useCallback(() => {
    resetContractValues();
    setCurrentStep(0);
  }, [resetContractValues]);

  const recordTxConfirmation = useCallback((signature: string, success = true) => {
    const event = success ? AppUsageEvent.TransferRecurringCompleted : AppUsageEvent.TransferRecurringFailed;
    segmentAnalytics.recordEvent(event, { signature: signature });
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      consoleOut('onTxConfirmed event executed:', item, 'crimson');
      setIsBusy(false);
      resetTransactionStatus();
      // If we have the item, record success and remove it from the list
      if (item && item.operationType === OperationType.Transfer) {
        recordTxConfirmation(item.signature, true);
        handleGoToStreamsClick();
      }
    },
    [recordTxConfirmation, handleGoToStreamsClick, resetTransactionStatus],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      console.log('onTxTimedout event executed:', item);
      // If we have the item, record failure and remove it from the list
      if (item) {
        recordTxConfirmation(item.signature, false);
      }
      setIsBusy(false);
      resetTransactionStatus();
    },
    [recordTxConfirmation, resetTransactionStatus],
  );

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

  const handleRecipientNoteChange = (e: string) => {
    setRecipientNote(e);
  };

  const handleRecipientAddressChange = (e: string) => {
    const inputValue = e;
    // Set the input value
    const trimmedValue = inputValue.trim();
    setRecipientAddress(trimmedValue);
  };

  const handleRecipientAddressFocusInOut = () => {
    setTimeout(() => {
      triggerWindowResize();
    }, 10);
  };

  const handlePaymentRateAmountChange = (e: string) => {
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
      setPaymentRateAmount('');
    } else if (newValue === '.') {
      setPaymentRateAmount('.');
    } else if (isValidNumber(newValue)) {
      setPaymentRateAmount(newValue);
    }
  };

  const handlePaymentRateOptionChange = (val: PaymentRateType) => {
    setPaymentRateFrequency(val);
  };

  const getTokenPrice = useCallback(() => {
    if (!fromCoinAmount || !selectedToken) {
      return 0;
    }
    const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

    return Number.parseFloat(fromCoinAmount) * price;
  }, [fromCoinAmount, selectedToken, getTokenPriceByAddress]);

  const getPaymentRateAmount = useCallback(() => {
    let outStr = '-';

    if (isValidNumber(paymentRateAmount)) {
      outStr = selectedToken
        ? displayAmountWithSymbol(
            toTokenAmountBn(paymentRateAmount, selectedToken.decimals),
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
          )
        : '-';
    }
    outStr += getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t);

    return outStr;
  }, [paymentRateAmount, paymentRateFrequency, selectedToken, splTokenList, t]);

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
    getTransactionFees(ACTION_CODES.CreateStreamWithFunds).then(value => {
      setRepeatingPaymentFees(value);
      consoleOut('repeatingPaymentFees:', value, 'orange');
    });
  }, [getTransactionFees]);

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

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallScreen && width < 576) {
      setIsSmallScreen(true);
    } else {
      setIsSmallScreen(false);
    }
  }, [isSmallScreen, width]);

  // Setup event listeners
  useEffect(() => {
    if (!(publicKey && canSubscribe)) {
      return;
    }
    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> RepeatingPayment', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
    confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
    consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
  }, [publicKey, canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> RepeatingPayment', '', 'brown');
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
    return !!(recipientNote && recipientNote.length <= 32);
  };

  const isAddressOwnAccount = (): boolean => {
    return !!(recipientAddress && wallet && publicKey && recipientAddress === publicKey.toBase58());
  };

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
    return !!(isSendAmountValid() && paymentStartDate);
  };

  const arePaymentSettingsValid = (): boolean => {
    if (!paymentStartDate) {
      return false;
    }
    const rateAmount = Number.parseFloat(paymentRateAmount || '0');
    if (!rateAmount) {
      return false;
    }

    return true;
  };

  // Ui helpers
  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = Number.parseFloat(paymentRateAmount || '0');
    if (!rateAmount) {
      return t('transactions.validation.no-payment-rate');
    }
    if (tokenBalanceBn.ltn(rateAmount)) {
      return t('transactions.validation.payment-rate-high');
    }

    return 'Invalid payment rate';
  };

  const getStepOneContinueButtonLabel = (): string => {
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
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!recipientNote) {
      return t('transactions.validation.memo-empty');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }

    return t('transactions.validation.valid-continue');
  };

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
    if (!recipientNote) {
      return t('transactions.validation.memo-empty');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }
    if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    }
    if (nativeBalance < getMinSolBlanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', {
        balance: formatThousands(getMinSolBlanceRequired(), 4),
      });
    }

    return t('transactions.validation.valid-approve');
  };

  const getOptionsFromEnum = (value: typeof PaymentRateType): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
      const mappedValue = Number.parseInt(enumMember, 10);
      if (!Number.isNaN(mappedValue)) {
        const item = new PaymentRateTypeOption(index, mappedValue, getPaymentRateOptionLabel(mappedValue, t));
        options.push(item);
      }
      index++;
    }
    return options;
  };

  const onStepperChange = useCallback((value: number) => {
    setCurrentStep(value);
  }, []);

  const onContinueButtonClick = () => {
    setCurrentStep(1); // Go to step 2
  };

  // Main action

  const onStartTransaction = useCallback(async () => {
    let createdTransaction: Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let transactionLog: LooseObject[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && publicKey && selectedToken) {
        consoleOut('Wallet address:', publicKey?.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        consoleOut('Beneficiary address:', recipientAddress);
        const beneficiary = new PublicKey(recipientAddress);
        consoleOut('beneficiaryMint:', selectedToken.address);
        const associatedToken =
          selectedToken.address === SOL_MINT.toBase58()
            ? NATIVE_SOL_MINT // imported from SDK
            : new PublicKey(selectedToken.address);
        const amount = toTokenAmount(fromCoinAmount, selectedToken.decimals).toString();
        const rateAmount = toTokenAmount(paymentRateAmount, selectedToken.decimals).toString();
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
          wallet: publicKey.toBase58(), // wallet
          treasury: 'undefined', // treasury
          beneficiary: beneficiary.toBase58(), // beneficiary
          associatedToken: associatedToken.toBase58(), // mint
          rateIntervalInSeconds: getRateIntervalInSeconds(paymentRateFrequency), // rateIntervalInSeconds
          startUtc: startUtc, // startUtc
          streamName: recipientNote ? recipientNote.trim() : '', // streamName
          rateAmount: rateAmount, // rateAmount
          allocation: amount, // allocation
          feePayedByTreasurer: false, // feePayedByTreasurer
        };
        consoleOut('data:', data);

        // Report event to Segment analytics
        const price = getTokenPrice();
        const segmentData: SegmentStreamRPTransferData = {
          asset: selectedToken?.symbol,
          assetPrice: price,
          allocation: Number.parseFloat(fromCoinAmount),
          beneficiary: data.beneficiary,
          startUtc: dateFormat(data.startUtc, SIMPLE_DATE_TIME_FORMAT),
          rateAmount: Number.parseFloat(paymentRateAmount),
          interval: getPaymentRateOptionLabel(paymentRateFrequency),
          feePayedByTreasurer: data.feePayedByTreasurer,
          valueInUsd: price * Number.parseFloat(fromCoinAmount),
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        consoleOut('repeatingPaymentFees:', getFeeAmount(), 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        try {
          const accounts: StreamPaymentTransactionAccounts = {
            feePayer: publicKey, // treasurer
            owner: publicKey, // treasurer
            beneficiary: beneficiary, // beneficiary
            mint: associatedToken, // mint
          };
          const { transaction } = await tokenStreamingV2.buildStreamPaymentTransaction(
            accounts, // accounts
            recipientNote, // streamName
            rateAmount, // rateAmount
            getRateIntervalInSeconds(paymentRateFrequency), // rateIntervalInSeconds
            amount, // allocationAssigned
            startUtc, // startUtc
            false, // feePayedByTreasurer
          );

          // TODO: Fix Error: failed to send transaction: Transaction signature verification failure
          // The following attempt to patch the Tx with priority fees would throw error due to
          // additional signatures other than the payer

          // const prioritizedTx = await composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

          consoleOut('streamPayment returned transaction:', transaction);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(transaction),
          });
          createdTransaction = transaction;
          return true;
        } catch (error) {
          console.error('streamPayment error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Repeating Payment transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, { transcript: transactionLog });
          return false;
        }
      }

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
        result: 'Cannot start transaction! Wallet not found!',
      });
      customLogger.logError('Repeating Payment transaction failed', {
        transcript: transactionLog,
      });
      segmentAnalytics.recordEvent(AppUsageEvent.TransferRecurringFailed, {
        transcript: transactionLog,
      });

      return false;
    };

    if (wallet && publicKey) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled && createdTransaction) {
        const sign = await signTx('Recurring Payment', wallet.adapter, publicKey, createdTransaction as Transaction);
        if (sign.encodedTransaction && !transactionCancelled) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Recurring Payment', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.StreamCreate,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Send ${getPaymentRateAmount()}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Stream to send ${getPaymentRateAmount()} has been created.`,
            });
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
      } else {
        setIsBusy(false);
      }
    }
  }, [
    wallet,
    publicKey,
    connection,
    nativeBalance,
    recipientNote,
    selectedToken,
    fromCoinAmount,
    recipientAddress,
    tokenStreamingV2,
    paymentStartDate,
    paymentRateAmount,
    transferCompleted,
    paymentRateFrequency,
    transactionCancelled,
    transactionStatus.currentOperation,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setIsVerifiedRecipient,
    getPaymentRateAmount,
    setTransactionStatus,
    resetContractValues,
    getTokenPrice,
    getFeeAmount,
    t,
  ]);

  const onIsVerifiedRecipientChange = (e: CheckboxChangeEvent) => {
    setIsVerifiedRecipient(e.target.checked);
  };

  const onDateChange: DatePickerProps['onChange'] = (_date, dateString) => {
    handleDateChange(dateString as string);
  };

  ///////////////////
  //   Rendering   //
  ///////////////////

  const paymentRateOptionsMenu = () => {
    const items: ItemType<MenuItemType>[] = getOptionsFromEnum(PaymentRateType).map((item, index) => {
      return {
        key: `option-${index}`,
        label: (
          <span onKeyDown={() => {}} onClick={() => handlePaymentRateOptionChange(item.value)}>
            {item.text}
          </span>
        ),
      };
    });

    return { items };
  };

  return (
    <>
      <StepSelector step={currentStep} steps={2} onValueSelected={onStepperChange} />

      <div className={`contract-wrapper panel1 ${currentStep === 0 ? 'show' : 'hide'}`}>
        {/* Memo */}
        <div className='form-label'>{t('transactions.memo2.label')}</div>
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
                placeholder={t('transactions.memo2.placeholder')}
                spellCheck='false'
                value={recipientNote}
              />
            </div>
          </div>
        </div>

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

        {/* Payment rate */}
        <div className='form-label'>{t('transactions.rate-and-frequency.amount-label')}</div>

        <div className='two-column-form-layout col60x40 mb-3'>
          <div className='left'>
            <div className='well mb-1'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <span className='add-on simplelink'>
                    {selectedToken && (
                      <TokenDisplay
                        onClick={() => onOpenTokenSelector()}
                        mintAddress={selectedToken.address}
                        name={selectedToken.name}
                        showCaretDown={true}
                        fullTokenInfo={selectedToken}
                      />
                    )}
                  </span>
                </div>
                <div className='right'>
                  <input
                    className='general-text-input text-right'
                    inputMode='decimal'
                    autoComplete='off'
                    autoCorrect='off'
                    type='text'
                    onChange={e => handlePaymentRateAmountChange(e.target.value)}
                    pattern='^[0-9]*[.,]?[0-9]*$'
                    placeholder='0.0'
                    minLength={1}
                    maxLength={79}
                    spellCheck='false'
                    value={paymentRateAmount}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className='right'>
            <div className='well mb-0'>
              <div className='flex-fixed-left'>
                <div className='left'>
                  <Dropdown menu={paymentRateOptionsMenu()} trigger={['click']}>
                    <span className='dropdown-trigger no-decoration flex-fixed-right align-items-center'>
                      <div className='left'>
                        <span className='capitalize-first-letter'>
                          {getPaymentRateOptionLabel(paymentRateFrequency, t)}{' '}
                        </span>
                      </div>
                      <div className='right'>
                        <IconCaretDown className='mean-svg-icons' />
                      </div>
                    </span>
                  </Dropdown>
                </div>
              </div>
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

        {/* Continue button */}
        <Button
          className='main-cta'
          block
          type='primary'
          shape='round'
          size='large'
          onClick={onContinueButtonClick}
          disabled={
            !connected ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            isAddressOwnAccount() ||
            !arePaymentSettingsValid()
          }
        >
          {getStepOneContinueButtonLabel()}
        </Button>
      </div>

      <div className={`contract-wrapper panel2 ${currentStep === 1 ? 'show' : 'hide'}`}>
        {/* Summary */}
        {publicKey && recipientAddress && (
          <>
            <div className='flex-fixed-right'>
              <div className='left'>
                <div className='form-label'>{t('transactions.resume')}</div>
              </div>
              <div className='right'>
                <span className='flat-button change-button' onKeyDown={() => {}} onClick={() => setCurrentStep(0)}>
                  <IconEdit className='mean-svg-icons' />
                  <span>{t('general.cta-change')}</span>
                </span>
              </div>
            </div>
            <div className='well'>
              <div className='three-col-flexible-middle'>
                <div className='left flex-row'>
                  <div className='flex-center'>
                    <Identicon
                      address={isValidAddress(recipientAddress) ? recipientAddress : SOL_MINT.toBase58()}
                      style={{ width: '30', display: 'inline-flex' }}
                    />
                  </div>
                  <div className='flex-column pl-3'>
                    <div className='address'>
                      {publicKey && isValidAddress(recipientAddress)
                        ? shortenAddress(recipientAddress)
                        : t('transactions.validation.no-recipient')}
                    </div>
                    <div className='inner-label text-truncate' style={{ maxWidth: '75%' }}>
                      {recipientNote || '-'}
                    </div>
                  </div>
                </div>
                <div className='middle flex-center'>
                  <div className='vertical-bar' />
                </div>
                <div className='right flex-column'>
                  <div className='rate'>{getPaymentRateAmount()}</div>
                  <div className='inner-label text-truncate'>{paymentStartDate}</div>
                </div>
              </div>
            </div>
          </>
        )}

        <div className='mb-3 text-center'>
          <div>
            {t('transactions.transaction-info.add-funds-repeating-payment-advice', {
              tokenSymbol: selectedToken?.symbol,
              rateInterval: getPaymentRateAmount(),
            })}
          </div>
        </div>

        {/* Amount to stream */}
        <div className='form-label'>
          <span className='align-middle'>{t('transactions.send-amount.label-amount')}</span>
          <span className='align-middle'>
            <InfoIcon
              content={
                <span>
                  This is the total amount of funds that will be streamed to the recipient at the payment rate selected.
                  You can add more funds at any time by topping up the stream.
                </span>
              }
              placement='top'
            >
              <InfoCircleOutlined />
            </InfoIcon>
          </span>
        </div>
        <div className='well'>
          <div className='flex-fixed-left'>
            <div className='left'>
              <span className='add-on'>
                {selectedToken && (
                  <TokenDisplay
                    onClick={() => {}}
                    mintAddress={selectedToken.address}
                    showCaretDown={false}
                    showName={false}
                    fullTokenInfo={selectedToken}
                  />
                )}
                {selectedToken && tokenBalanceBn.gtn(getMinSolBlanceRequired()) ? (
                  <div
                    className='token-max simplelink'
                    onKeyDown={() => {}}
                    onClick={() => {
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
                ~{fromCoinAmount ? toUsCurrency(getTokenPrice()) : '$0.00'}
              </span>
            </div>
          </div>
          {selectedToken &&
            selectedToken.address === NATIVE_SOL.address &&
            (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
              <div className='form-field-error'>{t('transactions.validation.minimum-balance-required')}</div>
            )}
        </div>

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
            !arePaymentSettingsValid() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient
          }
        >
          {isBusy && (
            <span className='mr-1'>
              <LoadingOutlined style={{ fontSize: '16px' }} />
            </span>
          )}
          {isBusy ? t('streams.create-new-stream-cta-busy') : getTransactionStartButtonLabel()}
        </Button>
      </div>
    </>
  );
};
