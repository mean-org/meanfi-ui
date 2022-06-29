import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Col, Menu, Row, Spin, Tabs } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TreasuryStreamCreateModal } from "../../components/TreasuryStreamCreateModal";
import { AppStateContext } from "../../contexts/appstate";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconArrowForward, IconLoading, IconVerticalEllipsis } from "../../Icons";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { OperationType, TransactionStatus } from "../../models/enums";
import { PieChartComponent } from "./PieChart";
import "./style.scss";
import { TxConfirmationContext } from "../../contexts/transaction-status";
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
import { cutNumber, formatAmount, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from "../../utils/utils";
import { openNotification } from "../../components/Notifications";
import { useTranslation } from "react-i18next";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { NO_FEES, ONE_MINUTE_REFRESH_TIMEOUT, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { TreasuryCreateModal } from "../../components/TreasuryCreateModal";
import { TreasuryCreateOptions } from "../../models/treasuries";
import { customLogger } from "../..";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import BN from "bn.js";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { ACCOUNTS_ROUTE_BASE_PATH } from "../../pages/accounts";
import { StreamOpenModal } from "../../components/StreamOpenModal";
import { SendAssetModal } from "../../components/SendAssetModal";
import { CreateStreamModal } from "../../components/CreateStreamModal";

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
  streamList?: Array<Stream | StreamInfo> | undefined;
  accountAddress: string;
  selectedTab: string;
  autocloseTreasuries: (Treasury | TreasuryInfo)[];
  treasuryList: (Treasury | TreasuryInfo)[];
}) => {
  const {
    tokenList,
    previousRoute,
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
    fetchTxInfoStatus,
    confirmationHistory,
    startFetchTxSignatureInfo,
    clearTxConfirmationContext,
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const {
    onSendFromStreamingAccountOutgoingStreamInfo,
    onSendFromStreamingAccountDetails,
    onSendFromIncomingStreamInfo,
    onSendFromOutgoingStreamInfo,
    autocloseTreasuries,
    accountAddress,
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
  const location = useLocation();
  const navigate = useNavigate();

  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);

  // Multisig related
  const [multisigAddress, setMultisigAddress] = useState('');
  const [selectedMultisig, setSelectedMultisig] = useState<MultisigInfo | undefined>(undefined);
  const [loadingMultisigAccounts, setLoadingMultisigAccounts] = useState(false);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [needReloadMultisig, setNeedReloadMultisig] = useState(true);

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
  const [rateIncomingPerDay, setRateIncomingPerDay] = useState(0);
  const [rateOutgoingPerDay, setRateOutgoingPerDay] = useState(0);

  const [loadingIncomingStreams, setLoadingIncomingStreams] = useState(true);
  const [loadingOutgoingStreams, setLoadingOutgoingStreams] = useState(true);

  const [incomingStreamList, setIncomingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();
  const [outgoingStreamList, setOutgoingStreamList] = useState<Array<Stream | StreamInfo> | undefined>();

  const [incomingAmount, setIncomingAmount] = useState<number | undefined>(undefined);
  const [outgoingAmount, setOutgoingAmount] = useState<number | undefined>(undefined);

  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // Treasuries related
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);
  // const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [loadingCombinedStreamingList, setLoadingCombinedStreamingList] = useState(true);
  // const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);

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

  // Reset when navigates from multisig
  // useEffect(() => {
  //   if (previousRoute.startsWith("/multisig")) {
  //     console.log("Clean all variables");
  //     setIncomingStreamList(undefined);
  //     setOutgoingStreamList(undefined);
  //     setIncomingAmount(undefined);
  //     setOutgoingAmount(undefined);
  //     setStreamingAccountCombinedList(undefined);
  //     setLoadingIncomingStreams(true);
  //     setLoadingOutgoingStreams(true);
  //     setLoadingCombinedStreamingList(true);
  //   }
  // }, [previousRoute])

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

  useEffect(() => {
    const getFinalList = async (list: (Treasury | TreasuryInfo)[]) => {
      const finalList: CombinedStreamingAccounts[] = [];
      
      for (const item of list) {
        const treasuryPk = new PublicKey(item.id as string);
        const isNewTreasury = (item as Treasury).version && (item as Treasury).version >= 2
          ? true
          : false;
            
        const streamList = await getStreamingAccountStreams(treasuryPk, isNewTreasury);
        
        const listItem: CombinedStreamingAccounts = {
          streams: streamList,
          treasury: item as any
        };
  
        finalList.push(listItem);
      }

      return finalList;
    }

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
          consoleOut("finalList", items, "blue");
    
          setStreamingAccountCombinedList(items);
        })
        .catch((error) => {
          console.log(error);
        })
        .finally(() => setLoadingCombinedStreamingList(false));
    }
  }, [getStreamingAccountStreams, treasuryList]);

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
    closeCreateTreasuryModal();
    refreshTokenBalance();
    resetTransactionStatus();
  }, [closeCreateTreasuryModal, refreshTokenBalance, resetTransactionStatus]);

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
            setIsBusy(false);
            onTreasuryCreated(createOptions);
            setNeedReloadMultisig(true);
            setLoadingMoneyStreamsDetails(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // TODO: Here the multisig ID is returned
  const getSelectedTreasuryMultisig = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? treasuryDetails;

    if (!treasuryInfo || treasuryInfo.version < 2 || !treasuryInfo.treasurer || !publicKey) {
      return PublicKey.default;
    }

    const treasurer = new PublicKey(treasuryInfo.treasurer as string);

    if (!multisigAccounts || !treasuryDetails) { return PublicKey.default; }
    const multisig = multisigAccounts.filter(a => a.authority.equals(treasurer))[0];
    if (!multisig) { return PublicKey.default; }
    return multisig.id;

  }, [
    multisigAccounts, 
    publicKey, 
    treasuryDetails
  ])

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

  // Get the Multisig accounts
  // TODO: Signal when it is loading
  useEffect(() => {

    if (!connection || !publicKey || !multisigClient || !multisigAddress || !needReloadMultisig) {
      return;
    }

    const timeout = setTimeout(() => {

      consoleOut('Loading multisigs...', '', 'blue');
      setNeedReloadMultisig(false);
      setLoadingMultisigAccounts(true);

      multisigClient
        .getMultisigs(publicKey)
        .then((allInfo: MultisigInfo[]) => {
          allInfo.sort((a: any, b: any) => b.createdOnUtc.getTime() - a.createdOnUtc.getTime());
          setMultisigAccounts(allInfo);
          consoleOut('multisigs:', allInfo, 'blue');
        })
        .catch(err => {
          console.error(err);
        })
        .finally(() => {
          setLoadingMultisigAccounts(false);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    connection,
    multisigClient,
    multisigAddress,
    needReloadMultisig,
  ]);

  // Set selectedMultisig based on the passed-in multisigAddress in query params
  useEffect(() => {

    if (!publicKey || !multisigAddress || !multisigAccounts || multisigAccounts.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      if (location.search) {
        consoleOut(`try to select multisig ${multisigAddress} from list`, multisigAccounts, 'blue');
        const selected = multisigAccounts.find(m => m.authority.toBase58() === multisigAddress);
        if (selected) {
          consoleOut('selectedMultisig:', selected, 'blue');
          setSelectedMultisig(selected);
        } else {
          consoleOut('multisigAccounts does not contain the requested multisigAddress:', multisigAddress, 'orange');
        }
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    publicKey,
    location.search,
    multisigAddress,
    multisigAccounts,
  ]);

  // Treasury list refresh timeout
  // useEffect(() => {
  //   let timer: any;

  //   if (publicKey && !treasuriesLoaded && !loadingTreasuries) {
  //     setTreasuriesLoaded(true);
  //     consoleOut("Loading treasuries for the first time");
  //     refreshTreasuries(true);
  //   }

  //   if (publicKey && treasuriesLoaded && !customStreamDocked) {
  //     timer = setInterval(() => {
  //       consoleOut(`Refreshing treasuries past ${ONE_MINUTE_REFRESH_TIMEOUT / 60 / 1000}min...`);
  //       refreshTreasuries(false);
  //     }, ONE_MINUTE_REFRESH_TIMEOUT);
  //   }

  //   return () => clearInterval(timer);
  // }, [
  //   publicKey,
  //   treasuriesLoaded,
  //   loadingTreasuries,
  //   customStreamDocked,
  //   refreshTreasuries
  // ]);

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
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/incoming`;

    navigate(url);
  }

  const goToOutgoingTabHandler = () => {
    const url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/outgoing`;

    navigate(url);
  }

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

  const onTabChange = useCallback((activeKey: string) => {
    consoleOut('Selected tab option:', activeKey, 'blue');
    
    let url = `${ACCOUNTS_ROUTE_BASE_PATH}/${accountAddress}/streaming/${activeKey}`;

    const param = getQueryAccountType();
    if (param) {
      url += `?account-type=${param}`;
    }

    navigate(url);
  }, [accountAddress, getQueryAccountType, navigate]);

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

  useEffect(() => {
    if (incomingStreamList && incomingStreamList.length >= 0) {
      setLoadingIncomingStreams(false);
    }

    if (outgoingStreamList && outgoingStreamList.length >= 0) {
      setLoadingOutgoingStreams(false);
    }
  }, [incomingStreamList, outgoingStreamList]);

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

    // consoleOut("treasuryCombinedList test", streamingAccountCombinedList);

    const sumStreamingStreams = streamingAccountCombinedList.reduce((accumulator, streaming: any) => {
      return accumulator + streaming.streams?.length;
    }, 0);

    setOutgoingAmount(outgoingStreamList.length + sumStreamingStreams);
  }, [
    outgoingStreamList,
    streamingAccountCombinedList
  ]);

  useEffect(() => {
    let totalWithdrawAmount = 0;

    if (incomingStreamList) {
      for (const stream of incomingStreamList) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;

        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);
        
        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

          const withdrawAmount = isNew ? toUiAmount(new BN(v2.withdrawableAmount), token?.decimals || 6) : v1.escrowVestedAmount;

          totalWithdrawAmount += withdrawAmount * tokenPrice;
        }
      }

        setWithdrawalBalance(totalWithdrawAmount);
    }
  }, [
    getTokenByMintAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    incomingStreamList
  ]);

  useEffect(() => {
    let totalUnallocatedAmount = 0;

    if (outgoingStreamList) {
      for (const stream of outgoingStreamList) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;

        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);
        
        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

          const fundsLeftInStreamAmount = isNew ? toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6) : v1.escrowUnvestedAmount;

          totalUnallocatedAmount += fundsLeftInStreamAmount * tokenPrice;
        }
      }
    }

    if (streamingAccountCombinedList) {
      // eslint-disable-next-line array-callback-return
      streamingAccountCombinedList.map(function(streaming) {
        if (!streaming.streams) { return false; }

        for (const stream of streaming.streams) {
          const v1 = stream as StreamInfo;
          const v2 = stream as Stream;

          const isNew = v2.version && v2.version >= 2 ? true : false;

          const token = getTokenByMintAddress(stream.associatedToken as string);

          if (token) {
            const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

            const fundsLeftInStreamAmount = isNew ? toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6) : v1.escrowUnvestedAmount;

            totalUnallocatedAmount += fundsLeftInStreamAmount * tokenPrice;
          }
        }
      });
    }

    setUnallocatedBalance(totalUnallocatedAmount);

  }, [
    getTokenByMintAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    outgoingStreamList,
    streamingAccountCombinedList
  ]);

  useEffect(() => {
    if (incomingStreamList) {
      const runningIncomingStreams = incomingStreamList.filter((stream: Stream | StreamInfo) => getStreamStatus(stream) === "Running");

      for (const stream of runningIncomingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;

        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);

        let totalRateAmountValue = 0;

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

          const rateAmountValue = isNew ? toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount;

          totalRateAmountValue += rateAmountValue * tokenPrice / stream.rateIntervalInSeconds * 86400;
        }

        setRateIncomingPerDay(totalRateAmountValue);
      }
    }

  }, [
    incomingStreamList,
    getDepositAmountDisplay,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getRateAmountDisplay,
    getStreamStatus,
    t,
  ]);

  useEffect(() => {
    if (outgoingStreamList) {
      const runningOutgoingStreams = outgoingStreamList.filter((stream: Stream | StreamInfo) => getStreamStatus(stream) === "Running");

      for (const stream of runningOutgoingStreams) {
        const v1 = stream as StreamInfo;
        const v2 = stream as Stream;

        const isNew = v2.version && v2.version >= 2 ? true : false;

        const token = getTokenByMintAddress(stream.associatedToken as string);

        let totalRateAmountValue = 0;

        if (token) {
          const tokenPrice = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);

          const rateAmountValue = isNew ? toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount;

          totalRateAmountValue += rateAmountValue * tokenPrice / stream.rateIntervalInSeconds * 86400;
        }

        setRateOutgoingPerDay(totalRateAmountValue);
      }
    }

  }, [
    outgoingStreamList,
    getDepositAmountDisplay,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    getRateAmountDisplay,
    getStreamStatus,
    t,
  ]);

  // Protocol
  const listOfBadges = ["MSP", "DEFI", "Money Streams"];

  const renderBadges = (
    <div className="badge-container">
      {listOfBadges.map((badge, index) => (
        <span key={`${badge}+${index}`} className="badge darken small text-uppercase mr-1">{badge}</span>
      ))}
      </div>
  );

  // Balance
  const renderBalance = (
    <a href="https://docs.meanfi.com/products/developers/smart-contracts"  target="_blank" rel="noopener noreferrer" className="simplelink underline-on-hover">Tracking 2 smart contracts</a>
  );

  const infoData = [
    {
      name: "Protocol",
      value: "Money Streams",
      content: renderBadges
    },
    {
      name: "Balance (My TVL)",
      value: (withdrawalBalance && unallocatedBalance) ? toUsCurrency(withdrawalBalance + unallocatedBalance) : "$0.00",
      content: renderBalance
    }
  ];

  const renderSummary = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink background-gray hover-list" onClick={goToIncomingTabHandler}>
          <div className="incoming-stream-amount">
            <div className="d-flex align-items-center">
              <h3>Incoming Streams</h3>
              <span className="info-icon">
                {incomingAmount ? (
                  <ArrowDownOutlined className="mean-svg-icons incoming bounce" />
                ) : (
                  <ArrowDownOutlined className="mean-svg-icons incoming" />
                )}
              </span>
            </div>
            <span className="incoming-amount">{rateIncomingPerDay ? `+ ${cutNumber(rateIncomingPerDay, 4)}/day` :  "$0.00"}</span>
          </div>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                {withdrawalBalance ? toUsCurrency(withdrawalBalance) : "$0.00"}
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                {incomingAmount ? `${incomingAmount} ${(incomingAmount > 1) ? "streams" : "stream"}` : "--"}
              </div>
            </div>
          </div>
        </Col>
        <Col xs={23} sm={11} md={23} lg={11} className="background-card simplelink background-gray hover-list" onClick={goToOutgoingTabHandler}>
          <div className="outgoing-stream-amount">
            <div className="d-flex align-items-center">
              <h3>Outgoing Streams</h3>
              <span className="info-icon">
                {outgoingAmount ? (
                  <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                ) : (
                  <ArrowUpOutlined className="mean-svg-icons outgoing" />
                )}
              </span>
            </div>
            <span className="outgoing-amount">{rateOutgoingPerDay ? `- ${cutNumber(rateOutgoingPerDay, 4)}/day` :  "$0.00"}</span>
          </div>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                {unallocatedBalance ? toUsCurrency(unallocatedBalance) : "$0.00"}
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                {outgoingAmount ? `${outgoingAmount} ${(outgoingAmount > 1) ? "streams" : "stream"}` : "--"}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {((incomingAmount && incomingAmount > 0) || (outgoingAmount && outgoingAmount > 0)) ? (
        <PieChartComponent
          incomingAmount={incomingAmount}
          outgoingAmount={outgoingAmount}
        />
      ) : null}
    </>
  );

  const subtitle = accountAddress && (
    <CopyExtLinkGroup
      content={accountAddress}
      number={8}
      externalLink={true}
    />
  );

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {!loadingIncomingStreams ? (
        (incomingStreamList !== undefined && incomingStreamList.length > 0) ? (
          incomingStreamList.map((stream, index) => {
            const onSelectStream = () => {
              // Sends outgoing stream value to the parent component "Accounts"
              onSendFromIncomingStreamInfo(stream);
            };
    
            const title = stream ? getStreamTitle(stream) : "Unknown incoming stream";
            const subtitle = getStreamSubtitle(stream);
            const status = getStreamStatus(stream);
            const resume = getStreamResume(stream);
    
            return (
              <div 
                key={index}
                onClick={onSelectStream}
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
              >
                <ResumeItem
                  id={index}
                  title={title}
                  subtitle={subtitle}
                  resume={resume}
                  status={status}
                  hasRightIcon={true}
                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                  isLink={true}
                  isStream={true}
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

  const param = getQueryAccountType();

  // Dropdown (three dots button) inside outgoing stream list
  const menu = (
    <Menu>
      <Menu.Item key="00" onClick={showCreateMoneyStreamModal}>
        <span className="menu-item-text">{param === "multisig" ? "Initiate outgoing stream" : "Add outgoing stream"}</span>
      </Menu.Item>
      <Menu.Item key="01" onClick={showCreateTreasuryModal}>
        <span className="menu-item-text">{param === "multisig" ? "Initiate streaming account" : "Add streaming account"}</span>
      </Menu.Item>
    </Menu>
  );

  const renderOutgoingAmoungOfStreams = (
    <>
      {outgoingAmount === undefined ? (
        <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
      ) : (
        outgoingAmount
      )}
    </>
  );
  
  // useEffect(() => {
  //   console.log("===============================");
  //   console.log("Showing streamingAccountCombinedList", streamingAccountCombinedList);
  //   console.log("Showing outgoingStreamList", outgoingStreamList);
  // }, [outgoingStreamList, streamingAccountCombinedList]);

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      <ResumeItem
        title="Outflows"
        classNameTitle="text-uppercase"
        subtitle={subtitle}
        amount={renderOutgoingAmoungOfStreams}
        resume="outflow"
        className="account-category-title pr-0"
        hasRightIcon={true}
        rightIconHasDropdown={true}
        rightIcon={<IconVerticalEllipsis className="mean-svg-icons"/>}
        dropdownMenu={menu}
        isLink={false}
      />
      {(!loadingOutgoingStreams && !loadingCombinedStreamingList) ? (
        ((outgoingStreamList !== undefined && outgoingStreamList.length > 0) || (streamingAccountCombinedList !== undefined && streamingAccountCombinedList.length > 0)) ? (
          <>
            <>
              {outgoingStreamList && outgoingStreamList.map((stream, index) => {
                const onSelectStream = () => {
                  // Sends outgoing stream value to the parent component "Accounts"
                  onSendFromOutgoingStreamInfo(stream);
                };
    
                const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
                const subtitle = getStreamSubtitle(stream);
                const status = getStreamStatus(stream);
                const resume = getStreamResume(stream);
    
                return (
                  <div 
                    key={index}
                    onClick={onSelectStream}
                    className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                  >
                    <ResumeItem
                      id={index}
                      title={title}
                      subtitle={subtitle}
                      resume={resume}
                      status={status}
                      hasRightIcon={true}
                      rightIcon={<IconArrowForward className="mean-svg-icons" />}
                      isLink={true}
                      isStream={true}
                    />
                  </div>
                )
              })}

              {(streamingAccountCombinedList && streamingAccountCombinedList.map((streaming, index) => {
                  const v1 = streaming.treasury as unknown as TreasuryInfo;
                  const v2 = streaming.treasury as Treasury;
                  const isNewTreasury = streaming && streaming.treasury.version >= 2 ? true : false;
      
                  const onSelectedStreamingAccount = () => {
                    // Sends outgoing stream value to the parent component "Accounts"
                    onSendFromStreamingAccountDetails(streaming.treasury);
                  }
      
                  const state = isNewTreasury
                    ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
                    : v1.type === TreasuryType.Open ? 'Open' : 'Locked';
      
                  const title = isNewTreasury ? v2.name : v1.label;
      
                  const subtitle = <CopyExtLinkGroup
                    content={streaming.treasury.id as string}
                    number={8}
                    externalLink={true}
                  />;
      
                  const amount = isNewTreasury ? v2.totalStreams : v1.streamsAmount;
      
                  const resume = amount > 1 ? "streams" : "stream";
      
                  return (
                    <div 
                      key={index}
                      // onClick={onSelectedStreamingAccount}
                      // className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                    >
                      <ResumeItem
                        title={title}
                        extraTitle={state}
                        classNameTitle="text-uppercase"
                        subtitle={subtitle}
                        amount={amount}
                        resume={resume}
                        className="account-category-title"
                        hasRightIcon={true}
                        rightIcon={<IconArrowForward className="mean-svg-icons" />}
                        isLink={true}
                        onClick={onSelectedStreamingAccount}
                      />
      
                      {(streaming.streams && streaming.streams.length > 0) && (
                        streaming.streams.map((stream, index) => {
                          const onSelectStream = () => {
                            // Sends outgoing stream value to the parent component "Accounts"
                            onSendFromStreamingAccountOutgoingStreamInfo(stream, streaming.treasury);
                          };
      
                          const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
                          const subtitle = getStreamSubtitle(stream);
                          const status = getStreamStatus(stream);
                          const resume = getStreamResume(stream);
      
                          return (
                            <div 
                              key={index}
                              onClick={onSelectStream}
                              className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                              >
                                <ResumeItem
                                  id={index}
                                  title={title}
                                  status={status}
                                  subtitle={subtitle}
                                  resume={resume}
                                  hasRightIcon={true}
                                  rightIcon={<IconArrowForward className="mean-svg-icons" />}
                                  isLink={true}
                                  isStream={true}
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
      <Spin spinning={loadingMoneyStreamsDetails}>
        <RightInfoDetails
          infoData={infoData}
        />

        {selectedTab === "summary" && (
          <Row gutter={[8, 8]} className="safe-btns-container mb-1">
            <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                onClick={showCreateMoneyStreamModal}>
                  <div className="btn-content">
                    {param === "multisig" ? "Initiate stream" : "Create stream"}
                  </div>
              </Button>
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                onClick={showOpenStreamModal}>
                  <div className="btn-content">
                    Find money stream
                  </div>
              </Button>
            </Col>
          </Row>
        )}

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
          treasuryDetails={treasuryDetails}
          isMultisigTreasury={isMultisigTreasury()}
          minRequiredBalance={minRequiredBalance}
          multisigClient={multisigClient}
          multisigAddress={getSelectedTreasuryMultisig()}
          userBalances={userBalances}
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
          multisigAccounts={multisigAccounts || []}
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