import { InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { DEFAULT_EXPIRATION_TIME_SECONDS, type MeanMultisig, type MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import type { TreasuryInfo } from '@mean-dao/money-streaming';
import {
  AccountType,
  PaymentStreaming,
  type Beneficiary,
  type CreateStreamTransactionAccounts,
  type PaymentStreamingAccount,
  type TransactionFees,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { PublicKey, type Connection, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { IconCaretDown, IconEdit, IconHelpCircle, IconWarning } from 'Icons';
import {
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  Modal,
  Row,
  Select,
  Tooltip,
  type MenuProps,
} from 'antd';
import type { CheckboxChangeEvent } from 'antd/lib/checkbox';
import { Identicon } from 'components/Identicon';
import { InfoIcon } from 'components/InfoIcon';
import { InputMean } from 'components/InputMean';
import { StepSelector } from 'components/StepSelector';
import { TokenDisplay } from 'components/TokenDisplay';
import { DATEPICKER_FORMAT, FALLBACK_COIN_IMAGE } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useLocalStorage from 'hooks/useLocalStorage';
import { appConfig, customLogger } from 'index';
import { getStreamingAccountMint } from 'middleware/getStreamingAccountMint';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';
import { SOL_MINT } from 'middleware/ids';
import {
  DEFAULT_BUDGET_CONFIG,
  composeTxWithPrioritizationFees,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
  type ComputeBudgetConfig,
} from 'middleware/transactions';
import {
  consoleOut,
  disabledDate,
  friendlyDisplayDecimalPlaces,
  getIntervalFromSeconds,
  getLockPeriodOptionLabel,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  stringNumberFormat,
  toUsCurrency,
} from 'middleware/ui';
import {
  displayAmountWithSymbol,
  formatThousands,
  getAmountWithSymbol,
  getSdkValue,
  getTokenOrCustomToken,
  isValidNumber,
  shortenAddress,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount,
} from 'middleware/utils';
import { PaymentRateTypeOption } from 'models/PaymentRateTypeOption';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { StreamRecipient } from 'models/common-types';
import { OperationType, PaymentRateType, TransactionStatus } from 'models/enums';
import type { CreateStreamParams } from 'models/streams';
import moment from 'moment';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';

const { Option } = Select;
type TreasuryValues = PaymentStreamingAccount | TreasuryInfo | undefined;

interface CreateStreamProps {
  associatedToken: string;
  connection: Connection;
  handleClose: () => void;
  handleOk: () => void;
  isVisible: boolean;
  minRequiredBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  multisigClient: MeanMultisig;
  nativeBalance: number;
  transactionFees: TransactionFees;
  treasuryList: (TreasuryInfo | PaymentStreamingAccount)[] | undefined;
  treasuryDetails: TreasuryValues;
  userBalances: LooseObject | undefined;
  withdrawTransactionFees: TransactionFees;
}

export const TreasuryStreamCreateModal = ({
  connection,
  handleClose,
  handleOk,
  isVisible,
  minRequiredBalance,
  selectedMultisig,
  multisigClient,
  nativeBalance,
  transactionFees,
  treasuryList,
  treasuryDetails,
  userBalances,
  withdrawTransactionFees,
}: CreateStreamProps) => {
  const { t } = useTranslation('common');
  const { wallet, publicKey } = useWallet();
  const {
    theme,
    splTokenList,
    loadingPrices,
    recipientNote,
    isWhitelisted,
    fromCoinAmount,
    selectedAccount,
    recipientAddress,
    paymentStartDate,
    lockPeriodAmount,
    transactionStatus,
    paymentRateAmount,
    isVerifiedRecipient,
    lockPeriodFrequency,
    paymentRateFrequency,
    setPaymentRateFrequency,
    setIsVerifiedRecipient,
    setLockPeriodFrequency,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setTransactionStatus,
    setPaymentRateAmount,
    setRecipientAddress,
    setPaymentStartDate,
    setLockPeriodAmount,
    setFromCoinAmount,
    setRecipientNote,
    refreshPrices,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState(new BN(0));
  const [enableMultipleStreamsOption] = useState(false);
  const today = new Date().toLocaleDateString('en-US');
  const [csvFile, setCsvFile] = useState<string | ArrayBuffer | null>(null);
  const [csvArray, setCsvArray] = useState<StreamRecipient[]>([]);
  const [listValidAddresses, setListValidAddresses] = useState<StreamRecipient[]>([]);
  const [hasIsOwnWallet, setHasIsOwnWallet] = useState<boolean>(false);
  const [isCsvSelected, setIsCsvSelected] = useState<boolean>(false);
  const [validMultiRecipientsList, setValidMultiRecipientsList] = useState<boolean>(false);
  const percentages = [5, 10, 15, 20];
  const [cliffRelease, setCliffRelease] = useState<string>('');
  const [cliffReleaseBn, setCliffReleaseBn] = useState(new BN(0));
  const [paymentRateAmountBn, setPaymentRateAmountBn] = useState(new BN(0));
  const [amountToBeStreamedBn, setAmountToBeStreamedBn] = useState(new BN(0));
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [workingTreasuryDetails, setWorkingTreasuryDetails] = useState<TreasuryValues>(undefined);
  const [workingTreasuryType, setWorkingTreasuryType] = useState<AccountType>(AccountType.Open);
  const [selectedStreamingAccountId, setSelectedStreamingAccountId] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);
  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, mspV2AddressPK, connection.commitment);
  }, [connection, mspV2AddressPK]);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  }, [setTransactionStatus]);

  const getMaxAmount = useCallback(
    (preSetting = false) => {
      if ((isFeePaidByTreasurer || preSetting) && withdrawTransactionFees) {
        const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
        const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
        const feeDenaminator = 1000000;
        const badStreamMaxAllocation = unallocatedBalance
          .mul(new BN(feeDenaminator))
          .div(new BN(feeNumerator + feeDenaminator));

        const feeMultiRecipientsNumerator = feeNumerator * listValidAddresses.length;

        const feeAmount = badStreamMaxAllocation
          .mul(new BN(!enableMultipleStreamsOption ? feeNumerator : feeMultiRecipientsNumerator))
          .div(new BN(feeDenaminator));

        const badTotal = badStreamMaxAllocation.add(feeAmount);
        const badRemaining = unallocatedBalance.sub(badTotal);
        const goodStreamMaxAllocation = unallocatedBalance.sub(feeAmount);
        const goodTotal = goodStreamMaxAllocation.add(feeAmount);
        const goodRemaining = unallocatedBalance.sub(goodTotal);
        const maxAmount = goodStreamMaxAllocation;

        if (isWhitelisted) {
          // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
          const debugTable: any[] = [];
          debugTable.push({
            unallocatedBalance: unallocatedBalance.toString(),
            feeNumerator: feeNumerator,
            feePercentage01: feeNumerator / feeDenaminator,
            badStreamMaxAllocation: badStreamMaxAllocation.toString(),
            feeAmount: feeAmount.toString(),
            badTotal: badTotal.toString(),
            badRemaining: badRemaining.toString(),
            goodStreamMaxAllocation: goodStreamMaxAllocation.toString(),
            goodTotal: goodTotal.toString(),
            goodRemaining: goodRemaining.toString(),
          });
          consoleOut('debug table', debugTable, 'blue');
        }

        if (!preSetting) {
          setMaxAllocatableAmount(maxAmount);
        }
        return maxAmount;
      }
      if (!preSetting) {
        setMaxAllocatableAmount(unallocatedBalance);
      }
      return unallocatedBalance;
    },
    [
      isWhitelisted,
      unallocatedBalance,
      isFeePaidByTreasurer,
      withdrawTransactionFees,
      enableMultipleStreamsOption,
      listValidAddresses.length,
    ],
  );

  const getTokenPrice = useCallback(
    (inputAmount: string) => {
      if (!selectedToken) {
        return 0;
      }
      const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);

      return Number.parseFloat(inputAmount) * price;
    },
    [getTokenPriceByAddress, selectedToken],
  );

  const hasNoStreamingAccounts = useMemo(() => {
    return !!(isMultisigContext && selectedMultisig && (!treasuryList || treasuryList.length === 0));
  }, [isMultisigContext, selectedMultisig, treasuryList]);

  /////////////////
  //   Getters   //
  /////////////////

  const isSelectedStreamingAccountMultisigTreasury = useMemo(() => {
    if (!publicKey || !workingTreasuryDetails || !selectedMultisig) {
      return false;
    }

    const treasury = workingTreasuryDetails as PaymentStreamingAccount;
    const treasurer = treasury.owner;

    if (treasurer.equals(selectedMultisig.authority)) {
      return true;
    }
    return false;
  }, [publicKey, selectedMultisig, workingTreasuryDetails]);

  const getReleaseRate = useCallback(() => {
    if (!selectedToken) {
      return '--';
    }

    return `${displayAmountWithSymbol(
      paymentRateAmountBn,
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
      false,
    )} ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`;
  }, [lockPeriodFrequency, paymentRateAmountBn, selectedToken, splTokenList, t]);

  const getOptionsFromEnum = (): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in PaymentRateType) {
      const mappedValue = Number.parseInt(enumMember, 10);
      if (!Number.isNaN(mappedValue)) {
        const item = new PaymentRateTypeOption(index, mappedValue, getPaymentRateOptionLabel(mappedValue, t));
        options.push(item);
      }
      index++;
    }
    return options;
  };

  const getLockPeriodOptionsFromEnum = (): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in PaymentRateType) {
      const mappedValue = Number.parseInt(enumMember, 10);
      if (!Number.isNaN(mappedValue)) {
        const item = new PaymentRateTypeOption(index, mappedValue, getLockPeriodOptionLabel(mappedValue, t));
        options.push(item);
      }
      index++;
    }
    return options;
  };

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = Number.parseFloat(paymentRateAmount || '0');

    if (workingTreasuryType === AccountType.Lock) {
      return !rateAmount ? 'Add funds to commit' : '';
    }

    return !rateAmount ? t('transactions.validation.no-payment-rate') : '';
  };

  const getStepOneContinueButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    }
    if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    }
    if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    }
    if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    }
    if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    }
    if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${
        workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id) + ')' : ''
      }`;
    }
    if (!paymentRateAmount || Number.parseFloat(paymentRateAmount) === 0) {
      return t('transactions.validation.no-amount');
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }

    return t('transactions.validation.valid-continue');
  };

  const getStepOneContinueButtonLabelInLocked = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    }
    if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    }
    if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    }
    if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    }
    if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    }
    if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${
        workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id) + ')' : ''
      }`;
    }
    if (!fromCoinAmount || Number.parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    }
    if (Number.parseFloat(fromCoinAmount) > Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }

    return t('transactions.validation.valid-continue');
  };

  const getStepTwoContinueButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    }
    if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    }
    if (!recipientNote) {
      return 'Set stream name';
    }
    if (!recipientAddress) {
      return t('transactions.validation.select-recipient');
    }
    if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${
        workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id) + ')' : ''
      }`;
    }
    if (!fromCoinAmount || Number.parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    }
    if (Number.parseFloat(fromCoinAmount) > Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    }
    if (!lockPeriodAmount || Number.parseFloat(lockPeriodAmount) === 0) {
      return 'Lock period cannot be empty';
    }
    if (
      cliffRelease &&
      Number.parseFloat(cliffRelease) > Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))
    ) {
      return 'Invalid cliff amount';
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!areSendAmountSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }

    return t('transactions.validation.valid-continue');
  };

  const getTransactionStartButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    }
    if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    }
    if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    }
    if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    }
    if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    }
    if (!selectedToken || unallocatedBalance.isZero()) {
      return t('transactions.validation.no-balance');
    }
    if (!tokenAmount || tokenAmount.isZero()) {
      return t('transactions.validation.no-amount');
    }
    if (
      (isFeePaidByTreasurer && tokenAmount.gt(maxAllocatableAmount)) ||
      (!isFeePaidByTreasurer && tokenAmount.gt(unallocatedBalance))
    ) {
      return t('transactions.validation.amount-high');
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }
    if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    }
    if (nativeBalance < getMinBalanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', {
        balance: formatThousands(getMinBalanceRequired(), 4),
      });
    }
    if (isMultisigContext) {
      return 'Submit proposal';
    }

    return t('transactions.validation.valid-approve');
  };

  const getTransactionStartButtonLabelInLocked = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    }
    if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    }
    if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    }
    if (!recipientNote) {
      return 'Set stream name';
    }
    if (!recipientAddress) {
      return t('transactions.validation.select-recipient');
    }
    if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${
        workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id) + ')' : ''
      }`;
    }
    if (!fromCoinAmount || Number.parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    }
    if (Number.parseFloat(fromCoinAmount) > Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    }
    if (!lockPeriodAmount || Number.parseFloat(lockPeriodAmount) === 0) {
      return 'Lock period cannot be empty';
    }
    if (
      cliffRelease &&
      Number.parseFloat(cliffRelease) > Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))
    ) {
      return 'Invalid cliff amount';
    }
    if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    }
    if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    }
    if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    }
    if (nativeBalance < getMinBalanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', {
        balance: formatThousands(getMinBalanceRequired(), 4),
      });
    }
    if (isMultisigContext) {
      return 'Submit proposal';
    }

    return t('transactions.validation.valid-approve');
  };

  const getPaymentRateAmount = useCallback(() => {
    let outStr = selectedToken
      ? getAmountWithSymbol(
          paymentRateAmount,
          selectedToken.address,
          false,
          splTokenList,
          friendlyDisplayDecimalPlaces(Number.parseFloat(paymentRateAmount)) ?? selectedToken.decimals,
        )
      : '-';
    outStr += getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t);

    return outStr;
  }, [paymentRateAmount, paymentRateFrequency, selectedToken, splTokenList, t]);

  /////////////////////
  // Data management //
  /////////////////////

  // Set working copy of the selected streaming account if passed-in
  // Also set the working associated token
  // Also set the treasury type
  useEffect(() => {
    if (isVisible) {
      if (treasuryDetails) {
        const treasuryType = getStreamingAccountType(treasuryDetails);
        consoleOut('treasuryDetails aquired:', treasuryDetails, 'blue');
        setWorkingTreasuryDetails(treasuryDetails);
        setSelectedStreamingAccountId(treasuryDetails.id.toString());
        setWorkingTreasuryType(treasuryType);
      }
    }
  }, [isVisible, treasuryDetails]);

  // Preset a working copy of the first available streaming account in the list if treasuryDetails was not passed in
  useEffect(() => {
    if (isVisible && !treasuryDetails && treasuryList && treasuryList.length > 0 && !workingTreasuryDetails) {
      consoleOut('treasuryDetails not set!', 'Try to pick one from list', 'blue');
      const selected = treasuryList[0];
      const treasuryType = getStreamingAccountType(selected);
      consoleOut('treasuryDetails preset:', selected, 'blue');
      setWorkingTreasuryDetails(selected);
      setSelectedStreamingAccountId(selected.id.toString());
      setWorkingTreasuryType(treasuryType);
    }
  }, [isVisible, treasuryDetails, treasuryList, workingTreasuryDetails]);

  useEffect(() => {
    if (hasNoStreamingAccounts || !workingTreasuryDetails) {
      return;
    }

    const tokenAddress = getStreamingAccountMint(workingTreasuryDetails);
    getTokenOrCustomToken(connection, tokenAddress, getTokenByMintAddress).then(token => {
      consoleOut('PaymentStreamingAccount associated token:', token, 'blue');
      setSelectedToken(token);
    });
  }, [connection, getTokenByMintAddress, hasNoStreamingAccounts, workingTreasuryDetails]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (!selectedToken) {
      setUnallocatedBalance(new BN(0));
      return;
    }

    const getUnallocatedBalance = (details: PaymentStreamingAccount | TreasuryInfo) => {
      const isNew = !!(details && details.version >= 2);
      let result = new BN(0);
      let balance: BN;
      let allocationAssigned: BN;

      if (!isNew) {
        balance = toTokenAmountBn(details.balance, selectedToken.decimals);
        allocationAssigned = toTokenAmountBn(details.allocationAssigned, selectedToken.decimals);
      } else {
        balance = new BN(details.balance);
        allocationAssigned = new BN(details.allocationAssigned);
      }
      result = balance.sub(allocationAssigned);

      return result;
    };

    if (isVisible && workingTreasuryDetails) {
      const ub = getUnallocatedBalance(workingTreasuryDetails);
      consoleOut('unallocatedBalance:', ub.toString(), 'blue');
      setUnallocatedBalance(new BN(ub));
    }
  }, [isVisible, workingTreasuryDetails, selectedToken]);

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (isVisible && workingTreasuryDetails && withdrawTransactionFees && !isFeePaidByTreasurer) {
      getMaxAmount();
    }
  }, [isVisible, isFeePaidByTreasurer, workingTreasuryDetails, withdrawTransactionFees, getMaxAmount]);

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

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  };

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  };

  const onContinueStepOneButtonClick = () => {
    setCurrentStep(1); // Go to step 2
  };

  const onContinueStepTwoButtonClick = () => {
    setCurrentStep(2); // Go to step 3
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

  const handlePaymentRateAmountChange = (value: string) => {
    let newValue = value.trim();

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

  const handleLockPeriodAmountChange = (value: string) => {
    let periodAmountValue = value.trim();

    if (periodAmountValue.length > 2) {
      periodAmountValue = periodAmountValue.substr(0, 2);
      setLockPeriodAmount(periodAmountValue);
    } else {
      setLockPeriodAmount(periodAmountValue);
    }
  };

  const handleLockPeriodOptionChange = (val: PaymentRateType) => {
    setLockPeriodFrequency(val);
  };

  const handleFromCoinAmountChange = (value: string) => {
    let newValue = value.trim();

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
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setFromCoinAmount('.');
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
      setTokenAmount(new BN(toTokenAmount(newValue, decimals).toString()));
    }
  };

  const handleCliffReleaseAmountChange = (value: string) => {
    let newValue = value.trim();

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
      setCliffRelease('');
      setCliffReleaseBn(new BN(0));
    } else if (newValue === '.') {
      setCliffRelease('.');
    } else if (isValidNumber(newValue)) {
      setCliffRelease(newValue);
      setCliffReleaseBn(toTokenAmountBn(newValue, decimals));
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  };

  const onFeePayedByTreasurerChange = (e: CheckboxChangeEvent) => {
    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');

    if (e.target.checked && selectedToken && tokenAmount) {
      const maxAmount = getMaxAmount(true);
      consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
      consoleOut('maxAmount:', maxAmount.toString(), 'blue');
      if (tokenAmount.gt(maxAmount)) {
        setFromCoinAmount(toUiAmount(new BN(maxAmount), selectedToken.decimals));
        setTokenAmount(new BN(maxAmount));
      }
    }

    setIsFeePaidByTreasurer(e.target.checked);
  };

  const onIsVerifiedRecipientChange = (e: CheckboxChangeEvent) => {
    setIsVerifiedRecipient(e.target.checked);
  };

  const onCloseModal = () => {
    handleClose();
    onAfterClose();
  };

  const onAfterClose = () => {
    setTimeout(() => {
      setRecipientAddress('');
      setRecipientNote('');
      setProposalTitle('');
      setPaymentRateAmount('');
      setFromCoinAmount('');
      setCsvArray([]);
      setIsCsvSelected(false);
      setIsFeePaidByTreasurer(false);
      setIsVerifiedRecipient(false);
      setPaymentRateFrequency(PaymentRateType.PerMonth);
      setPaymentStartDate(today);
      setLockPeriodAmount('');
      setLockPeriodFrequency(PaymentRateType.PerMonth);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
    });
  };

  const onChangeValuePercentages = useCallback(
    (value: number) => {
      if (!selectedToken) {
        return;
      }

      if (value > 0 && tokenAmount.gtn(0)) {
        const cr = tokenAmount.muln(value).divn(100);
        setCliffReleaseBn(cr);
        setCliffRelease(toUiAmount(cr, selectedToken.decimals));
      }
    },
    [selectedToken, tokenAmount],
  );

  const selectCsvHandler = (files: FileList | null) => {
    if (!files) return;

    const reader = new FileReader();

    setHasIsOwnWallet(false);

    reader.onloadend = fr => {
      if (fr.target?.readyState === FileReader.DONE) {
        setCsvFile(fr.target.result);
      }
    };

    reader.readAsText(files[0]);
  };

  const getMinBalanceRequired = useCallback(() => {
    if (!transactionFees) {
      return 0;
    }

    const bf = transactionFees.blockchainFee; // Blockchain fee
    const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
    const minRequired = isSelectedStreamingAccountMultisigTreasury ? minRequiredBalance : bf + ff;
    return minRequired;
  }, [isSelectedStreamingAccountMultisigTreasury, minRequiredBalance, transactionFees]);

  /////////////////////
  // Data management //
  /////////////////////

  // Recipient list - parse
  useEffect(() => {
    if (!csvFile) {
      return;
    }

    const splittedData = (csvFile as string).split('\n');
    const dataFormatted: StreamRecipient[] = [];

    const timeout = setTimeout(() => {
      for (const line of splittedData) {
        const splittedLine = line.split(',');

        if (splittedLine.length < 2) {
          continue;
        }

        dataFormatted.push({
          streamName: splittedLine[0].trim(),
          address: splittedLine[1].trim(),
        });
      }

      setCsvArray(dataFormatted);
    });

    setIsCsvSelected(true);

    return () => {
      clearTimeout(timeout);
    };
  }, [csvFile]);

  // Recipient list - filter valid addresses
  useEffect(() => {
    if (!csvArray.length || !publicKey) {
      return;
    }

    const timeout = setTimeout(() => {
      const validAddresses = csvArray.filter(csvItem => isValidAddress(csvItem.address));

      const validAddressesSingleSigner = validAddresses.filter(
        csvItem => csvItem.address !== `${publicKey.toBase58()}`,
      );

      if (!isSelectedStreamingAccountMultisigTreasury) {
        setListValidAddresses(validAddressesSingleSigner);
        if (validAddresses.length - validAddressesSingleSigner.length > 0) {
          setHasIsOwnWallet(true);
        }
      } else {
        setListValidAddresses(validAddresses);
      }
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [csvArray, publicKey, isSelectedStreamingAccountMultisigTreasury]);

  // Recipient list - Set valid flag
  useEffect(() => {
    if (isCsvSelected) {
      if (listValidAddresses.length > 0) {
        setValidMultiRecipientsList(true);
      } else {
        setValidMultiRecipientsList(false);
      }
    }
  }, [isCsvSelected, listValidAddresses]);

  // Set payment rate amount
  useEffect(() => {
    if (!selectedToken) {
      return;
    }

    if (tokenAmount.gtn(0)) {
      let toStream = tokenAmount;
      let ra = new BN(0);
      if (cliffReleaseBn.gtn(0)) {
        toStream = toStream.sub(cliffReleaseBn);
      }
      const lpa = Number.parseFloat(lockPeriodAmount);
      if (lpa) {
        ra = toStream.divn(lpa);
      }

      if (workingTreasuryType === AccountType.Lock) {
        setPaymentRateAmountBn(ra);
        setPaymentRateAmount(ra.toString());
      } else {
        const openRateAmount = toTokenAmount(paymentRateAmount || '0', selectedToken.decimals, true) as string;
        setPaymentRateAmountBn(new BN(openRateAmount));
      }
    }
  }, [
    cliffReleaseBn,
    lockPeriodAmount,
    paymentRateAmount,
    selectedToken,
    setPaymentRateAmount,
    tokenAmount,
    workingTreasuryType,
  ]);

  // Set the amount to be streamed
  useEffect(() => {
    if (!selectedToken) {
      return;
    }

    if (tokenAmount.gtn(0)) {
      let toStream = tokenAmount;
      if (cliffReleaseBn.gtn(0)) {
        toStream = toStream.sub(cliffReleaseBn);
      }
      setAmountToBeStreamedBn(toStream);
    }
  }, [cliffReleaseBn, selectedToken, tokenAmount]);

  ////////////////////////
  // Transaction start  //
  ////////////////////////

  const onStartTransaction = async () => {
    let transaction: VersionedTransaction | Transaction | null = null;
    let signature: string;
    let encodedTx: string;
    let multisigAuth = '';
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    let transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);
    resetTransactionStatus();

    const createStream = async (data: CreateStreamParams) => {
      consoleOut('Is Multisig PaymentStreamingAccount: ', isSelectedStreamingAccountMultisigTreasury, 'blue');
      consoleOut('Multisig authority: ', selectedMultisig ? selectedMultisig.authority.toBase58() : '--', 'blue');
      consoleOut('Starting create stream using MSP V2...', '', 'blue');

      const payer = new PublicKey(data.payer);
      const beneficiary = data.beneficiary.address;
      const streamName = data.beneficiary.streamName;

      if (!isSelectedStreamingAccountMultisigTreasury) {
        const accounts: CreateStreamTransactionAccounts = {
          feePayer: payer, // payer
          beneficiary, // beneficiary
          psAccount: new PublicKey(data.treasury), // treasury
          owner: new PublicKey(data.treasurer), // owner
        };
        const { transaction } = await paymentStreaming.buildCreateStreamTransaction(
          accounts, // accounts
          streamName, // streamName
          data.rateAmount, // rateAmount
          data.rateIntervalInSeconds, // rateIntervalInSeconds
          data.allocationAssigned, // allocationAssigned
          data.startUtc, // startUtc
          data.cliffVestAmount, // cliffVestAmount
          data.cliffVestPercent, // cliffVestPercent
          data.tokenFeePayedFromAccount, // feePayedByTreasurer
          true,
        );

        return await composeTxWithPrioritizationFees(connection, payer, transaction.instructions);
      }

      if (!workingTreasuryDetails || !multisigClient || !selectedMultisig || !publicKey) {
        return null;
      }

      multisigAuth = selectedMultisig.authority.toBase58();

      const [multisigSigner] = PublicKey.findProgramAddressSync([selectedMultisig.id.toBuffer()], multisigAddressPK);

      const accounts: CreateStreamTransactionAccounts = {
        feePayer: payer, // payer
        beneficiary, // beneficiary
        psAccount: new PublicKey(data.treasury), // treasury
        owner: multisigSigner, // owner
      };
      const { transaction } = await paymentStreaming.buildCreateStreamTransaction(
        accounts, // accounts
        streamName, // streamName
        data.rateAmount, // rateAmount
        data.rateIntervalInSeconds, // rateIntervalInSeconds
        data.allocationAssigned, // allocationAssigned
        data.startUtc, // startUtc
        data.cliffVestAmount, // cliffVestAmount
        data.cliffVestPercent, // cliffVestPercent
        data.tokenFeePayedFromAccount, // feePayedByTreasurer
        true, // usePda
      );

      const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;

      const tx = await getProposalWithPrioritizationFees(
        {
          connection,
          multisigClient,
          transactionPriorityOptions,
        },
        publicKey,
        proposalTitle === '' ? 'Create Stream' : proposalTitle,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.StreamCreate,
        selectedMultisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
      );

      if (!tx) {
        throw new Error("Could not create 'create stream' proposal");
      }

      return tx.transaction;
    };

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !workingTreasuryDetails || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      if (enableMultipleStreamsOption) {
        throw new Error('Unsupported');
      }

      const beneficiary: Beneficiary = {
        streamName: recipientNote ? recipientNote.trim() : '',
        address: new PublicKey(recipientAddress),
      };

      const assocToken = new PublicKey(selectedToken.address);
      const treasury = workingTreasuryDetails.id;
      const treasurer =
        isSelectedStreamingAccountMultisigTreasury && selectedMultisig ? selectedMultisig.id : publicKey;
      const amount = tokenAmount.toString();
      const rateAmount = paymentRateAmountBn.toString();
      const now = new Date();
      const parsedDate = Date.parse(paymentStartDate as string);
      const startUtc = new Date(parsedDate);
      const cliffAmount = cliffReleaseBn.toString();
      startUtc.setHours(now.getHours());
      startUtc.setMinutes(now.getMinutes());
      startUtc.setSeconds(now.getSeconds());
      startUtc.setMilliseconds(now.getMilliseconds());

      const isLockedTreasury = workingTreasuryType === AccountType.Lock;

      consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

      if (isLockedTreasury) {
        consoleOut('paymentRateFrequency', lockPeriodFrequency, 'crimson');
      } else {
        consoleOut('paymentRateFrequency', paymentRateFrequency, 'crimson');
      }

      // Create a transaction
      const data: CreateStreamParams = {
        payer: selectedAccount.address, // initializer
        treasurer: treasurer.toBase58(), // treasurer
        treasury: treasury.toString(), // treasury
        beneficiary, // beneficiaries
        associatedToken: assocToken.toBase58(), // associatedToken
        allocationAssigned: amount, // allocationAssigned
        rateAmount: rateAmount, // rateAmount
        rateIntervalInSeconds: isLockedTreasury
          ? getRateIntervalInSeconds(lockPeriodFrequency) // rateIntervalInSeconds
          : getRateIntervalInSeconds(paymentRateFrequency),
        startUtc: startUtc, // startUtc
        cliffVestAmount: cliffAmount, // cliffVestAmount
        cliffVestPercent: 0, // cliffVestPercent
        tokenFeePayedFromAccount: isFeePaidByTreasurer, // feePayedByTreasurer
      };
      consoleOut('data:', data);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data,
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: '',
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const minRequired = getMinBalanceRequired();
      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logWarning('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await createStream(data)
        .then(value => {
          if (!value) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: 'Could not create transaction',
            });
            customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('createStreams error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    };

    if (wallet && selectedToken && publicKey) {
      const created = await createTx();
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx('Create Stream', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Create Stream', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const isLockedTreasury = workingTreasuryType === AccountType.Lock;
            const rateDisplay = isLockedTreasury ? getReleaseRate() : getPaymentRateAmount();
            const messageLoading = multisigAuth
              ? `Proposal to create stream to send ${rateDisplay}.`
              : `Create stream to send ${rateDisplay}.`;
            const messageCompleted = multisigAuth
              ? `Proposal to create stream to send ${rateDisplay} sent for approval.`
              : `Stream to send ${rateDisplay} created successfully.`;
            consoleOut('pending confirm msg:', messageLoading, 'blue');
            consoleOut('confirmed msg:', messageCompleted, 'blue');
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.TreasuryStreamCreate,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: messageLoading,
              completedTitle: 'Transaction confirmed',
              completedMessage: messageCompleted,
              extras: {
                multisigAuthority: multisigAuth,
              },
            });
            setIsBusy(false);
            resetTransactionStatus();
            handleOk();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isStreamingAccountSelected = (): boolean => {
    const isMultisig = !!(isMultisigContext && selectedMultisig);
    return !!(!isMultisig || (isMultisig && selectedStreamingAccountId && isValidAddress(selectedStreamingAccountId)));
  };

  const isMemoValid = (): boolean => {
    return !!(recipientNote && recipientNote.length <= 32);
  };

  const isSendAmountValid = (): boolean => {
    return !!(
      publicKey &&
      selectedToken &&
      tokenAmount &&
      tokenAmount.gtn(0) &&
      ((isFeePaidByTreasurer && tokenAmount.lte(maxAllocatableAmount)) ||
        (!isFeePaidByTreasurer && tokenAmount.lte(unallocatedBalance)))
    );
  };

  const isRateAmountValid = (): boolean => {
    return !!(
      (paymentRateAmount && Number.parseFloat(paymentRateAmount) > 0) ||
      (fromCoinAmount && Number.parseFloat(fromCoinAmount) > 0)
    );
  };

  const areSendAmountSettingsValid = (): boolean => {
    return !!(isSendAmountValid() && paymentStartDate);
  };

  const arePaymentSettingsValid = (): boolean => {
    if (!paymentStartDate) {
      return false;
    }

    return isRateAmountValid();
  };

  const onTitleInputValueChange = (value: string) => {
    setProposalTitle(value);
  };

  // TODO: Verify and validate at runtime
  const onStreamingAccountSelected = useCallback(
    (e: string) => {
      consoleOut('Selected streaming account:', e, 'blue');
      setSelectedStreamingAccountId(e);
      const item = treasuryList?.find(t => t.id.toString() === e);
      consoleOut('item:', item, 'blue');
      if (item) {
        setWorkingTreasuryDetails(item);
        setSelectedStreamingAccountId(item.id.toString());
        const tokenAddress = getStreamingAccountMint(item);
        getTokenOrCustomToken(connection, tokenAddress, getTokenByMintAddress).then(token => {
          consoleOut('PaymentStreamingAccount associated token:', token, 'blue');
          setSelectedToken(token);
        });
      }
    },
    [connection, getTokenByMintAddress, treasuryList],
  );

  const isDestinationAddressValid = () => {
    if (!enableMultipleStreamsOption) {
      return isValidAddress(recipientAddress);
    }

    return validMultiRecipientsList;
  };

  ///////////////
  // Rendering //
  ///////////////

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const paymentRateOptionsMenu = () => {
    const items: MenuProps['items'] = getOptionsFromEnum().map((item, index) => {
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

  const lockPeriodOptionsMenu = () => {
    const items: MenuProps['items'] = getLockPeriodOptionsFromEnum().map((item, index) => {
      return {
        key: `option-${index}`,
        label: (
          <span onKeyDown={() => {}} onClick={() => handleLockPeriodOptionChange(item.value)}>
            {item.text}
          </span>
        ),
      };
    });

    return { items };
  };

  const getStreamingAccountIcon = (item: TreasuryValues) => {
    if (!item) {
      return null;
    }
    const treasuryAssociatedToken = getStreamingAccountMint(item);
    const token = treasuryAssociatedToken ? getTokenByMintAddress(treasuryAssociatedToken) : undefined;

    return (
      <div className='token-icon'>
        {treasuryAssociatedToken ? (
          <>
            {token?.logoURI ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={treasuryAssociatedToken} style={{ width: '20', display: 'inline-flex' }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: '20', display: 'inline-flex' }} />
        )}
      </div>
    );
  };

  const getStreamingAccountDescription = (item: TreasuryValues) => {
    if (!item) {
      return null;
    }
    const treasuryType = getStreamingAccountType(item);
    const isV2Treasury = !!(item && item.version >= 2);
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;
    const name = isV2Treasury ? v2.name : v1.label;
    return (
      <>
        {name ? (
          <>
            <div className='title text-truncate'>
              {name}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {treasuryType === AccountType.Open ? 'Open' : 'Locked'}
              </span>
            </div>
            <div className='subtitle text-truncate'>{shortenAddress(item.id, 8)}</div>
          </>
        ) : (
          <div className='title text-truncate'>{shortenAddress(item.id, 8)}</div>
        )}
      </>
    );
  };

  const getStreamingAccountStreamCount = (item: TreasuryValues) => {
    if (!item) {
      return null;
    }
    const isV2Treasury = !!(item && item.version >= 2);
    const v1 = item as TreasuryInfo;
    const v2 = item as PaymentStreamingAccount;
    return (
      <>
        {!isV2Treasury && v1.upgradeRequired ? (
          <span>&nbsp;</span>
        ) : (
          <>
            <div className='rate-amount'>
              {formatThousands(isV2Treasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
            </div>
            <div className='interval'>streams</div>
          </>
        )}
      </>
    );
  };

  const renderStreamingAccountItem = (item: PaymentStreamingAccount | TreasuryInfo) => {
    return (
      <Option key={`${item.id}`} value={item.id.toString()}>
        <div className={'transaction-list-row no-pointer'}>
          <div className='icon-cell'>{getStreamingAccountIcon(item)}</div>
          <div className='description-cell'>{getStreamingAccountDescription(item)}</div>
          <div className='rate-cell'>{getStreamingAccountStreamCount(item)}</div>
        </div>
      </Option>
    );
  };

  return (
    <Modal
      className='mean-modal treasury-stream-create-modal'
      title={
        workingTreasuryType === AccountType.Open ? (
          <div className='modal-title'>
            {isMultisigContext ? 'Propose outgoing stream' : t('treasuries.treasury-streams.add-stream-modal-title')}
          </div>
        ) : (
          <div className='modal-title'>{t('treasuries.treasury-streams.add-stream-locked.modal-title')}</div>
        )
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={480}
    >
      {hasNoStreamingAccounts ? (
        <div className='text-center px-4 py-4'>
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className='icon mt-0 mb-3 fg-warning' />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className={'icon mt-0 mb-3 fg-warning'} />
          )}
          <h2 className={'mb-3 fg-warning'}>No streaming accounts</h2>
          <p>
            Your super safe needs a streaming account to set up and fund payment streams. To get started, create and
            fund a streaming account and then you can proceed with creating a payment stream.
          </p>
        </div>
      ) : (
        <>
          <div className='scrollable-content'>
            <StepSelector
              step={currentStep}
              steps={workingTreasuryType === AccountType.Lock ? 3 : 2}
              onValueSelected={onStepperChange}
            />

            <div className={currentStep === 0 ? 'contract-wrapper panel1 show' : 'contract-wrapper panel1 hide'}>
              {workingTreasuryType === AccountType.Lock && (
                <div className='mb-2 text-uppercase'>
                  {t('treasuries.treasury-streams.add-stream-locked.panel1-name')}
                </div>
              )}

              {/* Proposal title */}
              {isMultisigContext && (
                <div className='mb-3'>
                  <div className='form-label'>{t('multisig.proposal-modal.title')}</div>
                  <InputMean
                    id='proposal-title-field'
                    name='Title'
                    className='w-100 general-text-input'
                    onChange={onTitleInputValueChange}
                    placeholder='Add a proposal title (required)'
                    value={proposalTitle}
                  />
                </div>
              )}

              {!enableMultipleStreamsOption && (
                <>
                  {isMultisigContext && selectedMultisig && !treasuryDetails && (
                    <div className='mb-3'>
                      <div className='form-label icon-label'>
                        {t('treasuries.add-funds.select-streaming-account-label')}
                        <Tooltip
                          placement='bottom'
                          title='Every payment stream is set up and funded from a streaming account. Select the account you want for the stream to be created and funded from. If you do not have the streaming account set up yet, first create and fund the account before proceeding.'
                        >
                          <span>
                            <IconHelpCircle className='mean-svg-icons' />
                          </span>
                        </Tooltip>
                      </div>
                      <div className={`well ${isBusy ? 'disabled' : ''}`}>
                        <div className='dropdown-trigger no-decoration flex-fixed-right align-items-center'>
                          {treasuryList && treasuryList.length > 0 && (
                            <Select
                              className={'auto-height'}
                              value={selectedStreamingAccountId}
                              style={{ width: '100%', maxWidth: 'none' }}
                              popupClassName='stream-select-dropdown'
                              onChange={onStreamingAccountSelected}
                              bordered={false}
                              showArrow={false}
                              dropdownRender={menu => <div>{menu}</div>}
                            >
                              {treasuryList.map(option => {
                                return renderStreamingAccountItem(option);
                              })}
                            </Select>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

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
                </>
              )}

              <div className='form-label icon-label'>
                {!enableMultipleStreamsOption
                  ? t('transactions.recipient.label')
                  : t('treasuries.treasury-streams.multiple-address-list')}
                {enableMultipleStreamsOption && (
                  <Tooltip
                    placement='top'
                    title={t('treasuries.treasury-streams.multiple-address-question-mark-tooltip')}
                  >
                    <span>
                      <IconHelpCircle className='mean-svg-icons' />
                    </span>
                  </Tooltip>
                )}
              </div>

              {!enableMultipleStreamsOption ? (
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
                          {recipientAddress ?? t('transactions.recipient.placeholder')}
                        </span>
                      </span>
                    </div>
                  </div>
                  {recipientAddress && !isValidAddress(recipientAddress) && (
                    <span className='form-field-error'>{t('transactions.validation.address-validation')}</span>
                  )}
                </div>
              ) : (
                <div className='well'>
                  <div className='flex-fixed-right'>
                    <div className='left position-relative'>
                      <span className='recipient-field-wrapper'>
                        <input
                          type='file'
                          accept='.csv'
                          id='csvFile'
                          onChange={e => selectCsvHandler(e.target.files)}
                        />
                      </span>
                    </div>
                  </div>
                  {!validMultiRecipientsList && isCsvSelected && listValidAddresses.length === 0 && (
                    <span className='form-field-error'>
                      {t('transactions.validation.multi-recipient-invalid-list')}
                    </span>
                  )}
                </div>
              )}

              {/* Payment rate */}
              {workingTreasuryType === AccountType.Open ? (
                <>
                  <div className='form-label'>{t('transactions.rate-and-frequency.amount-label')}</div>
                  <div className='two-column-form-layout col60x40 mb-3'>
                    <div className='left'>
                      <div className='well mb-1'>
                        <div className='flex-fixed-left'>
                          <div className='left'>
                            <span className='add-on'>
                              {selectedToken && (
                                <TokenDisplay
                                  onClick={() => {}}
                                  mintAddress={selectedToken.address}
                                  showCaretDown={false}
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
                </>
              ) : (
                <>
                  <div className='form-label'>TOTAL FUNDS TO COMMIT</div>
                  <div className='well mb-1'>
                    <div className='flex-fixed-left'>
                      <div className='left'>
                        <span className='add-on'>
                          {selectedToken && (
                            <TokenDisplay
                              onClick={() => {}}
                              mintAddress={selectedToken.address}
                              showCaretDown={false}
                              fullTokenInfo={selectedToken}
                            />
                          )}
                          {selectedToken && unallocatedBalance ? (
                            <div
                              className='token-max simplelink'
                              onKeyDown={() => {}}
                              onClick={() => {
                                const maxAmount = getMaxAmount(isFeePaidByTreasurer);
                                consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                                consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                                setFromCoinAmount(toUiAmount(new BN(maxAmount), selectedToken.decimals));
                                setTokenAmount(new BN(maxAmount));
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
                        <span>
                          {unallocatedBalance && selectedToken
                            ? getAmountWithSymbol(
                                toUiAmount(new BN(unallocatedBalance), selectedToken.decimals),
                                selectedToken.address,
                                true,
                                splTokenList,
                                selectedToken.decimals,
                              )
                            : '0'}
                        </span>
                      </div>
                      <div className='right inner-label'>&nbsp;</div>
                    </div>
                  </div>
                </>
              )}

              {/* Send date */}
              {workingTreasuryType === AccountType.Open && (
                <>
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
                            bordered={false}
                            className='addon-date-picker'
                            aria-required={true}
                            allowClear={false}
                            disabledDate={disabledDate}
                            placeholder={t('transactions.send-date.placeholder')}
                            onChange={(value, date) => handleDateChange(date)}
                            defaultValue={moment(paymentStartDate, DATEPICKER_FORMAT)}
                            format={DATEPICKER_FORMAT}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={currentStep === 1 ? 'contract-wrapper panel2 show' : 'contract-wrapper panel2 hide'}>
              {workingTreasuryType === AccountType.Open ? (
                <>
                  {publicKey && (
                    <>
                      {recipientAddress && !enableMultipleStreamsOption && (
                        <>
                          <div className='flex-fixed-right'>
                            <div className='left'>
                              <div className='form-label'>{t('transactions.resume')}</div>
                            </div>
                            <div className='right'>
                              <span
                                className='flat-button change-button'
                                onKeyDown={() => {}}
                                onClick={() => setCurrentStep(0)}
                              >
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
                                    style={{
                                      width: '30',
                                      display: 'inline-flex',
                                    }}
                                  />
                                </div>
                                <div className='flex-column pl-3'>
                                  <div className='address'>
                                    {publicKey && isValidAddress(recipientAddress)
                                      ? shortenAddress(recipientAddress)
                                      : t('transactions.validation.no-recipient')}
                                  </div>
                                  <div className='inner-label mt-0'>{recipientNote || '-'}</div>
                                </div>
                              </div>
                              <div className='middle flex-center'>
                                <div className='vertical-bar' />
                              </div>
                              <div className='right flex-column'>
                                <div className='rate'>{getPaymentRateAmount()}</div>
                                <div className='inner-label mt-0'>{paymentStartDate}</div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {csvArray && enableMultipleStreamsOption && validMultiRecipientsList && (
                        <>
                          {!isSelectedStreamingAccountMultisigTreasury && hasIsOwnWallet && (
                            <span className='form-field-error text-uppercase'>
                              <p>{t('treasuries.treasury-streams.message-warning')}</p>
                            </span>
                          )}
                          <div className='flex-fixed-right'>
                            <div className='left'>
                              <div className='form-label'>{t('transactions.resume')}</div>
                            </div>
                            <div className='right'>
                              <span
                                className='flat-button change-button'
                                onKeyDown={() => {}}
                                onClick={() => setCurrentStep(0)}
                              >
                                <IconEdit className='mean-svg-icons' />
                                <span>{t('general.cta-change')}</span>
                              </span>
                            </div>
                          </div>
                          {listValidAddresses.map(csvItem => (
                            <div key={csvItem.address} className='well'>
                              <div className='three-col-flexible-middle'>
                                <div className='left flex-row'>
                                  <div className='flex-center'>
                                    <Identicon
                                      address={isValidAddress(csvItem.address) ? csvItem.address : SOL_MINT.toBase58()}
                                      style={{
                                        width: '30',
                                        display: 'inline-flex',
                                      }}
                                    />
                                  </div>
                                  <div className='flex-column pl-3'>
                                    <div className='address'>
                                      {publicKey && isValidAddress(csvItem.address)
                                        ? shortenAddress(csvItem.address)
                                        : t('transactions.validation.no-recipient')}
                                    </div>
                                    <div className='inner-label mt-0'>{csvItem.streamName.substring(0, 15) || '-'}</div>
                                  </div>
                                </div>
                                <div className='middle flex-center'>
                                  <div className='vertical-bar' />
                                </div>
                                <div className='right flex-column'>
                                  <div className='rate'>{getPaymentRateAmount()}</div>
                                  <div className='inner-label mt-0'>{paymentStartDate}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  <div className='mb-3 text-center'>
                    <div>
                      {t('treasuries.treasury-streams.minimum-allocation-advice', {
                        tokenSymbol: selectedToken?.symbol,
                        rateInterval: getPaymentRateAmount(),
                      })}
                    </div>
                  </div>

                  {/* Amount to stream */}
                  <div className='form-label'>
                    <span className='align-middle'>{t('treasuries.treasury-streams.allocate-funds-label')}</span>
                    <span className='align-middle'>
                      <InfoIcon
                        content={
                          <span>
                            This is the total amount of funds that will be streamed to the recipient at the payment rate
                            selected. You can add more funds at any time by topping up the stream.
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
                              fullTokenInfo={selectedToken}
                            />
                          )}
                          {selectedToken && unallocatedBalance ? (
                            <div
                              className='token-max simplelink'
                              onKeyDown={() => {}}
                              onClick={() => {
                                const maxAmount = getMaxAmount(isFeePaidByTreasurer);
                                consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                                consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                                setFromCoinAmount(toUiAmount(new BN(maxAmount), selectedToken.decimals));
                                setTokenAmount(new BN(maxAmount));
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
                        <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                        <span>
                          {unallocatedBalance && selectedToken
                            ? stringNumberFormat(toUiAmount(unallocatedBalance, selectedToken.decimals), 4)
                            : '0'}
                        </span>
                      </div>
                      <div className='right inner-label'>
                        <span
                          className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                          onKeyDown={() => {}}
                          onClick={() => refreshPrices()}
                        >
                          ~{fromCoinAmount ? toUsCurrency(getTokenPrice(fromCoinAmount)) : '$0.00'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className='ml-1 mb-3'>
                    <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>
                      {t('treasuries.treasury-streams.fee-payed-by-treasurer')}
                    </Checkbox>
                  </div>

                  <div className='ml-1'>
                    <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                      {t('transfers.verified-recipient-disclaimer')}
                    </Checkbox>
                  </div>
                </>
              ) : (
                <>
                  <div className='mb-2 text-uppercase'>
                    {t('treasuries.treasury-streams.add-stream-locked.panel2-name')}
                  </div>

                  {recipientNote && recipientAddress && fromCoinAmount && selectedToken && (
                    <div className='flex-fixed-right'>
                      <div className='left'>
                        <div className='mb-3'>
                          {t('treasuries.treasury-streams.add-stream-locked.panel2-summary', {
                            recipientNote: recipientNote,
                            fromCoinAmount: formatThousands(
                              Number.parseFloat(fromCoinAmount),
                              friendlyDisplayDecimalPlaces(fromCoinAmount, selectedToken.decimals),
                            ),
                            selectedTokenName: selectedToken?.name,
                            recipientShortenAddress: shortenAddress(recipientAddress),
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className='form-label'>
                    {t('treasuries.treasury-streams.add-stream-locked.panel2-lock-period-label')}
                  </div>
                  <div className='d-flex'>
                    <div className='well w-25 mr-1'>
                      <div className='flex-fixed-right'>
                        <div className='left'>
                          <input
                            id='plock-period-field'
                            className='w-100 general-text-input'
                            autoComplete='on'
                            autoCorrect='off'
                            type='number'
                            onChange={e => handleLockPeriodAmountChange(e.target.value)}
                            placeholder={`Number of ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`}
                            spellCheck='false'
                            min={0}
                            value={lockPeriodAmount}
                          />
                        </div>
                      </div>
                    </div>
                    <div className='well w-75 ml-1'>
                      <Dropdown menu={lockPeriodOptionsMenu()} trigger={['click']}>
                        <span className='dropdown-trigger no-decoration flex-fixed-right align-items-center'>
                          <div className='left'>
                            <span>{getLockPeriodOptionLabel(lockPeriodFrequency, t)} </span>
                          </div>
                          <div className='right'>
                            <IconCaretDown className='mean-svg-icons' />
                          </div>
                        </span>
                      </Dropdown>
                    </div>
                  </div>

                  <div className='form-label'>
                    {t('treasuries.treasury-streams.add-stream-locked.panel2-commencement-date-label')}
                  </div>
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
                            bordered={false}
                            className='addon-date-picker'
                            aria-required={true}
                            allowClear={false}
                            disabledDate={disabledDate}
                            placeholder={t('transactions.send-date.placeholder')}
                            onChange={(value, date) => handleDateChange(date)}
                            defaultValue={moment(paymentStartDate, DATEPICKER_FORMAT)}
                            format={DATEPICKER_FORMAT}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className='form-label mt-2'>
                    {t('treasuries.treasury-streams.add-stream-locked.panel2-cliff-release-label')}
                  </div>
                  <div className='well'>
                    <div className='flexible-right mb-1'>
                      <div className='token-group'>
                        {percentages.map(percentage => (
                          <div key={percentage} className='mb-1 d-flex flex-column align-items-center'>
                            <div
                              className='token-max simplelink active'
                              onKeyDown={() => {}}
                              onClick={() => onChangeValuePercentages(percentage)}
                            >
                              {percentage}%
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className='flex-fixed-left'>
                      <div className='left'>
                        <span className='add-on simplelink'>
                          {selectedToken && (
                            <TokenDisplay
                              onClick={() => {}}
                              mintAddress={selectedToken.address}
                              name={selectedToken.name}
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
                          onChange={e => handleCliffReleaseAmountChange(e.target.value)}
                          pattern='^[0-9]*[.,]?[0-9]*$'
                          placeholder='0.0'
                          minLength={1}
                          maxLength={79}
                          spellCheck='false'
                          value={cliffRelease}
                        />
                      </div>
                    </div>
                    <div className='flex-fixed-right'>
                      <div className='left inner-label'>
                        <span>
                          {t('treasuries.treasury-streams.add-stream-locked.panel2-cliff-release-inner-label')}
                        </span>
                      </div>
                      <div className='right inner-label'>
                        <span
                          className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'}
                          onKeyDown={() => {}}
                          onClick={() => refreshPrices()}
                        >
                          ~{cliffRelease ? toUsCurrency(getTokenPrice(cliffRelease)) : '$0.00'}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={currentStep === 2 ? 'contract-wrapper panel3 show' : 'contract-wrapper panel3 hide'}>
              {workingTreasuryType === AccountType.Lock && (
                <>
                  <div className='flex-fixed-right'>
                    <div className='left'>
                      <div className='text-uppercase mb-2'>{t('transactions.resume')}</div>
                    </div>
                    <div className='right'>
                      <span
                        className='flat-button change-button'
                        onKeyDown={() => {}}
                        onClick={() => setCurrentStep(0)}
                      >
                        <IconEdit className='mean-svg-icons' />
                        <span>{t('general.cta-change')}</span>
                      </span>
                    </div>
                  </div>

                  <div className='mb-2'>
                    {t('treasuries.treasury-streams.add-stream-locked.panel3-text-one')} {recipientNote ?? '--'}
                  </div>

                  <Row className='mb-2'>
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-sending')}</strong>
                      <span className='ml-1'>
                        {fromCoinAmount && selectedToken
                          ? `${displayAmountWithSymbol(
                              tokenAmount,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false,
                            )}`
                          : '--'}
                      </span>
                    </Col>
                    <Col span={24} className='text-truncate'>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-to-address')}</strong>
                      <span className='ml-1'>{recipientAddress ?? '--'}</span>
                    </Col>
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-starting-on')}</strong>
                      <span className='ml-1'>{paymentStartDate}</span>
                    </Col>
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-cliff-release')}</strong>
                      <span className='ml-1'>
                        {cliffRelease && selectedToken
                          ? `${displayAmountWithSymbol(
                              cliffReleaseBn,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false,
                            )} (on commencement)`
                          : '--'}
                      </span>
                    </Col>
                    <Col span={24}>
                      <strong>Amount to be streamed:</strong>
                      <span className='ml-1'>
                        {lockPeriodAmount && selectedToken
                          ? `${displayAmountWithSymbol(
                              amountToBeStreamedBn,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false,
                            )} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`
                          : '--'}
                      </span>
                    </Col>
                    <Col span={24}>
                      <strong>Release rate:</strong>
                      <span className='ml-1'>{getReleaseRate()}</span>
                    </Col>
                  </Row>

                  <span className='warning-message icon-label mb-3'>
                    <IconWarning className='mean-svg-icons' />
                    {t('treasuries.treasury-streams.add-stream-locked.panel3-warning-message')}
                  </span>

                  <div className='ml-1 mb-3'>
                    <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>
                      {t('treasuries.treasury-streams.fee-payed-by-treasurer')}
                    </Checkbox>
                  </div>

                  <div className='ml-1'>
                    <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>
                      {t('transfers.verified-recipient-disclaimer')}
                    </Checkbox>
                  </div>
                </>
              )}
            </div>
          </div>

          <Divider plain />

          <div className={currentStep === 0 ? 'contract-wrapper panel1 show' : 'contract-wrapper panel1 hide'}>
            <Button
              className='main-cta center-text-in-btn'
              block
              type='primary'
              shape='round'
              size='large'
              onClick={onContinueStepOneButtonClick}
              disabled={
                workingTreasuryType === AccountType.Lock
                  ? !publicKey ||
                    (isMultisigContext && !proposalTitle) ||
                    !isMemoValid() ||
                    !isStreamingAccountSelected() ||
                    !isValidAddress(recipientAddress) ||
                    !selectedToken ||
                    unallocatedBalance.isZero() ||
                    tokenAmount.isZero() ||
                    tokenAmount.gt(unallocatedBalance) ||
                    !arePaymentSettingsValid()
                  : !publicKey ||
                    (isMultisigContext && !proposalTitle) ||
                    (!enableMultipleStreamsOption && !isMemoValid()) ||
                    !isStreamingAccountSelected() ||
                    !isDestinationAddressValid() ||
                    !paymentRateAmount ||
                    unallocatedBalance.isZero() ||
                    !paymentRateAmount ||
                    Number.parseFloat(paymentRateAmount) === 0 ||
                    !arePaymentSettingsValid()
              }
            >
              {workingTreasuryType === AccountType.Open
                ? getStepOneContinueButtonLabel()
                : getStepOneContinueButtonLabelInLocked()}
            </Button>
          </div>

          <div className={currentStep === 1 ? 'contract-wrapper panel2 show' : 'contract-wrapper panel2 hide'}>
            <Button
              className={`main-cta center-text-in-btn ${isBusy ? 'inactive' : ''}`}
              block
              type='primary'
              shape='round'
              size='large'
              onClick={workingTreasuryType === AccountType.Lock ? onContinueStepTwoButtonClick : onStartTransaction}
              disabled={
                workingTreasuryType === AccountType.Lock
                  ? !publicKey ||
                    (isMultisigContext && !proposalTitle) ||
                    !isMemoValid() ||
                    !isStreamingAccountSelected() ||
                    !isValidAddress(recipientAddress) ||
                    !selectedToken ||
                    unallocatedBalance.isZero() ||
                    tokenAmount.isZero() ||
                    tokenAmount.gt(unallocatedBalance) ||
                    !lockPeriodAmount ||
                    Number.parseFloat(lockPeriodAmount) === 0 ||
                    Number.parseFloat(cliffRelease) >
                      Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))
                  : !publicKey ||
                    (isMultisigContext && !proposalTitle) ||
                    (!enableMultipleStreamsOption && !isMemoValid()) ||
                    !isStreamingAccountSelected() ||
                    !isDestinationAddressValid() ||
                    !paymentRateAmount ||
                    unallocatedBalance.isZero() ||
                    !paymentRateAmount ||
                    Number.parseFloat(paymentRateAmount) === 0 ||
                    !arePaymentSettingsValid() ||
                    !areSendAmountSettingsValid() ||
                    !isVerifiedRecipient ||
                    nativeBalance < getMinBalanceRequired()
              }
            >
              {workingTreasuryType === AccountType.Open && isBusy && (
                <span className='mr-1'>
                  <LoadingOutlined style={{ fontSize: '16px' }} />
                </span>
              )}
              {workingTreasuryType === AccountType.Open &&
                (isBusy ? t('streams.create-new-stream-cta-busy') : getTransactionStartButtonLabel())}

              {workingTreasuryType === AccountType.Lock && getStepTwoContinueButtonLabel()}
            </Button>
          </div>

          <div className={currentStep === 2 ? 'contract-wrapper panel3 show' : 'contract-wrapper panel3 hide'}>
            <Button
              className='main-cta center-text-in-btn'
              block
              type='primary'
              shape='round'
              size='large'
              onClick={onStartTransaction}
              disabled={
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                !isMemoValid() ||
                !isStreamingAccountSelected() ||
                !isValidAddress(recipientAddress) ||
                !selectedToken ||
                unallocatedBalance.isZero() ||
                !fromCoinAmount ||
                Number.parseFloat(fromCoinAmount) === 0 ||
                !lockPeriodAmount ||
                Number.parseFloat(lockPeriodAmount) === 0 ||
                Number.parseFloat(cliffRelease) >
                  Number.parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals)) ||
                !arePaymentSettingsValid() ||
                !areSendAmountSettingsValid() ||
                !isVerifiedRecipient ||
                nativeBalance < getMinBalanceRequired()
              }
            >
              {getTransactionStartButtonLabelInLocked()}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
};
