import type { DdcaAccount } from '@mean-dao/ddca';
import {
  MeanMultisig,
  type MultisigInfo,
  type MultisigTransaction,
  MultisigTransactionStatus,
} from '@mean-dao/mean-multisig-sdk';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import type { StreamActivity as StreamActivityV1, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { PaymentStreaming, type Stream, type StreamActivity } from '@mean-dao/payment-streaming';
import type { FindNftsByOwnerOutput } from '@metaplex-foundation/js';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { isCacheItemExpired } from 'cache/persistentCache';
import { openNotification } from 'components/Notifications';
import { BANNED_TOKENS, MEAN_TOKEN_LIST, NATIVE_SOL } from 'constants/tokens';
import { TREASURY_TYPE_OPTIONS } from 'constants/treasury-type-options';
import useLocalStorage from 'hooks/useLocalStorage';
import { appConfig, customLogger } from 'index';
import { getAccountNFTs, getUserAccountTokens } from 'middleware/accounts';
import { getPrices, getSolFlareTokenList, getSolanaTokenListKeyNameByCluster, getSplTokens } from 'middleware/api';
import getPriceByAddressOrSymbol from 'middleware/getPriceByAddressOrSymbol';
import type { MappedTransaction } from 'middleware/history';
import { PerformanceCounter } from 'middleware/perf-counter';
import { consoleOut, isProd, msToTime } from 'middleware/ui';
import { findATokenAddress, getAmountFromLamports, shortenAddress } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { TokenPrice } from 'models/TokenPrice';
import type {
  AccountContext,
  AccountDetails,
  AccountTokenParsedInfo,
  ProgramAccounts,
  UserTokenAccount,
  UserTokensResponse,
} from 'models/accounts';
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from 'models/enums';
import type { MultisigVault } from 'models/multisig';
import { type PaymentStreamingStats, type StreamsSummary, initialStats, initialSummary } from 'models/streams';
import type { TreasuryTypeOption } from 'models/treasuries';
import moment from 'moment';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { failsafeConnectionConfig, getFallBackRpcEndpoint } from 'services/connections-hq';
import {
  DAO_CORE_TEAM_WHITELIST,
  FIVETY_SECONDS_REFRESH_TIMEOUT,
  FIVE_MINUTES_REFRESH_TIMEOUT,
  FORTY_SECONDS_REFRESH_TIMEOUT,
  ONE_MINUTE_REFRESH_TIMEOUT,
  PERFORMANCE_THRESHOLD,
  SEVENTY_SECONDS_REFRESH_TIMEOUT,
  THIRTY_MINUTES_REFRESH_TIMEOUT,
  TRANSACTIONS_PER_PAGE,
  WRAPPED_SOL_MINT_ADDRESS,
} from '../constants';
import { useNativeAccount } from './accounts';
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from './connection';
import { useWallet } from './wallet';
import { emptyAccount, useWalletAccount } from './walletAccount';

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
  selectedAccount: AccountContext;
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
  streamActivity: StreamActivityV1[] | StreamActivity[] | undefined;
  hasMoreStreamActivity: boolean;
  customStreamDocked: boolean;
  diagnosisInfo: AccountDetails | undefined;
  // Accounts page
  shouldLoadTokens: boolean;
  loadingTokenAccounts: boolean;
  tokenAccounts: AccountTokenParsedInfo[] | undefined;
  userTokensResponse: UserTokensResponse | null;
  tokensLoaded: boolean;
  splTokenList: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  transactions: MappedTransaction[] | undefined;
  lastTxSignature: string;
  streamsSummary: StreamsSummary;
  lastStreamsSummary: StreamsSummary;
  paymentStreamingStats: PaymentStreamingStats;
  accountNfts: FindNftsByOwnerOutput | undefined;
  // DDCAs
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
  getTokenPriceByAddress: (address: string, symbol?: string) => number;
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
  setDeletedStream: (id: string) => void;
  setHighLightableStreamId: (id: string | undefined) => void;
  openStreamById: (streamId: string, dock: boolean) => void;
  getStreamActivity: (streamId: string, version: number, clearHistory?: boolean) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setDiagnosisInfo: (info: AccountDetails | undefined) => void;
  // Accounts page
  setShouldLoadTokens: (state: boolean) => void;
  appendHistoryItems: (transactionsChunk: MappedTransaction[] | undefined, addItems?: boolean) => void;
  setSelectedAsset: (asset: UserTokenAccount | undefined) => void;
  setStreamsSummary: (summary: StreamsSummary) => void;
  setLastStreamsSummary: (summary: StreamsSummary) => void;
  setPaymentStreamingStats: (summary: PaymentStreamingStats) => void;
  // DDCAs
  setRecurringBuys: (recurringBuys: DdcaAccount[]) => void;
  setLoadingRecurringBuys: (state: boolean) => void;
  // Multisig
  setNeedReloadMultisigAccounts: (reload: boolean) => void;
  refreshMultisigs: () => Promise<boolean>;
  setMultisigAccounts: (accounts: MultisigInfo[]) => void;
  setSelectedMultisig: (multisig: MultisigInfo | undefined) => void;
  setMultisigSolBalance: (balance: number | undefined) => void;
  setMultisigVaults: (list: Array<MultisigVault>) => void;
  setHighLightableMultisigId: (id: string | undefined) => void;
  setPendingMultisigTxCount: (id: number | undefined) => void;
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
  selectedAccount: emptyAccount,
  // General
  theme: undefined,
  tpsAvg: undefined, // undefined at first (never had a value), null = couldn't get, number the value successfully retrieved
  refreshInterval: ONE_MINUTE_REFRESH_TIMEOUT,
  isWhitelisted: false,
  isDepositOptionsModalVisible: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  totalSafeBalance: undefined,
  fromCoinAmount: '',
  effectiveRate: 0,
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
    currentOperation: TransactionStatus.Iddle,
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
  shouldLoadTokens: false,
  loadingTokenAccounts: true,
  tokenAccounts: undefined,
  userTokensResponse: null,
  tokensLoaded: false,
  splTokenList: [],
  selectedAsset: undefined,
  transactions: undefined,
  lastTxSignature: '',
  streamsSummary: initialSummary,
  lastStreamsSummary: initialSummary,
  paymentStreamingStats: initialStats,
  accountNfts: undefined,
  // DDCAs
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
  getTokenPriceByAddress: () => 0,
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
  setCustomStreamDocked: () => {},
  setDiagnosisInfo: () => {},
  // Accounts page
  setShouldLoadTokens: () => {},
  appendHistoryItems: () => {},
  setSelectedAsset: () => {},
  setStreamsSummary: () => {},
  setLastStreamsSummary: () => {},
  setPaymentStreamingStats: () => {},
  // DDCAs
  setRecurringBuys: () => {},
  setLoadingRecurringBuys: () => {},
  // Multisig
  setNeedReloadMultisigAccounts: () => {},
  refreshMultisigs: async () => false,
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
  const { t } = useTranslation('common');
  // Parent contexts
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const { selectedAccount } = useWalletAccount();
  const connectionConfig = useConnectionConfig();
  const { account } = useNativeAccount();
  // Account selection
  const [isWhitelisted, setIsWhitelisted] = useState(contextDefaultValues.isWhitelisted);
  const today = new Date().toLocaleDateString('en-US');
  const tomorrow = moment().add(1, 'days').format('L');
  const timeDate = moment().format('hh:mm A');
  const [theme, updateTheme] = useLocalStorage('theme', 'dark');
  const [tpsAvg, setTpsAvg] = useState<TpsAverageValues>(contextDefaultValues.tpsAvg);
  const [treasuryOption, updateTreasuryOption] = useState<TreasuryTypeOption | undefined>(
    contextDefaultValues.treasuryOption,
  );
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
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(
    TimesheetRequirementOption.NotRequired,
  );
  const [isVerifiedRecipient, setIsVerifiedRecipient] = useState<boolean>(contextDefaultValues.isVerifiedRecipient);
  const [isAllocationReserved, setIsAllocationReserved] = useState<boolean>(contextDefaultValues.isAllocationReserved);
  const [transactionStatus, updateTransactionStatus] = useState<TransactionStatusInfo>(
    contextDefaultValues.transactionStatus,
  );
  const [previousWalletConnectState, updatePreviousWalletConnectState] = useState<boolean>(connected);
  const [tokenList, updateTokenlist] = useState<TokenInfo[]>([]);
  const [loadingStreams, updateLoadingStreams] = useState(false);
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(contextDefaultValues.loadingStreamActivity);
  const [streamActivity, setStreamActivity] = useState<StreamActivityV1[] | StreamActivity[] | undefined>(undefined);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(
    contextDefaultValues.hasMoreStreamActivity,
  );
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
  const [highLightableStreamId, setHighLightableStreamId] = useState<string | undefined>(
    contextDefaultValues.highLightableStreamId,
  );
  const [multisigVaults, setMultisigVaults] = useState<MultisigVault[]>([]);
  const [highLightableMultisigId, setHighLightableMultisigId] = useState<string | undefined>(
    contextDefaultValues.highLightableMultisigId,
  );
  const [multisigSolBalance, updateMultisigSolBalance] = useState<number | undefined>(
    contextDefaultValues.multisigSolBalance,
  );
  const [pendingMultisigTxCount, setPendingMultisigTxCount] = useState<number | undefined>(
    contextDefaultValues.pendingMultisigTxCount,
  );
  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number>(contextDefaultValues.tokenBalance);
  const [totalSafeBalance, updateTotalSafeBalance] = useState<number | undefined>(
    contextDefaultValues.totalSafeBalance,
  );
  const [stakingMultiplier, updateStakingMultiplier] = useState<number>(contextDefaultValues.stakingMultiplier);
  const [priceList, setPriceList] = useState<TokenPrice[] | null>(null);
  const [loadingPrices, setLoadingPrices] = useState<boolean>(contextDefaultValues.loadingPrices);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);
  const [stakedAmount, updateStakedAmount] = useState<string>(contextDefaultValues.stakedAmount);
  const [unstakedAmount, updatedUnstakeAmount] = useState<string>(contextDefaultValues.unstakedAmount);
  const [unstakeStartDate, updateUnstakeStartDate] = useState<string | undefined>(today);
  const [isDepositOptionsModalVisible, setIsDepositOptionsModalVisibility] = useState(false);

  const [splTokenList, updateSplTokenList] = useState<UserTokenAccount[]>(contextDefaultValues.splTokenList);
  const [transactions, setTransactions] = useState<MappedTransaction[] | undefined>(contextDefaultValues.transactions);
  const [selectedAsset, updateSelectedAsset] = useState<UserTokenAccount | undefined>(
    contextDefaultValues.selectedAsset,
  );
  const [lastTxSignature, setLastTxSignature] = useState<string>(contextDefaultValues.lastTxSignature);
  const [streamsSummary, setStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.streamsSummary);
  const [lastStreamsSummary, setLastStreamsSummary] = useState<StreamsSummary>(contextDefaultValues.lastStreamsSummary);
  const [paymentStreamingStats, setPaymentStreamingStats] = useState<PaymentStreamingStats>(
    contextDefaultValues.paymentStreamingStats,
  );
  const [accountNfts, setAccountNfts] = useState<FindNftsByOwnerOutput | undefined>(contextDefaultValues.accountNfts);
  const [previousRoute, setPreviousRoute] = useState<string>(contextDefaultValues.previousRoute);
  const [meanTokenList, setMeanTokenlist] = useState<UserTokenAccount[] | undefined>(undefined);
  const [tokensLoaded, setTokensLoaded] = useState(contextDefaultValues.tokensLoaded);
  const [shouldLoadTokens, updateShouldLoadTokens] = useState(contextDefaultValues.shouldLoadTokens);
  const [loadingTokenAccounts, setLoadingTokenAccounts] = useState(contextDefaultValues.loadingTokenAccounts);
  const [userTokensResponse, setUserTokensResponse] = useState<UserTokensResponse | null>(
    contextDefaultValues.userTokensResponse,
  );
  const [accountTokens, setAccountTokens] = useState<UserTokenAccount[]>([]);

  const [tokenAccounts, updateTokenAccounts] = useState<AccountTokenParsedInfo[] | undefined>(
    contextDefaultValues.tokenAccounts,
  );

  const isDowngradedPerformance = useMemo(() => {
    return !!(isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD));
  }, [tpsAvg]);

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);
  const streamProgramAddress = useMemo(() => appConfig.getConfig().streamProgramAddress, []);
  const streamV2ProgramAddress = useMemo(() => appConfig.getConfig().streamV2ProgramAddress, []);

  // Use a fallback RPC for Money Streaming Program (v1) instance
  const ms = useMemo(
    () => new MoneyStreaming(getFallBackRpcEndpoint().httpProvider, streamProgramAddress, 'confirmed'),
    [streamProgramAddress],
  );

  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, new PublicKey(streamV2ProgramAddress), connection.commitment);
  }, [connection, streamV2ProgramAddress]);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(connectionConfig.endpoint, publicKey, failsafeConnectionConfig, multisigAddressPK);
  }, [publicKey, connection, multisigAddressPK, connectionConfig.endpoint]);

  const setTheme = useCallback(
    (name: string) => {
      updateTheme(name);
    },
    [updateTheme],
  );

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
  };

  // Set theme option to html tag
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name ?? 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    };

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  useEffect(() => {
    setTransactions([]);
    setShouldLoadTokens(true);
  }, [selectedAccount]);

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
    };

    updateIsWhitelisted();
    return () => {};
  }, [publicKey]);

  useEffect(() => {
    consoleOut('isWhitelisted:', isWhitelisted, 'blue');
  }, [isWhitelisted]);

  const setLoadingStreams = (state: boolean) => {
    updateLoadingStreams(state);
  };

  const setTreasuryOption = (option: TreasuryTypeOption | undefined) => {
    updateTreasuryOption(option);
  };

  const setRecipientAddress = (address: string) => {
    updateRecipientAddress(address);
  };

  const setRecipientNote = (note: string) => {
    updateRecipientNote(note);
  };

  const setPaymentStartDate = (date: string) => {
    updatePaymentStartDate(date);
  };

  const setProposalEndDate = (date: string) => {
    updateProposalEndDate(date);
  };

  const setProposalEndTime = (time: string) => {
    updateProposalEndTime(time);
  };

  const setFromCoinAmount = (data: string) => {
    updateFromCoinAmount(data);
  };

  const setPaymentRateAmount = (data: string) => {
    updatePaymentRateAmount(data);
  };

  const setLockPeriodAmount = (data: string) => {
    updateLockPeriodAmount(data);
  };

  const setActiveTab = (data: string) => {
    updateActiveTab(data);
  };

  const setSelectedTab = (data: string) => {
    updateSelectedTab(data);
  };

  const setCoolOffPeriodFrequency = (freq: PaymentRateType) => {
    updateCoolOffPeriodFrequency(freq);
  };

  const setPaymentRateFrequency = (freq: PaymentRateType) => {
    updatePaymentRateFrequency(freq);
  };

  const setLockPeriodFrequency = (freq: PaymentRateType) => {
    updateLockPeriodFrequency(freq);
  };

  const setTimeSheetRequirement = (req: TimesheetRequirementOption) => {
    updateTimeSheetRequirement(req);
  };

  const setTransactionStatus = (status: TransactionStatusInfo) => {
    updateTransactionStatus(status);
  };

  const setStakedAmount = (data: string) => {
    updateStakedAmount(data);
  };

  const setUnstakedAmount = (data: string) => {
    updatedUnstakeAmount(data);
  };

  const setUnstakeStartDate = (date: string) => {
    updateUnstakeStartDate(date);
  };

  const resetContractValues = useCallback(() => {
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
  }, [timeDate, today, tomorrow]);

  const clearStreams = () => {
    setStreamList([]);
    setStreamListv2([]);
    setStreamListv1([]);
  };

  const resetStreamsState = useCallback(() => {
    setStreamList([]);
    setStreamActivity(undefined);
    setStreamDetail(undefined);
    setActiveStream(undefined);
    setLoadingStreamActivity(false);
    setHasMoreStreamActivity(true);
  }, []);

  const setPreviousWalletConnectState = useCallback(
    (state: boolean) => {
      updatePreviousWalletConnectState(state);
      if (state === false) {
        resetContractValues();
        resetStreamsState();
        setCustomStreamDocked(false);
      }
    },
    [resetContractValues, resetStreamsState],
  );

  const getTokenByMintAddress = useCallback(
    (address: string): TokenInfo | undefined => {
      let token = splTokenList && isProd() ? tokenList.find(t => t.address === address) : undefined;
      if (!token) {
        token = MEAN_TOKEN_LIST.find(t => t.address === address);
      }
      if (!token) {
        token = accountTokens.find(t => t.address === address);
      }
      return token;
    },
    [accountTokens, splTokenList, tokenList],
  );

  const openStreamById = useCallback(
    async (streamId: string, dock = false) => {
      try {
        const streamPublicKey = new PublicKey(streamId);
        try {
          if (paymentStreaming && publicKey) {
            const detail = await paymentStreaming.getStream(streamPublicKey);
            consoleOut('customStream', detail);
            if (detail) {
              setStreamDetail(detail);
              setActiveStream(detail);
              if (dock) {
                setStreamList([detail]);
                setCustomStreamDocked(true);
                openNotification({
                  description: t('notifications.success-loading-stream-message', {
                    streamId: shortenAddress(streamId, 10),
                  }),
                  type: 'success',
                });
              }
            } else if (dock) {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-loading-streamid-message', {
                  streamId: shortenAddress(streamId, 10),
                }),
                type: 'error',
              });
            }
          } else {
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-loading-streamid-message', {
                streamId: shortenAddress(streamId, 10),
              }),
              type: 'error',
            });
          }
        } catch (error) {
          console.error('customStream', error);
          openNotification({
            title: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {
              streamId: shortenAddress(streamId, 10),
            }),
            type: 'error',
          });
        }
      } catch (error) {
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.invalid-publickey-message'),
          type: 'error',
        });
      }
    },
    [paymentStreaming, publicKey, t],
  );

  const getStreamActivity = useCallback(
    (streamId: string, version: number, clearHistory = false) => {
      if (!connected || !streamId || !ms || !paymentStreaming) {
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
          const signature =
            streamActivity && streamActivity.length > 0 ? streamActivity[streamActivity.length - 1].signature : '';
          const before = clearHistory ? '' : signature;
          consoleOut('before:', before, 'crimson');
          paymentStreaming
            .listStreamActivity(streamPublicKey, before, 5)
            .then((value: StreamActivity[]) => {
              consoleOut('activity:', value);
              const currentActivity =
                streamActivity && streamActivity.length > 0 ? JSON.parse(JSON.stringify(streamActivity)) : [];
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
    },
    [ms, paymentStreaming, connected, streamActivity, loadingStreamActivity],
  );

  const setSelectedStream = useCallback(
    (stream: StreamValues) => {
      updateSelectedStream(stream);
      if (stream) {
        const mspInstance: any = stream.version < 2 ? ms : paymentStreaming;
        mspInstance
          .getStream(new PublicKey(stream.id as string))
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
    },
    [ms, paymentStreaming],
  );

  const setStreamDetail = (stream: StreamValues) => {
    updateStreamDetail(stream);
  };

  const setDeletedStream = (id: string) => {
    setDeletedStreams(oldArray => [...oldArray, id]);
  };

  const showDepositOptionsModal = useCallback(() => {
    setIsDepositOptionsModalVisibility(true);
    const depositMenuItem = document.getElementById('deposits-menu-item');
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
    const depositMenuItem = document.getElementById('deposits-menu-item');
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
  };

  const setSelectedTokenBalance = (balance: number) => {
    updateTokenBalance(balance);
  };

  const setMultisigSolBalance = (balance: number | undefined) => {
    updateMultisigSolBalance(balance);
  };

  const setTotalSafeBalance = (balance: number | undefined) => {
    updateTotalSafeBalance(balance);
  };

  const setStakingMultiplier = (rate: number) => {
    updateStakingMultiplier(rate);
  };

  const setEffectiveRate = (rate: number) => {
    updateEffectiveRate(rate);
  };

  /**
   * Gets the price of a token given its mint address if the price is available or the first match by symbol
   * @see {getPriceByAddressOrSymbol}
   */
  const getTokenPriceByAddress = useCallback(
    (address: string, symbol = ''): number => getPriceByAddressOrSymbol(priceList, address, symbol),
    [priceList],
  );

  const mapPrices = useCallback((prices: TokenPrice[]) => {
    if (prices && prices.length > 0) {
      const solIndex = prices.findIndex(p => p.symbol === 'SOL');
      const listCopy = JSON.parse(JSON.stringify(prices)) as TokenPrice[];
      if (solIndex !== -1) {
        listCopy[solIndex].address = NATIVE_SOL.address;
      }
      const sol = listCopy.find(p => p.symbol === 'SOL');
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
    } else {
      consoleOut('New prices list:', 'NO PRICES RETURNED!', 'red');
    }
  }, []);

  // Fetch coin prices
  const getCoinPrices = useCallback(
    async (fromCache = true) => {
      try {
        setLoadingPrices(true);
        pricesPerformanceCounter.start();
        const isExpired = isCacheItemExpired('token-prices', THIRTY_MINUTES_REFRESH_TIMEOUT);
        const honorCache = !!(fromCache && !isExpired);
        const newPrices = await getPrices(honorCache);
        pricesPerformanceCounter.stop();
        consoleOut(`Fetched price list in ${pricesPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
        mapPrices(newPrices);
      } catch (error) {
        updateEffectiveRate(0);
        consoleOut('New prices API error:', error, 'red');
      } finally {
        setLoadingPrices(false);
      }
    },
    [mapPrices],
  );

  const refreshPrices = useCallback(() => {
    getCoinPrices(false);
  }, [getCoinPrices]);

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
    if (priceList && selectedToken) {
      const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);
      updateEffectiveRate(price);
    }
  }, [getTokenPriceByAddress, priceList, selectedToken]);

  const refreshStreamList = useCallback(
    (reset = false) => {
      if (loadingStreams || customStreamDocked || !ms || !paymentStreaming) {
        return;
      }

      if (!publicKey) {
        return;
      }

      const userPk = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;
      consoleOut('Fetching streams for:', userPk?.toBase58(), 'orange');

      if (paymentStreaming) {
        updateLoadingStreams(true);

        const streamAccumulator: any[] = [];
        let rawStreamsv1: StreamInfo[] = [];
        let rawStreamsv2: Stream[] = [];

        // Reset all counters
        listStreamsV1PerformanceCounter.reset();
        listStreamsV2PerformanceCounter.reset();
        listStreamsV2PerformanceCounter.start();

        paymentStreaming
          .listStreams({ psAccountOwner: userPk, beneficiary: userPk })
          .then(streamsv2 => {
            consoleOut('streamsv2 from AppSate:', streamsv2, 'blue');
            listStreamsV2PerformanceCounter.stop();
            streamAccumulator.push(...streamsv2);
            rawStreamsv2 = streamsv2;
            rawStreamsv2.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime)) ? 1 : -1));
            listStreamsV1PerformanceCounter.start();
            ms.listStreams({ treasurer: userPk, beneficiary: userPk })
              .then(async streamsv1 => {
                listStreamsV1PerformanceCounter.stop();
                consoleOut(
                  `listStreams performance counter: ${tokenListPerformanceCounter.elapsedTime.toLocaleString()}ms`,
                  '',
                  'crimson',
                );
                streamAccumulator.push(...streamsv1);
                rawStreamsv1 = streamsv1;
                rawStreamsv1.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime)) ? 1 : -1));
                streamAccumulator.sort((a, b) => (new BN(a.createdBlockTime).lt(new BN(b.createdBlockTime)) ? 1 : -1));
                // Start debugging block
                if (!isProd()) {
                  const debugTable: any[] = [];
                  streamAccumulator.forEach(item =>
                    debugTable.push({
                      version: item.version,
                      name: item.version < 2 ? item.streamName : item.name.trim(),
                      streamId: shortenAddress(item.id, 8),
                    }),
                  );
                  console.table(debugTable);
                }
                // End of debugging block
                setStreamList(streamAccumulator);
                setStreamListv2(rawStreamsv2);
                setStreamListv1(rawStreamsv1);
                consoleOut('Streams from AppSate:', streamAccumulator, 'blue');
                if (streamDetail) {
                  const streamId =
                    streamDetail.version < 2
                      ? ((streamDetail as StreamInfo).id as string)
                      : (streamDetail as Stream).id.toBase58();
                  const item = streamAccumulator.find(s => {
                    const id = s.version < 2 ? ((s as StreamInfo).id as string) : (s as Stream).id.toBase58();
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
          })
          .catch(err => {
            console.error(err);
          });
      }
    },
    [ms, paymentStreaming, publicKey, streamDetail, selectedAccount.address, loadingStreams, customStreamDocked],
  );

  /**
   * Streams refresh timeout
   *
   * If TPS values are critical we should NOT schedule at all
   * and resume when TPS goes up again.
   */
  useEffect(() => {
    if (!publicKey) {
      return;
    }

    let timer: any;

    if (selectedAccount.address && !customStreamDocked && !isDowngradedPerformance) {
      timer = setInterval(() => {
        consoleOut(`Refreshing streams past ${msToTime(FIVE_MINUTES_REFRESH_TIMEOUT)}...`);
        refreshStreamList();
      }, FIVE_MINUTES_REFRESH_TIMEOUT);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [publicKey, customStreamDocked, selectedAccount.address, isDowngradedPerformance, refreshStreamList]);

  const refreshTokenBalance = useCallback(async () => {
    if (!connection || !publicKey || !tokenList || !tokenAccounts || !tokenAccounts.length) {
      return;
    }

    if (!selectedToken?.address) {
      return;
    }

    const userPk = selectedAccount.address ? new PublicKey(selectedAccount.address) : publicKey;

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (!address) return 0;
      try {
        const accountInfo = await connection.getAccountInfo(address.toPublicKey());
        if (!accountInfo) return 0;
        if (address === publicKey?.toBase58()) {
          return getAmountFromLamports(accountInfo.lamports);
        }
        const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
        return tokenAmount.uiAmount ?? 0;
      } catch (error) {
        console.error(error);
        throw error;
      }
    };

    let balance = 0;
    const selectedTokenAddress = findATokenAddress(userPk, new PublicKey(selectedToken.address));
    balance = await getTokenAccountBalanceByAddress(selectedTokenAddress.toBase58());
    updateTokenBalance(balance);
  }, [connection, publicKey, tokenList, tokenAccounts, selectedToken?.address, selectedAccount.address]);

  // Effect to refresh token balance if needed
  useEffect(() => {
    if (!publicKey || !tokenAccounts || !tokenAccounts.length) {
      return;
    }

    if (shouldUpdateToken) {
      setShouldUpdateToken(false);
      refreshTokenBalance();
    }

    return () => {};
  }, [tokenAccounts, publicKey, shouldUpdateToken, refreshTokenBalance]);

  const appendHistoryItems = useCallback(
    (transactionsChunk: MappedTransaction[] | undefined, addItems?: boolean) => {
      if (!addItems) {
        if (transactionsChunk && transactionsChunk.length === TRANSACTIONS_PER_PAGE) {
          const lastSignature = transactionsChunk[transactionsChunk.length - 1].signature;
          setLastTxSignature(lastSignature);
        } else {
          setLastTxSignature('');
        }
        // Get a unique set of items
        const filtered = new Set(transactionsChunk);
        // Convert iterable to array
        setTransactions(Array.from(filtered));
      } else {
        if (transactionsChunk?.length) {
          const modifiedHistory = transactions?.slice() ?? [];
          for (const tx of transactionsChunk) {
            if (modifiedHistory.every(item => item.signature !== tx.signature)) {
              modifiedHistory.push(tx);
            }
          }
          consoleOut('history:', modifiedHistory, 'blue');
          const lastSignature = modifiedHistory[modifiedHistory.length - 1].signature;
          if (modifiedHistory.length === TRANSACTIONS_PER_PAGE) {
            setLastTxSignature(lastSignature);
          } else {
            setLastTxSignature('');
          }
          setTransactions(modifiedHistory);
        }
      }
    },
    [transactions],
  );

  const setSelectedAsset = (asset: UserTokenAccount | undefined) => {
    updateSelectedAsset(asset);
  };

  // Fetch token list
  const getTokenList = useCallback(async () => {
    try {
      tokenListPerformanceCounter.start();
      const targetChain = getNetworkIdByCluster(connectionConfig.cluster);
      const cacheEntryKey = getSolanaTokenListKeyNameByCluster(targetChain);
      const honorCache = !isCacheItemExpired(cacheEntryKey);
      const tokenList = await getSplTokens(targetChain, honorCache);
      tokenListPerformanceCounter.stop();
      consoleOut(`Fetched token list in ${tokenListPerformanceCounter.elapsedTime.toLocaleString()}ms`, '', 'crimson');
      if (tokenList && tokenList.length > 0) {
        const newTokenList: TokenInfo[] = [];
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
            tags: [],
          };
          newTokenList.push(item);
          if (token.priceUsd) {
            const priceItem: TokenPrice = {
              address: token.mint,
              symbol: token.symbol,
              price: token.priceUsd,
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
        if (response?.tokens && response.tokens.length > 0) {
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
  }, [connectionConfig.cluster, getCoinPrices, mapPrices]);

  // Only get the token list once per page reload
  useEffect(() => {
    if (meanTokenList === undefined) {
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
        logoURI: NATIVE_SOL.logoURI,
      };
      // First add Native SOL as a token
      list.push(sol);
      // Add items from the MeanFi list
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster)).forEach(item =>
        list.push(item),
      );
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

    return () => {};
  }, [connectionConfig.cluster, meanTokenList]);

  // Keep track of current balance
  useEffect(() => {
    if (publicKey && account?.lamports && selectedAccount.address) {
      consoleOut('--------------------------------', '', 'darkorange');
      consoleOut('Native account lamports changed.', 'Reloading tokens...', 'darkorange');
      consoleOut('--------------------------------', '', 'darkorange');
      updateShouldLoadTokens(true);
    }
  }, [account?.lamports, publicKey, selectedAccount.address]);

  // Fetch all the owned token accounts on demmand via setShouldLoadTokens(true)
  // Also, do this after any Tx is completed in places where token balances were indeed changed)
  useEffect(() => {
    if (!connection || !publicKey || !selectedAccount.address || !shouldLoadTokens || !splTokenList) {
      return;
    }

    setLoadingTokenAccounts(true);
    updateShouldLoadTokens(false);
    setTokensLoaded(false);
    consoleOut('calling getUserAccountTokens from:', 'AppState', 'darkgreen');

    getUserAccountTokens(connection, selectedAccount.address, priceList, splTokenList)
      .then(response => {
        if (response) {
          setUserTokensResponse(response);
          setAccountTokens(response.accountTokens);
          updateTokenAccounts(response.userTokenAccouns);
        } else {
          setUserTokensResponse(null);
          setAccountTokens([]);
          updateTokenAccounts(undefined);
        }
      })
      .finally(() => {
        setTokensLoaded(true);
        setLoadingTokenAccounts(false);
      });

    return () => {};

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount.address, connection, priceList, publicKey, shouldLoadTokens, splTokenList]);

  // Get and populate the list of NFTs that the user holds
  useEffect(() => {
    if (!connection || !publicKey || !selectedAccount.address || !shouldLoadTokens) {
      return;
    }

    getAccountNFTs(connection, selectedAccount.address).then(response => {
      consoleOut('getAccountNFTs() response:', response, 'blue');
      setAccountNfts(response);
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount.address, connection, priceList, publicKey, shouldLoadTokens]);

  // Same as above but on demand
  const getAssetsByAccount = useCallback(
    (account: string) => {
      if (!connection || !publicKey || !account || !priceList) {
        return null;
      }

      setLoadingTokenAccounts(true);
      setTokensLoaded(false);
      consoleOut('calling getUserAccountTokens from:', 'getAssetsByAccount', 'darkgreen');

      return getUserAccountTokens(connection, account, priceList, splTokenList)
        .then(response => {
          if (response) {
            return response;
          } else {
            return null;
          }
        })
        .finally(() => {
          setLoadingTokenAccounts(false);
          setTokensLoaded(true);
          return null;
        });
    },
    [connection, priceList, publicKey, splTokenList],
  );

  ///////////////////////
  // Multisig accounts //
  ///////////////////////

  const [needReloadMultisigAccounts, setNeedReloadMultisigAccounts] = useState(
    contextDefaultValues.needReloadMultisigAccounts,
  );
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(contextDefaultValues.loadingMultisigAccounts);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>(contextDefaultValues.multisigAccounts);
  const [patchedMultisigAccounts, setPatchedMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(
    contextDefaultValues.selectedMultisig,
  );
  const [loadingMultisigTxPendingCount, setLoadingMultisigTxPendingCount] = useState(
    contextDefaultValues.loadingMultisigTxPendingCount,
  );

  // Refresh the list of multisigs and return a selection
  const refreshMultisigs = useCallback(async () => {
    if (!publicKey || !multisigClient) {
      return false;
    }

    setLoadingMultisigAccounts(true);

    try {
      const allInfo = await multisigClient.getMultisigs(publicKey);
      allInfo.sort((a: any, b: any) => new Date(b.createdOnUtc).getTime() - new Date(a.createdOnUtc).getTime());
      setMultisigAccounts(allInfo);
      consoleOut('multisigAccounts:', allInfo, 'darkorange');
      return true;
    } catch (error) {
      console.error('refreshMultisigs ->', error);
      return false;
    } finally {
      setLoadingMultisigAccounts(false);
    }
  }, [multisigClient, publicKey]);

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
    if (
      !publicKey ||
      !multisigClient ||
      patchedMultisigAccounts !== undefined ||
      loadingMultisigTxPendingCount ||
      !multisigAccounts ||
      multisigAccounts.length === 0
    ) {
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
      const multisigPendingStatus = [
        MultisigTransactionStatus.Active,
        MultisigTransactionStatus.Queued,
        MultisigTransactionStatus.Passed,
      ];
      let anythingChanged = false;
      for await (const multisig of multisigWithPendingTxs) {
        try {
          const multisigTransactions = await multisigClient.getMultisigTransactions(multisig.id, publicKey);
          const realPendingTxsAmount = multisigTransactions.filter(tx =>
            multisigPendingStatus.includes(tx.status),
          ).length;
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
  };

  const setRecurringBuys = (recurringBuys: DdcaAccount[]) => {
    updateRecurringBuys(recurringBuys);
  };

  const values = useMemo(() => {
    return {
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
      priceList,
      loadingPrices,
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
      tokenAccounts,
      userTokensResponse,
      transactions,
      lastTxSignature,
      streamsSummary,
      lastStreamsSummary,
      paymentStreamingStats,
      accountNfts,
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
      getTokenPriceByAddress,
      getTokenByMintAddress,
      refreshTokenBalance,
      resetContractValues,
      resetStreamsState,
      clearStreams,
      refreshStreamList,
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
      appendHistoryItems,
      setSelectedAsset,
      setStreamsSummary,
      setLastStreamsSummary,
      setPaymentStreamingStats,
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
    };
  }, [
    accountNfts,
    activeStream,
    activeTab,
    appendHistoryItems,
    coolOffPeriodFrequency,
    customStreamDocked,
    deletedStreams,
    diagnosisInfo,
    effectiveRate,
    fromCoinAmount,
    getAssetsByAccount,
    getStreamActivity,
    getTokenByMintAddress,
    getTokenPriceByAddress,
    hasMoreStreamActivity,
    hideDepositOptionsModal,
    highLightableMultisigId,
    highLightableStreamId,
    isAllocationReserved,
    isDepositOptionsModalVisible,
    isVerifiedRecipient,
    isWhitelisted,
    lastStreamsSummary,
    lastTxSignature,
    loadingMultisigAccounts,
    loadingMultisigTxPendingCount,
    loadingPrices,
    loadingRecurringBuys,
    loadingStreamActivity,
    loadingStreams,
    loadingTokenAccounts,
    lockPeriodAmount,
    lockPeriodFrequency,
    multisigAccounts,
    multisigSolBalance,
    multisigTxs,
    multisigVaults,
    needReloadMultisigAccounts,
    openStreamById,
    paymentRateAmount,
    paymentRateFrequency,
    paymentStartDate,
    paymentStreamingStats,
    pendingMultisigTxCount,
    previousRoute,
    previousWalletConnectState,
    priceList,
    programs,
    proposalEndDate,
    proposalEndTime,
    recipientAddress,
    recipientNote,
    recurringBuys,
    refreshInterval,
    refreshMultisigs,
    refreshPrices,
    refreshStreamList,
    refreshTokenBalance,
    resetContractValues,
    resetStreamsState,
    selectedAccount,
    selectedAsset,
    selectedMultisig,
    selectedStream,
    selectedTab,
    selectedToken,
    setPreviousWalletConnectState,
    setSelectedStream,
    setTheme,
    shouldLoadTokens,
    showDepositOptionsModal,
    splTokenList,
    stakedAmount,
    stakingMultiplier,
    streamActivity,
    streamDetail,
    streamList,
    streamListv1,
    streamListv2,
    streamProgramAddress,
    streamV2ProgramAddress,
    streamsSummary,
    theme,
    timeSheetRequirement,
    tokenAccounts,
    tokenBalance,
    tokenList,
    tokensLoaded,
    totalSafeBalance,
    tpsAvg,
    transactionStatus,
    transactions,
    treasuryOption,
    unstakeStartDate,
    unstakedAmount,
    userTokensResponse,
  ]);

  return <AppStateContext.Provider value={values}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
