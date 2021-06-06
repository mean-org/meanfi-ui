import React, { useCallback, useEffect, useMemo, useState } from "react";
import { convert, useLocalStorageState } from "../utils/utils";
import { STREAMING_PAYMENT_CONTRACTS, STREAMS_REFRESH_TIMEOUT } from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { getStream, listStreams } from "../money-streaming/utils";
import { useWallet } from "./wallet";
import { useConnection, useConnectionConfig } from "./connection";
import { Constants } from "../money-streaming/constants";
import { PublicKey } from "@solana/web3.js";
import { StreamInfo } from "../money-streaming/money-streaming";
import { deserializeMint, useAccountsContext } from "./accounts";
import { TokenAccount } from "../models";
import { MintInfo } from "@solana/spl-token";
import { TokenInfo } from "@solana/spl-token-registry";

export interface TransactionStatusInfo {
  lastOperation?: TransactionStatus | undefined;
  currentOperation?: TransactionStatus | undefined;
}

interface AppStateConfig {
  theme: string | undefined;
  currentScreen: string | undefined;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  contract: ContractDefinition | undefined;
  recipientAddress: string | undefined;
  recipientNote: string | undefined;
  paymentStartDate: string | undefined;
  fromCoinAmount: string | undefined;
  paymentRateAmount: string | undefined;
  paymentRateFrequency: PaymentRateType;
  timeSheetRequirement: TimesheetRequirementOption;
  transactionStatus: TransactionStatusInfo;
  lastCreatedTransactionSignature: string | undefined;
  streamList: StreamInfo[] | undefined;
  selectedStream: StreamInfo | undefined;
  streamDetail: StreamInfo | undefined;
  setTheme: (name: string) => void;
  setCurrentScreen: (name: string) => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setContract: (name: string) => void;
  setRecipientAddress: (address: string) => void;
  setRecipientNote: (note: string) => void;
  setPaymentStartDate: (date: string) => void;
  setFromCoinAmount: (data: string) => void;
  setPaymentRateAmount: (data: string) => void;
  setPaymentRateFrequency: (freq: PaymentRateType) => void;
  setTimeSheetRequirement: (req: TimesheetRequirementOption) => void;
  setTransactionStatus: (status: TransactionStatusInfo) => void;
  setLastCreatedTransactionSignature: (signature: string) => void;
  setStreamList: (list: StreamInfo[]) => void;
  setSelectedStream: (stream: StreamInfo) => void;
  setStreamDetail: (stream: StreamInfo) => void;
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  currentScreen: undefined,
  tokenList: [],
  selectedToken: undefined,
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
  lastCreatedTransactionSignature: undefined,
  streamList: undefined,
  selectedStream: undefined,
  streamDetail: undefined,
  setTheme: () => {},
  setCurrentScreen: () => {},
  setContract: () => {},
  setSelectedToken: () => {},
  setRecipientAddress: () => {},
  setRecipientNote: () => {},
  setPaymentStartDate: () => {},
  setFromCoinAmount: () => {},
  setPaymentRateAmount: () => {},
  setPaymentRateFrequency: () => {},
  setTimeSheetRequirement: () => {},
  setTransactionStatus: () => {},
  setLastCreatedTransactionSignature: () => {},
  setStreamList: () => {},
  setSelectedStream: () => {},
  setStreamDetail: () => {},
};

export const AppStateContext = React.createContext<AppStateConfig>(contextDefaultValues);

