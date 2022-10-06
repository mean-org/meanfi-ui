import { DdcaAccount } from "@mean-dao/ddca";
import { MeanMultisig, MultisigInfo, MultisigTransaction, MultisigTransactionStatus } from "@mean-dao/mean-multisig-sdk";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { StreamActivity, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { MSP, Stream } from "@mean-dao/msp";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { TokenInfo } from "models/SolanaTokenInfo";
import { TokenPrice } from "models/TokenPrice";
import moment from "moment";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { appConfig, customLogger } from "..";
import { isCacheItemExpired } from "../cache/persistentCache";
import { openNotification } from "../components/Notifications";
import {
  DAO_CORE_TEAM_WHITELIST,
  DDCA_FREQUENCY_OPTIONS, FIVETY_SECONDS_REFRESH_TIMEOUT, FIVE_MINUTES_REFRESH_TIMEOUT, FORTY_SECONDS_REFRESH_TIMEOUT, ONE_MINUTE_REFRESH_TIMEOUT, PERFORMANCE_THRESHOLD, SEVENTY_SECONDS_REFRESH_TIMEOUT, THIRTY_MINUTES_REFRESH_TIMEOUT, TRANSACTIONS_PER_PAGE,
  WRAPPED_SOL_MINT_ADDRESS
} from "../constants";
import { BANNED_TOKENS, MEAN_TOKEN_LIST, NATIVE_SOL } from "../constants/tokens";
import { TREASURY_TYPE_OPTIONS } from "../constants/treasury-type-options";
import { getUserAccountTokens } from "../middleware/accounts";
import { getPrices, getSolanaTokenListKeyNameByCluster, getSplTokens, getSolFlareTokenList } from "../middleware/api";
import { MappedTransaction } from "../middleware/history";
import { PerformanceCounter } from "../middleware/perf-counter";
import { consoleOut, isProd, msToTime } from "../middleware/ui";
import { findATokenAddress, getAmountFromLamports, shortenAddress, useLocalStorageState } from "../middleware/utils";
import { AccountContext, AccountDetails, ProgramAccounts, UserTokenAccount, UserTokensResponse } from "../models/accounts";
import { DdcaFrequencyOption } from "../models/ddca-models";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { MultisigVault } from "../models/multisig";
import { initialSummary, StreamsSummary } from "../models/streams";
import { TreasuryTypeOption } from "../models/treasuries";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../pages/accounts";
import { useAccountsContext } from "./accounts";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from "./connection";
import { useWallet } from "./wallet";

const pricesPerformanceCounter = new PerformanceCounter();
const tokenListPerformanceCounter = new PerformanceCounter();
const listStreamsV1PerformanceCounter = new PerformanceCounter();
const listStreamsV2PerformanceCounter = new PerformanceCounter();

export type TpsAverageValues = number | null | undefined;
export type StreamValues = Stream | StreamInfo | undefined;

export interface TransactionStatusInfo {
  customError?: any;
  lastOperation?: TransactionStatus;
  currentOperation?: TransactionStatus;
}

interface AppStateConfig {
  // Account selection
  isSelectingAccount: boolean;
  selectedAccount: AccountContext;
  rememberAccount: boolean;
  // General
  theme: string | undefined;
  tpsAvg: TpsAverageValues;
  refreshInterval: number;
  isWhitelisted: boolean;
  isDepositOptionsModalVisible: boolean;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  tokenBalance: number;
  totalSafeBalance: number | undefined;
  fromCoinAmount: string;
  effectiveRate: number;
  coinPrices: any | null;
  priceList: TokenPrice[] | null;
  loadingPrices: boolean;
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
  selectedStream: StreamValues;
  streamDetail: StreamValues;
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
  // Accounts page
  shouldLoadTokens: boolean;
  loadingTokenAccounts: boolean;
  userTokensResponse: UserTokensResponse | null;
  tokensLoaded: boolean;
  splTokenList: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  transactions: MappedTransaction[] | undefined;
  lastTxSignature: string;
  addAccountPanelOpen: boolean;
  streamsSummary: StreamsSummary;
  lastStreamsSummary: StreamsSummary;
  // DDCAs
  ddcaOption: DdcaFrequencyOption | undefined;
  recurringBuys: DdcaAccount[];
  loadingRecurringBuys: boolean;
  // Multisig
  multisigAccounts: MultisigInfo[];
  loadingMultisigAccounts: boolean;
  loadingMultisigTxPendingCount: boolean;
  needReloadMultisigAccounts: boolean;
  selectedMultisig: MultisigInfo | undefined;
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
  // Account selection
  setIsSelectingAccount: (state: boolean) => void;
  setSelectedAccount: (account: AccountContext) => void;
  setRememberAccount: (state: boolean) => void;
  getAssetsByAccount: (address: string) => Promise<UserTokensResponse | null> | null;
  // General
  setTheme: (name: string) => void;
  setTpsAvg: (value: TpsAverageValues) => void;
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
  refreshTokenBalance: () => void;
  resetContractValues: () => void;
  resetStreamsState: () => void;
  clearStreams: () => void;
  refreshStreamList: (reset?: boolean, userAddress?: PublicKey) => void;
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
  setSelectedStream: (stream: StreamValues) => void;
  setActiveStream: (stream: StreamValues) => void;
  setStreamDetail: (stream: StreamValues) => void;
  setDeletedStream: (id: string) => void,
  setHighLightableStreamId: (id: string | undefined) => void,
  openStreamById: (streamId: string, dock: boolean) => void;
  getStreamActivity: (streamId: string, version: number, clearHistory?: boolean) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setDiagnosisInfo: (info: AccountDetails | undefined) => void;
  // Accounts page
  setShouldLoadTokens: (state: boolean) => void;
  setTransactions: (map: MappedTransaction[] | undefined, addItems?: boolean) => void;
  setSelectedAsset: (asset: UserTokenAccount | undefined) => void;
  setAddAccountPanelOpen: (state: boolean) => void;
  setStreamsSummary: (summary: StreamsSummary) => void;
  setLastStreamsSummary: (summary: StreamsSummary) => void;
  // DDCAs
  setDdcaOption: (name: string) => void;
  setRecurringBuys: (recurringBuys: DdcaAccount[]) => void;
  setLoadingRecurringBuys: (state: boolean) => void;
  // Multisig
  setNeedReloadMultisigAccounts: (reload: boolean) => void;
  refreshMultisigs: (reset: boolean) => Promise<MultisigInfo | undefined>;
  setMultisigAccounts: (accounts: MultisigInfo[]) => void;
  setSelectedMultisig: (multisig: MultisigInfo | undefined) => void;
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
  // Account selection
  isSelectingAccount: true,
  selectedAccount: { address: '', name: '', isMultisig: false },
  rememberAccount: false,
  // General
  theme: undefined,
  tpsAvg: undefined,  // undefined at first (never had a value), null = couldn't get, number the value successfully retrieved
  refreshInterval: ONE_MINUTE_REFRESH_TIMEOUT,
  isWhitelisted: false,
  isDepositOptionsModalVisible: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  totalSafeBalance: undefined,
  fromCoinAmount: '',
  effectiveRate: 0,
  coinPrices: null,
  priceList: null,
  loadingPrices: false,
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
  // Accounts page
  shouldLoadTokens: true,
  loadingTokenAccounts: true,
  userTokensResponse: null,
  tokensLoaded: false,
  splTokenList: [],
  selectedAsset: undefined,
  transactions: undefined,
  lastTxSignature: '',
  addAccountPanelOpen: true,
  streamsSummary: initialSummary,
  lastStreamsSummary: initialSummary,
  // DDCAs
  ddcaOption: undefined,
  recurringBuys: [],
  loadingRecurringBuys: false,
  // Multisig
  multisigAccounts: [],
  loadingMultisigAccounts: false,
  loadingMultisigTxPendingCount: false,
  needReloadMultisigAccounts: true,
  selectedMultisig: undefined,
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
  // Account selection
  setIsSelectingAccount: () => {},
  setSelectedAccount: () => {},
  setRememberAccount: () => {},
  getAssetsByAccount: () => null,
  // General
  setTheme: () => {},
  setTpsAvg: () => {},
  showDepositOptionsModal: () => {},
  hideDepositOptionsModal: () => {},
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
  // Accounts page
  setShouldLoadTokens: () => {},
  setTransactions: () => {},
  setSelectedAsset: () => {},
  setAddAccountPanelOpen: () => {},
  setStreamsSummary: () => {},
  setLastStreamsSummary: () => {},
  // DDCAs
  setDdcaOption: () => {},
  setRecurringBuys: () => {},
  setLoadingRecurringBuys: () => {},
  // Multisig
  setNeedReloadMultisigAccounts: () => {},
  refreshMultisigs: async () => undefined,
  setMultisigAccounts: () => {},
  setSelectedMultisig: () => {},
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
  // Account selection
  const [isSelectingAccount, updateIsSelectingAccount] = useState<boolean>(contextDefaultValues.isSelectingAccount);
  const [rememberAccount, updateRememberAccount] = useLocalStorageState("rememberAccount", `${contextDefaultValues.rememberAccount}`);
  const [isWhitelisted, setIsWhitelisted] = useState(contextDefaultValues.isWhitelisted);
  const today = new Date().toLocaleDateString("en-US");
  const tomorrow = moment().add(1, 'days').format('L');
  const timeDate = moment().format('hh:mm A');  
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [tpsAvg, setTpsAvg] = useState<TpsAverageValues>(contextDefaultValues.tpsAvg);
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
  const [selectedStream, updateSelectedStream] = useState<StreamValues>();
  const [streamDetail, updateStreamDetail] = useState<StreamValues>();
  const [activeStream, setActiveStream] = useState<StreamValues>();
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
  const [priceList, setPriceList] = useState<TokenPrice[] | null>(null);
  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(contextDefaultValues.loadingPrices);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);
  const [stakedAmount, updateStakedAmount] = useState<string>(contextDefaultValues.stakedAmount);
  const [unstakedAmount, updatedUnstakeAmount] = useState<string>(contextDefaultValues.unstakedAmount);
  const [unstakeStartDate, updateUnstakeStartDate] = useState<string | undefined>(today);
  const [isDepositOptionsModalVisible, setIsDepositOptionsModalVisibility] = useState(false);
  const [selectedAccount, updateSelectedAccount] = useState<AccountContext>(contextDefaultValues.selectedAccount);
  const [splTokenList, updateSplTokenList] = useState<UserTokenAccount[]>(contextDefaultValues.splTokenList);
  const [transactions, updateTransactions] = useState<MappedTransaction[] | undefined>(contextDefaultValues.transactions);
  const [selectedAsset, updateSelectedAsset] = useState<UserTokenAccount | undefined>(contextDefaultValues.selectedAsset);
  const [lastTxSignature, setLastTxSignature] = useState<string>(contextDefaultValues.lastTxSignature);
  const [addAccountPanelOpen, updateAddAccountPanelOpen] = useState(contextDefaultValues.addAccountPanelOpen);
  const [streamsSummary, setStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.streamsSummary);
  const [lastStreamsSummary, setLastStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.lastStreamsSummary);
  const [previousRoute, setPreviousRoute] = useState<string>(contextDefaultValues.previousRoute);
  const [meanTokenList, setMeanTokenlist] = useState<UserTokenAccount[] | undefined>(undefined);
  const [tokensLoaded, setTokensLoaded] = useState(contextDefaultValues.tokensLoaded);
  const [shouldLoadTokens, updateShouldLoadTokens] = useState(contextDefaultValues.shouldLoadTokens);
  const [loadingTokenAccounts, setLoadingTokenAccounts] = useState(contextDefaultValues.loadingTokenAccounts);
  const [userTokensResponse, setUserTokensResponse] = useState<UserTokensResponse | null>(contextDefaultValues.userTokensResponse);
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);

  const isDowngradedPerformance = useMemo(() => {
    return isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD)
      ? true
      : false;
  }, [tpsAvg]);

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);
  const streamProgramAddress = useMemo(() => appConfig.getConfig().streamProgramAddress, []);
  const streamV2ProgramAddress = useMemo(() => appConfig.getConfig().streamV2ProgramAddress, []);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    return new MSP(
      connectionConfig.endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    connectionConfig.endpoint,
    streamV2ProgramAddress
  ]);

  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed",
      multisigAddressPK
    );

  }, [
    publicKey,
    connection,
    multisigAddressPK,
    connectionConfig.endpoint,
  ]);

  useEffect(() => {
    consoleOut('rememberAccount:', rememberAccount, 'blue');
  }, [rememberAccount]);

  const setTheme = (name: string) => {
    updateTheme(name);
  }

  const setIsSelectingAccount = (state: boolean) => {
    updateIsSelectingAccount(state);
  }

  const setRememberAccount = (state: boolean) => {
    updateRememberAccount(state);
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

  // Set theme option to html tag
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  // Update isWhitelisted
  useEffect(() => {
    const updateIsWhitelisted = () => {
      if (!publicKey) {
        setIsWhitelisted(false);
        customLogger.canLogToConsole = false;
      } else {
        const isWl = DAO_CORE_TEAM_WHITELIST.some(a => a === publicKey.toBase58());
        customLogger.canLogToConsole = isWl;
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
    let token = splTokenList && isProd()
      ? tokenList.find(t => t.address === address)
      : undefined;
    if (!token) {
      token = MEAN_TOKEN_LIST.find(t => t.address === address);
    }
    if (!token) {
      token = accountTokens.find(t => t.address === address);
    }
    return token;
  }, [accountTokens, splTokenList, tokenList]);

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
                description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId, 10)}),
                type: "error"
              });
            }
          }
        } else {
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error('customStream', error);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId, 10)}),
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
        const signature = streamActivity && streamActivity.length > 0
          ? streamActivity[streamActivity.length - 1].signature
          : '';
        const before = clearHistory ? '' : signature;
        consoleOut('before:', before, 'crimson');
        msp.listStreamActivity(streamPublicKey, before, 5)
          .then((value: StreamActivity[]) => {
            consoleOut('activity:', value);
            const currentActivity = streamActivity && streamActivity.length > 0
              ? JSON.parse(JSON.stringify(streamActivity))
              : [];
            const activities = clearHistory ? [] : currentActivity;
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

  const setSelectedStream = (stream: StreamValues) => {
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

  const setStreamDetail = (stream: StreamValues) => {
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
    getCoinPrices(false);
  }

  const getTokenPriceByAddress = useCallback((address: string): number => {
    if (!address || !priceList || priceList.length === 0) { return 0; }

    const item = priceList.find(i => i.address === address);

    return item ? (item.price || 0) : 0;

  }, [priceList]);

  const getTokenPriceBySymbol = useCallback((symbol: string): number => {
    if (!symbol || !coinPrices) { return 0; }

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol] as number
      : 0;

  }, [coinPrices]);

  const mapPrices = useCallback((prices: TokenPrice[]) => {
    if (prices && prices.length > 0) {
      const pricesMap: any = {};
      prices.forEach(tp => pricesMap[tp.symbol] = tp.price);
      const solPrice = pricesMap["SOL"];
      // Lets add wSOL to the list using SOL price
      if (solPrice) {
        pricesMap["WSOL"] = solPrice;
        pricesMap["wSOL"] = solPrice;
      }
      const solIndex = prices.findIndex(p => p.symbol === "SOL");
      const listCopy = JSON.parse(JSON.stringify(prices)) as TokenPrice[];
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
      setPriceList(listCopy);
      consoleOut('Price items:', prices.length, 'blue');
      consoleOut('Mapped prices:', pricesMap, 'blue');
      setCoinPrices(pricesMap);
    } else {
      consoleOut('New prices list:', 'NO PRICES RETURNED!', 'red');
      setCoinPrices({ "NO-TOKEN-VALUE": 1 });
    }
  }, []);

  // Fetch coin prices
  const getCoinPrices = useCallback(async (fromCache = true) => {

    try {
      setLoadingPrices(true);
      pricesPerformanceCounter.start();
      const isExpired = isCacheItemExpired('coin-prices', THIRTY_MINUTES_REFRESH_TIMEOUT);
      const honorCache = fromCache && !isExpired ? true : false;
      const newPrices = await getPrices(honorCache);
      pricesPerformanceCounter.stop();
      consoleOut(`Fetched price list in ${pricesPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
      mapPrices(newPrices);
    } catch (error) {
      setCoinPrices({ "NO-TOKEN-VALUE": 1 });
      updateEffectiveRate(0);
      consoleOut('New prices API error:', error, 'red');
    } finally {
      setLoadingPrices(false);
    }

  },[mapPrices]);

  // Effect to load coin prices
  useEffect(() => {

    const coinTimer = window.setInterval(() => {
      consoleOut(`Refreshing prices past ${THIRTY_MINUTES_REFRESH_TIMEOUT / 60 / 1000}min...`);
      getCoinPrices();
    }, THIRTY_MINUTES_REFRESH_TIMEOUT);

    // Return callback to run on unmount.
    return () => {
      if (coinTimer) {
        window.clearInterval(coinTimer);
      }
    };
  }, [getCoinPrices]);

  // Update token price while list of prices change
  useEffect(() => {
    if (coinPrices && selectedToken) {
      const price = coinPrices[selectedToken.address] ? coinPrices[selectedToken.address] : 0;
      updateEffectiveRate(price);
    }
  }, [coinPrices, selectedToken]);

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

    if (!selectedAccount.address && !userAddress && !publicKey) {
      return;
    }

    const fallback = selectedAccount.address
      ? new PublicKey(selectedAccount.address)
      : publicKey as PublicKey;
    const userPk = userAddress || fallback;
    consoleOut('Fetching streams for:', userPk?.toBase58(), 'orange');

    if (msp) {
      updateLoadingStreams(true);

      const streamAccumulator: any[] = [];
      let rawStreamsv1: StreamInfo[] = [];
      let rawStreamsv2: Stream[] = [];

      // Reset all counters
      listStreamsV1PerformanceCounter.reset();
      listStreamsV2PerformanceCounter.reset();
      listStreamsV2PerformanceCounter.start();

      msp.listStreams({ treasurer: userPk, beneficiary: userPk })
        .then(streamsv2 => {
          consoleOut('streamsv2 from AppSate:', streamsv2, 'blue');
          listStreamsV2PerformanceCounter.stop();
          streamAccumulator.push(...streamsv2);
          rawStreamsv2 = streamsv2;
          rawStreamsv2.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime))) ? 1 : -1);
          listStreamsV1PerformanceCounter.start();
          ms.listStreams({ treasurer: userPk, beneficiary: userPk })
          .then(async streamsv1 => {
            listStreamsV1PerformanceCounter.stop();
            consoleOut(`listStreams performance counter: ${tokenListPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
            streamAccumulator.push(...streamsv1);
            rawStreamsv1 = streamsv1;
            rawStreamsv1.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime))) ? 1 : -1)
            streamAccumulator.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime))) ? 1 : -1)
            // Start debugging block
            if (!isProd()) {
              const debugTable: any[] = [];
              streamAccumulator.forEach(item => debugTable.push({
                version: item.version,
                name: item.version < 2 ? item.streamName : item.name.trim(),
                streamId: shortenAddress(item.id, 8)
              }));
              console.table(debugTable);
            }
            // End of debugging block
            setStreamList(streamAccumulator);
            setStreamListv2(rawStreamsv2);
            setStreamListv1(rawStreamsv1);
            consoleOut('Streams from AppSate:', streamAccumulator, 'blue');
            if (streamDetail) {
              const streamId = streamDetail.version < 2 ? (streamDetail as StreamInfo).id as string : (streamDetail as Stream).id.toBase58();
              const item = streamAccumulator.find(s => {
                const id = s.version < 2 ? (s as StreamInfo).id as string : (s as Stream).id.toBase58();
                return id === streamId;
              });
              if (item) {
                setStreamDetail(item);
              }
            }
            setDeletedStreams([]);
          })
          .catch(err => {
            console.error(err);
          })
          .finally(() => {
            updateLoadingStreams(false);
          });
        }).catch(err => {
          console.error(err);
        });
    }

  }, [
    ms,
    msp,
    publicKey,
    streamDetail,
    selectedAccount.address,
    loadingStreams,
    customStreamDocked,
  ]);


  /**
   * Streams refresh timeout
   * 
   * If TPS values are critical we should NOT schedule at all
   * and resume when TPS goes up again.
   */
  useEffect(() => {
    if (!publicKey) { return; }

    let timer: any;

    if (selectedAccount.address && location.pathname.startsWith(ACCOUNTS_ROUTE_BASE_PATH) && !customStreamDocked && !isDowngradedPerformance) {
      timer = setInterval(() => {
        consoleOut(`Refreshing streams past ${msToTime(FIVE_MINUTES_REFRESH_TIMEOUT)}...`);
        refreshStreamList();
      }, FIVE_MINUTES_REFRESH_TIMEOUT);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    }
  }, [
    location,
    selectedAccount.address,
    customStreamDocked,
    isDowngradedPerformance,
    refreshStreamList,
  ]);

  const refreshTokenBalance = useCallback(async () => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (!selectedToken || !selectedToken.address ) {
      return;
    }

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (!address) return 0;
      try {
        const accountInfo = await connection.getAccountInfo(address.toPublicKey());
        if (!accountInfo) return 0;
        if (address === publicKey?.toBase58()) {
          return getAmountFromLamports(accountInfo.lamports);
        }
        const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
        return tokenAmount.uiAmount || 0;
      } catch (error) {
        console.error(error);
        throw(error);
      }
    }

    let balance = 0;
    const selectedTokenAddress = await findATokenAddress(publicKey, new PublicKey(selectedToken.address));
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

  const setSelectedAccount = (account: AccountContext) => {
    consoleOut('Account selected:', account, 'blue');
    updateTransactions([]);
    updateSelectedAccount(account);
  }

  // Fetch token list
  const getTokenList = useCallback(async () => {

    try {
      tokenListPerformanceCounter.start();
      const targetChain = getNetworkIdByCluster(connectionConfig.cluster);
      const cacheEntryKey = getSolanaTokenListKeyNameByCluster(targetChain);
      const honorCache = isCacheItemExpired(cacheEntryKey) ? false : true;
      const tokenList = await getSplTokens(targetChain, honorCache);
      tokenListPerformanceCounter.stop();
      consoleOut(`Fetched token list in ${tokenListPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
      if (tokenList && tokenList.length > 0) {
        const newTokenList: TokenInfo[] = []
        const newPriceList: TokenPrice[] = [];
        for (const token of tokenList) {
          const item: TokenInfo = {
            address: token.mint,
            name: token.name,
            chainId: targetChain,
            decimals: token.decimals,
            symbol: token.symbol,
            logoURI: token.mint === NATIVE_SOL.address ? NATIVE_SOL.logoURI : token.image,
            extensions: undefined,
            tags: []
          };
          newTokenList.push(item);
          if (token.priceUsd) {
            const priceItem: TokenPrice = {
              address: token.mint,
              symbol: token.symbol,
              price: token.priceUsd
            };
            newPriceList.push(priceItem);
          }
        }
        const filtered = newTokenList.filter(t => t.decimals !== null);
        consoleOut('API token list items:', filtered.length, 'blue');
        setMeanTokenlist(filtered);
        if (newPriceList.length > 0) {
          mapPrices(newPriceList);
        } else {
          getCoinPrices();
        }
      } else {
        consoleOut('Trying Solflare Unified Token List...', '', 'blue');
        const response = await getSolFlareTokenList();
        if (response && response.tokens && response.tokens.length > 0) {
          const withDecimals = response.tokens.filter((t: any) => t.decimals && t.decimals > 0);
          consoleOut('Solflare utl:', withDecimals.length, 'blue');
          setMeanTokenlist(withDecimals);
          getCoinPrices();
        }
      }
    } catch (error) {
      consoleOut('Token list API error:', error, 'red');
    } finally {
      tokenListPerformanceCounter.reset();
    }

  },[getCoinPrices, mapPrices]);

  // Only get the token list once per page reload
  useEffect(() => {
    if(meanTokenList === undefined) {
      consoleOut('Fetching the new token list...', '', 'blue');
      getTokenList();
    }
  }, [getTokenList, meanTokenList]);


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
      // Add items from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster))
        .forEach(item => list.push(item));
      // Save the MeanFi list
      updateTokenlist(list.filter(t => t.address !== NATIVE_SOL.address) as TokenInfo[]);
      // Update the list
      const userTokenList = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
      // Add the items from the API
      if (meanTokenList && meanTokenList.length > 0) {
        meanTokenList.forEach(item => {
          if (!userTokenList.some(i => i.address === item.address)) {
            userTokenList.push(item);
          }
        });
      }
      // Filter out the banned tokens
      const filteredTokens = userTokenList.filter(t => !BANNED_TOKENS.some(bt => bt === t.symbol));
      // Sort the big list
      const sortedMainnetList = [...filteredTokens].sort((a, b) => {
        const nameA = a.symbol.toUpperCase();
        const nameB = b.symbol.toUpperCase();
        if (nameA < nameB) {
          return -1;
        }
        if (nameA > nameB) {
          return 1;
        }
        return 0;
      });
      updateSplTokenList(sortedMainnetList);
    })();

    return () => { }

  }, [connectionConfig.cluster, meanTokenList]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  // Also, do this after any Tx is completed in places where token balances were indeed changed)
  useEffect(() => {

    if (!connection ||
        !publicKey ||
        !selectedAccount.address ||
        !shouldLoadTokens ||
        isSelectingAccount ||
        !splTokenList) {
      return;
    }

    setLoadingTokenAccounts(true);
    updateShouldLoadTokens(false);
    setTokensLoaded(false);
    consoleOut('calling getUserAccountTokens from:', 'AppState', 'darkgreen');

    getUserAccountTokens(
      connection,
      selectedAccount.address,
      priceList,
      splTokenList,
    ).then(response => {
      if (response) {
        setUserTokensResponse(response);
        setAccountTokens(response.accountTokens);
      } else {
        setUserTokensResponse(null);
        setAccountTokens([]);
      }
    }).finally(() => {
      setTokensLoaded(true);
      setLoadingTokenAccounts(false);
    });

    return () => {}

  }, [selectedAccount.address, connection, priceList, publicKey, shouldLoadTokens, splTokenList]);

  // Same as above but on demand
  const getAssetsByAccount = useCallback((account: string) => {

    if (!connection ||
        !publicKey ||
        !account ||
        !priceList
    ) {
      return null;
    }

    setLoadingTokenAccounts(true);
    setTokensLoaded(false);
    consoleOut('calling getUserAccountTokens from:', 'getAssetsByAccount', 'darkgreen');

    return getUserAccountTokens(
      connection,
      account,
      priceList,
      splTokenList,
    ).then(response => {
      if (response) {
        return response;
      } else {
        return null;
      }
    }).finally(() => {
      setLoadingTokenAccounts(false);
      setTokensLoaded(true);
      return null;
    });

  }, [connection, priceList, publicKey, splTokenList]);

  ///////////////////////
  // Multisig accounts //
  ///////////////////////

  const [needReloadMultisigAccounts, setNeedReloadMultisigAccounts] = useState(contextDefaultValues.needReloadMultisigAccounts);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(contextDefaultValues.loadingMultisigAccounts);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>(contextDefaultValues.multisigAccounts);
  const [patchedMultisigAccounts, setPatchedMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(contextDefaultValues.selectedMultisig);
  const [loadingMultisigTxPendingCount, setLoadingMultisigTxPendingCount] = useState(contextDefaultValues.loadingMultisigTxPendingCount);

  // Refresh the list of multisigs and return a selection
  const refreshMultisigs = useCallback(async (reset?: boolean) => {

    if (!publicKey || !multisigClient) {
      return undefined;
    }

    setLoadingMultisigAccounts(true);

    try {
      const allInfo = await multisigClient.getMultisigs(publicKey);
      allInfo.sort((a: any, b: any) => new Date(b.createdOnUtc).getTime() - new Date(a.createdOnUtc).getTime());
      setMultisigAccounts(allInfo);
      consoleOut('multisigAccounts:', allInfo, 'darkorange');
      if (allInfo.length > 0) {
        if (reset) {
          return allInfo[0];
        } else {
          const auth = selectedMultisig ? selectedMultisig.authority : undefined;
          const item = auth ? allInfo.find(m => m.authority.equals(auth)) : undefined;
          if (item) {
            return item;
          } else {
            return allInfo[0];
          }
        }
      }
      return undefined;
    } catch (error) {
      console.error('refreshMultisigs ->', error);
      return undefined;
    } finally {
      setLoadingMultisigAccounts(false);
    }

  }, [multisigClient, publicKey, selectedMultisig]);

  // Automatically get a list of multisigs for the connected wallet
  useEffect(() => {

    if (!publicKey || !multisigClient || !needReloadMultisigAccounts) {
      return;
    }

    setNeedReloadMultisigAccounts(false);
    setPatchedMultisigAccounts(undefined);

    refreshMultisigs();

  }, [multisigClient, needReloadMultisigAccounts, publicKey, refreshMultisigs]);

  useEffect(() => {
    if (!publicKey || !multisigClient || patchedMultisigAccounts !== undefined || loadingMultisigTxPendingCount || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const multisigWithPendingTxs = multisigAccounts.filter(x => x.pendingTxsAmount > 0);
    if (!multisigWithPendingTxs || multisigWithPendingTxs.length === 0) {
      consoleOut('No safes found with pending Txs to work on!', 'moving on...', 'crimson');
      return;
    }

    (async () => {
      consoleOut('Searching for pending Txs across multisigs...', '', 'crimson');
      setLoadingMultisigTxPendingCount(true);

      const multisigAccountsCopy = [...multisigAccounts];
      const multisigPendingStatus = [MultisigTransactionStatus.Active, MultisigTransactionStatus.Queued, MultisigTransactionStatus.Passed];
      let anythingChanged = false;
      for await (const multisig of multisigWithPendingTxs) {
        try {
          const multisigTransactions = await multisigClient.getMultisigTransactions(multisig.id, publicKey);
          const realPendingTxsAmount = multisigTransactions.filter(tx => multisigPendingStatus.includes(tx.status)).length;
          const itemIndex = multisigAccountsCopy.findIndex(x => x.id.equals(multisig.id));
          if (itemIndex > -1) {
            multisigAccountsCopy[itemIndex].pendingTxsAmount = realPendingTxsAmount;
            anythingChanged = true;
          }
        } catch (error) {
          consoleOut(`Failed pulling tx for multisig ${multisig.id.toBase58()}`, error, 'red');
        }
      }
      if (anythingChanged) {
        consoleOut('setting patchedMultisigAccounts...', '', 'crimson');
        setPatchedMultisigAccounts(multisigAccountsCopy);
      }
      setLoadingMultisigTxPendingCount(false);
    })();
  }, [loadingMultisigTxPendingCount, multisigAccounts, multisigClient, patchedMultisigAccounts, publicKey]);

  useEffect(() => {
    if (patchedMultisigAccounts !== undefined) {
      setMultisigAccounts(patchedMultisigAccounts);
      consoleOut('setting multisigAccounts...', '', 'crimson');
    }
  }, [patchedMultisigAccounts]);

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
        isSelectingAccount,
        rememberAccount,
        selectedAccount,
        theme,
        tpsAvg,
        refreshInterval,
        isWhitelisted,
        shouldLoadTokens,
        loadingTokenAccounts,
        tokensLoaded,
        isDepositOptionsModalVisible,
        tokenList,
        selectedToken,
        tokenBalance,
        totalSafeBalance,
        fromCoinAmount,
        effectiveRate,
        coinPrices,
        priceList,
        loadingPrices,
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
        selectedAsset,
        userTokensResponse,
        transactions,
        lastTxSignature,
        addAccountPanelOpen,
        streamsSummary,
        lastStreamsSummary,
        recurringBuys,
        loadingRecurringBuys,
        multisigAccounts,
        loadingMultisigAccounts,
        loadingMultisigTxPendingCount,
        needReloadMultisigAccounts,
        selectedMultisig,
        multisigSolBalance,
        multisigVaults,
        highLightableMultisigId,
        pendingMultisigTxCount,
        stakedAmount,
        unstakedAmount,
        unstakeStartDate,
        stakingMultiplier,
        previousRoute,
        setIsSelectingAccount,
        setSelectedAccount,
        setRememberAccount,
        getAssetsByAccount,
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
        refreshTokenBalance,
        resetContractValues,
        resetStreamsState,
        clearStreams,
        refreshStreamList,
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
        setAddAccountPanelOpen,
        setStreamsSummary,
        setLastStreamsSummary,
        setRecurringBuys,
        setLoadingRecurringBuys,
        setNeedReloadMultisigAccounts,
        refreshMultisigs,
        setMultisigAccounts,
        setSelectedMultisig,
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
