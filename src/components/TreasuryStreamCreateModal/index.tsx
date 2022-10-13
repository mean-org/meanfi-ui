import { InfoCircleOutlined, LoadingOutlined, WarningFilled, WarningOutlined } from '@ant-design/icons';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { TreasuryInfo } from '@mean-dao/money-streaming';
import { Beneficiary, MSP, StreamBeneficiary, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { u64 } from '@solana/spl-token';
import { AccountInfo, Connection, ParsedAccountData, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Checkbox, Col, DatePicker, Divider, Dropdown, Menu, Modal, Row, Select, Tooltip } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { BN } from 'bn.js';
import { Identicon } from 'components/Identicon';
import { InfoIcon } from 'components/InfoIcon';
import { InputMean } from 'components/InputMean';
import { StepSelector } from 'components/StepSelector';
import { TokenDisplay } from 'components/TokenDisplay';
import { CUSTOM_TOKEN_NAME, DATEPICKER_FORMAT, FALLBACK_COIN_IMAGE } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { IconCaretDown, IconEdit, IconHelpCircle, IconWarning } from 'Icons';
import { appConfig, customLogger } from 'index';
import { readAccountInfo } from 'middleware/accounts';
import { NATIVE_SOL_MINT } from 'middleware/ids';
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
  toUsCurrency
} from 'middleware/ui';
import {
  displayAmountWithSymbol,
  formatThousands, getAmountWithSymbol, getSdkValue, isValidNumber,
  shortenAddress,
  toTokenAmount,
  toTokenAmountBn,
  toUiAmount
} from 'middleware/utils';
import { OperationType, PaymentRateType, TransactionStatus } from 'models/enums';
import { PaymentRateTypeOption } from "models/PaymentRateTypeOption";
import { TokenInfo } from 'models/SolanaTokenInfo';
import { CreateStreamParams } from 'models/streams';
import moment from "moment";
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const { Option } = Select;
type TreasuryValues = Treasury | TreasuryInfo | undefined;