const AppStateProvider: React.FC = ({ children }) => {
  // Parent contexts
  const connected = useWallet();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const accounts = useAccountsContext();
  const [streamList, setStreamList] = useState<StreamInfo[] | undefined>();

  const today = new Date().toLocaleDateString();
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [currentScreen, setSelectedTab] = useState<string | undefined>();
  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [recipientAddress, updateRecipientAddress] = useState<string | undefined>();
  const [recipientNote, updateRecipientNote] = useState<string | undefined>();
  const [paymentStartDate, updatePaymentStartDate] = useState<string | undefined>(today);
  const [fromCoinAmount, updateFromCoinAmount] = useState<string | undefined>();
  const [paymentRateAmount, updatePaymentRateAmount] = useState<string | undefined>();
  const [paymentRateFrequency, updatePaymentRateFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
  const [timeSheetRequirement, updateTimeSheetRequirement] = useState<TimesheetRequirementOption>(TimesheetRequirementOption.NotRequired);
  const [transactionStatus, updateTransactionStatus] = useState<TransactionStatusInfo>(contextDefaultValues.transactionStatus);
  const [lastCreatedTransactionSignature, updateTxCreatedSignature] = useState<string | undefined>();
  const [selectedStream, updateSelectedStream] = useState<StreamInfo | undefined>();
  const [streamDetail, updateStreamDetail] = useState<StreamInfo | undefined>();
  const [tokenList, updateTokenlist] = useState<TokenInfo[]>([]);

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

  const setLastCreatedTransactionSignature = (signature: string) => {
    updateTxCreatedSignature(signature || undefined);
  }

  const setSelectedStream = async (stream: StreamInfo) => {
    updateSelectedStream(stream);
    if (stream?.id) {
      const streamPublicKey = new PublicKey(stream.id);
      const detail = await getStream(connection, streamPublicKey, connection.commitment);
      updateStreamDetail(detail);
    }
  }

  const setStreamDetail = (stream: StreamInfo) => {
    updateStreamDetail(stream);
  } 

  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [contractName, setContractName] = useLocalStorageState("contractName");
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);

  const setSelectedToken = (token: TokenInfo | undefined) => {
    updateSelectedToken(token);
    setShouldUpdateToken(true);
  }

  const contractFromCache = useMemo(
    () => STREAMING_PAYMENT_CONTRACTS.find(({ name }) => name === contractName),
    [contractName]
  );

  useEffect(() => {

    const setOrAutoSelectFirst = (name?: string) => {
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

    setOrAutoSelectFirst(contractName);
    return () => {};
  }, [
    contractName,
    contractFromCache,
    setSelectedContract,
    setContractName
  ]);

  const { publicKey } = useWallet();
  const refreshStreamsList = useCallback(async () => {
    if (!publicKey) {
      return [];
    }
    const programId = new PublicKey(Constants.STREAM_PROGRAM_ACCOUNT);

    const streams = await listStreams(connection, programId, publicKey, publicKey, connection.commitment, true);
    setStreamList(streams);
    if (!selectedStream && streams?.length) {
      updateSelectedStream(streams[0]);
      if (streams[0]?.id) {
        const streamPublicKey = new PublicKey(streams[0].id);
        const detail = await getStream(connection, streamPublicKey, connection.commitment);
        updateStreamDetail(detail);
      }
    }
  }, [publicKey, connection, selectedStream]);

  useEffect(() => {
    let timer: any;
    
    // Call it 1st time
    if (publicKey) {
      timer = window.setInterval(async () => {
        refreshStreamsList();
      }, STREAMS_REFRESH_TIMEOUT);
      refreshStreamsList();
    }

    // Return callback to run on unmount.
    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [refreshStreamsList, publicKey, currentScreen]);

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
      if (connection && accounts?.tokenAccounts?.length) {
        if (selectedToken) {
          const balance = await getTokenAccountBalanceByAddress(selectedToken.address);
          const modifiedBalance = Object.assign({}, selectedToken, {
            balance: balance
          });
          updateSelectedToken(modifiedBalance);
        }
      }
    }

    if (shouldUpdateToken) {
      setShouldUpdateToken(false);
      updateToken();
    }

    return () => {};
  }, [
    connected,
    shouldUpdateToken,
    connection,
    accounts,
    selectedToken,
    updateSelectedToken
  ]);

  return (
    <AppStateContext.Provider
      value={{
        theme,
        currentScreen,
        tokenList,
        selectedToken,
        contract,
        recipientAddress,
        recipientNote,
        paymentStartDate,
        fromCoinAmount,
        paymentRateAmount,
        paymentRateFrequency,
        timeSheetRequirement,
        transactionStatus,
        lastCreatedTransactionSignature,
        streamList,
        selectedStream,
        streamDetail,
        setTheme,
        setCurrentScreen,
        setSelectedToken,
        setContract,
        setRecipientAddress,
        setRecipientNote,
        setPaymentStartDate,
        setFromCoinAmount,
        setPaymentRateAmount,
        setPaymentRateFrequency,
        setTimeSheetRequirement,
        setTransactionStatus,
        setLastCreatedTransactionSignature,
        setStreamList,
        setSelectedStream,
        setStreamDetail
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
