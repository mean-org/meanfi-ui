import React, { useCallback, useEffect, useMemo, useState } from "react";
import { shortenAddress, useLocalStorageState } from "../utils/utils";
import { PRICE_REFRESH_TIMEOUT, STREAMING_PAYMENT_CONTRACTS, STREAMS_REFRESH_TIMEOUT } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { findATokenAddress, getStream, listStreamActivity, listStreams } from "money-streaming/lib/utils";
import { useWallet } from "./wallet";
import { getEndpointByRuntimeEnv, useConnection, useConnectionConfig } from "./connection";
import { PublicKey } from "@solana/web3.js";
import { useAccountsContext } from "./accounts";
import { TokenInfo } from "@solana/spl-token-registry";
import { AppConfigService } from "../environments/environment";
import { getPrices } from "../utils/api";
import { notify } from "../utils/notifications";
import { StreamActivity, StreamInfo } from "money-streaming/lib/types";
import { useTranslation } from "react-i18next";

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
  swapToToken: TokenInfo | undefined;
  swapToTokenBalance: number;
  swapToTokenAmount: string;
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
  setTheme: (name: string) => void;
  setCurrentScreen: (name: string) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setFromCoinAmount: (data: string) => void;
  setSwapToToken: (token: TokenInfo | undefined) => void;
  setSwapToTokenBalance: (balance: number) => void;
  setSwapToTokenAmount: (data: string) => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  refreshTokenBalance: () => void;
  refreshSwapToTokenBalance: () => void;
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
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  currentScreen: undefined,
  detailsPanelOpen: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  fromCoinAmount: '',
  swapToToken: undefined,
  swapToTokenBalance: 0,
  swapToTokenAmount: '',
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
  setTheme: () => {},
  setCurrentScreen: () => {},
  setDtailsPanelOpen: () => {},
  setContract: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
  setFromCoinAmount: () => {},
  setSwapToToken: () => {},
  setSwapToTokenBalance: () => {},
  setSwapToTokenAmount: () => {},
  setEffectiveRate: () => {},
  setCoinPrices: () => {},
  refreshTokenBalance: () => {},
  refreshSwapToTokenBalance: () => {},
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
  setReferral: () => {}
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  const { t } = useTranslation('common');
  // Parent contexts
  const connected = useWallet();
  const connection = useConnection();
  const { publicKey } = useWallet();
  const connectionConfig = useConnectionConfig();
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
  const [previousWalletConnectState, updatePreviousWalletConnectState] = useState<boolean>(contextDefaultValues.previousWalletConnectState);
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

  }, [
    connection,
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
  const [swapToToken, updateSwapToToken] = useState<TokenInfo>();
  const [swapToTokenBalance, updateSwapToTokenBalance] = useState<number>(contextDefaultValues.swapToTokenBalance);
  const [swapToTokenAmount, updateSwapToTokenAmount] = useState<string>(contextDefaultValues.swapToTokenAmount);
  const [shouldUpdateSwapToToken, setShouldUpdateSwapToToken] = useState<boolean>(true);
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

  const setSwapToToken = (token: TokenInfo | undefined) => {
    updateSwapToToken(token);
    setShouldUpdateSwapToToken(true);
  }

  const setSwapToTokenBalance = (balance: number) => {
    updateSwapToTokenBalance(balance);
  }

  const setSwapToTokenAmount = (data: string) => {
    updateSwapToTokenAmount(data);
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

    if (!streamList) {
      refreshStreamList(true);
    }

    if (streamList && currentScreen === 'streams' && !customStreamDocked) {
      timer = setInterval(() => {
        console.log(`Refreshing streams past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshStreamList(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
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

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (address) {
        const accountInfo = await connection.getAccountInfo(address.toPublicKey());
        if (accountInfo) {
          const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
          return tokenAmount.uiAmount || 0;
        }
      }
      return 0;
    }

    let balance = 0;
    if (connection && publicKey && tokenList?.length && accounts?.tokenAccounts?.length) {
      let selectedTokenAddress: any;
      if (selectedToken) {
        selectedTokenAddress = await findATokenAddress(publicKey as PublicKey, selectedToken.address.toPublicKey());
        balance = await getTokenAccountBalanceByAddress(selectedTokenAddress.toBase58());
      }
      updateTokenBalance(balance);
    }

  }, [
    accounts,
    connection,
    publicKey,
    selectedToken,
    tokenList
  ]);

  const refreshSwapToTokenBalance = useCallback(async () => {

    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (address) {
        const accountInfo = await connection.getAccountInfo(address.toPublicKey());
        if (accountInfo) {
          const tokenAmount = (await connection.getTokenAccountBalance(address.toPublicKey())).value;
          return tokenAmount.uiAmount || 0;
        }
      }
      return 0;
    }

    let balance = 0;
    if (connection && publicKey && tokenList?.length && accounts?.tokenAccounts?.length) {
      let swapToTokenAddress: any;
      if (swapToToken) {
        console.log('swapToToken => ', swapToToken);
        swapToTokenAddress = await findATokenAddress(publicKey as PublicKey, new PublicKey(swapToToken.address));
        balance = await getTokenAccountBalanceByAddress(swapToTokenAddress.toBase58());
      }
      updateSwapToTokenBalance(balance);
    }

  }, [
    accounts,
    connection,
    publicKey,
    swapToToken,
    tokenList
  ]);

  // Effect to refresh token balance if needed
  useEffect(() => {

    if (shouldUpdateToken) {
      if (publicKey && accounts?.tokenAccounts?.length) {
        setShouldUpdateToken(false);
        refreshTokenBalance();
      }
    } else if (shouldUpdateSwapToToken) {
      if (publicKey && accounts?.tokenAccounts?.length) {
        setShouldUpdateSwapToToken(false);
        refreshSwapToTokenBalance();
      }
    }

    return () => {};
  }, [
    accounts,
    publicKey,
    shouldUpdateToken,
    shouldUpdateSwapToToken,
    refreshTokenBalance,
    refreshSwapToTokenBalance
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
        swapToToken,
        swapToTokenBalance,
        swapToTokenAmount,
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
        setTheme,
        setCurrentScreen,
        setDtailsPanelOpen,
        setSelectedToken,
        setSelectedTokenBalance,
        setFromCoinAmount,
        setSwapToToken,
        setSwapToTokenBalance,
        setSwapToTokenAmount,
        setEffectiveRate,
        setCoinPrices,
        refreshTokenBalance,
        refreshSwapToTokenBalance,
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
        setReferral
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