export const TreasuryStreamCreateModal = (props: {
  associatedToken: string;
  connection: Connection;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  minRequiredBalance: number;
  selectedMultisig: MultisigInfo | undefined;
  multisigClient: MeanMultisig;
  nativeBalance: number;
  transactionFees: TransactionFees;
  treasuryList: (Treasury | TreasuryInfo)[] | undefined;
  treasuryDetails: TreasuryValues;
  userBalances: any;
  withdrawTransactionFees: TransactionFees;
}) => {
  const {
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
  } = props;
  const { t } = useTranslation('common');
  const { wallet, publicKey } = useWallet();
  const { endpoint } = useConnectionConfig();
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
    streamV2ProgramAddress,
    setPaymentRateFrequency,
    setIsVerifiedRecipient,
    setLockPeriodFrequency,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
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
  const {
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);
  const [enableMultipleStreamsOption] = useState(false);
  const today = new Date().toLocaleDateString("en-US");
  const [csvFile, setCsvFile] = useState<any>();
  const [csvArray, setCsvArray] = useState<any>([]);
  const [listValidAddresses, setListValidAddresses] = useState([]);
  const [hasIsOwnWallet, setHasIsOwnWallet] = useState<boolean>(false);
  const [isCsvSelected, setIsCsvSelected] = useState<boolean>(false);
  const [validMultiRecipientsList, setValidMultiRecipientsList] = useState<boolean>(false);
  const percentages = [5, 10, 15, 20];
  const [cliffRelease, setCliffRelease] = useState<string>("");
  const [cliffReleaseBn, setCliffReleaseBn] = useState(new BN(0));
  const [paymentRateAmountBn, setPaymentRateAmountBn] = useState(new BN(0));
  const [amountToBeStreamedBn, setAmountToBeStreamedBn] = useState(new BN(0));
  const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
  const [workingTreasuryDetails, setWorkingTreasuryDetails] = useState<TreasuryValues>(undefined);
  const [workingTreasuryType, setWorkingTreasuryType] = useState<TreasuryType>(TreasuryType.Open);
  const [selectedStreamingAccountId, setSelectedStreamingAccountId] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);


  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const getMaxAmount = useCallback((preSetting = false) => {
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
        const debugTable: any[] = [];
        debugTable.push({
          unallocatedBalance: unallocatedBalance.toString(),
          feeNumerator: feeNumerator,
          feePercentage01: feeNumerator/feeDenaminator,
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
  },[
    isWhitelisted,
    unallocatedBalance,
    isFeePaidByTreasurer,
    withdrawTransactionFees,
    enableMultipleStreamsOption,
    listValidAddresses.length
  ]);

  const getTokenPrice = useCallback((inputAmount: string) => {
    if (!selectedToken) { return 0; }
    const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

    return parseFloat(inputAmount) * price;
  }, [getTokenPriceByAddress, getTokenPriceBySymbol, selectedToken]);

  const hasNoStreamingAccounts = useMemo(() => {
    return  isMultisigContext && selectedMultisig &&
            (!treasuryList || treasuryList.length === 0)
      ? true
      : false;
  }, [isMultisigContext, selectedMultisig, treasuryList]);

  /////////////////
  //   Getters   //
  /////////////////

  const isSelectedStreamingAccountMultisigTreasury = useMemo(() => {

    if (!publicKey || !workingTreasuryDetails || !selectedMultisig) {
      return false;
    }

    const treasury = workingTreasuryDetails as Treasury;
    const treasurer = new PublicKey(treasury.treasurer as string);

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
      false
    )} ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`;
  }, [lockPeriodFrequency, paymentRateAmountBn, selectedToken, splTokenList, t]);

  const getTokenOrCustomToken = useCallback(async (address: string) => {

    const token = getTokenByMintAddress(address);

    const unkToken = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: `[${shortenAddress(address)}]`,
    };

    if (token) {
      return token;
    } else {
      try {
        const tokeninfo = await readAccountInfo(connection, address);
        if ((tokeninfo as any).data["parsed"]) {
          const decimals = (tokeninfo as AccountInfo<ParsedAccountData>).data.parsed.info.decimals as number;
          unkToken.decimals = decimals || 0;
          return unkToken as TokenInfo;
        } else {
          return unkToken as TokenInfo;
        }
      } catch (error) {
        console.error('Could not get token info, assuming decimals = 6');
        return unkToken as TokenInfo;
      }
    }
  }, [connection, getTokenByMintAddress]);

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

  const getLockPeriodOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getLockPeriodOptionLabel(mappedValue, t)
            );
            options.push(item);
        }
        index++;
    }
    return options;
  }

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');

    if (workingTreasuryType === TreasuryType.Lock) {
      return !rateAmount
        ? 'Add funds to commit'
        : '';
    } else {
      return !rateAmount
        ? t('transactions.validation.no-payment-rate')
        : '';
    }
  }

  const getStepOneContinueButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    } else if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    } else if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    } else if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    } else if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    } else if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id as string) + ')' : ''}`;
    } else if (!paymentRateAmount || parseFloat(paymentRateAmount) === 0) {
      return t('transactions.validation.no-amount');
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    } else if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    } else {
      return t('transactions.validation.valid-continue');
    }
  };

  const getStepOneContinueButtonLabelInLocked = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    } else if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    } else if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    } else if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    } else if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    } else if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id as string) + ')' : ''}`;
    } else if (!fromCoinAmount || parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    } else if (parseFloat(fromCoinAmount) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date')
    } else if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    } else {
      return t('transactions.validation.valid-continue');
    }
  };

  const getStepTwoContinueButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    } else if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    } else if (!recipientNote) {
      return 'Set stream name';
    } else if (!recipientAddress) {
      return t('transactions.validation.select-recipient');
    } else if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id as string) + ')' : ''}`;
    } else if (!fromCoinAmount || parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    } else if (parseFloat(fromCoinAmount) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    } else if (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) {
      return 'Lock period cannot be empty';
    } else if (cliffRelease && parseFloat(cliffRelease) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid cliff amount';
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    } else if (!areSendAmountSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    } else {
      return t('transactions.validation.valid-continue');
    }
  };

  const getTransactionStartButtonLabel = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    } else if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    } else if (!enableMultipleStreamsOption && !recipientNote) {
      return 'Set stream name';
    } else if (!enableMultipleStreamsOption && !recipientAddress) {
      return t('transactions.validation.select-recipient');
    } else if (enableMultipleStreamsOption && !validMultiRecipientsList) {
      return t('transactions.validation.select-address-list');
    } else if (!selectedToken || unallocatedBalance.isZero()) {
      return t('transactions.validation.no-balance');
    } else if (!tokenAmount || tokenAmount.isZero()) {
      return t('transactions.validation.no-amount');
    } else if ((isFeePaidByTreasurer && tokenAmount.gt(maxAllocatableAmount)) ||
               (!isFeePaidByTreasurer && tokenAmount.gt(unallocatedBalance))) {
      return t('transactions.validation.amount-high');
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date')
    } else if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    } else if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    } else if (nativeBalance < getMinBalanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) });
    } else if (isMultisigContext) {
      return 'Submit proposal';
    } else {
      return t('transactions.validation.valid-approve');
    }
  };

  const getTransactionStartButtonLabelInLocked = (): string => {
    if (!publicKey) {
      return t('transactions.validation.not-connected');
    } else if (isMultisigContext && !proposalTitle) {
      return 'Add a proposal title';
    } else if (!enableMultipleStreamsOption && !isStreamingAccountSelected()) {
      return 'Select streaming account';
    } else if (!recipientNote) {
      return 'Set stream name';
    } else if (!recipientAddress) {
      return t('transactions.validation.select-recipient');
    } else if (!selectedToken || unallocatedBalance.isZero()) {
      return `No balance in account ${workingTreasuryDetails ? '(' + shortenAddress(workingTreasuryDetails.id as string) + ')' : ''}`;
    } else if (!fromCoinAmount || parseFloat(fromCoinAmount) === 0) {
      return t('transactions.validation.no-amount');
    } else if (parseFloat(fromCoinAmount) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid amount';
    } else if (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) {
      return 'Lock period cannot be empty';
    } else if (cliffRelease && parseFloat(cliffRelease) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))) {
      return 'Invalid cliff amount';
    } else if (!paymentStartDate) {
      return t('transactions.validation.no-valid-date');
    } else if (!arePaymentSettingsValid()) {
      return getPaymentSettingsButtonLabel();
    } else if (!isVerifiedRecipient) {
      return t('transactions.validation.verified-recipient-unchecked');
    } else if (nativeBalance < getMinBalanceRequired()) {
      return t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) });
    } else if (isMultisigContext) {
      return 'Submit proposal';
    } else {
      return t('transactions.validation.valid-approve');
    }
  };

  const getPaymentRateAmount = useCallback(() => {

    let outStr = selectedToken
      ? getAmountWithSymbol(
          paymentRateAmount,
          selectedToken.address,
          false,
          splTokenList,
          friendlyDisplayDecimalPlaces(parseFloat(paymentRateAmount)) || selectedToken.decimals
        )
      : '-'
    outStr += getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)

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
        const v1 = treasuryDetails as TreasuryInfo;
        const v2 = treasuryDetails as Treasury;
        const treasuryType = treasuryDetails.version < 2 ? v1.type as TreasuryType : v2.treasuryType;
        consoleOut('treasuryDetails aquired:', treasuryDetails, 'blue');
        setWorkingTreasuryDetails(treasuryDetails);
        setSelectedStreamingAccountId(treasuryDetails.id as string);
        setWorkingTreasuryType(treasuryType);
      }
    }
  }, [isVisible, treasuryDetails]);

  // Preset a working copy of the first available streaming account in the list if treasuryDetails was not passed in
  useEffect(() => {
    if (isVisible && !treasuryDetails && treasuryList && treasuryList.length > 0 && !workingTreasuryDetails) {
      consoleOut('treasuryDetails not set!', 'Try to pick one from list', 'blue');
      const selected = treasuryList[0];
      const v1 = selected as TreasuryInfo;
      const v2 = selected as Treasury;
      const treasuryType = selected.version < 2 ? v1.type as TreasuryType : v2.treasuryType;
      consoleOut('treasuryDetails preset:', selected, 'blue');
      setWorkingTreasuryDetails(selected);
      setSelectedStreamingAccountId(selected.id as string);
      setWorkingTreasuryType(treasuryType);
    }
  }, [isVisible, treasuryDetails, treasuryList, workingTreasuryDetails]);

  useEffect(() => {
    if (hasNoStreamingAccounts || !workingTreasuryDetails) {
      return;
    }

    let tokenAddress = '';
    const v1 = workingTreasuryDetails as TreasuryInfo;
    const v2 = workingTreasuryDetails as Treasury;
    tokenAddress = workingTreasuryDetails.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
    getTokenOrCustomToken(tokenAddress)
    .then(token => {
      consoleOut('Treasury associated token:', token, 'blue');
      setSelectedToken(token);
    });
  }, [getTokenOrCustomToken, hasNoStreamingAccounts, userBalances, workingTreasuryDetails]);

  // Set treasury unalocated balance in BN
  useEffect(() => {

    if (!selectedToken) {
      setUnallocatedBalance(new BN(0));
      return;
    }

    const getUnallocatedBalance = (details: Treasury | TreasuryInfo) => {
      const isNew = details && details.version >= 2 ? true : false;
      let result = new BN(0);
      let balance;
      let allocationAssigned;

      if (!isNew) {
        balance = toTokenAmountBn(details.balance, selectedToken.decimals);
        allocationAssigned = toTokenAmountBn(details.allocationAssigned, selectedToken.decimals);
      } else {
        balance = new BN(details.balance);
        allocationAssigned = new BN(details.allocationAssigned);
      }
      result = balance.sub(allocationAssigned);

      return result;
    }

    if (isVisible && treasuryDetails) {
      const ub = getUnallocatedBalance(treasuryDetails);
      consoleOut('unallocatedBalance:', ub.toString(), 'blue');
      setUnallocatedBalance(new BN(ub));
    }

  }, [
    isVisible,
    treasuryDetails,
    selectedToken,
  ]);

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (workingTreasuryDetails && withdrawTransactionFees && !isFeePaidByTreasurer) {
      getMaxAmount();
    }
  }, [
    isVisible,
    isFeePaidByTreasurer,
    workingTreasuryDetails,
    withdrawTransactionFees,
    getMaxAmount
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

  ////////////////
  //   Events   //
  ////////////////

  const triggerWindowResize = () => {
    window.dispatchEvent(new Event('resize'));
  }

  const onStepperChange = (value: number) => {
    setCurrentStep(value);
  }

  const onContinueStepOneButtonClick = () => {
    setCurrentStep(1);  // Go to step 2
  }

  const onContinueStepTwoButtonClick = () => {
    setCurrentStep(2);  // Go to step 3
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

  const handleLockPeriodAmountChange = (e: any) => {

    let periodAmountValue = e.target.value;

    if (periodAmountValue.length > 2) {
      periodAmountValue = periodAmountValue.substr(0, 2);
      setLockPeriodAmount(periodAmountValue);
    } else {
      setLockPeriodAmount(periodAmountValue);
    }
  }

  const handleLockPeriodOptionChange = (val: PaymentRateType) => {
    setLockPeriodFrequency(val);
  }

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
      setTokenAmount(new BN(0));
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
      setTokenAmount(new BN(toTokenAmount(newValue, decimals).toString()));
    }
  };

  const handleCliffReleaseAmountChange = (e: any) => {

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
      setCliffRelease("");
      setCliffReleaseBn(new BN(0));
    } else if (newValue === '.') {
      setCliffRelease(".");
    } else if (isValidNumber(newValue)) {
      setCliffRelease(newValue);
      setCliffReleaseBn(toTokenAmountBn(newValue, decimals));
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const onFeePayedByTreasurerChange = (e: any) => {

    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');

    if (e.target.checked && tokenAmount) {
      const maxAmount = getMaxAmount(true);
      consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
      consoleOut('maxAmount:', maxAmount.toString(), 'blue');
      if (tokenAmount.gt(maxAmount)) {
        const decimals = selectedToken ? selectedToken.decimals : 6;
        setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
        setTokenAmount(new BN(maxAmount));
      }
    }

    setIsFeePaidByTreasurer(e.target.checked);
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onCloseModal = () => {
    handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setRecipientAddress("");
      setRecipientNote("");
      setProposalTitle("");
      setPaymentRateAmount("");
      setFromCoinAmount("");
      setCsvArray([]);
      setIsCsvSelected(false);
      setIsFeePaidByTreasurer(false);
      setIsVerifiedRecipient(false);
      setPaymentRateFrequency(PaymentRateType.PerMonth);
      setPaymentStartDate(today);
      setLockPeriodAmount("");
      setLockPeriodFrequency(PaymentRateType.PerMonth);
    });
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  } 
  
  const onChangeValuePercentages = useCallback((value: number) => {
    if (!selectedToken) { return; }

    if (value > 0 && tokenAmount.gtn(0)) {
      const cr = tokenAmount.muln(value).divn(100);
      setCliffReleaseBn(cr);
      setCliffRelease(toUiAmount(cr, selectedToken.decimals));
    }
  }, [selectedToken, tokenAmount]);

  const selectCsvHandler = (e: any) => {
    const reader = new FileReader();

    setHasIsOwnWallet(false);

    reader.onloadend = (e: any) => {
      if (e.target.readyState === FileReader.DONE) {
        setCsvFile(e.target.result);
      }
    }
    
    reader.readAsText(e.target.files[0]);
  }

  const getMinBalanceRequired = useCallback(() => {
    if (!transactionFees) { return 0; }

    const bf = transactionFees.blockchainFee;       // Blockchain fee
    const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
    const minRequired = isSelectedStreamingAccountMultisigTreasury ? minRequiredBalance : bf + ff;
    return minRequired;

  }, [isSelectedStreamingAccountMultisigTreasury, minRequiredBalance, transactionFees]);

  /////////////////////
  // Data management //
  /////////////////////

  // Recipient list - parse
  useEffect(() => {
    if (!csvFile) { return; }

    const splittedData = csvFile.split("\n");
    const dataFormatted: any[] = [];
    
    const timeout = setTimeout(() => {
      for (const line of splittedData) {
        const splittedLine = line.split(",");
  
        if (splittedLine.length < 2) {
          continue;
        }
  
        dataFormatted.push({
          streamName: splittedLine[0].trim(),
          address: splittedLine[1].trim()
        });
      }

      setCsvArray(dataFormatted);
    });

    setIsCsvSelected(true);
    
    return () => {
      clearTimeout(timeout);
    }    

  }, [csvFile]);

  // Recipient list - filter valid addresses
  useEffect(() => {

    if (!csvArray.length || !publicKey) { return; }

    const timeout = setTimeout(() => {
      const validAddresses = csvArray.filter((csvItem: any) => isValidAddress(csvItem.address));

      const validAddressesSingleSigner = validAddresses.filter((csvItem: any) => csvItem.address !== `${publicKey.toBase58()}`);

      if (!isSelectedStreamingAccountMultisigTreasury) {
        setListValidAddresses(validAddressesSingleSigner);
        if ((validAddresses.length - validAddressesSingleSigner.length) > 0) {
          setHasIsOwnWallet(true);
        }
      } else {
        setListValidAddresses(validAddresses);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    wallet,
    csvArray,
    publicKey,
    isSelectedStreamingAccountMultisigTreasury,
  ]);

  // Recipient list - Set valid flag
  useEffect(() => {
    if (isCsvSelected) {
      if (listValidAddresses.length > 0) {
        setValidMultiRecipientsList(true);
      } else {
        setValidMultiRecipientsList(false);
      }
    }
  }, [
    isCsvSelected,
    csvFile,
    listValidAddresses,
    csvArray,
  ]);

  // Set payment rate amount
  useEffect(() => {

    if (!selectedToken) { return; }

    if (tokenAmount.gtn(0)) {
      let toStream = tokenAmount;
      let ra = new BN(0);
      if (cliffReleaseBn.gtn(0)) {
        toStream = toStream.sub(cliffReleaseBn);
      }
      const lpa = parseFloat(lockPeriodAmount);
      if (lpa) {
        ra = toStream.divn(lpa);
      }

      if (workingTreasuryType === TreasuryType.Lock) {
        setPaymentRateAmountBn(ra);
        setPaymentRateAmount(ra.toString());
      } else {
        const openRateAmount = toTokenAmount(paymentRateAmount || '0', selectedToken.decimals, true) as string;
        setPaymentRateAmountBn(new BN(openRateAmount));
      }
    }
  }, [cliffReleaseBn, lockPeriodAmount, paymentRateAmount, selectedToken, setPaymentRateAmount, tokenAmount, workingTreasuryType]);

  // Set the amount to be streamed
  useEffect(() => {

    if (!selectedToken) { return; }

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

  const onTransactionStart = async () => {

    let transactions: Transaction[] = [];
    let signatures: string[] = [];
    let multisigAuth = '';

    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);
    resetTransactionStatus();

    const createStreams = async (data: CreateStreamParams): Promise<Transaction[] | null> => {

      consoleOut('Is Multisig Treasury: ', isSelectedStreamingAccountMultisigTreasury, 'blue');
      consoleOut('Multisig authority: ', selectedMultisig ? selectedMultisig.authority.toBase58() : '--', 'blue');
      consoleOut('Starting create streams using MSP V2...', '', 'blue');
      const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

      if (!isSelectedStreamingAccountMultisigTreasury) {

        const beneficiaries: Beneficiary[] = data.beneficiaries.map((b: any) => {
          return {
            ...b,
            address: new PublicKey(b.address)
          } as Beneficiary
        });

        return msp.createStreams(
          new PublicKey(data.payer),                                          // initializer
          new PublicKey(data.treasurer),                                      // treasurer
          new PublicKey(data.treasury),                                       // treasury
          beneficiaries,                                                      // beneficiary
          new PublicKey(data.associatedToken),                                // associatedToken
          data.allocationAssigned,                                            // allocationAssigned
          data.rateAmount,                                                    // rateAmount
          data.rateIntervalInSeconds,                                         // rateIntervalInSeconds
          data.startUtc,                                                      // startUtc
          data.cliffVestAmount,                                               // cliffVestAmount
          data.cliffVestPercent,                                              // cliffVestPercent
          data.feePayedByTreasurer                                            // feePayedByTreasurer
        );
      }

      if (!workingTreasuryDetails || !multisigClient || !selectedMultisig || !publicKey) { return null; }

      multisigAuth = selectedMultisig.authority.toBase58();

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [selectedMultisig.id.toBuffer()],
        multisigAddressPK
      );

      const streams: StreamBeneficiary[] = [];
      const streamsBumps: any = {};
      let seedCounter = 0;

      const timeStamp = parseInt((Date.now() / 1000).toString());

      for (const beneficiary of data.beneficiaries) {

        const timeStampCounter = new u64(timeStamp + seedCounter);
        const [stream, streamBump] = await PublicKey.findProgramAddress(
          [selectedMultisig.id.toBuffer(), timeStampCounter.toBuffer()],
          multisigAddressPK
        );

        streams.push({
          streamName: beneficiary.streamName,
          address: stream,
          beneficiary: new PublicKey(beneficiary.address)

        } as StreamBeneficiary);

        streamsBumps[stream.toBase58()] = {
          bump: streamBump,
          timeStamp: timeStampCounter
        };

        seedCounter += 1;
      }

      const createStreams = await msp.createStreamsFromPda(
        publicKey,                                                            // payer
        multisigSigner,                                                       // treasurer
        new PublicKey(data.treasury),                                         // treasury
        new PublicKey(data.associatedToken),                                  // associatedToken
        streams,                                                              // streams
        data.allocationAssigned,                                              // allocationAssigned
        data.rateAmount,                                                      // rateAmount
        data.rateIntervalInSeconds,                                           // rateIntervalInSeconds
        data.startUtc,                                                        // startUtc
        data.cliffVestAmount,                                                 // cliffVestAmount
        data.cliffVestPercent,                                                // cliffVestPercent
        data.feePayedByTreasurer                                              // feePayedByTreasurer
      );

      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
      const txs: Transaction[] = [];

      for (const createTx of createStreams) {
        const ixData = Buffer.from(createTx.instructions[0].data);
        const ixAccounts = createTx.instructions[0].keys;
        const streamSeedData = streamsBumps[createTx.instructions[0].keys[6].pubkey.toBase58()];

        const tx = await multisigClient.createMoneyStreamTransaction(
          publicKey,
          proposalTitle === "" ? "Create Stream" : proposalTitle,
          "", // description
          new Date(expirationTime * 1_000),
          streamSeedData.timeStamp.toNumber(),
          streamSeedData.bump,
          OperationType.StreamCreate,
          selectedMultisig.id,
          mspV2AddressPK,
          ixAccounts,
          ixData
        );
        
        if (tx) {
          txs.push(tx);
        }
      } 

      return txs;
    }

    const createTxs = async (): Promise<boolean> => {

      if (!publicKey || !workingTreasuryDetails || !selectedToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const beneficiaries = !enableMultipleStreamsOption 
        ? [{ streamName: recipientNote ? recipientNote.trim() : '', address: recipientAddress }]
        : csvArray;

      const assocToken = new PublicKey(selectedToken.address);
      const treasury = new PublicKey(workingTreasuryDetails.id as string);
      const treasurer = isSelectedStreamingAccountMultisigTreasury && selectedMultisig
        ? selectedMultisig.id
        : publicKey;
      const amount = tokenAmount.div(new BN(beneficiaries.length)).toString();
      const rateAmount = paymentRateAmountBn.toString();
      const now = new Date();
      const parsedDate = Date.parse(paymentStartDate as string);
      const startUtc = new Date(parsedDate);
      const cliffAmount = cliffReleaseBn.toString();
      startUtc.setHours(now.getHours());
      startUtc.setMinutes(now.getMinutes());
      startUtc.setSeconds(now.getSeconds());
      startUtc.setMilliseconds(now.getMilliseconds());

      const isLockedTreasury = workingTreasuryType === TreasuryType.Lock
        ? true
        : false;

      consoleOut('fromParsedDate.toString()', startUtc.toString(), 'crimson');
      consoleOut('fromParsedDate.toLocaleString()', startUtc.toLocaleString(), 'crimson');
      consoleOut('fromParsedDate.toISOString()', startUtc.toISOString(), 'crimson');
      consoleOut('fromParsedDate.toUTCString()', startUtc.toUTCString(), 'crimson');

      if (isLockedTreasury) {
        consoleOut('paymentRateFrequency', lockPeriodFrequency, 'crimson');
      } else {
        consoleOut('paymentRateFrequency', paymentRateFrequency, 'crimson');
      }

      // Create a transaction
      const data: CreateStreamParams = {
        payer: publicKey.toBase58(),                                                // initializer
        treasurer: treasurer.toBase58(),                                            // treasurer
        treasury: treasury.toBase58(),                                              // treasury
        beneficiaries: beneficiaries,                                               // beneficiaries
        associatedToken: assocToken.toBase58(),                                     // associatedToken
        allocationAssigned: amount,                                                 // allocationAssigned
        rateAmount: rateAmount,                                                     // rateAmount
        rateIntervalInSeconds: isLockedTreasury
          ? getRateIntervalInSeconds(lockPeriodFrequency)                           // rateIntervalInSeconds
          : getRateIntervalInSeconds(paymentRateFrequency),
        startUtc: startUtc,                                                         // startUtc
        cliffVestAmount: cliffAmount,                                               // cliffVestAmount
        cliffVestPercent: 0,                                                        // cliffVestPercent
        feePayedByTreasurer: isFeePaidByTreasurer                                   // feePayedByTreasurer
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

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const minRequired = getMinBalanceRequired();
      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await createStreams(data)
        .then(values => {
          if (!values || !values.length) { return false; }
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
          });
          transactions = values;
          return true;
        })
        .catch(error => {
          console.error('createStreams error:', error);
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

      return result;
    }

    const sendTxs = async (): Promise<boolean> => {

      if (!connection || !wallet || !wallet.publicKey) {
        console.error('Cannot send transactions! Wallet not found or no connection!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transactions! Wallet not found!'
        });
        customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      const {
        context: { slot: minContextSlot },
        value: { blockhash, lastValidBlockHeight },
      } = await connection.getLatestBlockhashAndContext();

      const promises: Promise<string>[] = [];

      // transactions
      for await (const tx of transactions) {
        tx.feePayer = wallet.publicKey;
        tx.recentBlockhash = blockhash;
        promises.push(
          wallet.sendTransaction(tx, connection, { minContextSlot })
        );
      }

      const result = Promise.all(promises)
        .then(sigs => {
          consoleOut('sendTransaction returned a signatures:', sigs);
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransactionSuccess,
            currentOperation: TransactionStatus.ConfirmTransaction
          });
          signatures = sigs;
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
            result: `signatures: ${signatures}`
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
            // result: { error, encodedTx }
          });
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    if (wallet && selectedToken) {
      const create = await createTxs();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sent = await sendTxs();
        consoleOut('sent:', sent);
        if (sent && !transactionCancelled) {
          consoleOut('Send Txs to confirmation queue:', signatures);
          const isLockedTreasury = workingTreasuryType === TreasuryType.Lock ? true : false;
          const rateDisplay = isLockedTreasury ? getReleaseRate() : getPaymentRateAmount();
          const messageLoading = multisigAuth
            ? `Proposal to create stream to send ${rateDisplay}.`
            : `Create stream to send ${rateDisplay}.`
          const messageCompleted = multisigAuth
            ? `Proposal to create stream to send ${rateDisplay} sent for approval.`
            : `Stream to send ${rateDisplay} created successfully.`

          consoleOut('pending confirm msg:', messageLoading, 'blue');
          consoleOut('confirmed msg:', messageCompleted, 'blue');

          enqueueTransactionConfirmation({
            signature: signatures[0],
            operationType: OperationType.TreasuryStreamCreate,
            finality: "confirmed",
            txInfoFetchStatus: "fetching",
            loadingTitle: "Confirming transaction",
            loadingMessage: messageLoading,
            completedTitle: "Transaction confirmed",
            completedMessage: messageCompleted,
            extras: {
              multisigAuthority: multisigAuth
            }
          });
          setIsBusy(false);
          resetTransactionStatus();
          handleOk();
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isStreamingAccountSelected = (): boolean => {
    const isMultisig = isMultisigContext && selectedMultisig ? true : false;
    return !isMultisig || (isMultisig && selectedStreamingAccountId && isValidAddress(selectedStreamingAccountId))
      ? true
      : false;
  }

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isSendAmountValid = (): boolean => {
    return publicKey &&
           selectedToken &&
           tokenAmount && tokenAmount.gtn(0) &&
           ((isFeePaidByTreasurer && tokenAmount.lte(maxAllocatableAmount)) ||
            (!isFeePaidByTreasurer && tokenAmount.lte(unallocatedBalance)))
    ? true
    : false;
  }

  const isRateAmountValid = (): boolean => {
    return ((paymentRateAmount && parseFloat(paymentRateAmount) > 0) || (fromCoinAmount && parseFloat(fromCoinAmount) > 0))
     ? true
     : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return (isSendAmountValid() && paymentStartDate) ? true : false;
  }

  const arePaymentSettingsValid = (): boolean => {
    if (!paymentStartDate) {
      return false;
    }

    return isRateAmountValid();
  }

  const onTitleInputValueChange = (e: any) => {
    setProposalTitle(e.target.value);
  }

  const onStreamingAccountSelected = useCallback((e: any) => {
    consoleOut('Selected streaming account:', e, 'blue');
    setSelectedStreamingAccountId(e.id as string);
    const item = treasuryList?.find(t => t.id === e);
    consoleOut('item:', item, 'blue');
    if (item) {
      setWorkingTreasuryDetails(item);
      setSelectedStreamingAccountId(item.id as string);
      const v1 = item as TreasuryInfo;
      const v2 = item as Treasury;
      const tokenAddress = item.version < 2 ? v1.associatedTokenAddress as string : v2.associatedToken as string;
      getTokenOrCustomToken(tokenAddress)
      .then(token => {
        consoleOut('Treasury associated token:', token, 'blue');
        setSelectedToken(token);
      });
    }
  }, [getTokenOrCustomToken, treasuryList, userBalances]);

  const isDestinationAddressValid = () => {
    if (!enableMultipleStreamsOption) {
      return isValidAddress(recipientAddress);
    } else {
      return validMultiRecipientsList;
    }
  }

  ///////////////
  // Rendering //
  ///////////////

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  const paymentRateOptionsMenu = () => {
    const items: ItemType[] = getOptionsFromEnum(PaymentRateType).map((item, index) => {
      return {
        key: `option-${index}`,
        label: (<span onClick={() => handlePaymentRateOptionChange(item.value)}>{item.text}</span>)
      };
    });

    return <Menu items={items} />;
  }

  const lockPeriodOptionsMenu = () => {
    const items: ItemType[] = getLockPeriodOptionsFromEnum(PaymentRateType).map((item, index) => {
      return {
        key: `option-${index}`,
        label: (<span onClick={() => handleLockPeriodOptionChange(item.value)}>{item.text}</span>)
      };
    });

    return <Menu items={items} />;
  }

  const getStreamingAccountIcon = (item: TreasuryValues) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const treasuryAssociatedToken = isV2Treasury ? v2.associatedToken as string : v1.associatedTokenAddress as string;
    const token = treasuryAssociatedToken ? getTokenByMintAddress(treasuryAssociatedToken) : undefined;

    return (
      <div className="token-icon">
        {treasuryAssociatedToken ? (
          <>
            {token && token.logoURI ? (
              <img alt={`${token.name}`} width={20} height={20} src={token.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={treasuryAssociatedToken} style={{ width: "20", display: "inline-flex" }} />
            )}
          </>
        ) : (
          <Identicon address={item.id} style={{ width: "20", display: "inline-flex" }} />
        )}
      </div>
    );
  }

  const getStreamingAccountDescription = (item: TreasuryValues) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    const name = isV2Treasury ? v2.name : v1.label;
    const treasuryType = isV2Treasury ? v2.treasuryType : v1.type as TreasuryType;
    return (
      <>
        {name ? (
          <>
            <div className="title text-truncate">
              {name}
              <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                {treasuryType === TreasuryType.Open ? 'Open' : 'Locked'}
              </span>
            </div>
            <div className="subtitle text-truncate">{shortenAddress(item.id as string, 8)}</div>
          </>
        ) : (
          <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
        )}
      </>
    );
  }

  const getStreamingAccountStreamCount = (item: TreasuryValues) => {
    if (!item) { return null; }
    const isV2Treasury = item && item.version >= 2 ? true : false;
    const v1 = item as TreasuryInfo;
    const v2 = item as Treasury;
    return (
      <>
        {!isV2Treasury && v1.upgradeRequired ? (
          <span>&nbsp;</span>
        ) : (
          <>
          <div className="rate-amount">
            {formatThousands(isV2Treasury ? +getSdkValue(v2.totalStreams) : +getSdkValue(v1.streamsAmount))}
          </div>
          <div className="interval">streams</div>
          </>
        )}
      </>
    );
  }

  const renderStreamingAccountItem = (item: Treasury | TreasuryInfo) => {
    return (
      <Option key={`${item.id}`} value={item.id as string}>
        <div className={`transaction-list-row no-pointer`}>
          <div className="icon-cell">{getStreamingAccountIcon(item)}</div>
          <div className="description-cell">
            {getStreamingAccountDescription(item)}
          </div>
          <div className="rate-cell">
            {getStreamingAccountStreamCount(item)}
          </div>
        </div>
      </Option>
    );
  }

  return (
    <Modal
      className="mean-modal treasury-stream-create-modal"
      title={
        (workingTreasuryType === TreasuryType.Open)
          ? (<div className="modal-title">{isMultisigContext
            ? "Propose outgoing stream"
            : t('treasuries.treasury-streams.add-stream-modal-title')}</div>)
          : (<div className="modal-title">{t('treasuries.treasury-streams.add-stream-locked.modal-title')}</div>)
      }
      maskClosable={false}
      footer={null}
      open={isVisible}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={480}>

      {hasNoStreamingAccounts ? (
        <div className="text-center px-4 py-4">
          {theme === 'light' ? (
            <WarningFilled style={{ fontSize: 48 }} className="icon mt-0 mb-3 fg-warning" />
          ) : (
            <WarningOutlined style={{ fontSize: 48 }} className={`icon mt-0 mb-3 fg-warning`} />
          )}
          <h2 className={`mb-3 fg-warning`}>No streaming accounts</h2>
          <p>Your super safe needs a streaming account to set up and fund payment streams. To get started, create and fund a streaming account and then you can proceed with creating a payment stream.</p>
        </div>
      ) : (
        <>
          <div className="scrollable-content">
            <StepSelector step={currentStep} steps={(workingTreasuryType === TreasuryType.Lock) ? 3 : 2} onValueSelected={onStepperChange} />

            <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

              {(workingTreasuryType === TreasuryType.Lock) && (
                <div className="mb-2 text-uppercase">{t('treasuries.treasury-streams.add-stream-locked.panel1-name')}</div>
              )}

              {/* Proposal title */}
              {isMultisigContext && (
                <div className="mb-3">
                  <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                  <InputMean
                    id="proposal-title-field"
                    name="Title"
                    className="w-100 general-text-input"
                    onChange={onTitleInputValueChange}
                    placeholder="Add a proposal title (required)"
                    value={proposalTitle}
                  />
                </div>
              )}

              {!enableMultipleStreamsOption && (
                <>
                  {isMultisigContext && selectedMultisig && !treasuryDetails && (
                    <>
                      <div className="mb-3">
                        <div className="form-label icon-label">
                          {t('treasuries.add-funds.select-streaming-account-label')}
                          <Tooltip placement="bottom" title="Every payment stream is set up and funded from a streaming account. Select the account you want for the stream to be created and funded from. If you do not have the streaming account set up yet, first create and fund the account before proceeding.">
                            <span>
                              <IconHelpCircle className="mean-svg-icons" />
                            </span>
                          </Tooltip>
                        </div>
                        <div className={`well ${isBusy ? 'disabled' : ''}`}>
                          <div className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                            {treasuryList && treasuryList.length > 0 && (
                              <Select className={`auto-height`} value={selectedStreamingAccountId}
                                style={{width:"100%", maxWidth:'none'}}
                                dropdownClassName="stream-select-dropdown"
                                onChange={onStreamingAccountSelected}
                                bordered={false}
                                showArrow={false}
                                dropdownRender={menu => (
                                <div>{menu}</div>
                              )}>
                                {treasuryList.map(option => {
                                  return renderStreamingAccountItem(option);
                                })}
                              </Select>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

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
                </>
              )}

              <div className="form-label icon-label">
                {!enableMultipleStreamsOption ? t('transactions.recipient.label') : t('treasuries.treasury-streams.multiple-address-list')}
                {enableMultipleStreamsOption && (
                  <Tooltip placement="top" title={t("treasuries.treasury-streams.multiple-address-question-mark-tooltip")}>
                    <span>
                      <IconHelpCircle className="mean-svg-icons" />
                    </span>
                  </Tooltip>
                )}
              </div>

              {!enableMultipleStreamsOption ? (
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
                        <span 
                          id="payment-recipient-static-field" 
                          className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                          {recipientAddress ? recipientAddress : t('transactions.recipient.placeholder')}
                        </span>
                      </span>
                    </div>
                  </div>
                  {
                    recipientAddress && !isValidAddress(recipientAddress) && (
                      <span className="form-field-error">
                        {t('transactions.validation.address-validation')}
                      </span>
                    )
                  }
                </div>
              ) : (
                <div className="well">
                  <div className="flex-fixed-right">
                    <div className="left position-relative">
                      <span className="recipient-field-wrapper">
                        <input
                          type='file'
                          accept='.csv'
                          id='csvFile'
                          onChange={selectCsvHandler}
                        />
                      </span>
                    </div>
                  </div>
                  {
                    (!validMultiRecipientsList && (isCsvSelected && listValidAddresses.length === 0)) && (
                      <span className="form-field-error">
                        {t('transactions.validation.multi-recipient-invalid-list')}
                      </span>
                    )
                  }
                </div>
              )}

              {/* Payment rate */}
              {(workingTreasuryType === TreasuryType.Open) ? (
                <>
                  <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
                  <div className="two-column-form-layout col60x40 mb-3">
                    <div className="left">
                      <div className="well mb-1">
                        <div className="flex-fixed-left">
                          <div className="left">
                            <span className="add-on">
                              {selectedToken && (
                                <TokenDisplay onClick={() => {}}
                                  mintAddress={selectedToken.address}
                                  showCaretDown={false}
                                  fullTokenInfo={selectedToken}
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
                      </div>
                    </div>
                    <div className="right">
                      <div className="well mb-0">
                        <div className="flex-fixed-left">
                          <div className="left">
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
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-label">TOTAL FUNDS TO COMMIT</div>
                  <div className="well mb-1">
                    <div className="flex-fixed-left">
                      <div className="left">
                        <span className="add-on">
                          {selectedToken && (
                            <TokenDisplay onClick={() => {}}
                              mintAddress={selectedToken.address}
                              showCaretDown={false}
                              fullTokenInfo={selectedToken}
                            />
                          )}
                          {
                            selectedToken && unallocatedBalance ? (
                              <div
                                className="token-max simplelink"
                                onClick={() => {
                                  const decimals = selectedToken ? selectedToken.decimals : 6;
                                  if (isFeePaidByTreasurer) {
                                    const maxAmount = getMaxAmount(true);
                                    consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                                    consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                                    setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
                                    setTokenAmount(new BN(maxAmount));
                                  } else {
                                    const maxAmount = getMaxAmount();
                                    setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
                                    setTokenAmount(new BN(maxAmount));
                                  }
                                }}>
                                MAX
                              </div>
                            ) : null
                          }
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
                          {unallocatedBalance && selectedToken
                            ? getAmountWithSymbol(
                                toUiAmount(new BN(unallocatedBalance), selectedToken.decimals),
                                selectedToken.address,
                                true,
                                splTokenList,
                                selectedToken.decimals
                              )
                            : "0"
                          }
                        </span>
                      </div>
                      <div className="right inner-label">&nbsp;</div>
                    </div>
                  </div>
                </>
              )}

              {/* Send date */}
              {(workingTreasuryType === TreasuryType.Open) && (
                <>
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
                          <>
                            {
                              <DatePicker
                                size="middle"
                                bordered={false}
                                className="addon-date-picker"
                                aria-required={true}
                                allowClear={false}
                                disabledDate={disabledDate}
                                placeholder={t('transactions.send-date.placeholder')}
                                onChange={(value: any, date: string) => handleDateChange(date)}
                                defaultValue={moment(
                                  paymentStartDate,
                                  DATEPICKER_FORMAT
                                )}
                                format={DATEPICKER_FORMAT}
                              />
                            }
                          </>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>

              {workingTreasuryType === TreasuryType.Open ? (
                <>
                  {publicKey && (
                    <>
                      {(recipientAddress && !enableMultipleStreamsOption) && (
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
                                  {getPaymentRateAmount()}
                                </div>
                                <div className="inner-label mt-0">{paymentStartDate}</div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {(csvArray && enableMultipleStreamsOption && validMultiRecipientsList) && (
                        <>
                          {!isSelectedStreamingAccountMultisigTreasury && (
                            hasIsOwnWallet && (
                              <span className="form-field-error text-uppercase">
                                <p>{t("treasuries.treasury-streams.message-warning")}</p>
                              </span>
                            )
                          )}
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
                          {listValidAddresses.map((csvItem: any, index: number) => (
                            <div key={index} className="well">
                              <div className="three-col-flexible-middle">
                                <div className="left flex-row">
                                  <div className="flex-center">
                                    <Identicon
                                      address={isValidAddress(csvItem.address) ? csvItem.address : NATIVE_SOL_MINT.toBase58()}
                                      style={{ width: "30", display: "inline-flex" }} />
                                  </div>
                                  <div className="flex-column pl-3">
                                    <div className="address">
                                      {publicKey && isValidAddress(csvItem.address)
                                        ? shortenAddress(csvItem.address)
                                        : t('transactions.validation.no-recipient')}
                                    </div>
                                    <div className="inner-label mt-0">{csvItem.streamName.substring(0, 15) || '-'}</div>
                                  </div>
                                </div>
                                <div className="middle flex-center">
                                  <div className="vertical-bar"></div>
                                </div>
                                <div className="right flex-column">
                                  <div className="rate">
                                    {getPaymentRateAmount()}
                                  </div>
                                  <div className="inner-label mt-0">{paymentStartDate}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  <div className="mb-3 text-center">
                    <div>{t('treasuries.treasury-streams.minimum-allocation-advice', {
                      tokenSymbol: selectedToken?.symbol,
                      rateInterval: getPaymentRateAmount()
                    })}</div>
                  </div>

                  {/* Amount to stream */}
                  <div className="form-label">
                    <span className="align-middle">{t('treasuries.treasury-streams.allocate-funds-label')}</span>
                    <span className="align-middle">
                      <InfoIcon content={<span>This is the total amount of funds that will be streamed to the recipient at the payment rate selected. You can add more funds at any time by topping up the stream.</span>}
                                placement="top">
                        <InfoCircleOutlined />
                      </InfoIcon>
                    </span>
                  </div>

                  <div className="well">
                    <div className="flex-fixed-left">
                      <div className="left">
                        <span className="add-on">
                          {selectedToken && (
                            <TokenDisplay onClick={() => {}}
                              mintAddress={selectedToken.address}
                              showCaretDown={false}
                              fullTokenInfo={selectedToken}
                            />
                          )}
                          {selectedToken && unallocatedBalance ? (
                            <div
                              className="token-max simplelink"
                              onClick={() => {
                                const decimals = selectedToken ? selectedToken.decimals : 6;
                                if (isFeePaidByTreasurer) {
                                  const maxAmount = getMaxAmount(true);
                                  consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
                                  consoleOut('maxAmount:', maxAmount.toString(), 'blue');
                                  setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
                                  setTokenAmount(new BN(maxAmount));
                                } else {
                                  const maxAmount = getMaxAmount();
                                  setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
                                  setTokenAmount(new BN(maxAmount));
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
                        <span>{t('treasuries.treasury-streams.available-unallocated-balance-label')}:</span>
                        <span>
                          {
                            unallocatedBalance && selectedToken
                              ? stringNumberFormat(
                                toUiAmount(unallocatedBalance, selectedToken.decimals),
                                4,
                              )
                              : "0"
                          }
                        </span>
                      </div>
                      <div className="right inner-label">
                        <>
                          <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                          ~{fromCoinAmount
                            ? toUsCurrency(getTokenPrice(fromCoinAmount))
                            : "$0.00"
                          }
                          </span>
                        </>
                      </div>
                    </div>
                  </div>

                  <div className="ml-1 mb-3">
                    <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('treasuries.treasury-streams.fee-payed-by-treasurer')}</Checkbox>
                  </div>

                  <div className="ml-1">
                    <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
                  </div>
                </>
              ) : (
                <>
                  <div className="mb-2 text-uppercase">{t('treasuries.treasury-streams.add-stream-locked.panel2-name')}</div>

                  {(recipientNote && recipientAddress && fromCoinAmount && selectedToken) && (
                    <div className="flex-fixed-right">
                      <div className="left">
                        <div className="mb-3">
                          {
                            t('treasuries.treasury-streams.add-stream-locked.panel2-summary', {
                                recipientNote: recipientNote,
                                fromCoinAmount: formatThousands(
                                  parseFloat(fromCoinAmount),
                                  friendlyDisplayDecimalPlaces(fromCoinAmount, selectedToken.decimals)
                                ),
                                selectedTokenName: selectedToken && selectedToken.name,
                                recipientShortenAddress: shortenAddress(recipientAddress)
                              }
                            )
                          }
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="form-label">{t('treasuries.treasury-streams.add-stream-locked.panel2-lock-period-label')}</div>
                  <div className="d-flex">
                    <div className="well w-25 mr-1">
                      <div className="flex-fixed-right">
                        <div className="left">
                          <input
                            id="plock-period-field"
                            className="w-100 general-text-input"
                            autoComplete="on"
                            autoCorrect="off"
                            type="number"
                            onChange={handleLockPeriodAmountChange}
                            placeholder={`Number of ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`}
                            spellCheck="false"
                            min={0}
                            value={lockPeriodAmount}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="well w-75 ml-1">
                      <Dropdown
                        overlay={lockPeriodOptionsMenu}
                        trigger={["click"]}>
                        <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                          <div className="left">
                            <span>{getLockPeriodOptionLabel(lockPeriodFrequency, t)}{" "}</span>
                          </div>
                          <div className="right">
                            <IconCaretDown className="mean-svg-icons" />
                          </div>
                        </span>
                      </Dropdown>
                    </div>
                  </div>

                  <div className="form-label">{t('treasuries.treasury-streams.add-stream-locked.panel2-commencement-date-label')}</div>
                  <div className="well">
                    <div className="flex-fixed-right">
                      <div className="left static-data-field">
                        {isToday(paymentStartDate || '')
                          ? `${paymentStartDate} (${t('common:general.now')})`
                          : `${paymentStartDate}`}
                      </div>
                      <div className="right">
                        <div className="add-on simplelink">
                          <>
                            {
                              <DatePicker
                                size="middle"
                                bordered={false}
                                className="addon-date-picker"
                                aria-required={true}
                                allowClear={false}
                                disabledDate={disabledDate}
                                placeholder={t('transactions.send-date.placeholder')}
                                onChange={(value: any, date: string) => handleDateChange(date)}
                                defaultValue={moment(
                                  paymentStartDate,
                                  DATEPICKER_FORMAT
                                )}
                                format={DATEPICKER_FORMAT}
                              />
                            }
                          </>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="form-label mt-2">{t('treasuries.treasury-streams.add-stream-locked.panel2-cliff-release-label')}</div>
                  <div className="well">
                    <div className="flexible-right mb-1">
                      <div className="token-group">
                        {percentages.map((percentage, index) => (
                          <div key={index} className="mb-1 d-flex flex-column align-items-center">
                            <div className="token-max simplelink active" onClick={() => onChangeValuePercentages(percentage)}>{percentage}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex-fixed-left">
                      <div className="left">
                        <span className="add-on simplelink">
                          {selectedToken && (
                            <TokenDisplay onClick={() => {}}
                              mintAddress={selectedToken.address}
                              name={selectedToken.name}
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
                          onChange={handleCliffReleaseAmountChange}
                          pattern="^[0-9]*[.,]?[0-9]*$"
                          placeholder="0.0"
                          minLength={1}
                          maxLength={79}
                          spellCheck="false"
                          value={cliffRelease}
                        />
                      </div>
                    </div>
                    <div className="flex-fixed-right">
                      <div className="left inner-label">
                        <span>{t('treasuries.treasury-streams.add-stream-locked.panel2-cliff-release-inner-label')}</span>
                      </div>
                      <div className="right inner-label">
                        <>
                            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                            ~{cliffRelease
                                ? toUsCurrency(getTokenPrice(cliffRelease))
                                : "$0.00"
                            }
                            </span>
                        </>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>

              {(workingTreasuryType === TreasuryType.Lock) && (
                <>
                  <div className="flex-fixed-right">
                    <div className="left">
                      <div className="text-uppercase mb-2">{t('transactions.resume')}</div>
                    </div>
                    <div className="right">
                      <span className="flat-button change-button" onClick={() => setCurrentStep(0)}>
                        <IconEdit className="mean-svg-icons" />
                        <span>{t('general.cta-change')}</span>
                      </span>
                    </div>
                  </div>

                  <div className="mb-2">{t('treasuries.treasury-streams.add-stream-locked.panel3-text-one')} {recipientNote ? recipientNote : "--"}</div>

                  <Row className="mb-2">
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-sending')}</strong>
                      <span className="ml-1">
                        {
                          fromCoinAmount && selectedToken
                            ? `${displayAmountWithSymbol(
                              tokenAmount,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false
                            )}`
                            : "--"
                        }
                      </span>
                    </Col>
                    <Col span={24} className="text-truncate">
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-to-address')}</strong>
                      <span className="ml-1">{recipientAddress ? recipientAddress : "--"}</span>
                    </Col>
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-starting-on')}</strong>
                      <span className="ml-1">{paymentStartDate}</span>
                    </Col>
                    <Col span={24}>
                      <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-cliff-release')}</strong>
                      <span className="ml-1">
                        {
                          cliffRelease && selectedToken
                            ? `${displayAmountWithSymbol(
                              cliffReleaseBn,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false
                            )} (on commencement)`
                            : "--"
                        }
                      </span>
                    </Col>
                    <Col span={24}>
                      <strong>Amount to be streamed:</strong>
                      <span className="ml-1">
                        {
                          lockPeriodAmount && selectedToken
                            ? `${displayAmountWithSymbol(
                              amountToBeStreamedBn,
                              selectedToken.address,
                              selectedToken.decimals,
                              splTokenList,
                              false
                            )} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`
                            : "--"
                        }
                      </span>
                    </Col>
                    <Col span={24}>
                      <strong>Release rate:</strong>
                      <span className="ml-1">{getReleaseRate()}</span>
                    </Col>
                  </Row>

                  <span className="warning-message icon-label mb-3">
                    <IconWarning className="mean-svg-icons" />
                    {t('treasuries.treasury-streams.add-stream-locked.panel3-warning-message')}
                  </span>

                  <div className="ml-1 mb-3">
                    <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('treasuries.treasury-streams.fee-payed-by-treasurer')}</Checkbox>
                  </div>

                  <div className="ml-1">
                    <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
                  </div>
                </>
              )}
            </div>
          </div>

          <Divider plain/>

          <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>
            <Button
              className="main-cta center-text-in-btn"
              block
              type="primary"
              shape="round"
              size="large"
              onClick={onContinueStepOneButtonClick}
              disabled={(workingTreasuryType === TreasuryType.Lock) ? (
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                !isMemoValid() ||
                !isStreamingAccountSelected() ||
                !isValidAddress(recipientAddress) ||
                (!selectedToken || unallocatedBalance.isZero()) ||
                tokenAmount.isZero() || tokenAmount.gt(unallocatedBalance) ||
                !arePaymentSettingsValid()
              ) : (
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                (!enableMultipleStreamsOption && !isMemoValid()) ||
                !isStreamingAccountSelected() ||
                !isDestinationAddressValid() ||
                (!paymentRateAmount || unallocatedBalance.isZero()) ||
                (!paymentRateAmount || parseFloat(paymentRateAmount) === 0) ||
                !arePaymentSettingsValid()
              )}>
              {(workingTreasuryType === TreasuryType.Open) ? getStepOneContinueButtonLabel() : getStepOneContinueButtonLabelInLocked()}
            </Button>
          </div>

          <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
            <Button
              className={`main-cta center-text-in-btn ${isBusy ? 'inactive' : ''}`}
              block
              type="primary"
              shape="round"
              size="large"
              onClick={workingTreasuryType === TreasuryType.Lock ? onContinueStepTwoButtonClick : onTransactionStart}
              disabled={workingTreasuryType === TreasuryType.Lock ? (
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                !isMemoValid() ||
                !isStreamingAccountSelected() ||
                !isValidAddress(recipientAddress) ||
                (!selectedToken || unallocatedBalance.isZero()) ||
                tokenAmount.isZero() || tokenAmount.gt(unallocatedBalance) ||
                (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) ||
                parseFloat(cliffRelease) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals))
              ) : (
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                (!enableMultipleStreamsOption && !isMemoValid()) ||
                !isStreamingAccountSelected() ||
                !isDestinationAddressValid() ||
                (!paymentRateAmount || unallocatedBalance.isZero()) ||
                (!paymentRateAmount || parseFloat(paymentRateAmount) === 0) ||
                !arePaymentSettingsValid() ||
                !areSendAmountSettingsValid() ||
                !isVerifiedRecipient ||
                nativeBalance < getMinBalanceRequired()
              )}>
              {(workingTreasuryType === TreasuryType.Open) && (
                isBusy && (
                  <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                )
              )}
              {(workingTreasuryType === TreasuryType.Open) && (isBusy
                ? t('streams.create-new-stream-cta-busy')
                : getTransactionStartButtonLabel()
              )}

              {(workingTreasuryType === TreasuryType.Lock) && getStepTwoContinueButtonLabel()}
            </Button>
          </div>

          <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
            <Button
              className="main-cta center-text-in-btn"
              block
              type="primary"
              shape="round"
              size="large"
              onClick={onTransactionStart}
              disabled={
                !publicKey ||
                (isMultisigContext && !proposalTitle) ||
                !isMemoValid() ||
                !isStreamingAccountSelected() ||
                !isValidAddress(recipientAddress) ||
                (!selectedToken || unallocatedBalance.isZero()) ||
                (!fromCoinAmount || parseFloat(fromCoinAmount) === 0) ||
                (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) ||
                parseFloat(cliffRelease) > parseFloat(toUiAmount(unallocatedBalance, selectedToken.decimals)) ||
                !arePaymentSettingsValid() ||
                !areSendAmountSettingsValid() ||
                !isVerifiedRecipient ||
                nativeBalance < getMinBalanceRequired()
              }>
              {getTransactionStartButtonLabelInLocked()}
            </Button>
          </div>
        </>
      )}

    </Modal>
  );
};
