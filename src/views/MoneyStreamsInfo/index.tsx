import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Col, Row, Spin, Tabs } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TreasuryStreamCreateModal } from "../../components/TreasuryStreamCreateModal";
import { AppStateContext } from "../../contexts/appstate";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconArrowForward, IconLoading } from "../../Icons";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { getCategoryLabelByValue, OperationType, TransactionStatus } from "../../models/enums";
import "./style.scss";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import Wave from 'react-wavify'
import {
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  Treasury,
  Stream,
  MSP,
  Constants as MSPV2Constants,
  TreasuryType,
  STREAM_STATUS
} from '@mean-dao/msp';
import { StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTransactionStatusForLogs, toUsCurrency } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { cutNumber, formatAmount, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress, toUiAmount } from "../../utils/utils";
import { useTranslation } from "react-i18next";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { FALLBACK_COIN_IMAGE, NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { TreasuryCreateModal } from "../../components/TreasuryCreateModal";
import { INITIAL_TREASURIES_SUMMARY, TreasuryCreateOptions, UserTreasuriesSummary } from "../../models/treasuries";
import { customLogger } from "../..";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import BN from "bn.js";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../pages/accounts";
import { StreamOpenModal } from "../../components/StreamOpenModal";
import { CreateStreamModal } from "../../components/CreateStreamModal";
import { initialSummary, StreamsSummary } from "../../models/streams";
import { Identicon } from "../../components/Identicon";
import { openNotification } from "../../components/Notifications";

const { TabPane } = Tabs;

type CombinedStreamingAccounts = {
  treasury: Treasury | Treasury;
  streams: Array<Stream | StreamInfo> | undefined;
};

export const MoneyStreamsInfoView = (props: {
  onSendFromIncomingStreamInfo?: any;
  onSendFromOutgoingStreamInfo?: any;
  onSendFromStreamingAccountDetails?: any;
  onSendFromStreamingAccountOutgoingStreamInfo?: any;
  loadingStreams: boolean;
  streamList: Array<Stream | StreamInfo> | undefined;
  accountAddress: string;
  selectedTab: string;
  autocloseTreasuries: (Treasury | TreasuryInfo)[];
  treasuryList: (Treasury | TreasuryInfo)[];
  multisigAccounts: MultisigInfo[] | undefined;
  selectedMultisig: MultisigInfo | undefined;
  showNotificationByType?: any;
}) => {
  const {
    tokenList,
    streamListv1,
    streamListv2,
    treasuryOption,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    resetContractValues,
    openStreamById
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    clearTxConfirmationContext,
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const {
    onSendFromStreamingAccountOutgoingStreamInfo,
    onSendFromStreamingAccountDetails,
    onSendFromIncomingStreamInfo,
    onSendFromOutgoingStreamInfo,
    showNotificationByType,
    autocloseTreasuries,
    multisigAccounts,
    selectedMultisig,
    accountAddress,
    loadingStreams,
    treasuryList,
    selectedTab,
    streamList,
  } = props;

  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { address } = useParams();
  const navigate = useNavigate();

  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);

  // Multisig related
  const [multisigAddress, setMultisigAddress] = useState('');

  // Transactions
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>({
    multisigFee: 0,
    networkFee: 0,
    rentExempt: 0
  } as MultisigTransactionFees);

  const [withdrawalBalance, setWithdrawalBalance] = useState(0);
  const [unallocatedBalance, setUnallocatedBalance] = useState(0);
  const [totalAccountBalance, setTotalAccountBalance] = useState<number | undefined>(undefined);
  const [rateIncomingPerDay, setRateIncomingPerDay] = useState(0);
  const [rateOutgoingPerDay, setRateOutgoingPerDay] = useState(0);
  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [incomingAmount, setIncomingAmount] = useState(0);
  const [outgoingAmount, setOutgoingAmount] = useState(0);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // Treasuries related
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  // const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [loadingCombinedStreamingList, setLoadingCombinedStreamingList] = useState(true);
  // const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [streamingAccountsSummary, setStreamingAccountsSummary] = useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);
  const [incomingStreamsSummary, setIncomingStreamsSummary] = useState<StreamsSummary>(initialSummary);
  const [outgoingStreamsSummary, setOutgoingStreamsSummary] = useState<StreamsSummary>(initialSummary);

  const [streamingAccountCombinedList, setStreamingAccountCombinedList] = useState<CombinedStreamingAccounts[] | undefined>();
  const [loadingMoneyStreamsDetails, setLoadingMoneyStreamsDetails] = useState(true);

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      "confirmed"
    );

  }, [
    connection,
    publicKey,
    connectionConfig.endpoint,
  ]);

  // Create and cache Money Streaming Program V1 instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  // Create and cache Money Streaming Program V2 instance
  const msp = useMemo(() => {
    if (publicKey) {
      return new MSP(
        connectionConfig.endpoint,
        streamV2ProgramAddress,
        "confirmed"
      );
    }
  }, [
    connectionConfig.endpoint,
    publicKey,
    streamV2ProgramAddress
  ]);

  const getQueryAccountType = useCallback(() => {
    let accountTypeInQuery: string | null = null;
    if (searchParams) {
      accountTypeInQuery = searchParams.get('account-type');
      if (accountTypeInQuery) {
        return accountTypeInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const param = useMemo(() => getQueryAccountType(), [getQueryAccountType]);

  // const getMultisigIdFromContext = useCallback((asPublicKey = false) => {

  //   if (!multisigAccounts || !selectedMultisig) { return ''; }

  //   if (accountAddress && getQueryAccountType() === "multisig") {
  //     const multisig = multisigAccounts.find(t => t.authority.toBase58() === accountAddress);
  //     if (multisig) {
  //       return asPublicKey ? multisig.id : multisig.id.toBase58();
  //     }
  //   }

  //   return '';

  // }, [accountAddress, getQueryAccountType, multisigAccounts, selectedMultisig])

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  // Call only if you have control over every loop
  const getStreamingAccountStreams = useCallback(async (treasuryPk: PublicKey, isNewTreasury: boolean) => {
    if (!publicKey || !ms || !msp || !treasuryPk || !streamList) { return undefined; }

    if (isNewTreasury) {
      return streamList.filter((item: any) => item.treasury === treasuryPk.toBase58());
    } else {
      return  streamList.filter((item: any) => item.treasuryAddress === treasuryPk.toBase58());
    }

  }, [ms, msp, publicKey, streamList]);

  // Create a combined list of streaming accounts with its 
  useEffect(() => {
    if (!treasuryList || !streamList) { return; }

    const getFinalList = async (list: (Treasury | TreasuryInfo)[]) => {
      const finalList: CombinedStreamingAccounts[] = [];

      for (const item of list) {
        const treasuryPk = new PublicKey(item.id as string);
        const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2
          ? true
          : false;

        const itemList = await getStreamingAccountStreams(treasuryPk, isNewTreasury);
        if (itemList) {
          const listItem: CombinedStreamingAccounts = {
            streams: itemList,
            treasury: item as any
          };
          finalList.push(listItem);
        }
      }

      return finalList;
    }

    setLoadingCombinedStreamingList(true);
    setStreamingAccountCombinedList([]);

    const sortedStreamingAccountList = treasuryList.map((streaming) => streaming).sort((a, b) => {
      const vA1 = a as TreasuryInfo;
      const vA2 = a as Treasury;
      const vB1 = b as TreasuryInfo;
      const vB2 = b as Treasury;

      const isNewTreasury = ((vA2.version && vA2.version >= 2) && (vB2.version && vB2.version >= 2))
        ? true
        : false;

      if (isNewTreasury) {
        return vB2.totalStreams - vA2.totalStreams;
      } else {
        return vB1.streamsAmount - vA1.streamsAmount;
      }
    });

    if (sortedStreamingAccountList) {
      getFinalList(sortedStreamingAccountList)
        .then(items => {
          consoleOut('streamingAccountCombinedList:', items, "blue");

          setStreamingAccountCombinedList(items);
        })
        .catch((error) => {
          console.log(error);
        })
        .finally(() => setLoadingCombinedStreamingList(false));
    }
  }, [getStreamingAccountStreams, streamList, treasuryList]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  const refreshUserBalances = useCallback(() => {

    if (!connection || !publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const balancesMap: any = {};
    connection.getTokenAccountsByOwner(
      publicKey, 
      { programId: TOKEN_PROGRAM_ID }, 
      connection.commitment
    )
    .then(response => {
      for (const acc of response.value) {
        const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
        const address = decoded.mint.toBase58();
        const itemIndex = tokenList.findIndex(t => t.address === address);
        if (itemIndex !== -1) {
          balancesMap[address] = decoded.amount.toNumber() / (10 ** tokenList[itemIndex].decimals);
        } else {
          balancesMap[address] = 0;
        }
      }
    })
    .catch(error => {
      console.error(error);
      for (const t of tokenList) {
        balancesMap[t.address] = 0;
      }
    })
    .finally(() => setUserBalances(balancesMap));

  }, [
    accounts,
    publicKey,
    tokenList,
    connection,
  ]);

  const getTreasuryUnallocatedBalance = useCallback((tsry: Treasury | TreasuryInfo, assToken: TokenInfo | undefined) => {
    if (tsry) {
        const decimals = assToken ? assToken.decimals : 9;
        const unallocated = tsry.balance - tsry.allocationAssigned;
        const isNewTreasury = (tsry as Treasury).version && (tsry as Treasury).version >= 2 ? true : false;
        const ub = isNewTreasury
            ? makeDecimal(new BN(unallocated), decimals)
            : unallocated;
        return ub;
    }
    return 0;
  }, []);

  const refreshTreasuriesSummary = useCallback(async () => {

    if (!treasuryList) { return; }

    const resume: UserTreasuriesSummary = {
        totalAmount: 0,
        openAmount: 0,
        lockedAmount: 0,
        totalNet: 0
    };

    consoleOut('=========== Block start ===========', '', 'orange');

    for (const treasury of treasuryList) {

        const isNew = (treasury as Treasury).version && (treasury as Treasury).version >= 2
            ? true
            : false;

        const treasuryType = isNew
            ? (treasury as Treasury).treasuryType
            : (treasury as TreasuryInfo).type as TreasuryType;

        const associatedToken = isNew
            ? (treasury as Treasury).associatedToken as string
            : (treasury as TreasuryInfo).associatedTokenAddress as string;

        if (treasuryType === TreasuryType.Open) {
            resume['openAmount'] += 1;
        } else {
            resume['lockedAmount'] += 1;
        }

        let amountChange = 0;

        const token = getTokenByMintAddress(associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const amount = getTreasuryUnallocatedBalance(treasury, token);
          amountChange = amount * tokenPrice;
        }

        resume['totalNet'] += amountChange;
    }

    resume['totalAmount'] += treasuryList.length;

    consoleOut('totalNet in streaming accounts:', resume['totalNet'], 'blue');
    consoleOut('=========== Block ends ===========', '', 'orange');

    // Update state
    setStreamingAccountsSummary(resume);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
      getTokenPriceBySymbol,
      getTokenByMintAddress,
      getTreasuryUnallocatedBalance,
      treasuryList
  ]);

  const refreshIncomingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) { return; }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = accountAddress
      ? new PublicKey(accountAddress)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    consoleOut('=========== Block start ===========', '', 'orange');

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 6;
        const amount = freshStream.withdrawableAmount;
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    consoleOut('totalNet in incoming streams:', resume['totalNet'], 'blue');
    consoleOut('=========== Block ends ===========', '', 'orange');

    // Update state
    setIncomingStreamsSummary(resume);

  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    accountAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getTokenPriceByAddress,
  ]);

  const refreshOutgoingStreamSummary = useCallback(async () => {

    if (!ms || !msp || !publicKey || (!streamListv1 && !streamListv2)) { return; }

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = accountAddress
      ? new PublicKey(accountAddress)
      : publicKey;

    const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
    const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);

    consoleOut('=========== Block start ===========', '', 'orange');

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

        if (!isIncoming) {
          resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * tokenPrice);
        }
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const token = getTokenByMintAddress(freshStream.associatedToken as string);

      if (token) {
        const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
        const decimals = token.decimals || 6;
        const amount = freshStream.fundsLeftInStream;
        const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * tokenPrice;

        if (!isIncoming) {
          resume['totalNet'] += amountChange;
        }
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    consoleOut('totalNet in outgoing streams:', resume['totalNet'], 'blue');
    consoleOut('=========== Block ends ===========', '', 'orange');

    // Update state
    setOutgoingStreamsSummary(resume);
  }, [
    ms,
    msp,
    publicKey, 
    streamListv1, 
    streamListv2,
    accountAddress, 
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    getTokenPriceByAddress,
  ]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;
  
    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return false;
    }
  
    const treasurer = new PublicKey(treasuryInfo.treasurer as string);
  
    if (!treasurer.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(treasurer)) !== -1) {
      return true;
    }
  
    return false;
  
  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ]);

  //////////////////////
  // MODALS & ACTIONS //
  //////////////////////

  // Send selected token modal
  const [isCreateMoneyStreamModalOpen, setIsCreateMoneyStreamModalOpen] = useState(false);
  const hideCreateMoneyStreamModal = useCallback(() => setIsCreateMoneyStreamModalOpen(false), []);
  const showCreateMoneyStreamModal = useCallback(() => setIsCreateMoneyStreamModalOpen(true), []);

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createStreamWithFunds).then((value: any) => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
      setWithdrawTransactionFees(value);
      consoleOut('withdrawTransactionFees:', value, 'orange');
    });
  }, [
    refreshUserBalances,
    refreshTokenBalance,
    getTransactionFeesV2,
    resetTransactionStatus,
  ]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
    resetContractValues();
    refreshTokenBalance();
    resetTransactionStatus();
  }, [refreshTokenBalance, resetContractValues, resetTransactionStatus]);

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (e: any) => {
    if (streamList) {
      const findStream = streamList.filter((stream: Stream | StreamInfo) => stream.id === e);
      const streamSelected = Object.assign({}, ...findStream);

      const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/${isInboundStream(streamSelected) ? "incoming" : "outgoing"}/${e}?v=details`;

      navigate(url);
    }

    openStreamById(e, true);
    closeOpenStreamModal();
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    setIsCreateTreasuryModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createTreasury).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const closeCreateTreasuryModal = useCallback(() => {
    setIsCreateTreasuryModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onAcceptCreateTreasury = (data: TreasuryCreateOptions) => {
    consoleOut('treasury create options:', data, 'blue');
    onExecuteCreateTreasuryTx(data);
    setRetryOperationPayload(data);
  };

  const onTreasuryCreated = useCallback((createOptions: TreasuryCreateOptions) => {
    refreshTokenBalance();

    openNotification({
      description: `Navigate to outgoing tab to checkout streaming account: ${createOptions.treasuryName}`,
      type: "info",
      duration: 20,
    });
  }, [refreshTokenBalance]);

  const onExecuteCreateTreasuryTx = async (createOptions: TreasuryCreateOptions) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTxConfirmationContext();
    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryCreate);
    setRetryOperationPayload(createOptions);
    setIsBusy(true);

    const createTreasury = async (data: any) => {

      if (!connection || !msp || !publicKey) { return null; }

      const treasuryType = data.type === 'Open' ? TreasuryType.Open : TreasuryType.Lock;

      if (!data.multisig) {
        return await msp.createTreasury(
          new PublicKey(data.treasurer),                    // treasurer
          new PublicKey(data.treasurer),                    // treasurer
          new PublicKey(data.associatedTokenAddress),       // associatedToken
          data.label,                                       // label
          treasuryType                                      // type
        );
      }

      if (!multisigClient || !multisigAccounts) { return null; }

      const multisig = multisigAccounts.filter(m => m.id.toBase58() === data.multisig)[0];

      if (!multisig) { return null; }

      // Create Streaming account
      const createTreasuryTx = await msp.createTreasury(
        publicKey,                                        // payer
        multisig.authority,                               // treasurer
        new PublicKey(data.associatedTokenAddress),       // associatedToken
        data.label,                                       // label
        treasuryType,                                     // type
        true,                                             // solFeePayedByTreasury = true
      );

      const ixData = Buffer.from(createTreasuryTx.instructions[0].data);
      const ixAccounts = createTreasuryTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Create streaming account",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryCreate,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey || !msp || !treasuryOption) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for create streaming account", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      // Create a transaction
      const associatedToken = createOptions.token;
      const payload = {
        treasurer: publicKey.toBase58(),                                                                  // treasurer
        label: createOptions.treasuryName,                                                                // label
        type: createOptions.treasuryType === TreasuryType.Open                                            // type
          ? 'Open'
          : 'Lock',
        multisig: createOptions.multisigId,                                                               // multisig
        associatedTokenAddress: associatedToken.address
      };

      consoleOut('payload:', payload);
      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: payload
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: ''
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee

      const bf = transactionFees.blockchainFee;       // Blockchain fee
      const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
      const mp = multisigTxFees.networkFee + multisigTxFees.multisigFee + multisigTxFees.rentExempt;  // Multisig proposal
      const minRequired = createOptions.multisigId ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(minRequired, NATIVE_SOL_MINT.toBase58())
          })`
        });
        customLogger.logWarning('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Create streaming account using MSP V2...', '', 'blue');

      const result = await createTreasury(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('create streaming account returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value)
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.error('create streaming account error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet && publicKey) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          // Try signature verification by serializing the transaction
          try {
            encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
          } catch (error) {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: publicKey.toBase58()}
          });
          return true;
        })
        .catch(error => {
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.WalletNotFound
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Create streaming account transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('signed:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            if (sent) {
              enqueueTransactionConfirmation({
                signature: signature,
                operationType: OperationType.TreasuryCreate,
                finality: "finalized",
                txInfoFetchStatus: "fetching",
                loadingTitle: "Confirming transaction",
                loadingMessage: `Create streaming account: ${createOptions.treasuryName}`,
                completedTitle: "Transaction confirmed",
                completedMessage: `Successfully streaming account creation: ${createOptions.treasuryName}`,
                extras: createOptions.multisigId as string
              });
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished
              });

              setIsCreateTreasuryModalVisibility(false);
              setLoadingMoneyStreamsDetails(true);
              param === "multisig" && showNotificationByType("info");
              param !== "multisig" && onTreasuryCreated(createOptions);
            } else {
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: "error"
              });
            }
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // const getSelectedTreasuryMultisig = useCallback((treasury?: any) => {

  //   const treasuryInfo: any = treasury ?? treasuryDetails;

  //   if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
  //     return PublicKey.default;
  //   }

  //   const treasurer = new PublicKey(treasuryInfo.treasurer as string);

  //   if (!multisigAccounts || !treasuryDetails) { return PublicKey.default; }
  //   const multisig = multisigAccounts.filter(a => a.authority.equals(treasurer))[0];
  //   if (!multisig) { return PublicKey.default; }
  //   return multisig.id;

  // }, [
  //   multisigAccounts, 
  //   publicKey, 
  //   treasuryDetails
  // ])

  // confirmationHistory
  const hasMoneyStreamPendingTx = useCallback(() => {
    if (!streamList || !treasuryList) { return false; }

    if (confirmationHistory && confirmationHistory.length > 0) {
      return confirmationHistory.some(h => h.txInfoFetchStatus === "fetching");
    }

    return false;
  }, [confirmationHistory, streamList, treasuryList]);

  useEffect(() => {
    if (!streamList || !treasuryList) {return;}

    const timeout = setTimeout(() => {
      if (streamList && treasuryList && !hasMoneyStreamPendingTx()) {
        setLoadingMoneyStreamsDetails(false);
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  }, [hasMoneyStreamPendingTx, streamList, treasuryList]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey && accountAddress) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === accountAddress ? true : false;
      } else {
        return v2.beneficiary === accountAddress ? true : false;
      }
    }
    return false;
  }, [accountAddress, publicKey]);

  const getStreamTitle = (item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;

      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
        
        if (v1.isUpdatePending) {
          title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v2.name) {
          return `${v2.name}`;
        }

        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      }
    }

    return title;
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';
    if (item) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item) {
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;

  }, [getRateAmountDisplay, getDepositAmountDisplay, t]);

  const isStreamRunning = useCallback((stream: Stream | StreamInfo) => {
    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    if (stream.version < 2) {
      return v1.state === STREAM_STATE.Running ? true : false;
    } else {
      return v2.status === STREAM_STATUS.Running ? true : false;
    }
  }, []);

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATE.Paused:
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return t('streams.status.status-paused');
            }
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }
  }, [t]);

  const getStreamResume = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.scheduled', {date: getShortDate(v1.startUtc as string)});
          case STREAM_STATE.Paused:
            return t('streams.status.stopped');
          default:
            return t('streams.status.streaming');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return `starts on ${getShortDate(v2.startUtc as string)}`;
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return `paused on ${getShortDate(v2.startUtc as string)}`;
            }
            return `out of funds on ${getShortDate(v2.startUtc as string)}`;
          default:
            return `streaming since ${getShortDate(v2.startUtc as string)}`;
        }
      }
    }
  }, [t]);

  const goToIncomingTabHandler = () => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;

    if (param) {
      url += `?account-type=${param}`;
    }

    navigate(url);
  }

  const goToOutgoingTabHandler = () => {
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;

    if (param) {
      url += `?account-type=${param}`;
    }

    navigate(url);
  }

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/${activeKey}`;

    if (param) {
      url += `?account-type=${param}`;
    }

    navigate(url);
  }, [accountAddress, navigate, param]);

  // Set the list of incoming and outgoing streams
  useEffect(() => {
    if (!connection || !publicKey || !streamList || !autocloseTreasuries) {
      setIncomingStreamList(undefined);
      setOutgoingStreamList(undefined);

      return;
    }

    setIncomingStreamList(streamList.filter((stream: Stream | StreamInfo) => isInboundStream(stream)));

    setOutgoingStreamList(streamList.filter((stream: Stream | StreamInfo) => !isInboundStream(stream) && autocloseTreasuries.some(ac => ac.id as string === (stream as Stream).treasury || ac.id as string === (stream as StreamInfo).treasuryAddress)));
  }, [
    publicKey,
    streamList,
    connection,
    autocloseTreasuries,
    getQueryAccountType,
    isInboundStream,
  ]);

  // Incoming amount
  useEffect(() => {
    if (!incomingStreamList) { return; }

    setIncomingAmount(incomingStreamList.length);
  }, [
    incomingStreamList
  ]);

  // Outgoing amount
  useEffect(() => {
    if (!outgoingStreamList || !streamingAccountCombinedList) { return; }

    const sumStreamingStreams = streamingAccountCombinedList.reduce((accumulator, streaming: any) => {
      return accumulator + streaming.streams?.length;
    }, 0);

    setOutgoingAmount(outgoingStreamList.length + sumStreamingStreams);
  }, [
    outgoingStreamList,
    streamingAccountCombinedList
  ]);

  // Live data calculation
  useEffect(() => {
    if (!publicKey || !treasuryList || !address) { return; }

    const timeout = setTimeout(() => {
      refreshTreasuriesSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey, treasuryList, address]);

  useEffect(() => {
    if (!publicKey || !streamList || (!streamListv1 && !streamListv2) || !address) { return; }

    const timeout = setTimeout(() => {
      refreshIncomingStreamSummary();
      refreshOutgoingStreamSummary();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    address,
    publicKey,
    streamList,
    streamListv1,
    streamListv2,
  ]);

  // Update incoming balance
  useEffect(() => {
    if (!incomingStreamsSummary) { return; }

    setWithdrawalBalance(parseFloat(incomingStreamsSummary.totalNet.toFixed(2)));
  }, [incomingStreamsSummary]);

  // Update outgoing balance
  useEffect(() => {
    if (!streamingAccountsSummary || !outgoingStreamsSummary) { return; }

    setUnallocatedBalance(parseFloat(outgoingStreamsSummary.totalNet.toFixed(2)) + parseFloat(streamingAccountsSummary.totalNet.toFixed(2)));
  }, [ streamingAccountsSummary, outgoingStreamsSummary]);

  // Update total account balance
  useEffect(() => {
    if (!unallocatedBalance && !withdrawalBalance) { return; }

      setTotalAccountBalance((withdrawalBalance + unallocatedBalance) as number);
  }, [unallocatedBalance, withdrawalBalance]);

  // Calculate the rate per day for incoming streams
  useEffect(() => {
    if (incomingStreamList && !loadingStreams) {
      const runningIncomingStreams = incomingStreamList.filter((stream: Stream | StreamInfo) => isStreamRunning(stream));

      let totalRateAmountValue = 0;

      for (const stream of runningIncomingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;
        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const rateAmountValue = isNew ? toUiAmount(new BN(v2.rateAmount), token.decimals) : v1.rateAmount;
          const valueOfDay = rateAmountValue * tokenPrice / stream.rateIntervalInSeconds * 86400;
          totalRateAmountValue += valueOfDay
        }

      }

      setRateIncomingPerDay(totalRateAmountValue);
    }
  }, [
    loadingStreams,
    incomingStreamList,
    getDepositAmountDisplay,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getRateAmountDisplay,
    isStreamRunning,
    t,
  ]);

  // Calculate the rate per day for outgoing streams
  useEffect(() => {
    if (outgoingStreamList && streamingAccountCombinedList && !loadingStreams && !loadingCombinedStreamingList) {
      const fromStreamingAccounts: (Stream | StreamInfo)[] = [];
      streamingAccountCombinedList.forEach(item => {
        if (item.streams && item.streams.length > 0) {
          fromStreamingAccounts.push(...item.streams);
        }
      });
      const runningOutgoingStreams = outgoingStreamList.filter((stream: Stream | StreamInfo) => isStreamRunning(stream));

      if (fromStreamingAccounts.length > 0) {
        runningOutgoingStreams.push(...fromStreamingAccounts);
      }

      let totalRateAmountValue = 0;

      for (const stream of runningOutgoingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;
        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
          const rateAmountValue = isNew ? toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount;
          const valueOfDay = rateAmountValue * tokenPrice / stream.rateIntervalInSeconds * 86400;
          totalRateAmountValue += valueOfDay;
          consoleOut(`${shortenAddress(stream.id as string)} rateAmountValue:`, valueOfDay, 'blue');
        }

      }
      consoleOut('totalRateAmountValue:', totalRateAmountValue, 'blue');
      setRateOutgoingPerDay(totalRateAmountValue);
    }
  }, [
    loadingStreams,
    outgoingStreamList,
    loadingCombinedStreamingList,
    streamingAccountCombinedList,
    getDepositAmountDisplay,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getRateAmountDisplay,
    isStreamRunning,
    t,
  ]);

  // Protocol
  const listOfBadges = ["MSP", "DEFI", "Money Streams"];

  const renderProtocol = (
    <>
      {accountAddress && (
        <CopyExtLinkGroup
          content={accountAddress}
          number={8}
          externalLink={true}
          isTx={false}
          classNameContainer="mb-1"
        />
      )}
      <div className="badge-container">
        {listOfBadges.map((badge, index) => (
          <span key={`${badge}+${index}`} className="badge darken small text-uppercase mr-1">{badge}</span>
        ))}
      </div>
    </>
  );

  // Balance
  const renderBalance = (
    <>
      {totalAccountBalance ? (
        <>
          {totalAccountBalance > 0 ? (
            <span>{toUsCurrency(totalAccountBalance)}</span>
          ) : (
            <span>$0.00</span>
          )}
          {totalAccountBalance > 0 && (
            (withdrawalBalance > unallocatedBalance) ? (
              <ArrowDownOutlined className="mean-svg-icons incoming bounce ml-1" />
            ) : (
              <ArrowUpOutlined className="mean-svg-icons outgoing bounce ml-1" />
            )
          )}
        </>
      ) : (
        <IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }} />
      )}
    </>
  )

  const renderBalanceContracts = (
    <a href="https://docs.meanfi.com/products/developers/smart-contracts" target="_blank" rel="noopener noreferrer" className="simplelink underline-on-hover">Tracking 2 smart contracts</a>
  );

  const infoData = [
    {
      name: "Protocol",
      value: t('account-area.money-streams'),
      content: renderProtocol
    },
    {
      name: "Balance (My TVL)",
      value: renderBalance,
      content: renderBalanceContracts
    }
  ];

  const [withdrawalScale, setWithdrawalScale] = useState<number>(0);
  const [unallocatedScale, setUnallocatedsetScale] = useState<number>(0);

  useEffect(() => {
    if (!totalAccountBalance && !withdrawalBalance) { return; }

    const calculateScaleBalanceIncoming = (withdrawalBalance * 100) / (totalAccountBalance as number);
    const calculateScaleInHeightIncoming = (calculateScaleBalanceIncoming * 30) / 100;

    if (calculateScaleInHeightIncoming > 0 && calculateScaleInHeightIncoming <= 3) {
      setWithdrawalScale(3);
    } else if (calculateScaleInHeightIncoming === 0) {
      setWithdrawalScale(0);
    } else {
      setWithdrawalScale(Math.ceil(calculateScaleInHeightIncoming));
    }

  }, [totalAccountBalance, withdrawalBalance]);

  useEffect(() => {
    if (!totalAccountBalance && !unallocatedBalance) { return; }

    const calculateScaleBalanceOutgoing = (unallocatedBalance * 100) / (totalAccountBalance as number);
    const calculateScaleInHeightOutgoing = (calculateScaleBalanceOutgoing * 30) / 100;

    if (calculateScaleInHeightOutgoing > 0 && calculateScaleInHeightOutgoing <= 3) {
      setUnallocatedsetScale(3);
    } else if (calculateScaleInHeightOutgoing === 0) {
      setUnallocatedsetScale(0);
    } else {
      setUnallocatedsetScale(Math.ceil(calculateScaleInHeightOutgoing));
    }

  }, [totalAccountBalance, unallocatedBalance]);

  const setHeightGreenWave = (newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-green-wave', newHeight);
  }

  const setHeightRedWave = (newHeight: string) => {
    document.documentElement.style.setProperty('--heigth-red-wave', newHeight);
  }

  useEffect(() => {
    getComputedStyle(document.documentElement).getPropertyValue('--heigth-green-wave');

    getComputedStyle(document.documentElement).getPropertyValue('--heigth-red-wave');

    setHeightGreenWave(`${withdrawalScale}vh`);
    setHeightRedWave(`${unallocatedScale}vh`);

    consoleOut("Height green withdrawal scale", withdrawalScale);
    consoleOut("Height red withdrawal scale", unallocatedScale);

  }, [unallocatedScale, withdrawalScale]);

  const [isPaused, setIsPaused] = useState(true);

  useEffect(() => {
    if (!address) { return; }

    const timeout = setTimeout(() => {
      setIsPaused(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
    }
  }, [address]);

  const renderSummary = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink background-gray hover-list" onClick={goToIncomingTabHandler}>
        {/* Background animation */}
        {rateIncomingPerDay !== 0 ? (
          <div className="stream-background stream-background-incoming">
            <img
              className="inbound"
              src="/assets/incoming-crypto.svg"
              alt=""
            />
          </div>
          ) : null}
          <div className="incoming-stream-amount">
            <div className="incoming-stream-running">
              <div className="d-flex align-items-center">
                <h4>Incoming streams</h4>
                <span className="info-icon">
                  {incomingAmount ? (
                    <ArrowDownOutlined className="mean-svg-icons incoming bounce ml-1" />
                  ) : (
                    <ArrowDownOutlined className="mean-svg-icons incoming ml-1" />
                  )}
                </span>
              </div>
              <span className="incoming-amount">{rateIncomingPerDay ? `+ ${cutNumber(rateIncomingPerDay, 4)}/day` :  "$0.00"}</span>
            </div>
            <div className="info-value">
              {`Total streams: ${incomingAmount ? incomingAmount : "0"}`}
            </div>
          </div>
          <div className="stream-balance">
            <div className="info-label">
              Available to withdraw:
            </div>
            <div className="info-value">
              {withdrawalBalance ? toUsCurrency(withdrawalBalance) : "$0.00"}
            </div>
          </div>
          <div className="wave-container wave-green" id="wave">
            {/* <div className="wave wave-green"></div> */}
            <Wave fill="url(#gradient1)"
              paused={isPaused}
              className="svg-container"
              style={{ height: `${withdrawalScale}vh`, position: "absolute", bottom: 0 }}
              options={{
                amplitude: 6,
                speed: 0.25,
                points: 6
              }}>
              <defs>
                <linearGradient id="gradient1" gradientTransform="rotate(180)">
                  <stop offset="10%"  stopColor="#006820" />
                  <stop offset="100%" stopColor="#181a2a" />
                </linearGradient>
              </defs>
            </Wave>
          </div>
        </Col>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink background-gray hover-list" onClick={goToOutgoingTabHandler}>
          {/* Background animation */}
          {rateIncomingPerDay !== 0 ? (
            <div className="stream-background stream-background-outgoing">
              <img
                className="inbound"
                src="/assets/outgoing-crypto.svg"
                alt=""
              />
            </div>
          ) : null}
          <div className="outgoing-stream-amount">
            <div className="outgoing-stream-running">
              <div className="d-flex align-items-center">
                <h4>Outgoing streams</h4>
                <span className="info-icon">
                  {outgoingAmount ? (
                    <ArrowUpOutlined className="mean-svg-icons outgoing bounce ml-1" />
                  ) : (
                    <ArrowUpOutlined className="mean-svg-icons outgoing ml-1" />
                  )}
                </span>
              </div>
              <span className="outgoing-amount">{rateOutgoingPerDay ? `- ${cutNumber(rateOutgoingPerDay, 4)}/day` :  "$0.00"}</span>
            </div>
            <div className="info-value">
              {`Total streams: ${outgoingAmount ? outgoingAmount : "0"}`}
            </div>
          </div>
          <div className="stream-balance">
            <div className="info-label">
              Remaining balance:
            </div>
            <div className="info-value">
              {unallocatedBalance ? toUsCurrency(unallocatedBalance) : "$0.00"}
            </div>
          </div>
          <div className="wave-container wave-red" id="wave">
            {/* <div className="wave wave-red"></div> */}
            <Wave fill="url(#gradient2)"
              paused={isPaused}
              className="svg-container"
              style={{ height: `${unallocatedScale}vh`, position: "absolute", bottom: 0 }}
              options={{
                amplitude: 6,
                speed: 0.25,
                points: 6
              }}>
              <defs>
                <linearGradient id="gradient2" gradientTransform="rotate(180)">
                  <stop offset="10%"  stopColor="#b7001c" />
                  <stop offset="100%" stopColor="#181a2a" />
                </linearGradient>
              </defs>
            </Wave>
          </div>
        </Col>
      </Row>

      {/* {((incomingAmount && incomingAmount > 0) || (outgoingAmount && outgoingAmount > 0)) ? (
        <PieChartComponent
          incomingAmount={incomingAmount || 0}
          outgoingAmount={outgoingAmount || 0}
        />
      ) : null} */}
    </>
  );

  // const subtitle = accountAddress && (
  //   <CopyExtLinkGroup
  //     content={accountAddress}
  //     number={8}
  //     externalLink={true}
  //   />
  // );

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {!loadingStreams ? (
        (incomingStreamList !== undefined && incomingStreamList.length > 0) ? (
          incomingStreamList.map((stream, index) => {
            const onSelectStream = () => {
              // Sends outgoing stream value to the parent component "Accounts"
              onSendFromIncomingStreamInfo(stream);
            };

            const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
              event.currentTarget.src = FALLBACK_COIN_IMAGE;
              event.currentTarget.className = "error";
            };

            const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;

            let img;

            if (stream.associatedToken) {
              if (token) {
                img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
              } else {
                img = <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
              }
            } else {
              img = <Identicon address={stream.id} style={{ width: "30", display: "inline-flex" }} className="token-img" />
            }
    
            const title = stream ? getStreamTitle(stream) : "Unknown incoming stream";
            const subtitle = getStreamSubtitle(stream);
            const status = getStreamStatus(stream);
            const resume = getStreamResume(stream);
    
            return (
              <div 
                key={`incoming-stream-${index}`}
                onClick={onSelectStream}
                className={`d-flex w-100 align-items-center simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
              >
                <ResumeItem
                  id={index}
                  img={img}
                  title={title}
                  subtitle={subtitle}
                  resume={resume}
                  status={status}
                  hasRightIcon={true}
                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  isLink={true}
                  isStream={true}
                  classNameRightContent="resume-stream-row"
                  classNameIcon="icon-stream-row"
                  xs={24}
                  md={24}
                />
              </div>
            )
          })
        ) : (
          <span className="pl-1">You don't have any incoming streams</span>
        )
      ) : (
        <span className="pl-1">Loading incoming streams ...</span>
      )}
    </>
  );

  // Dropdown (three dots button) inside outgoing stream list
  // const menu = (
  //   <Menu>
  //     <Menu.Item key="00" onClick={showCreateMoneyStreamModal}>
  //       <span className="menu-item-text">{param === "multisig" ? "Initiate outgoing stream" : "Add outgoing stream"}</span>
  //     </Menu.Item>
  //     <Menu.Item key="01" onClick={showCreateTreasuryModal}>
  //       <span className="menu-item-text">{param === "multisig" ? "Initiate streaming account" : "Add streaming account"}</span>
  //     </Menu.Item>
  //   </Menu>
  // );

  // const renderOutgoingAmoungOfStreams = (
  //   <>
  //     {outgoingAmount === undefined ? (
  //       <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
  //     ) : (
  //       outgoingAmount
  //     )}
  //   </>
  // );

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      {/* <ResumeItem
        title="Outflows"
        classNameTitle="text-uppercase"
        subtitle={subtitle}
        amount={renderOutgoingAmoungOfStreams}
        resume="outgoing"
        className="account-category-title no-border-top pt-2 no-icon-right"
        hasRightIcon={false}
        rightIconHasDropdown={true}
        rightIcon={<IconVerticalEllipsis className="mean-svg-icons"/>}
        dropdownMenu={menu}
        isLink={false}
      /> */}
      {(!loadingStreams && !loadingCombinedStreamingList) ? (
        ((outgoingStreamList !== undefined && outgoingStreamList.length > 0) || (streamingAccountCombinedList !== undefined && streamingAccountCombinedList.length > 0)) ? (
          <>
            <>
              {outgoingStreamList && outgoingStreamList.map((stream, index) => {
                const onSelectStream = () => {
                  // Sends outgoing stream value to the parent component "Accounts"
                  onSendFromOutgoingStreamInfo(stream);
                };

                const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                  event.currentTarget.src = FALLBACK_COIN_IMAGE;
                  event.currentTarget.className = "error";
                };
    
                const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
    
                let img;
    
                if (stream.associatedToken) {
                  if (token) {
                    img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
                  } else {
                    img = <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
                  }
                } else {
                  img = <Identicon address={stream.id} style={{ width: "30", display: "inline-flex" }} className="token-img" />
                }
    
                const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
                const subtitle = getStreamSubtitle(stream);
                const status = getStreamStatus(stream);
                const resume = getStreamResume(stream);
    
                return (
                  <div 
                    key={`outgoing-stream-${index}}`}
                    onClick={onSelectStream}
                    className={`d-flex w-100 align-items-center simplelink hover-list ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                  >
                    <ResumeItem
                      id={index}
                      img={img}
                      title={title}
                      subtitle={subtitle}
                      resume={resume}
                      status={status}
                      hasRightIcon={true}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                      isLink={true}
                      isStream={true}
                      classNameRightContent="resume-stream-row"
                      classNameIcon="icon-stream-row"
                      xs={24}
                      md={24}
                    />
                  </div>
                )
              })}

              {(streamingAccountCombinedList && streamingAccountCombinedList.map((streaming, outerIndex) => {
                  const v1 = streaming.treasury as unknown as TreasuryInfo;
                  const v2 = streaming.treasury as Treasury;
                  const isNewTreasury = streaming && streaming.treasury.version >= 2 ? true : false;
      
                  const onSelectedStreamingAccount = () => {
                    // Sends outgoing stream value to the parent component "Accounts"
                    onSendFromStreamingAccountDetails(streaming.treasury);
                  }
      
                  const type = isNewTreasury
                    ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                    : v1.type === TreasuryType.Open ? 'Open' : 'Locked';

                  const category = isNewTreasury
                    && v2.category === 1 ? "Vesting" : "";
              
                  const subCategory = isNewTreasury
                    && v2.subCategory ? getCategoryLabelByValue(v2.subCategory) : '';
              
                  let badges;
              
                  type && (
                    category ? (
                      subCategory ? (
                        badges = [category, subCategory, type]
                      ) : (
                        badges = [category, type]
                      )
                    ) : (
                      badges = [type]
                    )
                  );
      
                  const title = isNewTreasury ? v2.name : (v1.label ? v1.label : shortenAddress(v1.id as string, 8));
      
                  const subtitle = <CopyExtLinkGroup
                    content={streaming.treasury.id as string}
                    number={8}
                    externalLink={true}
                  />;
      
                  const amount = isNewTreasury ? v2.totalStreams : v1.streamsAmount;
      
                  const resume = amount > 1 ? "streams" : "stream";
      
                  return (
                    <div key={`streaming-account-${outerIndex}`}>
                      <ResumeItem
                        title={title}
                        extraTitle={badges}
                        classNameTitle="text-uppercase"
                        subtitle={subtitle}
                        amount={amount}
                        resume={resume}
                        className="account-category-title simplelink"
                        hasRightIcon={true}
                        rightIcon={<IconArrowForward className="mean-svg-icons" />}
                        isLink={true}
                        onClick={onSelectedStreamingAccount}
                        classNameRightContent="resume-streaming-row"
                        classNameIcon="icon-streaming-row"
                        xs={24}
                        sm={18}
                        md={24}
                        lg={18}
                      />
      
                      {(streaming.streams && streaming.streams.length > 0) && (
                        streaming.streams.map((stream, innerIndex) => {
                          const onSelectStream = () => {
                            // Sends outgoing stream value to the parent component "Accounts"
                            onSendFromStreamingAccountOutgoingStreamInfo(stream, streaming.treasury);
                          };

                          const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
                            event.currentTarget.src = FALLBACK_COIN_IMAGE;
                            event.currentTarget.className = "error";
                          };
              
                          const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
              
                          let img;
              
                          if (stream.associatedToken) {
                            if (token) {
                              img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
                            } else {
                              img = <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
                            }
                          } else {
                            img = <Identicon address={stream.id} style={{ width: "30", display: "inline-flex" }} className="token-img" />
                          }
      
                          const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
                          const subtitle = getStreamSubtitle(stream);
                          const status = getStreamStatus(stream);
                          const resume = getStreamResume(stream);
      
                          return (
                            <div 
                              key={`streaming-account-stream-${innerIndex}`}
                              onClick={onSelectStream}
                              className={`d-flex w-100 align-items-center simplelink hover-list ${(innerIndex + 1) % 2 === 0 ? '' : 'background-gray'}`}
                              >
                                <ResumeItem
                                  id={innerIndex}
                                  img={img}
                                  title={title}
                                  status={status}
                                  subtitle={subtitle}
                                  resume={resume}
                                  hasRightIcon={true}
                                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                                  isLink={true}
                                  isStream={true}
                                  classNameRightContent="resume-stream-row"
                                  classNameIcon="icon-stream-row"
                                  xs={24}
                                  md={24}
                                />
                            </div>
                          )
                        })
                      )}
                    </div>
                  )
                })
              )}
            </>
          </>
        ) : (
          <span className="pl-1">You don't have any outgoing streams</span>
        )
      ) : (
        <span className="pl-1">Loading outgoing streams ...</span>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "summary",
      name: "Summary",
      render: renderSummary
    },
    {
      id: "incoming",
      name: `Incoming ${(incomingAmount && incomingAmount > 0) ? `(${incomingAmount})` : "(0)"}`,
      render: renderListOfIncomingStreams
    },
    {
      id: "outgoing",
      name: `Outgoing ${(outgoingAmount && outgoingAmount > 0) ? `(${outgoingAmount})` : "(0)"}`,
      render: renderListOfOutgoingStreams
    },
  ];

  const renderTabset = () => {
    return (
      <Tabs activeKey={selectedTab} onChange={onTabChange} className="neutral">
        {tabs.map(item => {
          return (
            <TabPane tab={item.name} key={item.id} tabKey={item.id}>
              {item.render}
            </TabPane>
          );
        })}
      </Tabs>
    );
  }

  return (
    <>
      <Spin spinning={loadingMoneyStreamsDetails || loadingCombinedStreamingList}>
        <RightInfoDetails
          infoData={infoData}
        />

        <Row gutter={[8, 8]} className="safe-btns-container mb-1">
          <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => {
                param === "multisig"
                  ? showCreateStreamModal()
                  : showCreateMoneyStreamModal()
              }}>
              <div className="btn-content">
                {/* {param === "multisig" ? "Initiate stream" : "Create stream"} */}
                Create stream
              </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={showCreateTreasuryModal}>
                <div className="btn-content">
                  Create streaming account
                  {/* {param === "multisig" ? "Initiate streaming account" : "Create streaming account"} */}
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={showOpenStreamModal}>
                <div className="btn-content">
                  Find stream
                </div>
            </Button>
          </Col>
        </Row>

        {renderTabset()}
      </Spin>

      {/* TODO: Here the multisig ID is used */}
      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={
            treasuryDetails
              ? (treasuryDetails as Treasury).version && (treasuryDetails as Treasury).version >= 2
                ? (treasuryDetails as Treasury).associatedToken as string
                : (treasuryDetails as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={undefined}
          treasuryList={props.treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          selectedMultisig={selectedMultisig}
          userBalances={userBalances}
          showNotificationByType={() => showNotificationByType("info")}
        />
      )}

      {isOpenStreamModalVisible && (
        <StreamOpenModal
          isVisible={isOpenStreamModalVisible}
          handleOk={onAcceptOpenStream}
          handleClose={closeOpenStreamModal}
        />
      )}

      {isCreateTreasuryModalVisible && (
        <TreasuryCreateModal
          isVisible={isCreateTreasuryModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptCreateTreasury}
          handleClose={closeCreateTreasuryModal}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig}
          multisigAccounts={param === "multisig" ? multisigAccounts : undefined}
          multisigAddress={multisigAddress || undefined}
        />
      )}

      {isCreateMoneyStreamModalOpen && (
        <CreateStreamModal
          selectedToken={undefined}
          isVisible={isCreateMoneyStreamModalOpen}
          handleClose={hideCreateMoneyStreamModal}
        />
      )}
    </>
  )
}