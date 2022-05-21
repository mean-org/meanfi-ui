import React, { useCallback, useEffect } from 'react';
import "./style.scss";
import { useContext, useState } from 'react';
import { Modal, Button, Select, Dropdown, Menu, DatePicker, Checkbox, Divider, Tooltip, Row, Col } from 'antd';
import { AppStateContext } from '../../contexts/appstate';
import {
  cutNumber,
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  isValidNumber,
  makeDecimal,
  makeInteger,
  shortenAddress,
  toTokenAmount
} from '../../utils/utils';
import { useTranslation } from 'react-i18next';
import { TokenInfo } from '@solana/spl-token-registry';
import {
  consoleOut,
  disabledDate,
  getIntervalFromSeconds,
  getLockPeriodOptionLabel,
  getPaymentRateOptionLabel,
  getRateIntervalInSeconds,
  getTransactionStatusForLogs,
  isToday,
  isValidAddress,
  PaymentRateTypeOption,
} from '../../utils/ui';
import { NATIVE_SOL } from '../../utils/tokens';
import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { TokenDisplay } from '../TokenDisplay';
import { IconCaretDown, IconEdit, IconHelpCircle, IconWarning } from '../../Icons';
import { OperationType, PaymentRateType, TransactionStatus } from '../../models/enums';
import moment from "moment";
import { useWallet } from '../../contexts/wallet';
import { StepSelector } from '../StepSelector';
import { DATEPICKER_FORMAT } from '../../constants';
import { Identicon } from '../Identicon';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { customLogger } from '../..';
import { Beneficiary, Constants as MSPV2Constants, MSP, StreamBeneficiary, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { TreasuryInfo } from '@mean-dao/money-streaming';
import { useConnectionConfig } from '../../contexts/connection';
import { BN } from 'bn.js';
import { u64 } from '@solana/spl-token';
import { MeanMultisig, MEAN_MULTISIG_PROGRAM, DEFAULT_EXPIRATION_TIME_SECONDS } from '@mean-dao/mean-multisig-sdk';
import { InfoIcon } from '../InfoIcon';

const { Option } = Select;

export const TreasuryStreamCreateModal = (props: {
  associatedToken: string;
  connection: Connection;
  handleClose: any;
  handleOk: any;
  isVisible: boolean;
  nativeBalance: number;
  transactionFees: TransactionFees;
  withdrawTransactionFees: TransactionFees;
  treasuryDetails: Treasury | TreasuryInfo | undefined;
  isMultisigTreasury: boolean;
  minRequiredBalance: number;
  multisigClient: MeanMultisig;
  multisigAddress: PublicKey;
  userBalances: any;
}) => {
  const { t } = useTranslation('common');
  const { wallet, publicKey } = useWallet();
  const { endpoint } = useConnectionConfig();
  const { treasuryOption } = useContext(AppStateContext);
  const {
    tokenList,
    selectedToken,
    effectiveRate,
    loadingPrices,
    recipientNote,
    isWhitelisted,
    fromCoinAmount,
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
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    setPaymentRateAmount,
    setRecipientAddress,
    setPaymentStartDate,
    setLockPeriodAmount,
    setFromCoinAmount,
    setSelectedToken,
    setEffectiveRate,
    setRecipientNote,
    refreshPrices,
  } = useContext(AppStateContext);
  const {
    clearTxConfirmationContext,
    startFetchTxSignatureInfo,
  } = useContext(TxConfirmationContext);
  const [currentStep, setCurrentStep] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
  const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
  const [tokenAmount, setTokenAmount] = useState(new BN(0));
  const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);
  const [enableMultipleStreamsOption, /*setEnableMultipleStreamsOption*/] = useState(false);
  const today = new Date().toLocaleDateString("en-US");
  const [csvFile, setCsvFile] = useState<any>();
  const [csvArray, setCsvArray] = useState<any>([]);
  const [listValidAddresses, setListValidAddresses] = useState([]);
  const [hasIsOwnWallet, setHasIsOwnWallet] = useState<boolean>(false);
  const [isCsvSelected, setIsCsvSelected] = useState<boolean>(false);
  const [validMultiRecipientsList, setValidMultiRecipientsList] = useState<boolean>(false);
  const percentages = [5, 10, 15, 20];
  const [percentageValue, setPercentageValue] = useState<number>(0);
  const [cliffRelease, setCliffRelease] = useState<string>("")

  const isNewTreasury = useCallback(() => {
    if (props.treasuryDetails) {
      const v2 = props.treasuryDetails as Treasury;
      return v2.version >= 2 ? true : false;
    }

    return false;
  }, [props.treasuryDetails]);

  const getMaxAmount = useCallback((preSetting = false) => {
    if ((isFeePaidByTreasurer || preSetting) && props.withdrawTransactionFees) {
      const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
      const feeNumerator = props.withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
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
          unallocatedBalance: unallocatedBalance.toNumber(),
          feeNumerator: feeNumerator,
          feePercentage01: feeNumerator/feeDenaminator,
          badStreamMaxAllocation: badStreamMaxAllocation.toNumber(),
          feeAmount: feeAmount.toNumber(),
          badTotal: badTotal.toNumber(),
          badRemaining: badRemaining.toNumber(),
          goodStreamMaxAllocation: goodStreamMaxAllocation.toNumber(),
          goodTotal: goodTotal.toNumber(),
          goodRemaining: goodRemaining.toNumber(),
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
    props.withdrawTransactionFees,
    enableMultipleStreamsOption,
    listValidAddresses.length
  ]);

  // Set treasury unalocated balance in BN
  useEffect(() => {
    if (props.isVisible && props.treasuryDetails) {
      const unallocated = props.treasuryDetails.balance - props.treasuryDetails.allocationAssigned;
      const ub = isNewTreasury()
        ? new BN(unallocated)
        : makeInteger(unallocated, selectedToken?.decimals || 6);
      consoleOut('unallocatedBalance:', ub.toNumber(), 'blue');
      setUnallocatedBalance(ub);
    }
  }, [
    props.isVisible,
    props.treasuryDetails,
    selectedToken?.decimals,
    isNewTreasury,
  ]);

  // Set max amount allocatable to a stream in BN the first time
  useEffect(() => {
    if (props.isVisible && props.treasuryDetails && props.withdrawTransactionFees && !isFeePaidByTreasurer) {
      getMaxAmount();
    }
  }, [
    props.isVisible,
    isFeePaidByTreasurer,
    props.treasuryDetails,
    props.withdrawTransactionFees,
    getMaxAmount
  ]);

  /////////////////
  //   Getters   //
  /////////////////

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

  const getStepOneContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : (!enableMultipleStreamsOption && !recipientNote)
        ? 'Memo cannot be empty'
        : (!enableMultipleStreamsOption && !recipientAddress)
          ? t('transactions.validation.select-recipient') 
          : (enableMultipleStreamsOption && !validMultiRecipientsList)
            ? t('transactions.validation.select-address-list')
            : !selectedToken || unallocatedBalance.toNumber() === 0
              ? t('transactions.validation.no-balance')
                : (!paymentRateAmount || parseFloat(paymentRateAmount) === 0)
                ? t('transactions.validation.no-amount')
                  : !paymentStartDate
                    ? t('transactions.validation.no-valid-date')
                    : !arePaymentSettingsValid()
                      ? getPaymentSettingsButtonLabel()
                      : t('transactions.validation.valid-continue');
  };

  const getStepOneContinueButtonLabelInLocked = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : (!enableMultipleStreamsOption && !recipientNote)
        ? 'Memo cannot be empty'
        : (!enableMultipleStreamsOption && !recipientAddress)
          ? t('transactions.validation.select-recipient') 
          : (enableMultipleStreamsOption && !validMultiRecipientsList)
            ? t('transactions.validation.select-address-list')
            : !selectedToken || unallocatedBalance.toNumber() === 0
              ? t('transactions.validation.no-balance')
              : (!fromCoinAmount || parseFloat(fromCoinAmount) === 0)
                ? t('transactions.validation.no-amount')
                : (parseFloat(fromCoinAmount) > makeDecimal(unallocatedBalance, selectedToken.decimals))
                  ? t('Invalid amount')
                  : !paymentStartDate
                    ? t('transactions.validation.no-valid-date')
                    : !arePaymentSettingsValid()
                      ? getPaymentSettingsButtonLabel()
                      : t('transactions.validation.valid-continue');
  };

  const getStepTwoContinueButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !recipientNote
      ? 'Memo cannot be empty'
      : !recipientAddress
      ? t('transactions.validation.select-recipient') 
      : !selectedToken || unallocatedBalance.toNumber() === 0
      ? t('transactions.validation.no-balance')
      : (!fromCoinAmount || parseFloat(fromCoinAmount) === 0)
      ? t('transactions.validation.no-amount')
      : (parseFloat(fromCoinAmount) > makeDecimal(unallocatedBalance, selectedToken.decimals))
      ? t('Invalid amount')
      : (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0)
      ? 'Lock period cannot be empty'
      : !cliffRelease
      ? 'Add cliff to release'
      :  (parseFloat(cliffRelease) > makeDecimal(unallocatedBalance, selectedToken.decimals))
      ? 'Invalid cliff amount'
      : !selectedToken || unallocatedBalance.toNumber() === 0
      ? t('transactions.validation.no-balance')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !areSendAmountSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : t('transactions.validation.valid-continue');
  }

  const getTransactionStartButtonLabel = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : (!enableMultipleStreamsOption && !recipientNote)
      ? 'Memo cannot be empty'
      : (!enableMultipleStreamsOption && !recipientAddress)
      ? t('transactions.validation.select-recipient') 
      : (enableMultipleStreamsOption && !validMultiRecipientsList)
      ? t('transactions.validation.select-address-list')
      : !selectedToken || unallocatedBalance.isZero()
      ? t('transactions.validation.no-balance')
      : !tokenAmount || tokenAmount.isZero()
      ? t('transactions.validation.no-amount')
      : (isFeePaidByTreasurer && tokenAmount.gt(maxAllocatableAmount)) ||
        (!isFeePaidByTreasurer && tokenAmount.gt(unallocatedBalance))
      ? t('transactions.validation.amount-high')
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : props.nativeBalance < getMinBalanceRequired()
        ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) })
        : t('transactions.validation.valid-approve');
  };

  const getTransactionStartButtonLabelInLocked = (): string => {
    return !publicKey
      ? t('transactions.validation.not-connected')
      : !recipientNote
      ? 'Memo cannot be empty'
      : !recipientAddress
      ? t('transactions.validation.select-recipient') 
      : !selectedToken || unallocatedBalance.toNumber() === 0
      ? t('transactions.validation.no-balance')
      : (!fromCoinAmount || parseFloat(fromCoinAmount) === 0)
      ? t('transactions.validation.no-amount')
      : (parseFloat(fromCoinAmount) > makeDecimal(unallocatedBalance, selectedToken.decimals))
      ? t('Invalid amount')
      : !lockPeriodAmount || parseFloat(lockPeriodAmount) === 0
      ? 'Lock period cannot be empty'
      : (!cliffRelease || parseFloat(cliffRelease) > makeDecimal(unallocatedBalance, 6))
      ? 'Add cliff to release'
      :  (parseFloat(cliffRelease) > makeDecimal(unallocatedBalance, selectedToken.decimals))
      ? 'Invalid cliff amount'
      : !paymentStartDate
      ? t('transactions.validation.no-valid-date')
      : !arePaymentSettingsValid()
      ? getPaymentSettingsButtonLabel()
      : !isVerifiedRecipient
      ? t('transactions.validation.verified-recipient-unchecked')
      : props.nativeBalance < getMinBalanceRequired()
        ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) })
        : t('transactions.validation.valid-approve');
  };

  const getPaymentSettingsButtonLabel = (): string => {
    const rateAmount = parseFloat(paymentRateAmount || '0');

    if (treasuryOption && treasuryOption.type === TreasuryType.Lock) {
      return !rateAmount
        ? 'Add funds to commit'
        : '';
    } else {
      return !rateAmount
        ? t('transactions.validation.no-payment-rate')
        : '';
    }
  }

  const toggleOverflowEllipsisMiddle = useCallback((state: boolean) => {
    const ellipsisElements = document.querySelectorAll(".ant-select.token-selector-dropdown .ant-select-selector .ant-select-selection-item");
    if (ellipsisElements && ellipsisElements.length) {
      console.log('ellipsisElements:', ellipsisElements);

      ellipsisElements.forEach(element => {
        if (state) {
          if (!element.classList.contains('overflow-ellipsis-middle')) {
            element.classList.add('overflow-ellipsis-middle');
          }
        } else {
          if (element.classList.contains('overflow-ellipsis-middle')) {
            element.classList.remove('overflow-ellipsis-middle');
          }
        }
      });

      setTimeout(() => {
        triggerWindowResize();
      }, 10);
    }
  }, []);

  const setCustomToken = useCallback((address: string) => {
    const unkToken: TokenInfo = {
      address: address,
      name: 'Unknown',
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };
    setSelectedToken(unkToken);
    consoleOut("token selected:", unkToken, 'blue');
    setEffectiveRate(0);
    toggleOverflowEllipsisMiddle(true);
  }, [
    setEffectiveRate,
    setSelectedToken,
    toggleOverflowEllipsisMiddle
  ]);

  const getPaymentRateAmount = useCallback(() => {

    let outStr = selectedToken
      ? getTokenAmountAndSymbolByTokenAddress(
          parseFloat(paymentRateAmount),
          selectedToken.address,
          false
        )
      : '-'
    outStr += getIntervalFromSeconds(getRateIntervalInSeconds(paymentRateFrequency), true, t)

    return outStr;
  }, [paymentRateAmount, paymentRateFrequency, selectedToken, t]);

  /////////////////////
  // Data management //
  /////////////////////

  // When modal goes visible, use the treasury associated token or use the default from the appState
  useEffect(() => {
    if (props.isVisible && props.associatedToken) {
      const token = tokenList.find(t => t.address === props.associatedToken);
      if (token) {
        if (!selectedToken || selectedToken.address !== token.address) {
          setSelectedToken(token);
        }
      } else if (!token && (!selectedToken || selectedToken.address !== props.associatedToken)) {
        setCustomToken(props.associatedToken);
      }
    }
  }, [
    tokenList,
    selectedToken,
    props.isVisible,
    props.associatedToken,
    setCustomToken,
    setSelectedToken
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

  const onTokenChange = (e: any) => {
    consoleOut("token selected:", e, 'blue');
    const token = getTokenByMintAddress(e);
    if (token) {
      setSelectedToken(token as TokenInfo);
      setEffectiveRate(getTokenPriceBySymbol(token.symbol));
    }
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
      setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
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
    } else if (newValue === '.') {
      setCliffRelease(".");
    } else if (isValidNumber(newValue)) {
      setCliffRelease(newValue);
    }
  };

  const handleDateChange = (date: string) => {
    setPaymentStartDate(date);
  }

  const onFeePayedByTreasurerChange = (e: any) => {

    consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');

    if (e.target.checked && tokenAmount) {
      const maxAmount = getMaxAmount(true);
      consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
      consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
      if (tokenAmount.gt(maxAmount)) {
        const decimals = selectedToken ? selectedToken.decimals : 6;
        setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
        setTokenAmount(new BN(maxAmount));
      }
    }

    setIsFeePaidByTreasurer(e.target.checked);
  }

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onCloseModal = () => {
    props.handleClose();
    onAfterClose();
  }

  const onAfterClose = () => {
    setTimeout(() => {
      setRecipientAddress("");
      setRecipientNote("");
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
  
  const onChangeValuePercentages = (value: number) => {
    setPercentageValue(value);
  };

  // Multi-recipient
  // const onCloseMultipleStreamsChanged = useCallback((e: any) => {
  //   setEnableMultipleStreamsOption(e.target.value);
  
  //   if (!enableMultipleStreamsOption) {
  //     setCsvArray([]);
  //     setIsCsvSelected(false);
  //   }

  // }, [enableMultipleStreamsOption]);

  // const onAllocationReservedChanged = (e: any) => {
  //   setIsAllocationReserved(e.target.value);
  // }

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
    if (!props.transactionFees) { return 0; }

    const bf = props.transactionFees.blockchainFee;       // Blockchain fee
    const ff = props.transactionFees.mspFlatFee;          // Flat fee (protocol)
    const minRequired = props.isMultisigTreasury ? props.minRequiredBalance : bf + ff;
    return minRequired;

  }, [props.isMultisigTreasury, props.minRequiredBalance, props.transactionFees]);

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

  useEffect(() => {

    if (!csvArray.length || !publicKey) { return; }

    const timeout = setTimeout(() => {
      const validAddresses = csvArray.filter((csvItem: any) => isValidAddress(csvItem.address));

      const validAddressesSingleSigner = validAddresses.filter((csvItem: any) => wallet && !(csvItem.address === `${publicKey.toBase58()}`));

      if (!props.isMultisigTreasury) {
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
    props.isMultisigTreasury,
  ]);

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

  useEffect(() => {
    const percentageFromCoinAmount = parseFloat(fromCoinAmount) > 0 ? `${(parseFloat(fromCoinAmount)*percentageValue/100)}` : '';

    setCliffRelease(percentageFromCoinAmount);
    
  }, [fromCoinAmount, percentageValue]);

  useEffect(() => {
    if (treasuryOption && treasuryOption.type === TreasuryType.Lock) {
      setPaymentRateAmount(cutNumber((parseFloat(fromCoinAmount) - parseFloat(cliffRelease)) / parseFloat(lockPeriodAmount), 6));
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliffRelease, lockPeriodAmount]);

  ////////////////////////
  // Transaction start  //
  ////////////////////////

  const onTransactionStart = async () => {

    let transactions: Transaction[] = [];
    let signedTransactions: Transaction[] = [];
    let signatures: string[] = [];
    let encodedTxs: string[] = [];

    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createStreams = async (data: any) => {

      consoleOut('Is Multisig Treasury: ', props.isMultisigTreasury, 'blue');
      consoleOut('Starting create streams using MSP V2...', '', 'blue');
      const msp = new MSP(endpoint, streamV2ProgramAddress, "confirmed");

      if (!props.isMultisigTreasury) {

        const beneficiaries: Beneficiary[] = data.beneficiaries.map((b: any) => {
          return {
            ...b,
            address: new PublicKey(b.address)
          } as Beneficiary
        });

        return await msp.createStreams(
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

      if (!props.treasuryDetails || !props.multisigClient || !props.multisigAddress || !publicKey) { return null; }

      const [multisigSigner] = await PublicKey.findProgramAddress(
        [props.multisigAddress.toBuffer()],
        MEAN_MULTISIG_PROGRAM
      );

      const streams: StreamBeneficiary[] = [];
      const streamsBumps: any = {};
      let seedCounter = 0;

      const timeStamp = parseInt((Date.now() / 1000).toString());

      for (const beneficiary of data.beneficiaries) {
        
        const timeStampCounter = new u64(timeStamp + seedCounter);
        const [stream, streamBump] = await PublicKey.findProgramAddress(
          [props.multisigAddress.toBuffer(), timeStampCounter.toBuffer()],
          MEAN_MULTISIG_PROGRAM
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
        const streamSeedData = streamsBumps[createTx.instructions[0].keys[7].pubkey.toBase58()];

        const tx = await props.multisigClient.createMoneyStreamTransaction(
          publicKey,
          "Create Stream",
          "", // description
          new Date(expirationTime * 1_000),
          streamSeedData.timeStamp.toNumber(),
          streamSeedData.bump,
          OperationType.StreamCreate,
          props.multisigAddress,
          MSPV2Constants.MSP,
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

      if (!publicKey || !props.treasuryDetails || !selectedToken) {
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
        ? [{ streamName: recipientNote ? recipientNote.trim() : '', address: recipientAddress as string }]
        : csvArray;

      const associatedToken = new PublicKey(selectedToken?.address as string);
      const treasury = new PublicKey(props.treasuryDetails.id as string);
      const amount = tokenAmount.div(new BN(beneficiaries.length)).toNumber();
      const rateAmount = toTokenAmount(parseFloat(paymentRateAmount as string), selectedToken.decimals);
      const now = new Date();
      const parsedDate = Date.parse(paymentStartDate as string);
      const startUtc = new Date(parsedDate);
      const cliffAmount = toTokenAmount(parseFloat(cliffRelease as string), selectedToken.decimals);
      startUtc.setHours(now.getHours());
      startUtc.setMinutes(now.getMinutes());
      startUtc.setSeconds(now.getSeconds());
      startUtc.setMilliseconds(now.getMilliseconds());

      const isLockedTreasury = treasuryOption && treasuryOption.type === TreasuryType.Lock
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
      const data = {
        payer: publicKey.toBase58(),                                                // initializer
        treasurer: publicKey.toBase58(),                                            // treasurer
        treasury: treasury.toBase58(),                                              // treasury
        beneficiaries: beneficiaries,                                               // beneficiaries
        associatedToken: associatedToken.toBase58(),                                // associatedToken
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

      /**
       * payer: PublicKey,
       * treasurer: PublicKey,
       * treasury: PublicKey | undefined,
       * beneficiaries: any[],
       * associatedToken: PublicKey,
       * allocationAssigned: number,
       * rateAmount?: number | undefined,
       * rateIntervalInSeconds?: number | undefined,
       * startUtc?: Date | undefined,
       * cliffVestAmount?: number | undefined,
       * cliffVestPercent?: number | undefined,
       * feePayedByTreasurer?: boolean | undefined
       */

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
      consoleOut('nativeBalance:', props.nativeBalance, 'blue');

      if (props.nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(props.nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      const result = await createStreams(data)
        .then(values => {
          if (!values || !values.length) { return false; }
          // consoleOut('createStreams returned transaction:', values);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            // result: getTxIxResume(value)
          });
          transactions = values;
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
          customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTxs = async (): Promise<boolean> => {

      if (!wallet || !publicKey) {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('CreateStream for a treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Signing transactions...');
      const result = await wallet.signAllTransactions(transactions)
        .then((signed: Transaction[]) => {
          // consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransactions = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTxs = signedTransactions.map(t => t.serialize().toString('base64'));
            consoleOut('encodedTxs:', encodedTxs, 'orange');
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
            customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
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
          customLogger.logError('CreateStreams for a treasury transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const sendTxs = async (): Promise<boolean> => {

      if (!wallet) {
        console.error('Cannot send transactions! Wallet not found!');
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

      const promises: Promise<string>[] = [];

      for (const tx of encodedTxs) {
        promises.push(props.connection.sendEncodedTransaction(tx));
      }

      const result = await Promise.all(promises)
        .then(sigs => {
          consoleOut('sendEncodedTransaction returned a signature:', sigs);
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

    if (wallet) {
      const create = await createTxs();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTxs();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTxs();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Txs to confirmation queue:', signatures);
            signatures.forEach(s => {
              startFetchTxSignatureInfo(s, "confirmed", OperationType.TreasuryStreamCreate);
            });
            setIsBusy(false);
            props.handleOk();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  //////////////////
  //  Validation  //
  //////////////////

  const isMemoValid = (): boolean => {
    return recipientNote && recipientNote.length <= 32
      ? true
      : false;
  }

  const isSendAmountValid = (): boolean => {
    return publicKey &&
           selectedToken &&
           tokenAmount && tokenAmount.toNumber() > 0 &&
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

  ///////////////
  // Rendering //
  ///////////////

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

  const lockPeriodOptionsMenu = (
    <Menu>
      {getLockPeriodOptionsFromEnum(PaymentRateType).map((item) => {
        return (
          <Menu.Item
            key={item.key}
            onClick={() => handleLockPeriodOptionChange(item.value)}>
            {item.text}
          </Menu.Item>
        );
      })}
    </Menu>
  );  

  return (
    <Modal
      className="mean-modal treasury-stream-create-modal"
      title={(treasuryOption && treasuryOption.type === TreasuryType.Open) ? (<div className="modal-title">{t('treasuries.treasury-streams.add-stream-modal-title')}</div>) : (<div className="modal-title">{t('treasuries.treasury-streams.add-stream-locked.modal-title')}</div>)}
      maskClosable={false}
      footer={null}
      visible={props.isVisible}
      onOk={props.handleOk}
      onCancel={onCloseModal}
      afterClose={onAfterClose}
      width={480}>

      <div className="scrollable-content">
        <StepSelector step={currentStep} steps={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? 3 : 2} onValueSelected={onStepperChange} />

        <div className={currentStep === 0 ? "contract-wrapper panel1 show" : "contract-wrapper panel1 hide"}>

          {(treasuryOption && treasuryOption.type === TreasuryType.Lock) && (
            <div className="mb-2 text-uppercase">{t('treasuries.treasury-streams.add-stream-locked.panel1-name')}</div>
          )}

          {/* Create multi-recipient stream checkbox */}
          {/* {(treasuryOption && treasuryOption.type === TreasuryType.Open) && (
            <div className="mb-2 flex-row align-items-start">
              <span className="form-label w-auto mb-0">{t('treasuries.treasury-streams.create-multi-recipient-checkbox-label')}</span>
              <Radio.Group className="ml-2 d-flex" 
                onChange={onCloseMultipleStreamsChanged} 
                value={enableMultipleStreamsOption}
              >
                <Radio value={true}>{t('general.yes')}</Radio>
                <Radio value={false}>{t('general.no')}</Radio>
              </Radio.Group>
            </div>
          )} */}

          {!enableMultipleStreamsOption && (
            <>
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
                      onFocus={handleRecipientAddressFocusIn}
                      onChange={handleRecipientAddressChange}
                      onBlur={handleRecipientAddressFocusOut}
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
          {(treasuryOption && treasuryOption.type === TreasuryType.Open) ? (
            <>
              <div className="form-label">{t('transactions.rate-and-frequency.amount-label')}</div>
            </>
          ) : (
            <>
              <div className="form-label">TOTAL FUNDS TO COMMIT</div>
            </>
          )}

          <Row wrap={false}>
            <Col flex="1 1 160px" style={{ paddingRight: 8 }}>
              <div className="well">
                <div className="flex-fixed-left">
                  <div className="left">
                    <span className="add-on">
                      {(selectedToken && tokenList) && (
                        <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address} onChange={onTokenChange} bordered={false} showArrow={false}>
                          {tokenList.map((option) => {
                            if (option.address === NATIVE_SOL.address) {
                              return null;
                            }
                            return (
                              <Option key={option.address} value={option.address}>
                                <div className="option-container">
                                  <TokenDisplay onClick={() => {}}
                                    mintAddress={option.address}
                                    name={option.name}
                                    showCaretDown={props.associatedToken ? false : true}
                                  />
                                  <div className="balance">
                                    {props.userBalances && props.userBalances[option.address] > 0 && (
                                      <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                    )}
                                  </div>
                                </div>
                              </Option>
                            );
                          })}
                        </Select>
                      )}
                      {(treasuryOption && treasuryOption.type === TreasuryType.Lock) && (
                        selectedToken && unallocatedBalance ? (
                          <div
                            className="token-max simplelink"
                            onClick={() => {
                              const decimals = selectedToken ? selectedToken.decimals : 6;
                              if (isFeePaidByTreasurer) {
                                const maxAmount = getMaxAmount(true);
                                consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
                                consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
                                setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                setTokenAmount(new BN(maxAmount));
                              } else {
                                const maxAmount = getMaxAmount();
                                setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                setTokenAmount(new BN(maxAmount));
                              }
                            }}>
                            MAX
                          </div>
                        ) : null
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
                      onChange={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? handleFromCoinAmountChange : handlePaymentRateAmountChange}
                      pattern="^[0-9]*[.,]?[0-9]*$"
                      placeholder="0.0"
                      minLength={1}
                      maxLength={79}
                      spellCheck="false"
                      value={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? fromCoinAmount : paymentRateAmount}
                    />
                  </div>
                </div>
              </div>
            </Col>
            <Col flex="0 1 160px" style={{ paddingLeft: 8 }}>
              <div className="well">
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
            </Col>
          </Row>

          {/* Send date */}
          {(treasuryOption && treasuryOption.type === TreasuryType.Open) && (
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
                            value={moment(
                              paymentStartDate,
                              DATEPICKER_FORMAT
                            ) as any}
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

          {treasuryOption && treasuryOption.type === TreasuryType.Open ? (
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
                      {!props.isMultisigTreasury && (
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
                      {(selectedToken && tokenList) && (
                        <Select className={`token-selector-dropdown ${props.associatedToken ? 'click-disabled' : ''}`} value={selectedToken.address} onChange={onTokenChange} bordered={false} showArrow={false}>
                          {tokenList.map((option) => {
                            if (option.address === NATIVE_SOL.address) {
                              return null;
                            }
                            return (
                              <Option key={option.address} value={option.address}>
                                <div className="option-container">
                                  <TokenDisplay onClick={() => {}}
                                    mintAddress={option.address}
                                    name={option.name}
                                    showCaretDown={props.associatedToken ? false : true}
                                  />
                                  <div className="balance">
                                    {props.userBalances && props.userBalances[option.address] > 0 && (
                                      <span>{getTokenAmountAndSymbolByTokenAddress(props.userBalances[option.address], option.address, true)}</span>
                                    )}
                                  </div>
                                </div>
                              </Option>
                            );
                          })}
                        </Select>
                      )}
                      {selectedToken && unallocatedBalance ? (
                        <div
                          className="token-max simplelink"
                          onClick={() => {
                            const decimals = selectedToken ? selectedToken.decimals : 6;
                            if (isFeePaidByTreasurer) {
                              const maxAmount = getMaxAmount(true);
                              consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
                              consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
                              setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                              setTokenAmount(new BN(maxAmount));
                            } else {
                              const maxAmount = getMaxAmount();
                              setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
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
                      {`${unallocatedBalance && selectedToken
                          ? getAmountWithSymbol(
                              makeDecimal(new BN(unallocatedBalance), selectedToken.decimals),
                              selectedToken.address,
                              true
                            )
                          : "0"
                      }`}
                    </span>
                  </div>
                  <div className="right inner-label">
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~${fromCoinAmount && effectiveRate
                        ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
              </div>

              {/* {treasuryOption && treasuryOption.type === TreasuryType.Lock && (
                <div className="mb-2 flex-fixed-right">
                  <div className="left form-label flex-row align-items-center">
                    {t('treasuries.treasury-streams.allocation-reserved-label')}
                    <a className="simplelink" href="https://docs.meanfi.com/platform/specifications/money-streaming-protocol#treasuries-and-streams"
                        target="_blank" rel="noopener noreferrer">
                      <Button
                        className="info-icon-button"
                        type="default"
                        shape="circle">
                        <InfoCircleOutlined />
                      </Button>
                    </a>
                  </div>
                  <div className="right">
                    <Radio.Group onChange={onAllocationReservedChanged} value={isAllocationReserved}>
                      <Radio value={true}>{t('general.yes')}</Radio>
                      <Radio value={false}>{t('general.no')}</Radio>
                    </Radio.Group>
                  </div>
                </div>
              )} */}

              <div className="ml-1 mb-3">
                <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('treasuries.treasury-streams.fee-payed-by-treasurer')}</Checkbox>
              </div>

              <div className="ml-1">
                <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
              </div>
            </>
          ) : (
            <>
              {(treasuryOption && treasuryOption.type === TreasuryType.Lock) && (
                <div className="mb-2 text-uppercase">{t('treasuries.treasury-streams.add-stream-locked.panel2-name')}</div>
              )}

              {(recipientNote && recipientAddress && fromCoinAmount && selectedToken) && (
                <div className="flex-fixed-right">
                  <div className="left">
                    <div className="mb-3">{t('treasuries.treasury-streams.add-stream-locked.panel2-summary', { recipientNote: recipientNote, fromCoinAmount: fromCoinAmount, selectedTokenName: selectedToken && selectedToken.name, recipientShortenAddress: shortenAddress(recipientAddress)})}</div>
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
                        max={12}
                        maxLength={2}
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
                            value={moment(
                              paymentStartDate,
                              DATEPICKER_FORMAT
                            ) as any}
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
                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                      ~${cliffRelease && effectiveRate
                        ? formatAmount(parseFloat(cliffRelease) * effectiveRate, 2)
                        : "0.00"}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>

          {(treasuryOption && treasuryOption.type === TreasuryType.Lock) && (
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
                  <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-sending')}  </strong> {(fromCoinAmount) ? `${cutNumber(parseFloat(fromCoinAmount), 6)} ${selectedToken && selectedToken.name}` : "--"}
                </Col>
                <Col span={24}>
                  <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-to-address')}  </strong> {recipientAddress ? recipientAddress : "--"}
                </Col>
                <Col span={24}>
                  <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-starting-on')}  </strong> {paymentStartDate}
                </Col>
                <Col span={24}>
                  <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-cliff-release')}  </strong> {cliffRelease ? (`${cutNumber(parseFloat(cliffRelease), 6)} ${selectedToken && selectedToken.name} (on commencement)`) : "--"}
                </Col>
                <Col span={24}>
                  <strong>Amount to be streamed: </strong>
                  <span>
                  {
                    (cliffRelease && lockPeriodAmount && selectedToken)
                      ? (`${parseFloat(fromCoinAmount) - parseFloat(cliffRelease)} ${selectedToken.name} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`)
                      : "--"
                  }
                  </span>
                </Col>
                <Col span={24}>
                  <strong>Release rate: </strong>
                  <span>
                    {
                      (cliffRelease && lockPeriodAmount && selectedToken)
                        ? (`${paymentRateAmount} ${selectedToken.name} / ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`)
                        : "--"
                    }
                  </span>
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
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onContinueStepOneButtonClick}
          disabled={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? (
            !publicKey ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            (!selectedToken || unallocatedBalance.toNumber() === 0) ||
            (!fromCoinAmount || parseFloat(fromCoinAmount) === 0 || parseFloat(fromCoinAmount) > makeDecimal(unallocatedBalance, selectedToken.decimals)) ||
            !arePaymentSettingsValid()
          ) : (
            !publicKey ||
            (!enableMultipleStreamsOption && !isMemoValid()) ||
            ((!enableMultipleStreamsOption ? !isValidAddress(recipientAddress) : (!isCsvSelected || !validMultiRecipientsList))) ||
            (!paymentRateAmount || unallocatedBalance.toNumber() === 0) ||
            (!paymentRateAmount || parseFloat(paymentRateAmount) === 0) ||
            !arePaymentSettingsValid()
          )}>
          {(treasuryOption && treasuryOption.type === TreasuryType.Open) ? getStepOneContinueButtonLabel() : getStepOneContinueButtonLabelInLocked()}
        </Button>
      </div>

      <div className={currentStep === 1 ? "contract-wrapper panel2 show" : "contract-wrapper panel2 hide"}>
        <Button
          className={`main-cta ${isBusy ? 'inactive' : ''}`}
          block
          type="primary"
          shape="round"
          size="large"
          onClick={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? onContinueStepTwoButtonClick : onTransactionStart}
          disabled={(treasuryOption && treasuryOption.type === TreasuryType.Lock) ? (
            !publicKey ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            (!selectedToken || unallocatedBalance.toNumber() === 0) ||
            (!fromCoinAmount || parseFloat(fromCoinAmount) === 0 || parseFloat(fromCoinAmount) > makeDecimal(unallocatedBalance, selectedToken.decimals)) ||
            (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) ||
            !cliffRelease ||
            (parseFloat(cliffRelease) > makeDecimal(unallocatedBalance, selectedToken.decimals))
          ) : (
            !publicKey ||
            (!enableMultipleStreamsOption && !isMemoValid()) ||
            ((!enableMultipleStreamsOption ? !isValidAddress(recipientAddress) : !validMultiRecipientsList)) ||
            (!paymentRateAmount || unallocatedBalance.toNumber() === 0) ||
            (!paymentRateAmount || parseFloat(paymentRateAmount) === 0) ||
            !arePaymentSettingsValid() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient ||
            props.nativeBalance < getMinBalanceRequired()
          )}>
          {(treasuryOption && treasuryOption.type === TreasuryType.Open) && (
            isBusy && (
              <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
            )
          )}
          {(treasuryOption && treasuryOption.type === TreasuryType.Open) && (isBusy
            // ? t('treasuries.treasury-streams.create-stream-main-cta-busy')
            ? t('streams.create-new-stream-cta-busy')
            : getTransactionStartButtonLabel()
          )}

          {(treasuryOption && treasuryOption.type === TreasuryType.Lock) && getStepTwoContinueButtonLabel()}
        </Button>
      </div>

      <div className={currentStep === 2 ? "contract-wrapper panel3 show" : "contract-wrapper panel3 hide"}>
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={
            !publicKey ||
            !isMemoValid() ||
            !isValidAddress(recipientAddress) ||
            (!selectedToken || unallocatedBalance.toNumber() === 0) ||
            (!fromCoinAmount || parseFloat(fromCoinAmount) === 0) ||
            (!lockPeriodAmount || parseFloat(lockPeriodAmount) === 0) ||
            !cliffRelease ||
            (parseFloat(cliffRelease) > makeDecimal(unallocatedBalance, selectedToken.decimals)) ||
            !arePaymentSettingsValid() ||
            !areSendAmountSettingsValid() ||
            !isVerifiedRecipient ||
            props.nativeBalance < getMinBalanceRequired()
          }>
          {getTransactionStartButtonLabelInLocked()}
        </Button>
      </div>
    </Modal>
  );
};
