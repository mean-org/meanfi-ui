import React, { useCallback, useEffect, useMemo, useState } from "react";
import { convert, shortenAddress, useLocalStorageState } from "../utils/utils";
import { PRICE_REFRESH_TIMEOUT, STREAMING_PAYMENT_CONTRACTS, STREAMS_REFRESH_TIMEOUT } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { getStream, listStreamActivity, listStreams } from "../money-streaming/utils";
import { useWallet } from "./wallet";
import { getEndpointByRuntimeEnv, useConnection, useConnectionConfig } from "./connection";
import { PublicKey } from "@solana/web3.js";
import { StreamActivity, StreamInfo } from "../money-streaming/money-streaming";
import { deserializeMint, useAccountsContext } from "./accounts";
import { TokenAccount } from "../models";
import { MintInfo } from "@solana/spl-token";
import { TokenInfo } from "@solana/spl-token-registry";
import { AppConfigService } from "../environments/environment";
import { getPrices } from "../utils/api";
import { notify } from "../utils/notifications";

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
  effectiveRate: number;
  coinPrices: any | null;
  contract: ContractDefinition | undefined;
  recipientAddress: string;
  recipientNote: string;
  paymentStartDate: string | undefined;
  fromCoinAmount: string;
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
  setTheme: (name: string) => void;
  setCurrentScreen: (name: string) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  refreshTokenBalance: () => void;
  refreshStreamList: (reset?: boolean) => void;
  setContract: (name: string) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
  setPaymentStartDate: (date: string) => void;
  setFromCoinAmount: (data: string) => void;
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
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  currentScreen: undefined,
  detailsPanelOpen: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  effectiveRate: 0,
  coinPrices: null,
  contract: undefined,
  recipientAddress: '',
  recipientNote: '',
  paymentStartDate: undefined,
  fromCoinAmount: '',
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
  setTheme: () => {},
  setCurrentScreen: () => {},
  setDtailsPanelOpen: () => {},
  setContract: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
  setEffectiveRate: () => {},
  setCoinPrices: () => {},
  refreshTokenBalance: () => {},
  refreshStreamList: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setFromCoinAmount: () => {},
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
  setCustomStreamDocked: () => {},
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
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
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
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

  const setPreviousWalletConnectState = (state: boolean) => {
    updatePreviousWalletConnectState(state);
  }

  const openStreamById = async (streamId: string) => {
    let streamPublicKey: PublicKey;
    try {
      streamPublicKey = new PublicKey(streamId);
      try {
        const detail = await getStream(connection, streamPublicKey, 'finalized', true);
        console.log('customStream', detail);
        if (detail) {
          setStreamDetail(detail);
          setStreamList([detail]);
          getStreamActivity(streamId);
          setCustomStreamDocked(true);
          notify({
            description: `The stream with ID ${shortenAddress(streamId, 10)} has been loaded`,
            type: "success"
          });
        } else {
          notify({
            message: "Error",
            description: `Could not find or load stream with ID ${shortenAddress(streamId, 10)}`,
            type: "error"
          });
        }
      } catch (error) {
        console.log('customStream', error);
        notify({
          message: "Error",
          description: (error),
          type: "error"
        });
      }
    } catch (error) {
      notify({
        message: "Error",
        description: 'Invalid public key. Please check input.',
        type: "error"
      });
    }
  }

  const getStreamActivity = useCallback((streamId: string) => {
    if (!connected || !streamId) {
      return [];
    }

    setLoadingStreamActivity(true);
    const streamPublicKey = new PublicKey(streamId);
    listStreamActivity(connection, getEndpointByRuntimeEnv(), streamPublicKey, 'confirmed', true)
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
  }, [connection, connected]);

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
              updateEffectiveRate(
                prices[selectedToken.symbol] ? prices[selectedToken.symbol] : 0
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

  const contractFromCache = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );

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

    console.log('Reset selected stream:', reset);

    if (!loadingStreams) {
      updateLoadingStreams(true);
      const programId = new PublicKey(streamProgramAddress);

      listStreams(connection, programId, publicKey, publicKey, 'confirmed', true)
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
              setLoadingStreamActivity(true);
              const streamPublicKey = new PublicKey(item.id as string);
              listStreamActivity(connection, getEndpointByRuntimeEnv(), streamPublicKey, 'confirmed', true)
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
    loadingStreams,
    publicKey,
    selectedStream
  ]);

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

  useEffect(() => {

    if (connectionConfig && connectionConfig.tokens && connectionConfig.tokens.length) {
      updateTokenlist(connectionConfig.tokens);
      if (!selectedToken) {
        setSelectedToken(connectionConfig.tokens[0]);
      }
    }

    return () => {};
  }, [connectionConfig, selectedToken]);

  useEffect(() => {
    const getTokenAccountBalanceByAddress = async (address: string): Promise<number> => {
      if (address) {
        const tokenAccounts = accounts.tokenAccounts as TokenAccount[];
        const tokenAccount = tokenAccounts.find(t => t.info.mint.toBase58() === address) as TokenAccount;
        if (tokenAccount) {
          const minAccountInfo = await connection.getAccountInfo(tokenAccount?.info.mint as PublicKey);
          const mintInfoDecoded = deserializeMint(minAccountInfo?.data as Buffer);
          console.log('mintInfoDecoded:', mintInfoDecoded);
          return convert(tokenAccount as TokenAccount, mintInfoDecoded as MintInfo);
        }
      }
      return 0;
    }

    const updateToken = async () => {
      if (connection && connected && tokenList?.length && accounts?.tokenAccounts?.length) {
        if (selectedToken) {
          const balance = await getTokenAccountBalanceByAddress(selectedToken.address);
          console.log('balance:', balance);
          updateTokenBalance(balance);
        } else {
          setSelectedToken(tokenList[0]);
          const balance = await getTokenAccountBalanceByAddress(tokenList[0].address);
          console.log('balance:', balance);
          updateTokenBalance(balance);
        }
      } else {
        updateTokenBalance(0);
      }
    }

    if (shouldUpdateToken) {
      setShouldUpdateToken(false);
      updateToken();
    }

    return () => {};
  }, [
    tokenList,
    connected,
    shouldUpdateToken,
    connection,
    accounts,
    selectedToken,
    updateSelectedToken
  ]);

  const refreshTokenBalance = useCallback(async () => {

    const getTokenBalanceByAddress = async (address: string): Promise<number> => {
      if (address) {
        const tokenAccounts = accounts.tokenAccounts as TokenAccount[];
        const tokenAccount = tokenAccounts.find(t => t.info.mint.toBase58() === address) as TokenAccount;
        if (tokenAccount) {
          const minAccountInfo = await connection.getAccountInfo(tokenAccount?.info.mint as PublicKey);
          const mintInfoDecoded = deserializeMint(minAccountInfo?.data as Buffer);
          return convert(tokenAccount as TokenAccount, mintInfoDecoded as MintInfo);
        }
      }
      return 0;
    }

    if (connection && accounts?.tokenAccounts?.length && selectedToken) {
      const balance = await getTokenBalanceByAddress(selectedToken.address);
      updateTokenBalance(balance);
    } else {
      updateTokenBalance(0);
    }
  
  }, [selectedToken, accounts, connection]);

  return (
    <AppStateContext.Provider
      value={{
        theme,
        currentScreen,
        detailsPanelOpen,
        tokenList,
        selectedToken,
        tokenBalance,
        effectiveRate,
        coinPrices,
        contract,
        recipientAddress,
        recipientNote,
        paymentStartDate,
        fromCoinAmount,
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
        setTheme,
        setCurrentScreen,
        setDtailsPanelOpen,
        setSelectedToken,
        setSelectedTokenBalance,
        setEffectiveRate,
        setCoinPrices,
        refreshTokenBalance,
        refreshStreamList,
        setContract,
        setRecipientAddress,
        setRecipientNote,
        setPaymentStartDate,
        setFromCoinAmount,
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
        setCustomStreamDocked
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
