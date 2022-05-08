import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { findATokenAddress, getTokenByMintAddress, shortenAddress, useLocalStorageState } from "../utils/utils";
import {
  DAO_CORE_TEAM_WHITELIST,
  BANNED_TOKENS,
  DDCA_FREQUENCY_OPTIONS,
  TEN_MINUTES_REFRESH_TIMEOUT,
  STREAMING_PAYMENT_CONTRACTS,
  FIVE_MINUTES_REFRESH_TIMEOUT,
  TRANSACTIONS_PER_PAGE,
  BETA_TESTING_PROGRAM_WHITELIST,
  WRAPPED_SOL_MINT_ADDRESS,
  FORTY_SECONDS_REFRESH_TIMEOUT,
  FIVETY_SECONDS_REFRESH_TIMEOUT,
  SEVENTY_SECONDS_REFRESH_TIMEOUT,
  PERFORMANCE_THRESHOLD,
  ONE_MINUTE_REFRESH_TIMEOUT,
  HALF_MINUTE_REFRESH_TIMEOUT
} from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { DdcaFrequencyOption } from "../models/ddca-models";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { StreamActivity, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { useWallet } from "./wallet";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from "./connection";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useAccountsContext } from "./accounts";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { getNewPrices, getPrices } from "../utils/api";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { UserTokenAccount } from "../models/transactions";
import { MEAN_TOKEN_LIST, PINNED_TOKENS } from "../constants/token-list";
import { NATIVE_SOL } from "../utils/tokens";
import useLocalStorage from "../hooks/useLocalStorage";
import { MappedTransaction } from "../utils/history";
import { consoleOut, isProd, msToTime } from "../utils/ui";
import { appConfig } from "..";
import { DdcaAccount } from "@mean-dao/ddca";
import { TxConfirmationContext } from "./transaction-status";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { TreasuryTypeOption } from "../models/treasuries";
import { TREASURY_TYPE_OPTIONS } from "../constants/treasury-type-options";
import { initialSummary, StreamsSummary } from "../models/streams";
import { MSP, Stream } from "@mean-dao/msp";
import { AccountDetails } from "../models";
import moment from "moment";
import { NATIVE_SOL_MINT } from "../utils/ids";
import { openNotification } from "../components/Notifications";
import { PerformanceCounter } from "../utils/perf-counter";

const pricesOldPerformanceCounter = new PerformanceCounter();
const pricesNewPerformanceCounter = new PerformanceCounter();

export interface TransactionStatusInfo {
  customError?: any;
  lastOperation?: TransactionStatus | undefined;
  currentOperation?: TransactionStatus | undefined;
}

