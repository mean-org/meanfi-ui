import React, { useCallback, useEffect, useMemo, useState } from "react";
import { shortenAddress, useLocalStorageState } from "../utils/utils";
import { PRICE_REFRESH_TIMEOUT, STREAMING_PAYMENT_CONTRACTS, STREAMS_REFRESH_TIMEOUT } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { findATokenAddress, getStream, listStreamActivity, listStreams } from "money-streaming/lib/utils";
import { useWallet } from "./wallet";
import { ENDPOINTS, getEndpointByRuntimeEnv, useConnection, useConnectionConfig } from "./connection";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useAccountsContext, useNativeAccount } from "./accounts";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { AppConfigService, environment } from "../environments/environment";
import { getPrices } from "../utils/api";
import { notify } from "../utils/notifications";
import { StreamActivity, StreamInfo } from "money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Connection } from "@solana/web3.js";
import { TransactionWithSignature, UserTokenAccount } from "../models/transactions";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { NATIVE_SOL } from "../utils/tokens";
import _ from "lodash";
import { TokenAccount } from "../models/account";
import { NATIVE_SOL_MINT } from "../utils/ids";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

export interface TransactionStatusInfo {
  lastOperation?: TransactionStatus | undefined;
  currentOperation?: TransactionStatus | undefined;
}

interface AppStateConfig {
  theme: string | undefined;
  currentScreen: string | undefined;
  detailsPanelOpen: boolean;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  tokenBalance: number;
  fromCoinAmount: string;
  effectiveRate: number;
  coinPrices: any | null;
  contract: ContractDefinition | undefined;
  recipientAddress: string;
  recipientNote: string;
  paymentStartDate: string | undefined;
  paymentRateAmount: string;
  paymentRateFrequency: PaymentRateType;
  timeSheetRequirement: TimesheetRequirementOption;
  transactionStatus: TransactionStatusInfo;
  previousWalletConnectState: boolean;
  loadingStreams: boolean;
  streamList: StreamInfo[] | undefined;
  selectedStream: StreamInfo | undefined;
  streamDetail: StreamInfo | undefined;
  streamProgramAddress: string;
  loadingStreamActivity: boolean;
  streamActivity: StreamActivity[];
  customStreamDocked: boolean;
  referral: TokenInfo | undefined;
  // Transactions
  tokens: UserTokenAccount[];
  userTokens: UserTokenAccount[];
  transactions: TransactionWithSignature[];
  setTheme: (name: string) => void;
  setCurrentScreen: (name: string) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setFromCoinAmount: (data: string) => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  refreshTokenBalance: () => void;
  resetContractValues: () => void;
  refreshStreamList: (reset?: boolean) => void;
  setContract: (name: string) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
  setPaymentStartDate: (date: string) => void;
  setPaymentRateAmount: (data: string) => void;
  setPaymentRateFrequency: (freq: PaymentRateType) => void;
  setTimeSheetRequirement: (req: TimesheetRequirementOption) => void;
  setTransactionStatus: (status: TransactionStatusInfo) => void;
  setPreviousWalletConnectState: (state: boolean) => void;
  setLoadingStreams: (state: boolean) => void;
  setStreamList: (list: StreamInfo[] | undefined) => void;
  setSelectedStream: (stream: StreamInfo | undefined) => void;
  setStreamDetail: (stream: StreamInfo) => void;
  openStreamById: (streamId: string) => void;
  getStreamActivity: (streamId: string) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setReferral: (token: TokenInfo | undefined) => void;
  // Transactions
  setTransactions: (tx: TransactionWithSignature[]) => void;
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  currentScreen: undefined,
  detailsPanelOpen: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  fromCoinAmount: '',
  effectiveRate: 0,
  coinPrices: null,
  contract: undefined,
  recipientAddress: '',
  recipientNote: '',
  paymentStartDate: undefined,
  paymentRateAmount: '',
  paymentRateFrequency: PaymentRateType.PerMonth,
  timeSheetRequirement: TimesheetRequirementOption.NotRequired,
  transactionStatus: {
    lastOperation: TransactionStatus.Iddle,
    currentOperation: TransactionStatus.Iddle
  },
  previousWalletConnectState: false,
  loadingStreams: false,
  streamList: undefined,
  selectedStream: undefined,
  streamDetail: undefined,
  streamProgramAddress: '',
  loadingStreamActivity: false,
  streamActivity: [],
  customStreamDocked: false,
  referral: undefined,
  // Transactions
  tokens: [],
  userTokens: [],
  transactions: [],
  setTheme: () => {},
  setCurrentScreen: () => {},
  setDtailsPanelOpen: () => {},
  setContract: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
  setFromCoinAmount: () => {},
  setEffectiveRate: () => {},
  setCoinPrices: () => {},
  refreshTokenBalance: () => {},
  resetContractValues: () => {},
  refreshStreamList: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setPaymentRateAmount: () => {},
  setPaymentRateFrequency: () => {},
  setTimeSheetRequirement: () => {},
  setTransactionStatus: () => {},
  setPreviousWalletConnectState: () => {},
  setLoadingStreams: () => {},
  setStreamList: () => {},
  setSelectedStream: () => {},
  setStreamDetail: () => {},
  openStreamById: () => {},
  getStreamActivity: () => {},
  setCustomStreamDocked: () => { },
  setReferral: () => {},
  // Transactions
  setTransactions: () => {}
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const location = useLocation();
  const { t } = useTranslation('common');
  // Parent contexts
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const connectionConfig = useConnectionConfig();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [streamProgramAddress, setStreamProgramAddress] = useState('');

