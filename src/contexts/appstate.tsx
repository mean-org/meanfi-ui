import React, { useCallback, useEffect, useMemo, useState } from "react";
import { findATokenAddress, getTokenByMintAddress, shortenAddress, useLocalStorageState } from "../utils/utils";
import {
  BANNED_TOKENS,
  DDCA_FREQUENCY_OPTIONS,
  PRICE_REFRESH_TIMEOUT,
  STREAMING_PAYMENT_CONTRACTS,
  STREAMS_REFRESH_TIMEOUT,
  TRANSACTIONS_PER_PAGE
} from "../constants";
import { ContractDefinition } from "../models/contract-definition";
import { DdcaFrequencyOption } from "../models/ddca-models";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { StreamActivity, StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { getStream, listStreamActivity, listStreams } from '@mean-dao/money-streaming/lib/utils';
import { useWallet } from "./wallet";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from "./connection";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useAccountsContext } from "./accounts";
import { TokenInfo, TokenListProvider } from "@solana/spl-token-registry";
import { getPrices } from "../utils/api";
import { notify } from "../utils/notifications";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { Connection } from "@solana/web3.js";
import { UserTokenAccount } from "../models/transactions";
import { MEAN_TOKEN_LIST } from "../constants/token-list";
import { NATIVE_SOL } from "../utils/tokens";
import useLocalStorage from "../hooks/useLocalStorage";
import { MappedTransaction } from "../utils/history";
import { consoleOut } from "../utils/ui";
import { appConfig } from "..";
import { ChainId } from "@saberhq/token-utils";
import { DdcaAccount } from "@mean-dao/ddca";

export interface TransactionStatusInfo {
  lastOperation?: TransactionStatus | undefined;
  currentOperation?: TransactionStatus | undefined;
}

interface AppStateConfig {
  theme: string | undefined;
  detailsPanelOpen: boolean;
  isDepositOptionsModalVisible: boolean;
  tokenList: TokenInfo[];
  selectedToken: TokenInfo | undefined;
  tokenBalance: number;
  fromCoinAmount: string;
  effectiveRate: number;
  coinPrices: any | null;
  contract: ContractDefinition | undefined;
  ddcaOption: DdcaFrequencyOption | undefined;
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
  referrals: number;
  // Accounts
  splTokenList: UserTokenAccount[];
  userTokens: UserTokenAccount[];
  selectedAsset: UserTokenAccount | undefined;
  transactions: MappedTransaction[] | undefined;
  accountAddress: string;
  lastTxSignature: string;
  addAccountPanelOpen: boolean;
  canShowAccountDetails: boolean;
  // DDCAs
  recurringBuys: DdcaAccount[];
  loadingRecurringBuys: boolean;
  setTheme: (name: string) => void;
  setDtailsPanelOpen: (state: boolean) => void;
  showDepositOptionsModal: () => void;
  hideDepositOptionsModal: () => void;
  setSelectedToken: (token: TokenInfo | undefined) => void;
  setSelectedTokenBalance: (balance: number) => void;
  setFromCoinAmount: (data: string) => void;
  setEffectiveRate: (rate: number) => void;
  setCoinPrices: (prices: any) => void;
  refreshTokenBalance: () => void;
  resetContractValues: () => void;
  refreshStreamList: (reset?: boolean) => void;
  setContract: (name: string) => void;
  setDdcaOption: (name: string) => void;
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
  setStreamDetail: (stream: StreamInfo | undefined) => void;
  openStreamById: (streamId: string) => void;
  getStreamActivity: (streamId: string) => void;
  setCustomStreamDocked: (state: boolean) => void;
  setReferrals: (value: number) => void;
  // Accounts
  setTransactions: (map: MappedTransaction[] | undefined, addItems?: boolean) => void;
  setSelectedAsset: (asset: UserTokenAccount | undefined) => void;
  setAccountAddress: (address: string) => void;
  setAddAccountPanelOpen: (state: boolean) => void;
  setCanShowAccountDetails: (state: boolean) => void;
  // DDCAs
  setRecurringBuys: (recurringBuys: DdcaAccount[]) => void;
  setLoadingRecurringBuys: (state: boolean) => void;
}