interface AppStateConfig {
  theme: string | undefined;
  tpsAvg: number | null | undefined;
  refreshInterval: number;
  isWhitelisted: boolean;
  isInBetaTestingProgram: boolean;
  detailsPanelOpen: boolean;
  isDepositOptionsModalVisible: boolean;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  tokenBalance: number;
  fromCoinAmount: string;
  effectiveRate: number;
  coinPrices: any | null;
  loadingPrices: boolean;
  contract: ContractDefinition | undefined;
  treasuryOption: TreasuryTypeOption | undefined;
  recipientAddress: string;
  recipientNote: string;
  paymentStartDate: string | undefined;
  proposalEndDate: string | undefined;
  proposalEndTime: string | undefined;
  paymentRateAmount: string;
  lockPeriodAmount: string;
  paymentRateFrequency: PaymentRateType;
  lockPeriodFrequency: PaymentRateType;
  timeSheetRequirement: TimesheetRequirementOption;
  isVerifiedRecipient: boolean;
  isAllocationReserved: boolean;
  transactionStatus: TransactionStatusInfo;
  previousWalletConnectState: boolean;
  loadingStreams: boolean;
  streamListv1: StreamInfo[] | undefined;
  streamListv2: Stream[] | undefined;
  streamList: Array<Stream | StreamInfo> | undefined;
  selectedStream: Stream | StreamInfo | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  activeStream: StreamInfo | Stream | undefined;
  deletedStreams: string[];
  highLightableStreamId: string | undefined;
  streamProgramAddress: string;
  streamV2ProgramAddress: string;
  loadingStreamActivity: boolean;
  streamActivity: StreamActivity[];
  hasMoreStreamActivity: boolean;
  customStreamDocked: boolean;
  diagnosisInfo: AccountDetails | undefined;
  // Accounts
  shouldLoadTokens: boolean;
  splTokenList: UserTokenAccount[];
  userTokens: UserTokenAccount[];
  pinnedTokens: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  transactions: MappedTransaction[] | undefined;
  accountAddress: string;
  lastTxSignature: string;
  addAccountPanelOpen: boolean;
  canShowAccountDetails: boolean;
  streamsSummary: StreamsSummary;
  lastStreamsSummary: StreamsSummary;
  loadingStreamsSummary: boolean;
  // DDCAs
  ddcaOption: DdcaFrequencyOption | undefined;
  recurringBuys: DdcaAccount[];
  loadingRecurringBuys: boolean;
  // Multisig
  highLightableMultisigId: string | undefined;
  // Staking
  stakedAmount: string;
  unstakedAmount: string;
  unstakeStartDate: string | undefined;
  stakingMultiplier: number;
  setTheme: (name: string) => void;
  setTpsAvg: (value: number | null | undefined) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  showDepositOptionsModal: () => void;
  hideDepositOptionsModal: () => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setFromCoinAmount: (data: string) => void;
  refreshPrices: () => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  refreshTokenBalance: () => void;
  resetContractValues: () => void;
  resetStreamsState: () => void;
  refreshStreamList: (reset?: boolean, userAddress?: PublicKey) => void;
  setContract: (name: string) => void;
  setTreasuryOption: (option: TreasuryTypeOption | undefined) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
  setPaymentStartDate: (date: string) => void;
  setProposalEndDate: (date: string) => void;
  setProposalEndTime: (time: string) => void;
  setPaymentRateAmount: (data: string) => void;
  setLockPeriodAmount: (data: string) => void;
  setPaymentRateFrequency: (freq: PaymentRateType) => void;
  setLockPeriodFrequency: (freq: PaymentRateType) => void;
  setTimeSheetRequirement: (req: TimesheetRequirementOption) => void;
  setIsVerifiedRecipient: (state: boolean) => void;
  setIsAllocationReserved: (state: boolean) => void;
  setTransactionStatus: (status: TransactionStatusInfo) => void;
  setPreviousWalletConnectState: (state: boolean) => void;
  setLoadingStreams: (state: boolean) => void;
  setStreamList: (list: Array<StreamInfo | Stream> | undefined) => void;
  setSelectedStream: (stream: Stream | StreamInfo | undefined) => void;
  setStreamDetail: (stream: Stream | StreamInfo | undefined) => void;
  setDeletedStream: (id: string) => void,
  setHighLightableStreamId: (id: string | undefined) => void,
  openStreamById: (streamId: string, dock: boolean) => void;
  getStreamActivity: (streamId: string, version: number) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setDiagnosisInfo: (info: AccountDetails | undefined) => void;
  // Accounts
  setShouldLoadTokens: (state: boolean) => void;
  setTransactions: (map: MappedTransaction[] | undefined, addItems?: boolean) => void;
  setSelectedAsset: (asset: UserTokenAccount | undefined) => void;
  setAccountAddress: (address: string) => void;
  setAddAccountPanelOpen: (state: boolean) => void;
  setCanShowAccountDetails: (state: boolean) => void;
  setStreamsSummary: (summary: StreamsSummary) => void;
  setLastStreamsSummary: (summary: StreamsSummary) => void;
  setLoadingStreamsSummary: (state: boolean) => void;
  // DDCAs
  setDdcaOption: (name: string) => void;
  setRecurringBuys: (recurringBuys: DdcaAccount[]) => void;
  setLoadingRecurringBuys: (state: boolean) => void;
  // Multisig
  setHighLightableMultisigId: (id: string | undefined) => void,
  // Staking
  setStakedAmount: (data: string) => void;
  setUnstakedAmount: (data: string) => void;
  setUnstakeStartDate: (date: string) => void;
  setStakingMultiplier: (rate: number) => void;
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  tpsAvg: undefined,
  refreshInterval: ONE_MINUTE_REFRESH_TIMEOUT,
  isWhitelisted: false,
  isInBetaTestingProgram: false,
  detailsPanelOpen: false,
  isDepositOptionsModalVisible: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  fromCoinAmount: '',
  effectiveRate: 0,
  coinPrices: null,
  loadingPrices: false,
  contract: undefined,
  treasuryOption: TREASURY_TYPE_OPTIONS[0],
  recipientAddress: '',
  recipientNote: '',
  paymentStartDate: undefined,
  proposalEndDate: undefined,
  proposalEndTime: undefined,
  paymentRateAmount: '',
  lockPeriodAmount: '',
  paymentRateFrequency: PaymentRateType.PerMonth,
  lockPeriodFrequency: PaymentRateType.PerMonth,
  timeSheetRequirement: TimesheetRequirementOption.NotRequired,
  isVerifiedRecipient: false,
  isAllocationReserved: false,
  transactionStatus: {
    lastOperation: TransactionStatus.Iddle,
    currentOperation: TransactionStatus.Iddle
  },
  previousWalletConnectState: false,
  loadingStreams: false,
  streamListv1: undefined,
  streamListv2: undefined,
  streamList: undefined,
  selectedStream: undefined,
  streamDetail: undefined,
  activeStream: undefined,
  deletedStreams: [],
  highLightableStreamId: undefined,
  streamProgramAddress: '',
  streamV2ProgramAddress: '',
  loadingStreamActivity: false,
  streamActivity: [],
  hasMoreStreamActivity: true,
  customStreamDocked: false,
  diagnosisInfo: undefined,
  // Accounts
  shouldLoadTokens: true,
  splTokenList: [],
  userTokens: [],
  pinnedTokens: [],
  selectedAsset: undefined,
  transactions: undefined,
  accountAddress: '',
  lastTxSignature: '',
  addAccountPanelOpen: true,
  canShowAccountDetails: false,
  streamsSummary: initialSummary,
  lastStreamsSummary: initialSummary,
  loadingStreamsSummary: false,
  // DDCAs
  ddcaOption: undefined,
  recurringBuys: [],
  loadingRecurringBuys: false,
  // Multisig
  highLightableMultisigId: undefined,
  // Staking
  stakedAmount: '',
  unstakedAmount: '',
  unstakeStartDate: 'undefined',
  stakingMultiplier: 1,
  setTheme: () => {},
  setTpsAvg: () => {},
  setDtailsPanelOpen: () => {},
  showDepositOptionsModal: () => {},
  hideDepositOptionsModal: () => {},
  setContract: () => {},
  setTreasuryOption: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
  setFromCoinAmount: () => {},
  refreshPrices: () => {},
  setEffectiveRate: () => {},
  setCoinPrices: () => {},
  refreshTokenBalance: () => {},
  resetContractValues: () => {},
  resetStreamsState: () => {},
  refreshStreamList: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setProposalEndDate: () => {},
  setProposalEndTime: () => {},
  setPaymentRateAmount: () => {},
  setLockPeriodAmount: () => {},
  setPaymentRateFrequency: () => {},
  setLockPeriodFrequency: () => {},
  setTimeSheetRequirement: () => {},
  setIsVerifiedRecipient: () => {},
  setIsAllocationReserved: () => {},
  setTransactionStatus: () => {},
  setPreviousWalletConnectState: () => {},
  setLoadingStreams: () => {},
  setStreamList: () => {},
  setSelectedStream: () => {},
  setStreamDetail: () => {},
  setDeletedStream: () => {},
  setHighLightableStreamId: () => {},
  openStreamById: () => {},
  getStreamActivity: () => {},
  setCustomStreamDocked: () => { },
  setDiagnosisInfo: () => { },
  // Accounts
  setShouldLoadTokens: () => {},
  setTransactions: () => {},
  setSelectedAsset: () => {},
  setAccountAddress: () => {},
  setAddAccountPanelOpen: () => {},
  setCanShowAccountDetails: () => {},
  setStreamsSummary: () => {},
  setLastStreamsSummary: () => {},
  setLoadingStreamsSummary: () => {},
  // DDCAs
  setDdcaOption: () => {},
  setRecurringBuys: () => {},
  setLoadingRecurringBuys: () => {},
  // Multisig
  setHighLightableMultisigId: () => {},
  // Staking
  setStakedAmount: () => {},
  setUnstakedAmount: () => {},
  setUnstakeStartDate: () => {},
  setStakingMultiplier: () => {}
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const location = useLocation();
  const { t } = useTranslation('common');
  // Parent contexts
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const connectionConfig = useConnectionConfig();
  const accounts = useAccountsContext();
  const [isWhitelisted, setIsWhitelisted] = useState(contextDefaultValues.isWhitelisted);
  const [isInBetaTestingProgram, setIsInBetaTestingProgram] = useState(contextDefaultValues.isInBetaTestingProgram);
  const [streamProgramAddress, setStreamProgramAddress] = useState('');
  const [streamV2ProgramAddress, setStreamV2ProgramAddress] = useState('');
  const {
    lastSentTxStatus,
    clearTxConfirmationContext,
  } = useContext(TxConfirmationContext);
  const today = new Date().toLocaleDateString("en-US");
  const tomorrow = moment().add(1, 'days').format('L');
  const timeDate = moment().format('hh:mm A');  
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [tpsAvg, setTpsAvg] = useState<number | null | undefined>(contextDefaultValues.tpsAvg);
  const [detailsPanelOpen, updateDetailsPanelOpen] = useState(contextDefaultValues.detailsPanelOpen);
  const [shouldLoadTokens, updateShouldLoadTokens] = useState(contextDefaultValues.shouldLoadTokens);
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [contractName, setContractName] = useLocalStorageState("contractName");
  const [ddcaOption, updateDdcaOption] = useState<DdcaFrequencyOption | undefined>();
  const [treasuryOption, updateTreasuryOption] = useState<TreasuryTypeOption | undefined>(contextDefaultValues.treasuryOption);
  const [ddcaOptionName, setDdcaOptionName] = useState<string>('');
  const [recipientAddress, updateRecipientAddress] = useState<string>(contextDefaultValues.recipientAddress);
  const [recipientNote, updateRecipientNote] = useState<string>(contextDefaultValues.recipientNote);
  const [paymentStartDate, updatePaymentStartDate] = useState<string | undefined>(today);
  const [proposalEndDate, updateProposalEndDate] = useState<string | undefined>(tomorrow);
  const [proposalEndTime, updateProposalEndTime] = useState<string | undefined>(timeDate);
  const [fromCoinAmount, updateFromCoinAmount] = useState<string>(contextDefaultValues.fromCoinAmount);
  const [paymentRateAmount, updatePaymentRateAmount] = useState<string>(contextDefaultValues.paymentRateAmount);
  const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>(contextDefaultValues.lockPeriodAmount);
  const [paymentRateFrequency, updatePaymentRateFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [lockPeriodFrequency, updateLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(TimesheetRequirementOption.NotRequired);
  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState<boolean>(contextDefaultValues.isVerifiedRecipient);
  const [isAllocationReserved, setIsAllocationReserved] = useState<boolean>(contextDefaultValues.isAllocationReserved);
  const [transactionStatus, updateTransactionStatus] = useState<TransactionStatusInfo>(contextDefaultValues.transactionStatus);
  const [previousWalletConnectState, updatePreviousWalletConnectState] = useState<boolean>(connected);
  const [tokenList, updateTokenlist] = useState<TokenInfo[]>([]);
  const [loadingStreams, updateLoadingStreams] = useState(false);
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(contextDefaultValues.loadingStreamActivity);
  const [streamActivity, setStreamActivity] = useState<StreamActivity[]>([]);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(contextDefaultValues.hasMoreStreamActivity);
  const [customStreamDocked, setCustomStreamDocked] = useState(contextDefaultValues.customStreamDocked);
  const [diagnosisInfo, setDiagnosisInfo] = useState<AccountDetails | undefined>(contextDefaultValues.diagnosisInfo);
  const [streamListv1, setStreamListv1] = useState<StreamInfo[] | undefined>();
  const [streamListv2, setStreamListv2] = useState<Stream[] | undefined>();
  const [streamList, setStreamList] = useState<Array<StreamInfo | Stream> | undefined>();
  const [selectedStream, updateSelectedStream] = useState<Stream | StreamInfo | undefined>();
  const [streamDetail, updateStreamDetail] = useState<Stream | StreamInfo | undefined>();
  const [activeStream, setActiveStream] = useState<Stream | StreamInfo | undefined>();
  const [deletedStreams, setDeletedStreams] = useState<string[]>([]);
  const [highLightableStreamId, setHighLightableStreamId] = useState<string | undefined>(contextDefaultValues.highLightableStreamId);
  const [highLightableMultisigId, setHighLightableMultisigId] = useState<string | undefined>(contextDefaultValues.highLightableMultisigId);
  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number>(contextDefaultValues.tokenBalance);
  const [stakingMultiplier, updateStakingMultiplier] = useState<number>(contextDefaultValues.stakingMultiplier);
  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(contextDefaultValues.loadingPrices);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);
  const [stakedAmount, updateStakedAmount] = useState<string>(contextDefaultValues.stakedAmount);
  const [unstakedAmount, updatedUnstakeAmount] = useState<string>(contextDefaultValues.unstakedAmount);
  const [unstakeStartDate, updateUnstakeStartDate] = useState<string | undefined>(today);
  const streamProgramAddressFromConfig = appConfig.getConfig().streamProgramAddress;
  const streamV2ProgramAddressFromConfig = appConfig.getConfig().streamV2ProgramAddress;

  const isDowngradedPerformance = useMemo(() => {
    return isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD)
      ? true
      : false;
  }, [tpsAvg]);