  if (!streamProgramAddress) {
    const config = new AppConfigService();
    setStreamProgramAddress(config.getConfig().streamProgramAddress);
  }

  const today = new Date().toLocaleDateString();
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [currentScreen, setSelectedTab] = useState<string>('contract');
  const [detailsPanelOpen, updateDetailsPanelOpen] = useState(contextDefaultValues.detailsPanelOpen);
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [recipientAddress, updateRecipientAddress] = useState<string>(contextDefaultValues.recipientAddress);
  const [recipientNote, updateRecipientNote] = useState<string>(contextDefaultValues.recipientNote);
  const [paymentStartDate, updatePaymentStartDate] = useState<string | undefined>(today);
  const [fromCoinAmount, updateFromCoinAmount] = useState<string>(contextDefaultValues.fromCoinAmount);
  const [paymentRateAmount, updatePaymentRateAmount] = useState<string>(contextDefaultValues.paymentRateAmount);
  const [paymentRateFrequency, updatePaymentRateFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(TimesheetRequirementOption.NotRequired);
  const [transactionStatus, updateTransactionStatus] = useState<TransactionStatusInfo>(contextDefaultValues.transactionStatus);
  const [previousWalletConnectState, updatePreviousWalletConnectState] = useState<boolean>(connected);
  const [tokenList, updateTokenlist] = useState<TokenInfo[]>([]);
  const [streamList, setStreamList] = useState<StreamInfo[] | undefined>();
  const [selectedStream, updateSelectedStream] = useState<StreamInfo | undefined>();
  const [streamDetail, updateStreamDetail] = useState<StreamInfo | undefined>();
  const [loadingStreams, updateLoadingStreams] = useState(false);
  const [loadingStreamActivity, setLoadingStreamActivity] = useState(contextDefaultValues.loadingStreamActivity);
  const [streamActivity, setStreamActivity] = useState<StreamActivity[]>([]);
  const [customStreamDocked, setCustomStreamDocked] = useState(contextDefaultValues.customStreamDocked);

  const setTheme = (name: string) => {
    updateTheme(name);
  }

  const setDtailsPanelOpen = (state: boolean) => {
    updateDetailsPanelOpen(state);
  }

  useEffect(() => {
    const applyTheme = (name?: string) => {
      const theme = name || 'light';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

  const setCurrentScreen = (name: string) => {
    setSelectedTab(name);
  }

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

  const setRecipientAddress = (address: string) => {
    updateRecipientAddress(address);
  }

  const setRecipientNote = (note: string) => {
    updateRecipientNote(note);
  }

  const setPaymentStartDate = (date: string) => {
    updatePaymentStartDate(date);
  }

  const setFromCoinAmount = (data: string) => {
    updateFromCoinAmount(data);
  }

  const setPaymentRateAmount = (data: string) => {
    updatePaymentRateAmount(data);
  }

  const setPaymentRateFrequency = (freq: PaymentRateType) => {
    updatePaymentRateFrequency(freq);
  }

  const setTimeSheetRequirement = (req: TimesheetRequirementOption) => {
    updateTimeSheetRequirement(req);
  }

  const setTransactionStatus = (status: TransactionStatusInfo) => {
    updateTransactionStatus(status);
  }

  const resetContractValues = () => {
    setFromCoinAmount('');
    setRecipientAddress('');
    setRecipientNote('');
    setPaymentStartDate(today);
    setPaymentRateAmount('');
    setPaymentRateFrequency(PaymentRateType.PerMonth);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const setPreviousWalletConnectState = (state: boolean) => {
    updatePreviousWalletConnectState(state);
    if (state === false) {
      resetContractValues();
      setCustomStreamDocked(false);
    }
  }

  const openStreamById = async (streamId: string) => {
    let streamPublicKey: PublicKey;
    try {
      streamPublicKey = new PublicKey(streamId);
      try {
        const detail = await getStream(connection, streamPublicKey);
        console.log('customStream', detail);
        if (detail) {
          setStreamDetail(detail);
          setStreamList([detail]);
          getStreamActivity(streamId);
          setCustomStreamDocked(true);
          notify({
            description: t('notifications.success-loading-stream-message', {streamId: shortenAddress(streamId, 10)}),
            type: "success"
          });
        } else {
          notify({
            message: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.log('customStream', error);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
          type: "error"
        });
      }
    } catch (error) {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.invalid-publickey-message'),
        type: "error"
      });
    }
  }

  const getStreamActivity = useCallback((streamId: string) => {
    if (!connected || !streamId) {
      return [];
    }

    if (!loadingStreamActivity) {
      setLoadingStreamActivity(true);
      const streamPublicKey = new PublicKey(streamId);
      const newConnection = new Connection(getEndpointByRuntimeEnv(), "confirmed");
      listStreamActivity(newConnection, getEndpointByRuntimeEnv(), streamPublicKey)
        .then(value => {
          console.log('activity:', value);
          setStreamActivity(value);
          setLoadingStreamActivity(false);
        })
        .catch(err => {
          console.log(err);
          setStreamActivity([]);
          setLoadingStreamActivity(false);
        });
    }

  }, [
    connected,
    loadingStreamActivity
  ]);

  const setSelectedStream = (stream: StreamInfo | undefined) => {
    updateSelectedStream(stream);
    updateStreamDetail(stream);
    if (stream) {
      getStreamActivity(stream.id as string);
    } else {
      setStreamActivity([]);
    }
  }

  const setStreamDetail = (stream: StreamInfo) => {
    updateStreamDetail(stream);
  }

  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number>(contextDefaultValues.tokenBalance);
  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [contractName, setContractName] = useLocalStorageState("contractName");
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);
  const [referral, setReferral] = useState<TokenInfo>();  

  const setSelectedToken = (token: TokenInfo | undefined) => {
    updateSelectedToken(token);
    setShouldUpdateToken(true);
  }

  const setSelectedTokenBalance = (balance: number) => {
    updateTokenBalance(balance);
  }

  const setEffectiveRate = (rate: number) => {
    updateEffectiveRate(rate);
  }

  // Effect to load coin prices
  useEffect(() => {
    let coinTimer: any;

    const getCoinPrices = async () => {
      try {
        await getPrices()
          .then((prices) => {
            console.log("Coin prices:", prices);
            setCoinPrices(prices);
            if (selectedToken) {
              const tokenSymbol = selectedToken.symbol.toUpperCase();
              const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;
              updateEffectiveRate(
                prices[symbol] ? prices[symbol] : 0
              );
            }
          })
          .catch(() => setCoinPrices(null));
      } catch (error) {
        setCoinPrices(null);
      }
    };

    if (shouldLoadCoinPrices && selectedToken) {
      setShouldLoadCoinPrices(false);
      getCoinPrices();
    }

    coinTimer = window.setInterval(() => {
      console.log(`Refreshing prices past ${PRICE_REFRESH_TIMEOUT / 60 / 1000}min...`);
      getCoinPrices();
    }, PRICE_REFRESH_TIMEOUT);

    // Return callback to run on unmount.
    return () => {
      if (coinTimer) {
        window.clearInterval(coinTimer);
      }
    };
  }, [
    coinPrices,
    shouldLoadCoinPrices,
    selectedToken
  ]);

  // Cache contracts
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

  const refreshStreamList = useCallback((reset = false) => {
    if (!publicKey) {
      return [];
    }

    if (!loadingStreams) {
      updateLoadingStreams(true);
      const programId = new PublicKey(streamProgramAddress);

      listStreams(connection, programId, publicKey, publicKey)
        .then(streams => {
          console.log('Streams:', streams);
          let item: StreamInfo | undefined;
          if (streams.length) {
            if (reset) {
              item = streams[0];
            } else {
              // Try to get current item by its id
              if (selectedStream) {
                const itemFromServer = streams.find(i => i.id === selectedStream.id);
                item = itemFromServer || selectedStream;
              } else {
                item = streams[0];
              }
            }
            console.log('selectedStream:', item);
            if (item) {
              updateSelectedStream(item);
              updateStreamDetail(item);
              if (!loadingStreamActivity) {
                setLoadingStreamActivity(true);
                const streamPublicKey = new PublicKey(item.id as string);
                listStreamActivity(connection, getEndpointByRuntimeEnv(), streamPublicKey)
                  .then(value => {
                    console.log('activity:', value);
                    setStreamActivity(value);
                    setLoadingStreamActivity(false);
                  })
                  .catch(err => {
                    console.log(err);
                    setStreamActivity([]);
                    setLoadingStreamActivity(false);
                  });
              }
            }
            if (currentScreen === 'contract') {
              setSelectedTab('streams');
            }
          } else {
            setStreamActivity([]);
            updateSelectedStream(undefined);
            updateStreamDetail(undefined);
            setSelectedTab('contract');
          }
          setStreamList(streams);
          updateLoadingStreams(false);
        }).catch(err => {
          console.log(err);
          updateLoadingStreams(false);
        });
    }
  }, [
    connection,
    currentScreen,
    streamProgramAddress,
    loadingStreamActivity,
    selectedStream,
    loadingStreams,
    publicKey
  ]);

  // Streams refresh timeout
  useEffect(() => {
    let timer: any;

    if (location.pathname === '/transfers') {
      if (!streamList) {
        refreshStreamList(true);
      }

      if (streamList && currentScreen === 'streams' && !customStreamDocked) {
        timer = setInterval(() => {
          console.log(`Refreshing streams past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
          refreshStreamList(false);
        }, STREAMS_REFRESH_TIMEOUT);
      }
    }

    return () => clearInterval(timer);
  }, [
    location,
    streamList,
    currentScreen,
    customStreamDocked,
    refreshStreamList
  ]);

  // Auto select a token
  useEffect(() => {

    if (connectionConfig && connectionConfig.tokens && connectionConfig.tokens.length) {
      updateTokenlist(connectionConfig.tokens);
      if (!selectedToken) {
        setSelectedToken(connectionConfig.tokens[0]);
      }
    }

    return () => {};
  }, [
    connectionConfig,
    selectedToken
  ]);

  const refreshTokenBalance = useCallback(async () => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (!address) return 0;
      const accountInfo = await connection.getAccountInfo(address.toPublicKey());
      if (!accountInfo) return 0;
      if (address === publicKey?.toBase58()) {
        return accountInfo.lamports / LAMPORTS_PER_SOL;
      }
      const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
      return tokenAmount.uiAmount || 0;
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

  // Added to support transaction history
  const [transactions, setTransactions] = useState<Array<TransactionWithSignature>>([]);
  const [tokens, setTokens] = useState<UserTokenAccount[]>([]);
  const [userTokens, setUserTokens] = useState<UserTokenAccount[]>([]);
  const [loadingUserTokens, setLoadingUserTokens] = useState(false);
  const [shouldLoadBalances, setShouldLoadBalances] = useState(false);
  const chain = ENDPOINTS.find((end) => end.endpoint === connectionConfig.endpoint) || ENDPOINTS[0];

  // Load a Token list for use in accounts page
  useEffect(() => {
    (async () => {
      let list = new Array<UserTokenAccount>();
      if (environment === 'production') {
        const res = await new TokenListProvider().resolve();
        list = res
          .filterByChainId(chain.chainID)
          .excludeByTag("nft")
          .getList();
      } else {
        list = MEAN_TOKEN_LIST.filter(t => t.chainId === chain.chainID);
      }
      setTokens(list);
    })();

    return () => { }

  }, [chain]);

  // Filter down the token list against the user token accounts
  useEffect(() => {
    if (!publicKey || !tokens || !accounts || !accounts.tokenAccounts || accounts.tokenAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      const myTokens = new Array<UserTokenAccount>();
      myTokens.push(NATIVE_SOL as UserTokenAccount);
      for (let i = 0; i < accounts.tokenAccounts.length; i++) {
        const item = accounts.tokenAccounts[i];
        let token: UserTokenAccount | undefined;
        const mintAddress = item.info.mint.toBase58();
        // console.log(`Account ${i + 1} of ${accounts.tokenAccounts.length}| Native: ${item.info.isNative ? 'Yes' : 'No'} | mint address:`, mintAddress || '-');
        token = tokens.find(i => i.address === mintAddress);

        // Add the token only if matches one of the user's token account and it is not already in the list
        if (token) {
          if (!myTokens.some(t => t.address === token?.address)) {
            myTokens.push(token);
          }
        }
      }
      console.log('myTokens:', myTokens);
      setUserTokens(myTokens);
      setLoadingUserTokens(false);
      setShouldLoadBalances(true);
    });

    return () => {
      clearTimeout(timeout);
    }
  }, [
    publicKey,
    tokens,
    accounts,
    loadingUserTokens
  ]);

  const getTokenBalance = useCallback(async (tokenPk: PublicKey) => {
    if (tokenPk.equals(NATIVE_SOL_MINT)) {
      const info = await connection.getAccountInfo(publicKey as PublicKey);
      const balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
      return balance;
    } else {
      const info = await connection?.getTokenAccountBalance(tokenPk);
      const balance = info && info.value ? (info.value.uiAmount || 0) : 0;
      return balance;
    }
  }, [
    connection, 
    publicKey
  ]);

  // Update the user token account balances when the list of tokens change
  useEffect(() => {
    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    const getBalances = async (tokenList: UserTokenAccount[], userAccounts: TokenAccount[]) => {
      if (tokenList && tokenList.length > 0 && userAccounts && userAccounts.length > 0) {
        const tokenListCopy = _.cloneDeep(tokenList);
        tokenListCopy[0].balance = getAccountBalance();
        for (let i = 1; i < tokenListCopy.length; i++) {
          const tokenAddress = tokenListCopy[i].address;
          const tokenMint = userAccounts.find(m => m.info.mint.toBase58() === tokenAddress);
          if (tokenMint) {
            const associatedTokenAddress = await Token.getAssociatedTokenAddress(
              ASSOCIATED_TOKEN_PROGRAM_ID,
              TOKEN_PROGRAM_ID,
              tokenMint.info.mint,
              publicKey as PublicKey
            );
            tokenListCopy[i].ataAddress = associatedTokenAddress.toBase58();
            tokenListCopy[i].balance = await getTokenBalance(associatedTokenAddress);
          }
        }
        setUserTokens(tokenListCopy);
        setShouldLoadBalances(false);
      }
    }

    if (location.pathname === '/accounts' && connection && publicKey && userTokens && accounts && shouldLoadBalances) {
      getBalances(userTokens, accounts.tokenAccounts);
    }
  }, [
    location,
    connection,
    publicKey,
    userTokens,
    accounts,
    account?.lamports,
    shouldLoadBalances,
    getTokenBalance
  ]);

  return (
    <AppStateContext.Provider
      value={{
        theme,
        currentScreen,
        detailsPanelOpen,
        tokenList,
        selectedToken,
        tokenBalance,
        fromCoinAmount,
        effectiveRate,
        coinPrices,
        contract,
        recipientAddress,
        recipientNote,
        paymentStartDate,
        paymentRateAmount,
        paymentRateFrequency,
        timeSheetRequirement,
        transactionStatus,
        previousWalletConnectState,
        loadingStreams,
        streamList,
        selectedStream,
        streamDetail,
        streamProgramAddress,
        loadingStreamActivity,
        streamActivity,
        customStreamDocked,
        referral,
        tokens,
        userTokens,
        transactions,
        setTheme,
        setCurrentScreen,
        setDtailsPanelOpen,
        setSelectedToken,
        setSelectedTokenBalance,
        setFromCoinAmount,
        setEffectiveRate,
        setCoinPrices,
        refreshTokenBalance,
        resetContractValues,
        refreshStreamList,
        setContract,
        setRecipientAddress,
        setRecipientNote,
        setPaymentStartDate,
        setPaymentRateAmount,
        setPaymentRateFrequency,
        setTimeSheetRequirement,
        setTransactionStatus,
        setPreviousWalletConnectState,
        setLoadingStreams,
        setStreamList,
        setSelectedStream,
        setStreamDetail,
        openStreamById,
        getStreamActivity,
        setCustomStreamDocked,
        setReferral,
        setTransactions
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