const contextDefaultValues: AppStateConfig = {
  theme: undefined,
  detailsPanelOpen: false,
  isDepositOptionsModalVisible: false,
  tokenList: [],
  selectedToken: undefined,
  tokenBalance: 0,
  fromCoinAmount: '',
  effectiveRate: 0,
  coinPrices: null,
  contract: undefined,
  ddcaOption: undefined,
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
  referrals: 0,
  // Accounts
  splTokenList: [],
  userTokens: [],
  selectedAsset: undefined,
  transactions: undefined,
  accountAddress: '',
  lastTxSignature: '',
  addAccountPanelOpen: true,
  canShowAccountDetails: false,
  // DDCAs
  recurringBuys: [],
  loadingRecurringBuys: false,
  setTheme: () => {},
  setDtailsPanelOpen: () => {},
  showDepositOptionsModal: () => {},
  hideDepositOptionsModal: () => {},
  setContract: () => {},
  setDdcaOption: () => {},
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
  setReferrals: () => {},
  // Accounts
  setTransactions: () => {},
  setSelectedAsset: () => {},
  setAccountAddress: () => {},
  setAddAccountPanelOpen: () => {},
  setCanShowAccountDetails: () => {},
  // DDCAs
  setRecurringBuys: () => {},
  setLoadingRecurringBuys: () => {},
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
  const [streamProgramAddress, setStreamProgramAddress] = useState('');

  if (!streamProgramAddress) {
    setStreamProgramAddress(appConfig.getConfig().streamProgramAddress);
  }

  const today = new Date().toLocaleDateString("en-US");
  const [theme, updateTheme] = useLocalStorageState("theme");
  const [detailsPanelOpen, updateDetailsPanelOpen] = useState(contextDefaultValues.detailsPanelOpen);

  const [contract, setSelectedContract] = useState<ContractDefinition | undefined>();
  const [contractName, setContractName] = useLocalStorageState("contractName");

  const [ddcaOption, updateDdcaOption] = useState<DdcaFrequencyOption | undefined>();
  const [ddcaOptionName, setDdcaOptionName] = useState<string>('');

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
      const theme = name || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      updateTheme(theme);
    }

    applyTheme(theme);
    return () => {};
  }, [theme, updateTheme]);

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
        consoleOut('customStream', detail);
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
        console.error('customStream', error);
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
      const newConnection = new Connection(connectionConfig.endpoint, "confirmed");
      listStreamActivity(newConnection, streamPublicKey)
        .then(value => {
          consoleOut('activity:', value);
          setStreamActivity(value);
          setLoadingStreamActivity(false);
        })
        .catch(err => {
          console.error(err);
          setStreamActivity([]);
          setLoadingStreamActivity(false);
        });
    }

  }, [
    connected,
    connectionConfig.endpoint,
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

  const setStreamDetail = (stream: StreamInfo | undefined) => {
    updateStreamDetail(stream);
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

  const [selectedToken, updateSelectedToken] = useState<TokenInfo>();
  const [tokenBalance, updateTokenBalance] = useState<number>(contextDefaultValues.tokenBalance);
  const [coinPrices, setCoinPrices] = useState<any>(null);
  const [effectiveRate, updateEffectiveRate] = useState<number>(contextDefaultValues.effectiveRate);
  const [shouldLoadCoinPrices, setShouldLoadCoinPrices] = useState(true);
  const [shouldUpdateToken, setShouldUpdateToken] = useState<boolean>(true);

  // TODO: referrals are tempararily persisted in localStorage but we must use an API
  const [referrals, updateReferrals] = useLocalStorage('referrals', contextDefaultValues.referrals);

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

  const setReferrals = (value: number) => {
    if (publicKey) {
      updateReferrals(value);
    }
  }

  // Effect to load coin prices
  useEffect(() => {
    let coinTimer: any;

    const getCoinPrices = async () => {
      try {
        await getPrices()
          .then((prices) => {
            consoleOut("Coin prices:", prices, 'blue');
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
      consoleOut(`Refreshing prices past ${PRICE_REFRESH_TIMEOUT / 60 / 1000}min...`);
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

    const setContractOrAutoSelectFirst = (name?: string) => {
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

    setContractOrAutoSelectFirst(ddcaOptionName);
    return () => {};
  }, [
    ddcaOptionName,
    ddcaOptFromCache,
    setDdcaOptionName,
    updateDdcaOption,
  ]);

  const refreshStreamList = useCallback((reset = false) => {
    if (!publicKey) {
      return [];
    }

    if (!loadingStreams) {
      setLoadingStreams(true);
      const programId = new PublicKey(streamProgramAddress);

      listStreams(connection, programId, publicKey, publicKey)
        .then(streams => {
          consoleOut('Streams:', streams, 'blue');
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
            consoleOut('selectedStream:', item, 'blue');
            if (item) {
              updateSelectedStream(item);
              updateStreamDetail(item);
              // setSelectedToken
              const token = getTokenByMintAddress(item.associatedToken as string);
              setSelectedToken(token);
              if (!loadingStreamActivity) {
                setLoadingStreamActivity(true);
                const streamPublicKey = new PublicKey(item.id as string);
                listStreamActivity(connection, streamPublicKey)
                  .then(value => {
                    consoleOut('activity:', value, 'blue');
                    setStreamActivity(value);
                    setLoadingStreamActivity(false);
                  })
                  .catch(err => {
                    console.error(err);
                    setStreamActivity([]);
                    setLoadingStreamActivity(false);
                  });
              }
            }
          } else {
            setStreamActivity([]);
            updateSelectedStream(undefined);
            updateStreamDetail(undefined);
          }
          setStreamList(streams);
          updateLoadingStreams(false);
        }).catch(err => {
          console.error(err);
          updateLoadingStreams(false);
        });
    }
  }, [
    connection,
    streamProgramAddress,
    loadingStreamActivity,
    selectedStream,
    loadingStreams,
    publicKey
  ]);

  // Streams refresh timeout
  useEffect(() => {
    let timer: any;

    if (location.pathname === '/accounts' || location.pathname === '/accounts/streams') {
      if (!streamList) {
        refreshStreamList(true);
      }

      if (streamList && !customStreamDocked) {
        timer = setInterval(() => {
          consoleOut(`Refreshing streams past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
          refreshStreamList(false);
        }, STREAMS_REFRESH_TIMEOUT);
      }
    }

    return () => clearInterval(timer);
  }, [
    location,
    streamList,
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
  const [splTokenList, updateSplTokenList] = useState<UserTokenAccount[]>([]);
  const [userTokens, updateUserTokens] = useState<UserTokenAccount[]>([]);
  const [transactions, updateTransactions] = useState<MappedTransaction[] | undefined>();
  const [selectedAsset, updateSelectedAsset] = useState<UserTokenAccount | undefined>(undefined);
  const [lastTxSignature, setLastTxSignature] = useState<string>('');
  const [addAccountPanelOpen, updateAddAccountPanelOpen] = useState(false);
  const [canShowAccountDetails, updateCanShowAccountDetails] = useState(accountAddress ? true : false);

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
      let list = new Array<UserTokenAccount>();
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
      list.push(sol);
      MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster))
        .forEach(item => list.push(Object.assign({}, item, { isMeanSupportedToken: true })));
      // Update the list
      updateUserTokens(list);
      // consoleOut('AppState -> userTokens:', list);

      // Load the mainnet list
      const res = await new TokenListProvider().resolve();
      const mainnetList = res
        .filterByChainId(ChainId.MainnetBeta)
        .excludeByTag("nft")
        .getList() as UserTokenAccount[];
      // Filter out the banned tokens
      const filteredTokens = mainnetList.filter(t => !BANNED_TOKENS.some(bt => bt === t.symbol));
      // Sort the big list
      const sortedMainnetList = filteredTokens.sort((a, b) => {
        var nameA = a.symbol.toUpperCase();
        var nameB = b.symbol.toUpperCase();
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

  /////////////////////////////////////
  // Added to support /accounts page //
  /////////////////////////////////////

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
        detailsPanelOpen,
        isDepositOptionsModalVisible,
        tokenList,
        selectedToken,
        tokenBalance,
        fromCoinAmount,
        effectiveRate,
        coinPrices,
        contract,
        ddcaOption,
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
        referrals,
        splTokenList,
        userTokens,
        selectedAsset,
        transactions,
        accountAddress,
        lastTxSignature,
        addAccountPanelOpen,
        canShowAccountDetails,
        recurringBuys,
        loadingRecurringBuys,
        setTheme,
        setDtailsPanelOpen,
        showDepositOptionsModal,
        hideDepositOptionsModal,
        setSelectedToken,
        setSelectedTokenBalance,
        setFromCoinAmount,
        setEffectiveRate,
        setCoinPrices,
        refreshTokenBalance,
        resetContractValues,
        refreshStreamList,
        setContract,
        setDdcaOption,
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
        setReferrals,
        setTransactions,
        setSelectedAsset,
        setAccountAddress,
        setAddAccountPanelOpen,
        setCanShowAccountDetails,
        setRecurringBuys,
        setLoadingRecurringBuys
      }}>
      {children}
    </AppStateContext.Provider>
  );
};

export default AppStateProvider;