  if (!streamProgramAddress) {
    setStreamProgramAddress(streamProgramAddressFromConfig);
  }

  if (!streamV2ProgramAddress) {
    setStreamV2ProgramAddress(streamV2ProgramAddressFromConfig);
  }

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddressFromConfig,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddressFromConfig
  ]);

  const msp = useMemo(() => {
    console.log('New MSP from appState');
    return new MSP(
      connectionConfig.endpoint,
      streamV2ProgramAddressFromConfig,
      "confirmed"
    );
  }, [
    connectionConfig.endpoint,
    streamV2ProgramAddressFromConfig
  ]);

  const setTheme = (name: string) => {
    updateTheme(name);
  }

  const setDtailsPanelOpen = (state: boolean) => {
    updateDetailsPanelOpen(state);
  }

  /**
   * Auto reload timeout breakdown
   * 
   * #s <= 5 30s
   * #s > 5 & <= 25 40s
   * #s > 25 & <= 60 50s
   * #s > 60 & <= 100 70s
   * #s > 100 5min is ok
   */
   const refreshInterval = useMemo(() => {
    if (!streamList || streamList.length <= 5) {
      return HALF_MINUTE_REFRESH_TIMEOUT;
    } else if (streamList.length > 5 && streamList.length <= 25) {
      return FORTY_SECONDS_REFRESH_TIMEOUT;
    } else if (streamList.length > 25 && streamList.length <= 60) {
      return FIVETY_SECONDS_REFRESH_TIMEOUT;
    } else if (streamList.length > 60 && streamList.length <= 100) {
      return SEVENTY_SECONDS_REFRESH_TIMEOUT;
    } else {
      return FIVE_MINUTES_REFRESH_TIMEOUT;
    }
  }, [streamList]);

  const setShouldLoadTokens = (state: boolean) => {
    updateShouldLoadTokens(state);
  }

  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  // Update isInBetaTestingProgram
  useEffect(() => {
    const isUserInBetaTestingProgram = () => {
      if (!publicKey) {
        setIsWhitelisted(false);
      } else {
        const user = BETA_TESTING_PROGRAM_WHITELIST.some(a => a === publicKey.toBase58());
        setIsInBetaTestingProgram(user);
      }
    }

    isUserInBetaTestingProgram();
    return () => {};
  }, [
    publicKey
  ]);

  useEffect(() => {
    consoleOut('isInBetaTestingProgram:', isInBetaTestingProgram, 'blue');
  }, [isInBetaTestingProgram]);

  // Update isWhitelisted
  useEffect(() => {
    const updateIsWhitelisted = () => {
      if (!publicKey) {
        setIsWhitelisted(false);
      } else {
        const isWl = DAO_CORE_TEAM_WHITELIST.some(a => a === publicKey.toBase58());
        setIsWhitelisted(isWl);
      }
    }

    updateIsWhitelisted();
    return () => {};
  }, [
    publicKey
  ]);

  useEffect(() => {
    consoleOut('isWhitelisted:', isWhitelisted, 'blue');
  }, [isWhitelisted]);

  const setLoadingStreams = (state: boolean) => {
    updateLoadingStreams(state);
  }

  const setContract = (name: string) => {
    const items = STREAMING_PAYMENT_CONTRACTS.filter(c => c.name === name);
    if (items?.length) {
      setSelectedContract(items[0]);
      setContractName(name);
    }
  }

  const setDdcaOption = (name: string) => {
    const items = DDCA_FREQUENCY_OPTIONS.filter(c => c.name === name);
    if (items?.length) {
      updateDdcaOption(items[0]);
      setDdcaOptionName(name);
    }
  }

  const setTreasuryOption = (option: TreasuryTypeOption | undefined) => {
    updateTreasuryOption(option);
  }

  const setRecipientAddress = (address: string) => {
    updateRecipientAddress(address);
  }

  const setRecipientNote = (note: string) => {
    updateRecipientNote(note);
  }

  const setPaymentStartDate = (date: string) => {
    updatePaymentStartDate(date);
  }

  const setProposalEndDate = (date: string) => {
    updateProposalEndDate(date);
  }

  const setProposalEndTime = (time: string) => {
    updateProposalEndTime(time);
  }

  const setFromCoinAmount = (data: string) => {
    updateFromCoinAmount(data);
  }

  const setPaymentRateAmount = (data: string) => {
    updatePaymentRateAmount(data);
  }

  const setLockPeriodAmount = (data: string) => {
    updateLockPeriodAmount(data);
  }

  const setPaymentRateFrequency = (freq: PaymentRateType) => {
    updatePaymentRateFrequency(freq);
  }

  const setLockPeriodFrequency = (freq: PaymentRateType) => {
    updateLockPeriodFrequency(freq);
  }

  const setTimeSheetRequirement = (req: TimesheetRequirementOption) => {
    updateTimeSheetRequirement(req);
  }

  const setTransactionStatus = (status: TransactionStatusInfo) => {
    updateTransactionStatus(status);
  }

  const setStakedAmount = (data: string) => {
    updateStakedAmount(data);
  }

  const setUnstakedAmount = (data: string) => {
    updatedUnstakeAmount(data);
  }

  const setUnstakeStartDate = (date: string) => {
    updateUnstakeStartDate(date);
  }

  const resetContractValues = () => {
    setFromCoinAmount('');
    setRecipientAddress('');
    setRecipientNote('');
    setPaymentStartDate(today);
    setProposalEndDate(tomorrow);
    setProposalEndTime(timeDate);
    setPaymentRateAmount('');
    setLockPeriodAmount('');
    setPaymentRateFrequency(PaymentRateType.PerMonth);
    setPaymentRateFrequency(PaymentRateType.PerMonth);
    setIsVerifiedRecipient(false);
    setIsAllocationReserved(false);
  }

  const resetStreamsState = () => {
    setStreamList([]);
    setStreamActivity([]);
    setStreamDetail(undefined);
    setActiveStream(undefined);
    setLoadingStreamActivity(false);
    setHasMoreStreamActivity(true);
  }

  const setPreviousWalletConnectState = (state: boolean) => {
    updatePreviousWalletConnectState(state);
    if (state === false) {
      resetContractValues();
      resetStreamsState();
      setCustomStreamDocked(false);
    }
  }

  const openStreamById = async (streamId: string, dock = false) => {
    try {
      const streamPublicKey = new PublicKey(streamId);
      try {
        if (msp && publicKey) {
          console.log('streamPublicKey', streamPublicKey.toBase58());
          const detail = await msp.getStream(streamPublicKey);
          consoleOut('customStream', detail);
          if (detail) {
            setStreamDetail(detail);
            setActiveStream(detail);
            if (dock) {
              setStreamList([detail]);
              setStreamActivity([]);
              setHasMoreStreamActivity(true);
              getStreamActivity(streamId, detail.version, true);
              setCustomStreamDocked(true);
              openNotification({
                description: t('notifications.success-loading-stream-message', {streamId: shortenAddress(streamId, 10)}),
                type: "success"
              });
            }
          } else {
            if (dock) {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
                type: "error"
              });
            }
          }
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error('customStream', error);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
          type: "error"
        });
      }
    } catch (error) {
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.invalid-publickey-message'),
        type: "error"
      });
    }
  }

  const getStreamActivity = useCallback((streamId: string, version: number, clearHistory = false) => {
    if (!connected || !streamId || !ms || !msp) {
      return [];
    }

    if (!loadingStreamActivity) {

      consoleOut('Loading stream activity...', '', 'crimson');

      setLoadingStreamActivity(true);
      const streamPublicKey = new PublicKey(streamId);

      if (version < 2) {
        ms.listStreamActivity(streamPublicKey)
          .then(value => {
            consoleOut('activity:', value);
            setStreamActivity(value);
          })
          .catch(err => {
            console.error(err);
            setStreamActivity([]);
          })
          .finally(() => {
            setHasMoreStreamActivity(false);
            setLoadingStreamActivity(false);
          });

      } else {
        const before = clearHistory
          ? ''
          : streamActivity && streamActivity.length > 0
            ? streamActivity[streamActivity.length - 1].signature
            : '';
        consoleOut('before:', before, 'crimson');
        msp.listStreamActivity(streamPublicKey, before, 5)
          .then((value: StreamActivity[]) => {
            consoleOut('activity:', value);
            const activities = clearHistory
              ? []
              : streamActivity && streamActivity.length > 0
                ? JSON.parse(JSON.stringify(streamActivity)) // Object.assign({}, streamActivity)
                : [];

            if (value && value.length > 0) {
              activities.push(...value);
              setHasMoreStreamActivity(true);
            } else {
              setHasMoreStreamActivity(false);
            }
            setStreamActivity(activities);
          })
          .catch(err => {
            console.error(err);
            setStreamActivity([]);
            setHasMoreStreamActivity(false);
          })
          .finally(() => setLoadingStreamActivity(false));
      }
    }

  }, [
    ms,
    msp,
    connected,
    streamActivity,
    loadingStreamActivity
  ]);

  const setSelectedStream = (stream: Stream | StreamInfo | undefined) => {
    updateSelectedStream(stream);
    if (stream) {
      const mspInstance: any = stream.version < 2 ? ms : msp;
      mspInstance.getStream(new PublicKey(stream.id as string))
        .then((detail: Stream | StreamInfo) => {
          consoleOut('detail:', detail, 'blue');
          if (detail) {
            setStreamActivity([]);
            setHasMoreStreamActivity(true);
            getStreamActivity(detail.id as string, detail.version, true);
            updateStreamDetail(detail);
            setActiveStream(detail);
            if (location.pathname.startsWith('/accounts/streams')) {
              const token = getTokenByMintAddress(detail.associatedToken as string);
              setSelectedToken(token);
            }
          }
        })
        .catch((error: any) => {
          console.error(error);
          setStreamActivity([]);
          setHasMoreStreamActivity(false);
        });
    }
  }

  const setStreamDetail = (stream: Stream | StreamInfo | undefined) => {
    updateStreamDetail(stream);
  }

  const setDeletedStream = (id: string) => {
    console.log('setDeletedStream:', id);
    setDeletedStreams(oldArray => [...oldArray, id]);
  }

  // Deposits modal
  const [isDepositOptionsModalVisible, setIsDepositOptionsModalVisibility] = useState(false);

  const showDepositOptionsModal = useCallback(() => {
    setIsDepositOptionsModalVisibility(true);
    const depositMenuItem = document.getElementById("deposits-menu-item");
    if (depositMenuItem) {
      setTimeout(() => {
        if (depositMenuItem.classList.contains('ant-menu-item-active')) {
          depositMenuItem.classList.remove('ant-menu-item-active');
        }
      }, 300);
    }
  }, []);

  const hideDepositOptionsModal = useCallback(() => {
    setIsDepositOptionsModalVisibility(false);
    const depositMenuItem = document.getElementById("deposits-menu-item");
    if (depositMenuItem) {
      setTimeout(() => {
        if (depositMenuItem.classList.contains('ant-menu-item-active')) {
          depositMenuItem.classList.remove('ant-menu-item-active');
        }
      }, 300);
    }
  }, []);

  const setSelectedToken = (token: TokenInfo | undefined) => {
    updateSelectedToken(token);
    setShouldUpdateToken(true);
  }

  const setSelectedTokenBalance = (balance: number) => {
    updateTokenBalance(balance);
  }

  const setStakingMultiplier = (rate: number) => {
    updateStakingMultiplier(rate);
  }

  const setEffectiveRate = (rate: number) => {
    updateEffectiveRate(rate);
  }

  const refreshPrices = () => {
    setLoadingPrices(true);
    getCoinPrices();
  }

  // Fetch coin prices
  const getCoinPrices = useCallback(async () => {

    // try {
    //   pricesOldPerformanceCounter.start();
    //   const prices = await getPrices();
    //   pricesOldPerformanceCounter.stop();
    //   consoleOut(`Fetched old price list in ${pricesOldPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
    //   if (!prices || prices.msg) {
    //     setCoinPrices(null);
    //     updateEffectiveRate(0);
    //   } else {
    //     const wSolPrice = prices[WRAPPED_SOL_MINT_ADDRESS];
    //     const nativeAddress = NATIVE_SOL_MINT.toBase58();
    //     if (wSolPrice) {
    //       prices[nativeAddress] = wSolPrice;
    //     }
    //     consoleOut('Old price items:', Object.keys(prices).length, 'blue');
    //     consoleOut('Old prices list:', prices, 'blue');
    //     setCoinPrices(prices);
    //   }
    //   setLoadingPrices(false);
    // } catch (error) {
    //   pricesOldPerformanceCounter.stop();
    //   setCoinPrices(null);
    //   updateEffectiveRate(0);
    //   setLoadingPrices(false);
    // }

    try {
      pricesNewPerformanceCounter.start();
      const newPrices = await getNewPrices();
      pricesNewPerformanceCounter.stop();
      consoleOut(`Fetched new price list in ${pricesNewPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
      if (newPrices && newPrices.length > 0) {
        // const pricesMap = new Map<string, number>();
        // newPrices.forEach(tp => pricesMap.set(tp.address, tp.price));
        const pricesMap: any = {};
        newPrices.forEach(tp => pricesMap[tp.address] = tp.price);
        const wSolPrice = pricesMap[WRAPPED_SOL_MINT_ADDRESS];
        const nativeAddress = NATIVE_SOL_MINT.toBase58();
        // Lets add SOL to the list using wSOL price
        if (wSolPrice) {
          pricesMap[nativeAddress] = wSolPrice;
        }
        consoleOut('New price items:', Object.keys(pricesMap).length, 'blue');
        consoleOut('New prices list:', pricesMap, 'blue');
        setCoinPrices(pricesMap);
      } else {
        consoleOut('New prices list:', 'NO PRICES RETURNED!', 'red');
      }
    } catch (error) {
      pricesOldPerformanceCounter.stop();
      setCoinPrices(null);
      updateEffectiveRate(0);
      consoleOut('New prices API error:', error, 'red');
    } finally {
      setLoadingPrices(false);
    }

  },[]);

  // Effect to load coin prices
  useEffect(() => {

    if (shouldLoadCoinPrices) {
      setShouldLoadCoinPrices(false);
      setLoadingPrices(true);
      getCoinPrices();
    }

    const coinTimer = window.setInterval(() => {
      consoleOut(`Refreshing prices past ${TEN_MINUTES_REFRESH_TIMEOUT / 60 / 1000}min...`);
      setLoadingPrices(true);
      getCoinPrices();
    }, TEN_MINUTES_REFRESH_TIMEOUT);

    // Return callback to run on unmount.
    return () => {
      if (coinTimer) {
        window.clearInterval(coinTimer);
      }
    };
  }, [
    shouldLoadCoinPrices,
    getCoinPrices
  ]);

  // Update token price while list of prices change
  useEffect(() => {
    if (coinPrices && selectedToken) {
      const price = coinPrices[selectedToken.address] ? coinPrices[selectedToken.address] : 0;
      updateEffectiveRate(price);
    }
  }, [coinPrices, selectedToken]);

  // Cache selected contract
  const contractFromCache = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );

  // Preselect a contract
  useEffect(() => {

    const setContractOrAutoSelectFirst = (name?: string) => {
      if (name) {
        if (contractFromCache) {
          setSelectedContract(contractFromCache);
        } else {
          const item = STREAMING_PAYMENT_CONTRACTS.filter(c => !c.disabled)[0];
          setSelectedContract(item);
          setContractName(item.name);
        }
      } else {
        const item = STREAMING_PAYMENT_CONTRACTS.filter(c => !c.disabled)[0];
        setSelectedContract(item);
        setContractName(item.name);
      }
    }

    setContractOrAutoSelectFirst(contractName);
    return () => {};
  }, [
    contractName,
    contractFromCache,
    setSelectedContract,
    setContractName
  ]);

  // Cache selected DDCA frequency option
  const ddcaOptFromCache = useMemo(
    () => DDCA_FREQUENCY_OPTIONS.find(({ name }) => name === ddcaOptionName),
    [ddcaOptionName]
  );

  // Preselect a DDCA frequency option
  useEffect(() => {

    const setFrequencyOrAutoSelectFirst = (name?: string) => {
      if (name) {
        if (ddcaOptFromCache) {
          updateDdcaOption(ddcaOptFromCache);
        } else {
          const item = DDCA_FREQUENCY_OPTIONS.filter(c => !c.disabled)[0];
          updateDdcaOption(item);
          setDdcaOptionName(item.name);
        }
      } else {
        const item = DDCA_FREQUENCY_OPTIONS.filter(c => !c.disabled)[0];
        updateDdcaOption(item);
        setDdcaOptionName(item.name);
      }
    }

    setFrequencyOrAutoSelectFirst(ddcaOptionName);
    return () => {};
  }, [
    ddcaOptionName,
    ddcaOptFromCache,
    setDdcaOptionName,
    updateDdcaOption,
  ]);

  const refreshStreamList = useCallback((reset = false, userAddress?: PublicKey) => {
    if (loadingStreams || customStreamDocked || !ms || !msp) {
      return;
    }

    if (!publicKey && !userAddress) {
      return;
    }

    const userPk = userAddress || publicKey;
    consoleOut('Fetching streams for:', userPk?.toBase58(), 'blue');

    if (msp) {
      setLoadingStreams(true);
      const signature = lastSentTxStatus || '';
      setTimeout(() => {
        clearTxConfirmationContext();
      });

      const streamAccumulator: any[] = [];
      let rawStreamsv1: StreamInfo[] = [];
      let rawStreamsv2: Stream[] = [];

      msp.listStreams({treasurer: userPk, beneficiary: userPk})
        .then(streamsv2 => {
          streamAccumulator.push(...streamsv2);
          rawStreamsv2 = streamsv2;
          rawStreamsv2.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1);
          ms.listStreams({treasurer: userPk, beneficiary: userPk})
          .then(streamsv1 => {
              streamAccumulator.push(...streamsv1);
              rawStreamsv1 = streamsv1;
              rawStreamsv1.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1)
              streamAccumulator.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1)
              // Sort debugging block
              if (!isProd()) {
                const debugTable: any[] = [];
                streamAccumulator.forEach(item => debugTable.push({
                  createdBlockTime: item.createdBlockTime,
                  name: item.version < 2 ? item.streamName : item.name.trim(),
                }));
                console.table(debugTable);
              }
              // End of debugging block
              setStreamList(streamAccumulator);
              setStreamListv2(rawStreamsv2);
              setStreamListv1(rawStreamsv1);
              consoleOut('Streams:', streamAccumulator, 'blue');
              setDeletedStreams([]);
              if (streamAccumulator.length) {
                let item: Stream | StreamInfo | undefined;
                if (reset) {
                  if (signature) {
                    item = streamAccumulator.find(d => d.transactionSignature === signature);
                  } else {
                    item = streamAccumulator[0];
                  }
                } else {
                  // Try to get current item by its original Tx signature then its id
                  if (signature) {
                    item = streamAccumulator.find(d => d.transactionSignature === signature);
                  } else if (highLightableStreamId) {
                    const highLightableItem = streamAccumulator.find(i => i.id === highLightableStreamId);
                    item = highLightableItem || streamAccumulator[0];
                  } else if (selectedStream) {
                    const itemFromServer = streamAccumulator.find(i => i.id === selectedStream.id);
                    item = itemFromServer || streamAccumulator[0];
                  } else {
                    item = streamAccumulator[0];
                  }
                }
                if (!item) {
                  item = Object.assign({}, streamAccumulator[0]);
                }
                consoleOut('selectedStream:', item, 'blue');

                setStreamActivity([]);
                setHasMoreStreamActivity(true);

                if (item && selectedStream && item.id !== selectedStream.id) {
                  updateSelectedStream(item);
                  const mspInstance: any = item.version < 2 ? ms : msp;
                  mspInstance.getStream(new PublicKey(item.id as string))
                    .then((detail: Stream | StreamInfo) => {
                      if (detail) {
                        updateStreamDetail(detail);
                        setActiveStream(detail);
                        if (location.pathname.startsWith('/accounts/streams')) {
                          const token = getTokenByMintAddress(detail.associatedToken as string);
                          setSelectedToken(token);
                        }
                        setTimeout(() => {
                          setStreamActivity([]);
                          setHasMoreStreamActivity(true);
                          setLoadingStreamActivity(true);
                        });
                        getStreamActivity(detail.id as string, detail.version, true);
                      }
                    })
                } else {
                  if (item) {
                    updateStreamDetail(item);
                    setActiveStream(item);
                    if (location.pathname.startsWith('/accounts/streams')) {
                      const token = getTokenByMintAddress(item.associatedToken as string);
                      setSelectedToken(token);
                    }
                    setTimeout(() => {
                      setStreamActivity([]);
                      setHasMoreStreamActivity(true);
                      setLoadingStreamActivity(true);
                    });
                    getStreamActivity(item.id as string, item.version, true);
                  }
                }
              } else {
                setStreamActivity([]);
                setHasMoreStreamActivity(false);
                updateSelectedStream(undefined);
                updateStreamDetail(undefined);
                setActiveStream(undefined);
              }
              updateLoadingStreams(false);
            }).catch(err => {
              console.error(err);
              updateLoadingStreams(false);
            });
        }).catch(err => {
          console.error(err);
          updateLoadingStreams(false);
        });
    }

  }, [
    ms,
    msp,
    publicKey,
    loadingStreams,
    selectedStream,
    lastSentTxStatus,
    location.pathname,
    customStreamDocked,
    highLightableStreamId,
    clearTxConfirmationContext,
    getStreamActivity
  ]);

  /**
   * Streams refresh timeout
   * 
   * If TPS values are critical we should NOT schedule at all
   * and resume when TPS goes up again.
   */
  useEffect(() => {
    let timer: any;

    if ((location.pathname === '/accounts' || location.pathname === '/accounts/streams') &&
        !customStreamDocked && !isDowngradedPerformance) {
      timer = setInterval(() => {
        consoleOut(`Refreshing streams past ${msToTime(FIVE_MINUTES_REFRESH_TIMEOUT)}...`);
        refreshStreamList();
      }, FIVE_MINUTES_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    location,
    customStreamDocked,
    isDowngradedPerformance,
    refreshStreamList,
  ]);

  const refreshTokenBalance = useCallback(async () => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (!address) return 0;
      try {
        const accountInfo = await connection.getAccountInfo(address.toPublicKey());
        if (!accountInfo) return 0;
        if (address === publicKey?.toBase58()) {
          return accountInfo.lamports / LAMPORTS_PER_SOL;
        }
        const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
        return tokenAmount.uiAmount || 0;
      } catch (error) {
        console.error(error);
        throw(error);
      }
    }

    if (!selectedToken) return;

    let balance = 0;
    const selectedTokenAddress = await findATokenAddress(publicKey as PublicKey, selectedToken.address.toPublicKey());
    balance = await getTokenAccountBalanceByAddress(selectedTokenAddress.toBase58());
    updateTokenBalance(balance);

  }, [
    accounts,
    connection,
    publicKey,
    selectedToken,
    tokenList
  ]);

  // Effect to refresh token balance if needed
  useEffect(() => {

    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (shouldUpdateToken) {
      setShouldUpdateToken(false);
      refreshTokenBalance();
    }

    return () => {};

  }, [
    accounts,
    publicKey,
    shouldUpdateToken,
    refreshTokenBalance
  ]);


  /////////////////////////////////////
  // Added to support /accounts page //
  /////////////////////////////////////

  const [accountAddress, updateAccountAddress] = useLocalStorage('lastUsedAccount', publicKey ? publicKey.toBase58() : '');
  const [splTokenList, updateSplTokenList] = useState<UserTokenAccount[]>(contextDefaultValues.splTokenList);
  const [userTokens, updateUserTokens] = useState<UserTokenAccount[]>(contextDefaultValues.userTokens);
  const [pinnedTokens, updatePinnedTokens] = useState<UserTokenAccount[]>(contextDefaultValues.pinnedTokens);
  const [transactions, updateTransactions] = useState<MappedTransaction[] | undefined>(contextDefaultValues.transactions);
  const [selectedAsset, updateSelectedAsset] = useState<UserTokenAccount | undefined>(contextDefaultValues.selectedAsset);
  const [lastTxSignature, setLastTxSignature] = useState<string>(contextDefaultValues.lastTxSignature);
  const [addAccountPanelOpen, updateAddAccountPanelOpen] = useState(contextDefaultValues.addAccountPanelOpen);
  const [canShowAccountDetails, updateCanShowAccountDetails] = useState(accountAddress ? true : false);
  const [streamsSummary, setStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.streamsSummary);
  const [lastStreamsSummary, setLastStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.lastStreamsSummary);
  const [loadingStreamsSummary, setLoadingStreamsSummary] = useState(contextDefaultValues.loadingStreamsSummary);

  const setAddAccountPanelOpen = (state: boolean) => {
    updateAddAccountPanelOpen(state);
  }

  const setCanShowAccountDetails = (state: boolean) => {
    updateCanShowAccountDetails(state);
  }

  const setTransactions = (map: MappedTransaction[] | undefined, addItems?: boolean) => {
    if (!addItems) {
      if (map && map.length === TRANSACTIONS_PER_PAGE) {
        const lastSignature = map[map.length - 1].signature;
        setLastTxSignature(lastSignature);
      } else {
        setLastTxSignature('');
      }
      updateTransactions(map);
    } else {
      if (map && map.length) {
        const lastSignature = map[map.length - 1].signature;
        const currentArray = transactions?.slice() || [];
        const jointArray = currentArray.concat(map);
        if (map.length === TRANSACTIONS_PER_PAGE) {
          setLastTxSignature(lastSignature);
        } else {
          setLastTxSignature('');
        }
        updateTransactions(jointArray);
      }
    }
  }

  const setSelectedAsset = (asset: UserTokenAccount | undefined) => {
    updateSelectedAsset(asset);
  }

  const setAccountAddress = (address: string) => {
    updateTransactions([]);
    updateAccountAddress(address);
  }

  // Load the supported tokens
  useEffect(() => {
    (async () => {
      const list = new Array<UserTokenAccount>();
      const sol: UserTokenAccount = {
        address: NATIVE_SOL.address,
        balance: 0,
        chainId: 0,
        decimals: NATIVE_SOL.decimals,
        name: NATIVE_SOL.name,
        symbol: NATIVE_SOL.symbol,
        publicAddress: '',
        tags: NATIVE_SOL.tags,
        logoURI: NATIVE_SOL.logoURI
      };
      sol.isMeanSupportedToken = true;
      // First add Native SOL as a token
      list.push(sol);
      // Add pinned tokens from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster) && PINNED_TOKENS.includes(t.symbol))
        .forEach(item => list.push(Object.assign({}, item, { isMeanSupportedToken: true })));
      // Save pinned tokens' list
      const pinned = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
      updatePinnedTokens(pinned);
      // Add non-pinned tokens from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster) && !PINNED_TOKENS.includes(t.symbol))
        .forEach(item => list.push(item));
      // Save the MeanFi list
      updateTokenlist(list.filter(t => t.address !== NATIVE_SOL.address) as TokenInfo[]);
      // Update the list
      updateUserTokens(list);
      // Load the mainnet list
      const res = await new TokenListProvider().resolve();
      const mainnetList = res
        .filterByChainId(101)
        .excludeByTag("nft")
        .getList() as UserTokenAccount[];
      // Filter out the banned tokens
      const filteredTokens = mainnetList.filter(t => !BANNED_TOKENS.some(bt => bt === t.symbol));
      // Sort the big list
      const sortedMainnetList = filteredTokens.sort((a, b) => {
        const nameA = a.symbol.toUpperCase();
        const nameB = b.symbol.toUpperCase();
        if (nameA < nameB) {
          return -1;
        }
        if (nameA > nameB) {
          return 1;
        }
        // names must be equal
        return 0;
      });

      updateSplTokenList(sortedMainnetList);
    })();

    return () => { }

  }, [connectionConfig.cluster]);

  //////////////////////////////////
  // Added to support /ddcas page //
  //////////////////////////////////

  const [recurringBuys, updateRecurringBuys] = useState<DdcaAccount[]>([]);
  const [loadingRecurringBuys, updateLoadingRecurringBuys] = useState(false);

  const setLoadingRecurringBuys = (value: boolean) => {
    updateLoadingRecurringBuys(value);
  }

  const setRecurringBuys = (recurringBuys: DdcaAccount[]) => {
    updateRecurringBuys(recurringBuys);
  }

  return (
    <AppStateContext.Provider
      value={{
        theme,
        tpsAvg,
        refreshInterval,
        isWhitelisted,
        isInBetaTestingProgram,
        detailsPanelOpen,
        shouldLoadTokens,
        isDepositOptionsModalVisible,
        tokenList,
        selectedToken,
        tokenBalance,
        fromCoinAmount,
        effectiveRate,
        coinPrices,
        loadingPrices,
        contract,
        ddcaOption,
        treasuryOption,
        recipientAddress,
        recipientNote,
        paymentStartDate,
        proposalEndDate,
        proposalEndTime,
        paymentRateAmount,
        lockPeriodAmount,
        paymentRateFrequency,
        lockPeriodFrequency,
        timeSheetRequirement,
        isVerifiedRecipient,
        isAllocationReserved,
        transactionStatus,
        previousWalletConnectState,
        loadingStreams,
        streamListv1,
        streamListv2,
        streamList,
        selectedStream,
        streamDetail,
        activeStream,
        deletedStreams,
        highLightableStreamId,
        streamProgramAddress,
        streamV2ProgramAddress,
        loadingStreamActivity,
        streamActivity,
        hasMoreStreamActivity,
        customStreamDocked,
        diagnosisInfo,
        splTokenList,
        userTokens,
        pinnedTokens,
        selectedAsset,
        transactions,
        accountAddress,
        lastTxSignature,
        addAccountPanelOpen,
        canShowAccountDetails,
        streamsSummary,
        lastStreamsSummary,
        loadingStreamsSummary,
        recurringBuys,
        loadingRecurringBuys,
        highLightableMultisigId,
        stakedAmount,
        unstakedAmount,
        unstakeStartDate,
        stakingMultiplier,
        setTheme,
        setTpsAvg,
        setDtailsPanelOpen,
        setShouldLoadTokens,
        showDepositOptionsModal,
        hideDepositOptionsModal,
        setSelectedToken,
        setSelectedTokenBalance,
        setFromCoinAmount,
        refreshPrices,
        setEffectiveRate,
        setCoinPrices,
        refreshTokenBalance,
        resetContractValues,
        resetStreamsState,
        refreshStreamList,
        setContract,
        setDdcaOption,
        setTreasuryOption,
        setRecipientAddress,
        setRecipientNote,
        setPaymentStartDate,
        setProposalEndDate,
        setProposalEndTime,
        setPaymentRateAmount,
        setLockPeriodAmount,
        setPaymentRateFrequency,
        setLockPeriodFrequency,
        setTimeSheetRequirement,
        setIsVerifiedRecipient,
        setIsAllocationReserved,
        setTransactionStatus,
        setPreviousWalletConnectState,
        setLoadingStreams,
        setStreamList,
        setSelectedStream,
        setStreamDetail,
        setDeletedStream,
        setHighLightableStreamId,
        openStreamById,
        getStreamActivity,
        setCustomStreamDocked,
        setDiagnosisInfo,
        setTransactions,
        setSelectedAsset,
        setAccountAddress,
        setAddAccountPanelOpen,
        setCanShowAccountDetails,
        setStreamsSummary,
        setLastStreamsSummary,
        setLoadingStreamsSummary,
        setRecurringBuys,
        setLoadingRecurringBuys,
        setHighLightableMultisigId,
        setStakedAmount,
        setUnstakedAmount,
        setUnstakeStartDate,
        setStakingMultiplier
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
