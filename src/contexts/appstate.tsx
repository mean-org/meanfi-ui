import type { DdcaAccount } from '@mean-dao/ddca';
import { type MultisigInfo, type MultisigTransaction, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import type { StreamActivity as StreamActivityV1, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import type { Stream, StreamActivity } from '@mean-dao/payment-streaming';
import type { FindNftsByOwnerOutput } from '@metaplex-foundation/js';
import { PublicKey } from '@solana/web3.js';
import dayjs from 'dayjs';
import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DAO_CORE_TEAM_WHITELIST, TRANSACTIONS_PER_PAGE } from 'src/app-constants/common';
import { BANNED_TOKENS, MEAN_TOKEN_LIST, NATIVE_SOL } from 'src/app-constants/tokens';
import { TREASURY_TYPE_OPTIONS } from 'src/app-constants/treasury-type-options';
import { openNotification } from 'src/components/Notifications';
import { useWallet } from 'src/contexts/wallet';
import useLocalStorage from 'src/hooks/useLocalStorage';
import { customLogger } from 'src/main';
import { getAccountNFTs } from 'src/middleware/accounts';
import getPriceByAddressOrSymbol from 'src/middleware/getPriceByAddressOrSymbol';
import type { MappedTransaction } from 'src/middleware/history';
import { consoleOut, isProd } from 'src/middleware/ui';
import { findATokenAddress, getAmountFromLamports, shortenAddress } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import type { TokenPrice } from 'src/models/TokenPrice';
import type { AccountContext, AccountTokenParsedInfo, RuntimeAppDetails, UserTokenAccount } from 'src/models/accounts';
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from 'src/models/enums';
import type { MultisigVault } from 'src/models/multisig';
import { type PaymentStreamingStats, type StreamsSummary, initialStats, initialSummary } from 'src/models/streams';
import type { TreasuryTypeOption } from 'src/models/treasuries';
import { useAccountAssets } from 'src/query-hooks/accountTokens';
import { useGetMultisigAccounts } from 'src/query-hooks/multisigAccounts/index.ts';
import useMultisigClient from 'src/query-hooks/multisigClient';
import useStreamingClient from 'src/query-hooks/streamingClient';
import useGetTokenList from 'src/query-hooks/tokenList';
import useGetAssetPrices from 'src/query-hooks/tokenPrices';
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from './connection';
import { emptyAccount, useWalletAccount } from './walletAccount';

export type StreamValues = Stream | StreamInfo | undefined;

export interface TransactionStatusInfo {
  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  customError?: any;
  lastOperation?: TransactionStatus;
  currentOperation?: TransactionStatus;
}

interface AppStateConfig {
  // Account selection
  selectedAccount: AccountContext;
  // General
  theme: string | undefined;
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
  multisigTxs: MultisigTransaction[] | undefined;
  selectedStream: StreamValues;
  streamDetail: StreamValues;
  activeStream: StreamInfo | Stream | undefined;
  deletedStreams: string[];
  highLightableStreamId: string | undefined;
  loadingStreamActivity: boolean;
  streamActivity: StreamActivityV1[] | StreamActivity[] | undefined;
  hasMoreStreamActivity: boolean;
  customStreamDocked: boolean;
  diagnosisInfo: RuntimeAppDetails | undefined;
  // Accounts page
  loadingUserAssets: boolean;
  tokenAccounts: AccountTokenParsedInfo[] | undefined;
  splTokenList: UserTokenAccount[];
  accountTokens: UserTokenAccount[];
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
  // General
  setTheme: (name: string) => void;
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
  setMultisigTxs: (list: Array<MultisigTransaction> | undefined) => void;
  setSelectedStream: (stream: StreamValues) => void;
  setActiveStream: (stream: StreamValues) => void;
  setStreamDetail: (stream: StreamValues) => void;
  setDeletedStream: (id: string) => void;
  setHighLightableStreamId: (id: string | undefined) => void;
  openStreamById: (streamId: string, dock: boolean) => void;
  getStreamActivity: (streamId: string, version: number, clearHistory?: boolean) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setDiagnosisInfo: (info: RuntimeAppDetails | undefined) => void;
  // Accounts page
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
  // biome-ignore lint/suspicious/noExplicitAny: Promise<QueryObserverResult<MultisigInfo[] | undefined, Error>>
  refreshMultisigs: () => Promise<any>;
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
    lastOperation: TransactionStatus.Idle,
    currentOperation: TransactionStatus.Idle,
  },
  previousWalletConnectState: false,
  multisigTxs: undefined,
  selectedStream: undefined,
  streamDetail: undefined,
  activeStream: undefined,
  deletedStreams: [],
  highLightableStreamId: undefined,
  loadingStreamActivity: false,
  streamActivity: undefined,
  hasMoreStreamActivity: true,
  customStreamDocked: false,
  diagnosisInfo: undefined,
  // Accounts page
  loadingUserAssets: true,
  tokenAccounts: undefined,
  splTokenList: [],
  accountTokens: [],
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
  // General
  setTheme: () => {},
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
  refreshMultisigs: async () => {},
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

interface ProviderProps {
  children: ReactNode;
}

const AppStateProvider = ({ children }: ProviderProps) => {
  const { t } = useTranslation('common');
  // Parent contexts
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const { selectedAccount } = useWalletAccount();
  const connectionConfig = useConnectionConfig();
  // Account selection
  const [isWhitelisted, setIsWhitelisted] = useState(contextDefaultValues.isWhitelisted);
  const today = new Date().toLocaleDateString('en-US');
  const tomorrow = dayjs().add(1, 'day').format('L');
  const timeDate = dayjs().format('hh:mm A');
  const [theme, updateTheme] = useLocalStorage('theme', 'dark');
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
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(contextDefaultValues.loadingStreamActivity);
  const [streamActivity, setStreamActivity] = useState<StreamActivityV1[] | StreamActivity[] | undefined>(undefined);
  const [hasMoreStreamActivity, setHasMoreStreamActivity] = useState<boolean>(
    contextDefaultValues.hasMoreStreamActivity,
  );
  const [customStreamDocked, setCustomStreamDocked] = useState(contextDefaultValues.customStreamDocked);
  const [diagnosisInfo, setDiagnosisInfo] = useState<RuntimeAppDetails | undefined>(contextDefaultValues.diagnosisInfo);
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

  const setTheme = useCallback(
    (name: string) => {
      updateTheme(name);
    },
    [updateTheme],
  );

  // Set theme option to html tag
  // biome-ignore lint/correctness/useExhaustiveDependencies: Ommiting updateTheme
  useEffect(() => {
    const applyTheme = (name?: string) => {
      const value = name ?? 'dark';
      document.documentElement.setAttribute('data-theme', value);
      updateTheme(value);
    };

    applyTheme(theme);
    return () => {};
  }, [theme]);

  const { tokenStreamingV1, tokenStreamingV2 } = useStreamingClient();
  const { multisigClient } = useMultisigClient();
  const { tokenList: meanTokenList } = useGetTokenList();
  const { prices: priceList, loadingPrices, refetchPrices } = useGetAssetPrices();
  const { userAssets, loadingUserAssets } = useAccountAssets(selectedAccount.address);
  const {
    data: walletMultisigs,
    isFetching: loadingMultisigAccounts,
    refetch: refreshMultisigs,
  } = useGetMultisigAccounts(publicKey?.toBase58());

  const accountTokens = useMemo(() => {
    if (loadingUserAssets || !userAssets) return [];

    return userAssets.accountTokens;
  }, [loadingUserAssets, userAssets]);

  const tokenAccounts = useMemo(() => {
    if (loadingUserAssets || !userAssets) return [];

    return userAssets.userTokenAccounts ?? [];
  }, [loadingUserAssets, userAssets]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    setTransactions([]);
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

  const setActiveTab = useCallback((data: string) => {
    updateActiveTab(data);
  }, []);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
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

  const resetStreamsState = useCallback(() => {
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
          if (tokenStreamingV2 && publicKey) {
            const detail = await tokenStreamingV2.getStream(streamPublicKey);
            consoleOut('customStream', detail);
            if (detail) {
              setStreamDetail(detail);
              setActiveStream(detail);
              if (dock) {
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
        console.error(error);
        openNotification({
          title: t('notifications.error-title'),
          description: t('notifications.invalid-publickey-message'),
          type: 'error',
        });
      }
    },
    [tokenStreamingV2, publicKey, t],
  );

  const getStreamActivity = useCallback(
    (streamId: string, version: number, clearHistory = false) => {
      if (!connected || !streamId || !tokenStreamingV1 || !tokenStreamingV2) {
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
          tokenStreamingV1
            .listStreamActivity(streamPublicKey)
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
          tokenStreamingV2
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
    [tokenStreamingV1, tokenStreamingV2, connected, streamActivity, loadingStreamActivity],
  );

  const setSelectedStream = useCallback(
    (stream: StreamValues) => {
      updateSelectedStream(stream);
      if (stream) {
        // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
        const mspInstance: any = stream.version < 2 ? tokenStreamingV1 : tokenStreamingV2;
        mspInstance
          .getStream(new PublicKey(stream.id as string))
          .then((detail: Stream | StreamInfo) => {
            consoleOut('detail:', detail, 'blue');
            if (detail) {
              updateStreamDetail(detail);
              setActiveStream(detail);
            }
          })
          // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
          .catch((error: any) => {
            console.error(error);
          });
      }
    },
    [tokenStreamingV1, tokenStreamingV2],
  );

  const setStreamDetail = useCallback((stream: StreamValues) => {
    updateStreamDetail(stream);
  }, []);

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

  const refreshPrices = useCallback(() => {
    refetchPrices();
  }, [refetchPrices]);

  // Update token price while list of prices change
  useEffect(() => {
    if (priceList && selectedToken) {
      const price = getTokenPriceByAddress(selectedToken.address, selectedToken.symbol);
      updateEffectiveRate(price);
    }
  }, [getTokenPriceByAddress, priceList, selectedToken]);

  const refreshTokenBalance = useCallback(async () => {
    if (!connection || !publicKey || !tokenAccounts || !tokenAccounts.length) {
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
  }, [connection, publicKey, tokenAccounts, selectedToken?.address, selectedAccount.address]);

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

  // Load the supported tokens
  useEffect(() => {
    const list = new Array<UserTokenAccount>();
    // First add Native SOL as a token
    list.push({
      address: NATIVE_SOL.address,
      balance: 0,
      chainId: 0,
      decimals: NATIVE_SOL.decimals,
      name: NATIVE_SOL.name,
      symbol: NATIVE_SOL.symbol,
      publicAddress: '',
      tags: NATIVE_SOL.tags,
      logoURI: NATIVE_SOL.logoURI,
    });
    // Add items from the MeanFi list
    const chainFiltered = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster));
    for (const item of chainFiltered) {
      if (item.address === NATIVE_SOL.address) continue;
      list.push(item);
    }
    // Save the MeanFi list
    updateTokenlist(list);
  }, [connectionConfig.cluster]);

  // Enrich the list of tokens with the API resolved tokens
  useEffect(() => {
    if (!tokenList || tokenList.length === 0 || !meanTokenList || meanTokenList.length === 0) {
      return;
    }

    const userTokenList = JSON.parse(JSON.stringify(tokenList)) as UserTokenAccount[];
    // Add the items from the API
    for (const item of meanTokenList) {
      if (!userTokenList.some(i => i.address === item.address)) {
        userTokenList.push(item);
      }
    }
    // Filter out the banned tokens
    const filteredTokens = userTokenList.filter(t => !BANNED_TOKENS.some(bt => bt === t.symbol));
    // Sort the big list
    const sortedList = [...filteredTokens].sort((a, b) => {
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
    updateSplTokenList(sortedList);
  }, [meanTokenList, tokenList]);

  // Get and populate the list of NFTs that the user holds
  useEffect(() => {
    if (!selectedAccount.address) {
      return;
    }

    getAccountNFTs(connection, selectedAccount.address).then(response => {
      consoleOut('getAccountNFTs() response:', response, 'blue');
      setAccountNfts(response);
    });
  }, [selectedAccount.address, connection]);

  ///////////////////////
  // Multisig accounts //
  ///////////////////////

  const [needReloadMultisigAccounts, setNeedReloadMultisigAccounts] = useState(
    contextDefaultValues.needReloadMultisigAccounts,
  );
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[]>(contextDefaultValues.multisigAccounts);
  const [patchedMultisigAccounts, setPatchedMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(
    contextDefaultValues.selectedMultisig,
  );
  const [loadingMultisigTxPendingCount, setLoadingMultisigTxPendingCount] = useState(
    contextDefaultValues.loadingMultisigTxPendingCount,
  );

  // Update multisigAccounts from the walletMultisigs
  useEffect(() => {
    if (!walletMultisigs) {
      return;
    }

    setNeedReloadMultisigAccounts(false);
    setPatchedMultisigAccounts(undefined);

    setMultisigAccounts(walletMultisigs);
  }, [walletMultisigs]);

  // Patches the multisigAccounts with the pending txs count
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

    const findPendingTxs = async () => {
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
          consoleOut(`Failed pulling tx for multisig ${multisig.id.toBase58()}`, '', 'red');
          console.error(error);
        }
      }
      if (anythingChanged) {
        consoleOut('setting patchedMultisigAccounts...', '', 'crimson');
        setPatchedMultisigAccounts(multisigAccountsCopy);
      }
      setLoadingMultisigTxPendingCount(false);
    };

    findPendingTxs();
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

  const setLoadingRecurringBuys = useCallback((value: boolean) => {
    updateLoadingRecurringBuys(value);
  }, []);

  const setRecurringBuys = (recurringBuys: DdcaAccount[]) => {
    updateRecurringBuys(recurringBuys);
  };

  // TODO: Remove this after fixing dependencies
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const values = useMemo(() => {
    return {
      accountNfts,
      activeStream,
      activeTab,
      coolOffPeriodFrequency,
      customStreamDocked,
      deletedStreams,
      diagnosisInfo,
      effectiveRate,
      fromCoinAmount,
      hasMoreStreamActivity,
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
      loadingUserAssets,
      lockPeriodAmount,
      lockPeriodFrequency,
      multisigAccounts,
      multisigSolBalance,
      multisigTxs,
      multisigVaults,
      needReloadMultisigAccounts,
      paymentRateAmount,
      paymentRateFrequency,
      paymentStartDate,
      paymentStreamingStats,
      pendingMultisigTxCount,
      previousRoute,
      previousWalletConnectState,
      priceList,
      proposalEndDate,
      proposalEndTime,
      recipientAddress,
      recipientNote,
      recurringBuys,
      selectedAccount,
      selectedAsset,
      selectedMultisig,
      selectedStream,
      selectedTab,
      selectedToken,
      splTokenList,
      stakedAmount,
      stakingMultiplier,
      streamActivity,
      streamDetail,
      streamsSummary,
      theme,
      timeSheetRequirement,
      tokenAccounts,
      tokenBalance,
      tokenList,
      totalSafeBalance,
      transactions,
      transactionStatus,
      treasuryOption,
      unstakedAmount,
      unstakeStartDate,
      accountTokens,
      appendHistoryItems,
      getStreamActivity,
      getTokenByMintAddress,
      getTokenPriceByAddress,
      hideDepositOptionsModal,
      openStreamById,
      refreshMultisigs,
      refreshPrices,
      refreshTokenBalance,
      resetContractValues,
      resetStreamsState,
      setActiveStream,
      setActiveTab,
      setCoolOffPeriodFrequency,
      setCustomStreamDocked,
      setDeletedStream,
      setDiagnosisInfo,
      setEffectiveRate,
      setFromCoinAmount,
      setHighLightableMultisigId,
      setHighLightableStreamId,
      setIsAllocationReserved,
      setIsVerifiedRecipient,
      setLastStreamsSummary,
      setLoadingRecurringBuys,
      setLockPeriodAmount,
      setLockPeriodFrequency,
      setMultisigAccounts,
      setMultisigSolBalance,
      setMultisigTxs,
      setMultisigVaults,
      setNeedReloadMultisigAccounts,
      setPaymentRateAmount,
      setPaymentRateFrequency,
      setPaymentStartDate,
      setPaymentStreamingStats,
      setPendingMultisigTxCount,
      setPreviousRoute,
      setPreviousWalletConnectState,
      setProposalEndDate,
      setProposalEndTime,
      setRecipientAddress,
      setRecipientNote,
      setRecurringBuys,
      setSelectedAsset,
      setSelectedMultisig,
      setSelectedStream,
      setSelectedTab,
      setSelectedToken,
      setSelectedTokenBalance,
      setStakedAmount,
      setStakingMultiplier,
      setStreamDetail,
      setStreamsSummary,
      setTheme,
      setTimeSheetRequirement,
      setTotalSafeBalance,
      setTransactionStatus,
      setTreasuryOption,
      setUnstakedAmount,
      setUnstakeStartDate,
      showDepositOptionsModal,
    };
  }, [
    accountNfts,
    activeStream,
    activeTab,
    coolOffPeriodFrequency,
    customStreamDocked,
    deletedStreams,
    diagnosisInfo,
    effectiveRate,
    fromCoinAmount,
    hasMoreStreamActivity,
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
    loadingUserAssets,
    lockPeriodAmount,
    lockPeriodFrequency,
    multisigAccounts,
    multisigSolBalance,
    multisigTxs,
    multisigVaults,
    needReloadMultisigAccounts,
    paymentRateAmount,
    paymentRateFrequency,
    paymentStartDate,
    paymentStreamingStats,
    pendingMultisigTxCount,
    previousRoute,
    previousWalletConnectState,
    priceList,
    proposalEndDate,
    proposalEndTime,
    recipientAddress,
    recipientNote,
    recurringBuys,
    selectedAccount,
    selectedAsset,
    selectedMultisig,
    selectedStream,
    selectedTab,
    selectedToken,
    splTokenList,
    stakedAmount,
    stakingMultiplier,
    streamActivity,
    streamDetail,
    streamsSummary,
    theme,
    timeSheetRequirement,
    tokenAccounts,
    tokenBalance,
    tokenList,
    totalSafeBalance,
    transactions,
    transactionStatus,
    treasuryOption,
    unstakedAmount,
    unstakeStartDate,
    accountTokens,
    appendHistoryItems,
    getStreamActivity,
    getTokenByMintAddress,
    getTokenPriceByAddress,
    hideDepositOptionsModal,
    openStreamById,
    refreshMultisigs,
    refreshPrices,
    refreshTokenBalance,
    resetContractValues,
    resetStreamsState,
    setActiveTab,
    setTheme,
    setSelectedStream,
    showDepositOptionsModal,
    setPreviousWalletConnectState,
    // TODO: Conver all these into useCallbacks
    // setCoolOffPeriodFrequency,
    // setDeletedStream,
    // setEffectiveRate,
    // setFromCoinAmount,
    setLoadingRecurringBuys,
    // setLockPeriodAmount,
    // setLockPeriodFrequency,
    // setMultisigSolBalance,
    // setPaymentRateAmount,
    // setPaymentRateFrequency,
    // setPaymentStartDate,
    // setProposalEndDate,
    // setProposalEndTime,
    // setRecipientAddress,
    // setRecipientNote,
    // setRecurringBuys,
    // setSelectedAsset,
    // setSelectedTab,
    // setSelectedToken,
    // setSelectedTokenBalance,
    // setStakedAmount,
    // setStakingMultiplier,
    setStreamDetail,
    // setTimeSheetRequirement,
    // setTotalSafeBalance,
    // setTransactionStatus,
    // setTreasuryOption,
    // setUnstakedAmount,
    // setUnstakeStartDate,
  ]);

  return <AppStateContext.Provider value={values}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
