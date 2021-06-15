import React, { useCallback, useEffect, useMemo, useState } from "react";
import { convert, useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS, STREAMS_REFRESH_TIMEOUT } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { getStream, listStreams } from "../money-streaming/utils";
import { useWallet } from "./wallet";
import { useConnection, useConnectionConfig } from "./connection";
import { PublicKey } from "@solana/web3.js";
import { StreamInfo } from "../money-streaming/money-streaming";
import { deserializeMint, useAccountsContext } from "./accounts";
import { TokenAccount } from "../models";
import { MintInfo } from "@solana/spl-token";
import { TokenInfo } from "@solana/spl-token-registry";
import { AppConfigService } from "../environments/environment";

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
  tokenBalance: number | undefined;
  contract: ContractDefinition | undefined;
  recipientAddress: string | undefined;
  recipientNote: string | undefined;
  paymentStartDate: string | undefined;
  fromCoinAmount: string | undefined;
  paymentRateAmount: string | undefined;
  paymentRateFrequency: PaymentRateType;
  timeSheetRequirement: TimesheetRequirementOption;
  transactionStatus: TransactionStatusInfo;
  previousWalletConnectState: boolean;
  loadingStreams: boolean;
  streamList: StreamInfo[] | undefined;
  selectedStream: StreamInfo | undefined;
  streamDetail: StreamInfo | undefined;
  streamProgramAddress: string;
  setTheme: (name: string) => void;
  setCurrentScreen: (name: string) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  refreshTokenBalance: () => void;
  refreshStreamList: () => void;
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
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  currentScreen: undefined,
  detailsPanelOpen: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: undefined,
  contract: undefined,
  recipientAddress: undefined,
  recipientNote: undefined,
  paymentStartDate: undefined,
  fromCoinAmount: undefined,
  paymentRateAmount: undefined,
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
  setTheme: () => {},
  setCurrentScreen: () => {},
  setDtailsPanelOpen: () => {},
  setContract: () => {},
  setSelectedToken: () => {},
  setSelectedTokenBalance: () => {},
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
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  // Parent contexts
  const connected = useWallet();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const accounts = useAccountsContext();
  const [streamProgramAddress, setStreamProgramAddress] = useState('');
  const [streamList, setStreamList] = useState<StreamInfo[] | undefined>();

  const today = new Date().toLocaleDateString();
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
  const [detailsPanelOpen, updateDetailsPanelOpen] = useState(contextDefaultValues.detailsPanelOpen);
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [recipientAddress, updateRecipientAddress] = useState<string | undefined>();
  const [recipientNote, updateRecipientNote] = useState<string | undefined>();
  const [paymentStartDate, updatePaymentStartDate] = useState<string | undefined>(today);
  const [fromCoinAmount, updateFromCoinAmount] = useState<string | undefined>();
  const [paymentRateAmount, updatePaymentRateAmount] = useState<string | undefined>();
  const [paymentRateFrequency, updatePaymentRateFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(TimesheetRequirementOption.NotRequired);
  const [transactionStatus, updateTransactionStatus] = useState<TransactionStatusInfo>(contextDefaultValues.transactionStatus);
  const [previousWalletConnectState, updatePreviousWalletConnectState] = useState<boolean>(contextDefaultValues.previousWalletConnectState);
  const [tokenList, updateTokenlist] = useState<TokenInfo[]>([]);
  const [selectedStream, updateSelectedStream] = useState<StreamInfo | undefined>();
  const [streamDetail, updateStreamDetail] = useState<StreamInfo | undefined>();
  const [loadingStreams, updateLoadingStreams] = useState(false);

  if (!streamProgramAddress) {
    const config = new AppConfigService();
    setStreamProgramAddress(config.getConfig().streamProgramAddress);
  }

  const setDtailsPanelOpen = (state: boolean) => {
    updateDetailsPanelOpen(state);
  }

  const setTheme = (name: string) => {
    updateTheme(name);
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
    const streamPublicKey = new PublicKey(streamId);
    const detail = await getStream(connection, streamPublicKey, 'finalized', true);
    console.log('streamDetail', detail);
    updateStreamDetail(detail);
  }

  const setSelectedStream = async (stream: StreamInfo | undefined) => {
    updateSelectedStream(stream);
    updateStreamDetail(stream);
  }

  const setStreamDetail = (stream: StreamInfo) => {
    updateStreamDetail(stream);
  }

  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number | undefined>();
  const [contractName, setContractName] = useLocalStorageState("contractName");
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);

  const setSelectedToken = (token: TokenInfo | undefined) => {
    updateSelectedToken(token);
    setShouldUpdateToken(true);
  }

  const setSelectedTokenBalance = (balance: number) => {
    updateTokenBalance(balance);
  }

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

  const { publicKey } = useWallet();
  const refreshStreamList = useCallback(() => {
    if (!publicKey) {
      return [];
    }

    if (!loadingStreams) {
      updateLoadingStreams(true);
      const programId = new PublicKey(streamProgramAddress);

      listStreams(connection, programId, publicKey, publicKey, 'confirmed', true)
        .then(streams => {
          if (streams.length) {
            if (selectedStream) {
              const item = streams.find(s => s.id === selectedStream.id);
              if (item) {
                updateSelectedStream(item);
                updateStreamDetail(item);
              }
            } else {
              updateSelectedStream(streams[0]);
              updateStreamDetail(streams[0]);
            }
            if (!previousWalletConnectState && connected) {
              setSelectedTab('streams');
            }
          }
          setStreamList(streams);
          console.log('Streams:', streams);
          updateLoadingStreams(false);
        });
    }
  }, [
    connected,
    previousWalletConnectState,
    streamProgramAddress,
    loadingStreams,
    publicKey,
    connection,
    selectedStream
  ]);

  useEffect(() => {
    let timer: any;

    // Call it 1st time
    if (publicKey && !streamList) {
      refreshStreamList();
    }

    // Install the timer only in the streams screen
    if (currentScreen === 'streams') {
      timer = window.setInterval(() => {
        console.log(`Refreshing streams past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshStreamList();
      }, STREAMS_REFRESH_TIMEOUT);
    }

    // Return callback to run on unmount.
    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [publicKey, streamList, currentScreen, refreshStreamList]);

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
          return convert(tokenAccount as TokenAccount, mintInfoDecoded as MintInfo);
        }
      }
      return 0;
    }

    const updateToken = async () => {
      if (connection && connected && tokenList?.length && accounts?.tokenAccounts?.length) {
        if (selectedToken) {
          const balance = await getTokenAccountBalanceByAddress(selectedToken.address);
          updateTokenBalance(balance);
        } else {
          setSelectedToken(tokenList[0]);
          const balance = await getTokenAccountBalanceByAddress(tokenList[0].address);
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
        setTheme,
        setCurrentScreen,
        setDtailsPanelOpen,
        setSelectedToken,
        setSelectedTokenBalance,
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
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
