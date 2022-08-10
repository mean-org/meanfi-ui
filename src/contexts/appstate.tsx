import React, { useCallback, useEffect, useMemo, useState } from "react";
import { findATokenAddress, shortenAddress, useLocalStorageState } from "../utils/utils";
import {
  DAO_CORE_TEAM_WHITELIST,
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
  ONE_MINUTE_REFRESH_TIMEOUT
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
import { getPrices } from "../utils/api";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { UserTokenAccount } from "../models/transactions";
import { BANNED_TOKENS, MEAN_TOKEN_LIST, PINNED_TOKENS } from "../constants/token-list";
import { NATIVE_SOL } from "../utils/tokens";
import { MappedTransaction } from "../utils/history";
import { consoleOut, isProd, msToTime } from "../utils/ui";
import { appConfig } from "..";
import { DdcaAccount } from "@mean-dao/ddca";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { TreasuryTypeOption } from "../models/treasuries";
import { TREASURY_TYPE_OPTIONS } from "../constants/treasury-type-options";
import { initialSummary, StreamsSummary } from "../models/streams";
import { MSP, Stream } from "@mean-dao/msp";
import { AccountDetails } from "../models";
import { openNotification } from "../components/Notifications";
import { PerformanceCounter } from "../utils/perf-counter";
import { TokenPrice } from "../models/token";
import { ProgramAccounts } from "../utils/accounts";
import { MultisigVault } from "../models/multisig";
import moment from "moment";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../pages/accounts";
import { MultisigTransaction } from "@mean-dao/mean-multisig-sdk";

const pricesOldPerformanceCounter = new PerformanceCounter();
const pricesNewPerformanceCounter = new PerformanceCounter();
const refreshStreamsPerformanceCounter = new PerformanceCounter();
const listStreamsV1PerformanceCounter = new PerformanceCounter();
const listStreamsV2PerformanceCounter = new PerformanceCounter();
const streamDetailPerformanceCounter = new PerformanceCounter();

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
  isDepositOptionsModalVisible: boolean;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  tokenBalance: number;
  totalSafeBalance: number | undefined;
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
  activeTab: string;
  selectedTab: string;
  coolOffPeriodFrequency: PaymentRateType;
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
  programs: ProgramAccounts[] | undefined;
  multisigTxs: MultisigTransaction[] | undefined;
  selectedStream: Stream | StreamInfo | undefined;
  streamDetail: Stream | StreamInfo | undefined;
  activeStream: StreamInfo | Stream | undefined;
  deletedStreams: string[];
  highLightableStreamId: string | undefined;
  streamProgramAddress: string;
  streamV2ProgramAddress: string;
  loadingStreamActivity: boolean;
  streamActivity: StreamActivity[] | undefined;
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
  streamsSummary: StreamsSummary;
  lastStreamsSummary: StreamsSummary;
  // DDCAs
  ddcaOption: DdcaFrequencyOption | undefined;
  recurringBuys: DdcaAccount[];
  loadingRecurringBuys: boolean;
  // Multisig
  multisigSolBalance: number | undefined;
  multisigVaults: MultisigVault[];
  highLightableMultisigId: string | undefined;
  pendingMultisigTxCount: number | undefined;
  // Staking
  stakedAmount: string;
  unstakedAmount: string;
  unstakeStartDate: string | undefined;
  stakingMultiplier: number;
  // Routes
  previousRoute: string;
  setTheme: (name: string) => void;
  setTpsAvg: (value: number | null | undefined) => void;
  showDepositOptionsModal: () => void;
  hideDepositOptionsModal: () => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setTotalSafeBalance: (balance: number | undefined) => void;
  setFromCoinAmount: (data: string) => void;
  refreshPrices: () => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  getTokenPriceByAddress: (address: string) => number;
  getTokenPriceBySymbol: (symbol: string) => number;
  getTokenByMintAddress: (address: string) => TokenInfo | undefined;
  getUserTokenByMintAddress: (address: string) => TokenInfo | undefined;
  refreshTokenBalance: () => void;
  resetContractValues: () => void;
  resetStreamsState: () => void;
  clearStreams: () => void;
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
  setActiveTab: (data: string) => void;
  setSelectedTab: (data: string) => void;
  setCoolOffPeriodFrequency: (freq: PaymentRateType) => void;
  setPaymentRateFrequency: (freq: PaymentRateType) => void;
  setLockPeriodFrequency: (freq: PaymentRateType) => void;
  setTimeSheetRequirement: (req: TimesheetRequirementOption) => void;
  setIsVerifiedRecipient: (state: boolean) => void;
  setIsAllocationReserved: (state: boolean) => void;
  setTransactionStatus: (status: TransactionStatusInfo) => void;
  setPreviousWalletConnectState: (state: boolean) => void;
  setLoadingStreams: (state: boolean) => void;
  setStreamList: (list: Array<StreamInfo | Stream> | undefined) => void;
  setPrograms: (list: Array<ProgramAccounts> | undefined) => void;
  setMultisigTxs: (list: Array<MultisigTransaction> | undefined) => void;
  setSelectedStream: (stream: Stream | StreamInfo | undefined) => void;
  setActiveStream: (stream: Stream | StreamInfo | undefined) => void;
  setStreamDetail: (stream: Stream | StreamInfo | undefined) => void;
  setDeletedStream: (id: string) => void,
  setHighLightableStreamId: (id: string | undefined) => void,
  openStreamById: (streamId: string, dock: boolean) => void;
  getStreamActivity: (streamId: string, version: number, clearHistory?: boolean) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setDiagnosisInfo: (info: AccountDetails | undefined) => void;
  // Accounts
  setShouldLoadTokens: (state: boolean) => void;
  setTransactions: (map: MappedTransaction[] | undefined, addItems?: boolean) => void;
  setSelectedAsset: (asset: UserTokenAccount | undefined) => void;
  setAccountAddress: (address: string) => void;
  setAddAccountPanelOpen: (state: boolean) => void;
  setStreamsSummary: (summary: StreamsSummary) => void;
  setLastStreamsSummary: (summary: StreamsSummary) => void;
  // DDCAs
  setDdcaOption: (name: string) => void;
  setRecurringBuys: (recurringBuys: DdcaAccount[]) => void;
  setLoadingRecurringBuys: (state: boolean) => void;
  // Multisig
  setMultisigSolBalance: (balance: number | undefined) => void;
  setMultisigVaults: (list: Array<MultisigVault>) => void;
  setHighLightableMultisigId: (id: string | undefined) => void,
  setPendingMultisigTxCount: (id: number | undefined) => void,
  // Staking
  setStakedAmount: (data: string) => void;
  setUnstakedAmount: (data: string) => void;
  setUnstakeStartDate: (date: string) => void;
  setStakingMultiplier: (rate: number) => void;
  // Routes
  setPreviousRoute: (route: string) => void;
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  tpsAvg: undefined,
  refreshInterval: ONE_MINUTE_REFRESH_TIMEOUT,
  isWhitelisted: false,
  isInBetaTestingProgram: false,
  isDepositOptionsModalVisible: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  totalSafeBalance: undefined,
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
  activeTab: '',
  selectedTab: '',
  coolOffPeriodFrequency: PaymentRateType.PerDay,
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
  programs: undefined,
  multisigTxs: undefined,
  selectedStream: undefined,
  streamDetail: undefined,
  activeStream: undefined,
  deletedStreams: [],
  highLightableStreamId: undefined,
  streamProgramAddress: '',
  streamV2ProgramAddress: '',
  loadingStreamActivity: false,
  streamActivity: undefined,
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
  streamsSummary: initialSummary,
  lastStreamsSummary: initialSummary,
  // DDCAs
  ddcaOption: undefined,
  recurringBuys: [],
  loadingRecurringBuys: false,
  // Multisig
  multisigSolBalance: undefined,
  multisigVaults: [],
  highLightableMultisigId: undefined,
  pendingMultisigTxCount: undefined,
  // Staking
  stakedAmount: '',
  unstakedAmount: '',
  unstakeStartDate: 'undefined',
  stakingMultiplier: 1,
  // Routes
  previousRoute: '',
  setTheme: () => {},
  setTpsAvg: () => {},
  showDepositOptionsModal: () => {},
  hideDepositOptionsModal: () => {},
  setContract: () => {},
  setTreasuryOption: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
  setTotalSafeBalance: () => {},
  setFromCoinAmount: () => {},
  refreshPrices: () => {},
  setEffectiveRate: () => {},
  setCoinPrices: () => {},
  getTokenPriceByAddress: () => 0,
  getTokenPriceBySymbol: () => 0,
  getTokenByMintAddress: () => undefined,
  getUserTokenByMintAddress: () => undefined,
  refreshTokenBalance: () => {},
  resetContractValues: () => {},
  resetStreamsState: () => {},
  clearStreams: () => {},
  refreshStreamList: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setProposalEndDate: () => {},
  setProposalEndTime: () => {},
  setPaymentRateAmount: () => {},
  setLockPeriodAmount: () => {},
  setActiveTab: () => {},
  setSelectedTab: () => {},
  setCoolOffPeriodFrequency: () => {},
  setPaymentRateFrequency: () => {},
  setLockPeriodFrequency: () => {},
  setTimeSheetRequirement: () => {},
  setIsVerifiedRecipient: () => {},
  setIsAllocationReserved: () => {},
  setTransactionStatus: () => {},
  setPreviousWalletConnectState: () => {},
  setLoadingStreams: () => {},
  setStreamList: () => {},
  setPrograms: () => {},
  setMultisigTxs: () => {},
  setSelectedStream: () => {},
  setActiveStream: () => {},
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
  setStreamsSummary: () => {},
  setLastStreamsSummary: () => {},
  // DDCAs
  setDdcaOption: () => {},
  setRecurringBuys: () => {},
  setLoadingRecurringBuys: () => {},
  // Multisig
  setMultisigSolBalance: () => {},
  setMultisigVaults: () => {},
  setHighLightableMultisigId: () => {},
  setPendingMultisigTxCount: () => {},
  // Staking
  setStakedAmount: () => {},
  setUnstakedAmount: () => {},
  setUnstakeStartDate: () => {},
  setStakingMultiplier: () => {},
  // Routes
  setPreviousRoute: () => {},
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
  const today = new Date().toLocaleDateString("en-US");
  const tomorrow = moment().add(1, 'days').format('L');
  const timeDate = moment().format('hh:mm A');  
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [tpsAvg, setTpsAvg] = useState<number | null | undefined>(contextDefaultValues.tpsAvg);
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
  const [activeTab, updateActiveTab] = useState<string>(contextDefaultValues.activeTab);
  const [selectedTab, updateSelectedTab] = useState<string>(contextDefaultValues.selectedTab);
  const [coolOffPeriodFrequency, updateCoolOffPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerDay);
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
  const [streamActivity, setStreamActivity] = useState<StreamActivity[] | undefined>(undefined);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(contextDefaultValues.hasMoreStreamActivity);
  const [customStreamDocked, setCustomStreamDocked] = useState(contextDefaultValues.customStreamDocked);
  const [diagnosisInfo, setDiagnosisInfo] = useState<AccountDetails | undefined>(contextDefaultValues.diagnosisInfo);
  const [streamListv1, setStreamListv1] = useState<StreamInfo[] | undefined>();
  const [streamListv2, setStreamListv2] = useState<Stream[] | undefined>();
  const [streamList, setStreamList] = useState<Array<StreamInfo | Stream> | undefined>();
  const [programs, setPrograms] = useState<ProgramAccounts[] | undefined>();
  const [multisigTxs, setMultisigTxs] = useState<MultisigTransaction[] | undefined>();
  const [selectedStream, updateSelectedStream] = useState<Stream | StreamInfo | undefined>();
  const [streamDetail, updateStreamDetail] = useState<Stream | StreamInfo | undefined>();
  const [activeStream, setActiveStream] = useState<Stream | StreamInfo | undefined>();
  const [deletedStreams, setDeletedStreams] = useState<string[]>([]);
  const [highLightableStreamId, setHighLightableStreamId] = useState<string | undefined>(contextDefaultValues.highLightableStreamId);
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  const [highLightableMultisigId, setHighLightableMultisigId] = useState<string | undefined>(contextDefaultValues.highLightableMultisigId);
  const [multisigSolBalance, updateMultisigSolBalance] = useState<number | undefined>(contextDefaultValues.multisigSolBalance);
  const [pendingMultisigTxCount, setPendingMultisigTxCount] = useState<number | undefined>(contextDefaultValues.pendingMultisigTxCount);

  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number>(contextDefaultValues.tokenBalance);
  const [totalSafeBalance, updateTotalSafeBalance] = useState<number | undefined>(contextDefaultValues.totalSafeBalance);
  const [stakingMultiplier, updateStakingMultiplier] = useState<number>(contextDefaultValues.stakingMultiplier);
  const [coinPricesFromApi, setCoinPricesFromApi] = useState<TokenPrice[] | null>(null);
  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(contextDefaultValues.loadingPrices);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);
  const [stakedAmount, updateStakedAmount] = useState<string>(contextDefaultValues.stakedAmount);
  const [unstakedAmount, updatedUnstakeAmount] = useState<string>(contextDefaultValues.unstakedAmount);
  const [unstakeStartDate, updateUnstakeStartDate] = useState<string | undefined>(today);
  const [isDepositOptionsModalVisible, setIsDepositOptionsModalVisibility] = useState(false);
  const [accountAddress, updateAccountAddress] = useState('');
  const [splTokenList, updateSplTokenList] = useState<UserTokenAccount[]>(contextDefaultValues.splTokenList);
  const [userTokens, updateUserTokens] = useState<UserTokenAccount[]>(contextDefaultValues.userTokens);
  const [pinnedTokens, updatePinnedTokens] = useState<UserTokenAccount[]>(contextDefaultValues.pinnedTokens);
  const [transactions, updateTransactions] = useState<MappedTransaction[] | undefined>(contextDefaultValues.transactions);
  const [selectedAsset, updateSelectedAsset] = useState<UserTokenAccount | undefined>(contextDefaultValues.selectedAsset);
  const [lastTxSignature, setLastTxSignature] = useState<string>(contextDefaultValues.lastTxSignature);
  const [addAccountPanelOpen, updateAddAccountPanelOpen] = useState(contextDefaultValues.addAccountPanelOpen);
  const [streamsSummary, setStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.streamsSummary);
  const [lastStreamsSummary, setLastStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.lastStreamsSummary);
  const [previousRoute, setPreviousRoute] = useState<string>(contextDefaultValues.previousRoute);

  const isDowngradedPerformance = useMemo(() => {
    return isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD)
      ? true
      : false;
  }, [tpsAvg]);

  const streamProgramAddressFromConfig = appConfig.getConfig().streamProgramAddress;
  const streamV2ProgramAddressFromConfig = appConfig.getConfig().streamV2ProgramAddress;

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

  /**
   * Auto reload timeout breakdown
   * 
   * #s <= 5 30s * 2
   * #s > 5 & <= 25 40s * 2
   * #s > 25 & <= 60 50s * 2
   * #s > 60 & <= 100 70s * 2
   * #s > 100 5min is ok
   */
   const refreshInterval = useMemo(() => {
    if (!streamList || streamList.length <= 5) {
      return ONE_MINUTE_REFRESH_TIMEOUT;
    } else if (streamList.length > 5 && streamList.length <= 25) {
      return FORTY_SECONDS_REFRESH_TIMEOUT * 2;
    } else if (streamList.length > 25 && streamList.length <= 60) {
      return FIVETY_SECONDS_REFRESH_TIMEOUT * 2;
    } else if (streamList.length > 60 && streamList.length <= 100) {
      return SEVENTY_SECONDS_REFRESH_TIMEOUT * 2;
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

  const setActiveTab = (data: string) => {
    updateActiveTab(data);
  }

  const setSelectedTab = (data: string) => {
    updateSelectedTab(data);
  }

  const setCoolOffPeriodFrequency = (freq: PaymentRateType) => {
    updateCoolOffPeriodFrequency(freq);
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
    setActiveTab('');
    setSelectedTab('');
    setCoolOffPeriodFrequency(PaymentRateType.PerDay);
    setPaymentRateFrequency(PaymentRateType.PerMonth);
    setPaymentRateFrequency(PaymentRateType.PerMonth);
    setIsVerifiedRecipient(false);
    setIsAllocationReserved(false);
  }

  const clearStreams = () => {
    setStreamList([]);
    setStreamListv2([]);
    setStreamListv1([]);
  }

  const resetStreamsState = () => {
    setStreamList([]);
    setStreamActivity(undefined);
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

  const getTokenByMintAddress = useCallback((address: string): TokenInfo | undefined => {
    const tokenFromTokenList = splTokenList && isProd()
      ? splTokenList.find(t => t.address === address)
      : MEAN_TOKEN_LIST.find(t => t.address === address);
    if (tokenFromTokenList) {
      return tokenFromTokenList;
    }
    return undefined;
  }, [splTokenList]);

  const getUserTokenByMintAddress = useCallback((address: string): TokenInfo | undefined => {
    const tokenFromTokenList = splTokenList && isProd()
      ? splTokenList.find(t => t.address === address)
      : userTokens.find(t => t.address === address);
    if (tokenFromTokenList) {
      return tokenFromTokenList;
    }
    return undefined;
  }, [splTokenList, userTokens]);

  const openStreamById = async (streamId: string, dock = false) => {
    try {
      const streamPublicKey = new PublicKey(streamId);
      try {
        if (msp && publicKey) {
          const detail = await msp.getStream(streamPublicKey);
          consoleOut('customStream', detail);
          if (detail) {
            setStreamDetail(detail);
            setActiveStream(detail);
            if (dock) {
              setStreamList([detail]);
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

      if (clearHistory) {
        setStreamActivity(undefined);
        setHasMoreStreamActivity(true);
      }

      if (version < 2) {
        ms.listStreamActivity(streamPublicKey)
          .then(value => {
            consoleOut('activity:', value);
            setStreamActivity(value);
          })
          .catch(err => {
            console.error(err);
            setStreamActivity(undefined);
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
            setStreamActivity(undefined);
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
            updateStreamDetail(detail);
            setActiveStream(detail);
          }
        })
        .catch((error: any) => {
          console.error(error);
        });
    }
  }

  const setStreamDetail = (stream: Stream | StreamInfo | undefined) => {
    updateStreamDetail(stream);
  }

  const setDeletedStream = (id: string) => {
    setDeletedStreams(oldArray => [...oldArray, id]);
  }

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

  const setMultisigSolBalance = (balance: number | undefined) => {
    updateMultisigSolBalance(balance);
  }

  const setTotalSafeBalance = (balance: number | undefined) => {
    updateTotalSafeBalance(balance);
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

  const getTokenPriceByAddress = useCallback((address: string): number => {
    if (!address || !coinPricesFromApi || coinPricesFromApi.length === 0) { return 0; }

    const item = coinPricesFromApi.find(i => i.address === address);

    return item ? (item.price || 0) : 0;

  }, [coinPricesFromApi]);

  const getTokenPriceBySymbol = useCallback((symbol: string): number => {
    if (!symbol || !coinPrices) { return 0; }

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol] as number
      : 0;

  }, [coinPrices]);

  // Fetch coin prices
  const getCoinPrices = useCallback(async () => {

    try {
      pricesNewPerformanceCounter.start();
      const newPrices = await getPrices();
      pricesNewPerformanceCounter.stop();
      consoleOut(`Fetched price list in ${pricesNewPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
      if (newPrices && newPrices.length > 0) {
        const pricesMap: any = {};
        newPrices.forEach(tp => pricesMap[tp.symbol] = tp.price);
        const solPrice = pricesMap["SOL"];
        // Lets add wSOL to the list using SOL price
        if (solPrice) {
          pricesMap["WSOL"] = solPrice;
          pricesMap["wSOL"] = solPrice;
        }
        const solIndex = newPrices.findIndex(p => p.symbol === "SOL");
        const listCopy = JSON.parse(JSON.stringify(newPrices)) as TokenPrice[];
        if (solIndex !== -1) {
          listCopy[solIndex].address = NATIVE_SOL.address;
        }
        const sol = listCopy.find(p => p.symbol === "SOL");
        if (sol) {
          listCopy.push({
            symbol: 'wSOL',
            address: WRAPPED_SOL_MINT_ADDRESS,
            price: sol.price,
          });
          listCopy.push({
            symbol: 'WSOL',
            address: WRAPPED_SOL_MINT_ADDRESS,
            price: sol.price,
          });
        }
        setCoinPricesFromApi(listCopy);
        consoleOut('Price items:', newPrices.length, 'blue');
        consoleOut('Mapped prices:', pricesMap, 'blue');
        setCoinPrices(pricesMap);
      } else {
        consoleOut('New prices list:', 'NO PRICES RETURNED!', 'red');
        setCoinPrices({ "NO-TOKEN-VALUE": 1 });
      }
    } catch (error) {
      pricesOldPerformanceCounter.stop();
      setCoinPrices({ "NO-TOKEN-VALUE": 1 });
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

    if (!accountAddress && !userAddress && !publicKey) {
      return;
    }

    const userPk = userAddress
      ? userAddress
      : accountAddress
        ? new PublicKey(accountAddress)
        : publicKey as PublicKey;
    consoleOut('Fetching streams for:', userPk?.toBase58(), 'orange');

    if (msp) {
      updateLoadingStreams(true);

      const streamAccumulator: any[] = [];
      let rawStreamsv1: StreamInfo[] = [];
      let rawStreamsv2: Stream[] = [];

      // Reset all counters
      refreshStreamsPerformanceCounter.reset();
      listStreamsV1PerformanceCounter.reset();
      listStreamsV2PerformanceCounter.reset();
      streamDetailPerformanceCounter.reset();

      refreshStreamsPerformanceCounter.start();
      listStreamsV2PerformanceCounter.start();

      msp.listStreams({treasurer: userPk, beneficiary: userPk})
        .then(streamsv2 => {
          listStreamsV2PerformanceCounter.stop();
          streamAccumulator.push(...streamsv2);
          rawStreamsv2 = streamsv2;
          rawStreamsv2.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1);
          listStreamsV1PerformanceCounter.start();
          ms.listStreams({treasurer: userPk, beneficiary: userPk})
          .then(async streamsv1 => {
            listStreamsV1PerformanceCounter.stop();
            streamAccumulator.push(...streamsv1);
            rawStreamsv1 = streamsv1;
            rawStreamsv1.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1)
            streamAccumulator.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1)
            // Sort debugging block
            // if (!isProd()) {
            //   const debugTable: any[] = [];
            //   streamAccumulator.forEach(item => debugTable.push({
            //     createdBlockTime: item.createdBlockTime,
            //     name: item.version < 2 ? item.streamName : item.name.trim(),
            //   }));
            //   console.table(debugTable);
            // }
            // End of debugging block
            setStreamList(streamAccumulator);
            setStreamListv2(rawStreamsv2);
            setStreamListv1(rawStreamsv1);
            consoleOut('Streams:', streamAccumulator, 'blue');
            setDeletedStreams([]);
            if (streamAccumulator.length) {
              let item: Stream | StreamInfo | undefined;
              if (reset) {
                item = streamAccumulator[0];
              } else {
                if (highLightableStreamId) {
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

              const mspInstance: any = item && item.version < 2 ? ms : msp;
              streamDetailPerformanceCounter.start();
              mspInstance.getStream(new PublicKey(item?.id as string))
              .then((detail: Stream | StreamInfo) => {
                streamDetailPerformanceCounter.stop();
                refreshStreamsPerformanceCounter.stop();
                // if (!isProd()) {
                //   consoleOut('listStreams performance counter:', '', 'crimson');
                //   const results = [{
                //     v2_Streams: `${listStreamsV2PerformanceCounter.elapsedTime.toLocaleString()}ms`,
                //     v1_Streams: `${listStreamsV1PerformanceCounter.elapsedTime.toLocaleString()}ms`,
                //     streamDetails: `${streamDetailPerformanceCounter.elapsedTime.toLocaleString()}ms`,
                //     total: `${refreshStreamsPerformanceCounter.elapsedTime.toLocaleString()}ms`,
                //   }];
                //   console.table(results);
                // }
                if (detail) {
                  updateStreamDetail(detail);
                  setActiveStream(detail);
                } else if (item) {
                  updateStreamDetail(item);
                  setActiveStream(item);
                }
              })
            } else {
              updateSelectedStream(undefined);
              updateStreamDetail(undefined);
              setActiveStream(undefined);
            }
          })
          .catch(err => {
            console.error(err);
          })
          .finally(() => {
            updateLoadingStreams(false);
            consoleOut('listStreams performance counter:', 'Pending streamDetails...', 'crimson');
          });
        }).catch(err => {
          console.error(err);
        });
    }

  }, [
    ms,
    msp,
    publicKey,
    accountAddress,
    loadingStreams,
    selectedStream,
    customStreamDocked,
    highLightableStreamId,
  ]);


  /**
   * Streams refresh timeout
   * 
   * If TPS values are critical we should NOT schedule at all
   * and resume when TPS goes up again.
   */
  useEffect(() => {
    let timer: any;

    if (accountAddress && location.pathname.startsWith(ACCOUNTS_ROUTE_BASE_PATH) && !customStreamDocked && !isDowngradedPerformance) {
      timer = setInterval(() => {
        consoleOut(`Refreshing streams past ${msToTime(FIVE_MINUTES_REFRESH_TIMEOUT)}...`);
        refreshStreamList();
      }, FIVE_MINUTES_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    location,
    accountAddress,
    customStreamDocked,
    isDowngradedPerformance,
    refreshStreamList,
  ]);

  const refreshTokenBalance = useCallback(async () => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (!selectedToken || !(selectedToken as TokenInfo).address ) {
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

    let balance = 0;
    const selectedTokenAddress = await findATokenAddress(publicKey as PublicKey, new PublicKey(selectedToken.address));
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

  const setAddAccountPanelOpen = (state: boolean) => {
    updateAddAccountPanelOpen(state);
  }

  const setTransactions = (map: MappedTransaction[] | undefined, addItems?: boolean) => {
    if (!addItems) {
      if (map && map.length === TRANSACTIONS_PER_PAGE) {
        const lastSignature = map[map.length - 1].signature;
        setLastTxSignature(lastSignature);
      } else {
        setLastTxSignature('');
      }
      // Get a unique set of items
      const filtered = new Set(map);
      // Convert iterable to array
      updateTransactions(Array.from(filtered));
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
        // Get a unique set of items
        const filtered = new Set(jointArray);
        // Convert iterable to array
        updateTransactions(Array.from(filtered));
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
      // First add Native SOL as a token
      list.push(sol);
      // Add pinned tokens from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster) && PINNED_TOKENS.includes(t.symbol))
        .forEach(item => list.push(item));
      // Save pinned tokens' list
      const pinned = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
      updatePinnedTokens(pinned);
      // Add non-pinned tokens from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster) && !PINNED_TOKENS.includes(t.symbol))
        .forEach(item => list.push(item));
      // Save the MeanFi list
      updateTokenlist(list.filter(t => t.address !== NATIVE_SOL.address) as TokenInfo[]);
      // Update the list
      const userTokenList = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
      consoleOut('userTokenList:', userTokenList, 'purple');
      updateUserTokens(userTokenList);
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
        shouldLoadTokens,
        isDepositOptionsModalVisible,
        tokenList,
        selectedToken,
        tokenBalance,
        totalSafeBalance,
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
        activeTab,
        selectedTab,
        coolOffPeriodFrequency,
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
        programs,
        multisigTxs,
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
        streamsSummary,
        lastStreamsSummary,
        recurringBuys,
        loadingRecurringBuys,
        multisigSolBalance,
        multisigVaults,
        highLightableMultisigId,
        pendingMultisigTxCount,
        stakedAmount,
        unstakedAmount,
        unstakeStartDate,
        stakingMultiplier,
        previousRoute,
        setTheme,
        setTpsAvg,
        setShouldLoadTokens,
        showDepositOptionsModal,
        hideDepositOptionsModal,
        setSelectedToken,
        setSelectedTokenBalance,
        setTotalSafeBalance,
        setFromCoinAmount,
        refreshPrices,
        setEffectiveRate,
        setCoinPrices,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
        getUserTokenByMintAddress,
        refreshTokenBalance,
        resetContractValues,
        resetStreamsState,
        clearStreams,
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
        setActiveTab,
        setSelectedTab,
        setCoolOffPeriodFrequency,
        setPaymentRateFrequency,
        setLockPeriodFrequency,
        setTimeSheetRequirement,
        setIsVerifiedRecipient,
        setIsAllocationReserved,
        setTransactionStatus,
        setPreviousWalletConnectState,
        setLoadingStreams,
        setStreamList,
        setPrograms,
        setMultisigTxs,
        setSelectedStream,
        setActiveStream,
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
        setStreamsSummary,
        setLastStreamsSummary,
        setRecurringBuys,
        setLoadingRecurringBuys,
        setMultisigSolBalance,
        setMultisigVaults,
        setHighLightableMultisigId,
        setPendingMultisigTxCount,
        setStakedAmount,
        setUnstakedAmount,
        setUnstakeStartDate,
        setStakingMultiplier,
        setPreviousRoute,
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
