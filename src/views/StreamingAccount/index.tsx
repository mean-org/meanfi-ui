import { StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { Stream, STREAM_STATUS, TransactionFees, Treasury, MSP_ACTIONS as MSP_ACTIONS_V2, calculateActionFees as calculateActionFeesV2, MSP, Constants as MSPV2Constants, TreasuryType, VestingTreasuryActivity, VestingTreasuryActivityAction } from "@mean-dao/msp";
import { 
  MSP_ACTIONS, 
  calculateActionFees,
  MoneyStreaming,
  Constants,
  refreshTreasuryBalanceInstruction
} from '@mean-dao/money-streaming';
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenInfo } from "@solana/spl-token-registry";
import { AccountInfo, Connection, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { Alert, Button, Col, Dropdown, Menu, Modal, Row, Spin, Tabs } from "antd";
import BN from "bn.js";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { TreasuryAddFundsModal } from "../../components/TreasuryAddFundsModal";
import { CUSTOM_TOKEN_NAME, FALLBACK_COIN_IMAGE, NO_FEES, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconArrowBack, IconArrowForward, IconEllipsisVertical, IconExternalLink } from "../../Icons";
import { getCategoryLabelByValue, OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, friendlyDisplayDecimalPlaces, getIntervalFromSeconds, getShortDate, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, isProd, isValidAddress } from "../../utils/ui";
import { fetchAccountTokens, findATokenAddress, formatThousands, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress } from "../../utils/utils";
import { TreasuryTopupParams } from "../../models/common-types";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo, MultisigTransactionFees } from "@mean-dao/mean-multisig-sdk";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { customLogger } from "../..";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { TreasuryTransferFundsModal } from "../../components/TreasuryTransferFundsModal";
import { TreasuryStreamCreateModal } from "../../components/TreasuryStreamCreateModal";
import { useParams, useSearchParams } from "react-router-dom";
import { TreasuryCloseModal } from "../../components/TreasuryCloseModal";
import { Identicon } from "../../components/Identicon";
import { SolBalanceModal } from "../../components/SolBalanceModal";
import useWindowSize from "../../hooks/useWindowResize";
import { isMobile } from "react-device-detect";
import { getTokenAccountBalanceByAddress, readAccountInfo } from "../../utils/accounts";
import { NATIVE_SOL } from "../../utils/tokens";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const { TabPane } = Tabs;

export const StreamingAccountView = (props: {
  streamSelected: Stream | StreamInfo | undefined;
  streamingAccountSelected: Treasury | TreasuryInfo | undefined;
  onSendFromStreamingAccountDetails?: any;
  onSendFromStreamingAccountStreamInfo?: any;
  treasuryList: (Treasury | TreasuryInfo)[] | undefined;
  multisigAccounts: MultisigInfo[] | undefined;
  selectedMultisig: MultisigInfo | undefined;
}) => {
  const {
    splTokenList,
    tokenBalance,
    selectedToken,
    accountAddress,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    setHighLightableStreamId,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    resetContractValues,
    setSelectedToken,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);

  const { publicKey, connected, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { width } = useWindowSize();
  const { address, streamingItemId } = useParams();
  
  const { 
    selectedMultisig,
    multisigAccounts,
    streamingAccountSelected,
    onSendFromStreamingAccountDetails,
    onSendFromStreamingAccountStreamInfo,
  } = props;

  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);

  // Streaming account
  const [highlightedStream, sethHighlightedStream] = useState<Stream | StreamInfo | undefined>();
  const [loadingStreamingAccountDetails, setLoadingStreamingAccountDetails] = useState(true);
  const [streamingAccountStreams, setStreamingAccountStreams] = useState<Array<Stream | StreamInfo> | undefined>(undefined);
  const [loadingStreamingAccountStreams, setLoadingStreamingAccountStreams] = useState(true);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
  const [isBusy, setIsBusy] = useState(false);
  const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>({
    multisigFee: 0,
    networkFee: 0,
    rentExempt: 0
  } as MultisigTransactionFees);
  const [minRequiredBalance, setMinRequiredBalance] = useState(0);
  const [streamingAccountActivity, setStreamingAccountActivity] = useState<VestingTreasuryActivity[]>([]);
  const [loadingStreamingAccountActivity, setLoadingStreamingAccountActivity] = useState(false);
  const [hasMoreStreamingAccountActivity, setHasMoreStreamingAccountActivity] = useState<boolean>(true);
  const [associatedTokenBalance, setAssociatedTokenBalance] = useState(0);
  const [associatedTokenDecimals, setAssociatedTokenDecimals] = useState(6);
  const [treasuryEffectiveBalance, setTreasuryEffectiveBalance] = useState(0);

  const hideDetailsHandler = () => {
    onSendFromStreamingAccountDetails();
  }

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // const getQueryAccountType = useCallback(() => {
  //   let accountTypeInQuery: string | null = null;
  //   if (searchParams) {
  //     accountTypeInQuery = searchParams.get('account-type');
  //     if (accountTypeInQuery) {
  //       return accountTypeInQuery;
  //     }
  //   }
  //   return undefined;
  // }, [searchParams]);

  // const param = useMemo(() => getQueryAccountType(), [getQueryAccountType]);

  const getQueryTabOption = useCallback(() => {

    let tabOptionInQuery: string | null = null;
    if (searchParams) {
      tabOptionInQuery = searchParams.get('v');
      if (tabOptionInQuery) {
        return tabOptionInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const navigateToTab = useCallback((tab: string) => {
    setSearchParams({v: tab as string});
  }, [setSearchParams]);

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

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const getTokenOrCustomToken = useCallback((address: string) => {

    const token = getTokenByMintAddress(address);

    const unkToken = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: shortenAddress(address),
    };

    if (token) {
      return token;
    } else {
      readAccountInfo(connection, address)
      .then(info => {
        if ((info as any).data["parsed"]) {
          const decimals = (info as AccountInfo<ParsedAccountData>).data.parsed.info.decimals as number;
          unkToken.decimals = decimals || 0;
          return unkToken as TokenInfo;
        } else {
          return unkToken;
        }
      })
      .catch(err => {
        console.error('Could not get token info, assuming decimals = 6');
        return unkToken;
      });
    }
  }, [connection, getTokenByMintAddress]);

  const refreshUserBalances = useCallback((source?: PublicKey) => {

    if (!connection || !publicKey || !splTokenList) {
      return;
    }

    const balancesMap: any = {};
    const pk = source || publicKey;
    consoleOut('Reading balances for:', pk.toBase58(), 'darkpurple');

    connection.getBalance(pk)
    .then(solBalance => {
      balancesMap[NATIVE_SOL.address] = solBalance / LAMPORTS_PER_SOL;
    })

    fetchAccountTokens(connection, pk)
    .then(accTks => {
      consoleOut('Token accounts:', accTks, 'darkpurple');
      if (accTks) {
        for (const item of accTks) {
          const address = item.parsedInfo.mint;
          const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
          balancesMap[address] = balance;
        }
      } else {
        for (const t of splTokenList) {
          balancesMap[t.address] = 0;
        }
      }
    })
    .catch(error => {
      console.error(error);
      for (const t of splTokenList) {
        balancesMap[t.address] = 0;
      }
    })
    .finally(() => setUserBalances(balancesMap));

  }, [
    publicKey,
    splTokenList,
    connection,
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  const isMultisigTreasury = useCallback((treasury?: any) => {

    const treasuryInfo: any = treasury ?? streamingAccountSelected;

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
    streamingAccountSelected
  ]);

  const getStreamingAccountActivity = useCallback((streamingAccountSelectedId: string, clearHistory = false) => {
    if (!streamingAccountSelectedId || !msp || loadingStreamingAccountActivity) {
      return;
    }
  
    consoleOut('Loading streaming account activity...', '', 'crimson');
  
    setLoadingStreamingAccountActivity(true);
    const streamingAccountPublicKey = new PublicKey(streamingAccountSelectedId);
  
    const before = clearHistory
      ? ''
      : streamingAccountActivity && streamingAccountActivity.length > 0
        ? streamingAccountActivity[streamingAccountActivity.length - 1].signature
        : '';
    consoleOut('before:', before, 'crimson');
    msp.listVestingTreasuryActivity(streamingAccountPublicKey, before, 5)
      .then(value => {
        consoleOut('Streaming Account activity:', value);
        const activities = clearHistory
          ? []
          : streamingAccountActivity && streamingAccountActivity.length > 0
            ? JSON.parse(JSON.stringify(streamingAccountActivity))
            : [];
  
        if (value && value.length > 0) {
          activities.push(...value);
          setHasMoreStreamingAccountActivity(true);
        } else {
          setHasMoreStreamingAccountActivity(false);
        }
        setStreamingAccountActivity(activities);
      })
      .catch(err => {
        console.error(err);
        setStreamingAccountActivity([]);
        setHasMoreStreamingAccountActivity(false);
      })
      .finally(() => setLoadingStreamingAccountActivity(false));
  
  }, [loadingStreamingAccountActivity, msp, streamingAccountActivity]);

  const getStreamingAccountName = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.name : v1.label;
    }
    return "";
  }, [streamingAccountSelected]);

  const getStreamingAccountActivityAction = (item: VestingTreasuryActivity): string => {
    let message = '';
    switch (item.action) {
        case VestingTreasuryActivityAction.TreasuryCreate:
            message += "Streaming account created";
            break;
        case VestingTreasuryActivityAction.TreasuryAddFunds:
            message += "Deposit funds in the streaming account";
            break;
        case VestingTreasuryActivityAction.TreasuryWithdraw:
            message += "Withdraw funds from streaming account";
            break;
        case VestingTreasuryActivityAction.TreasuryRefresh:
            message += "Refresh streaming account data";
            break;
        case VestingTreasuryActivityAction.StreamCreate:
            message += `Create stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        case VestingTreasuryActivityAction.StreamAllocateFunds:
            message += `Topped up stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        case VestingTreasuryActivityAction.StreamWithdraw:
            message += `Withdraw funds from stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        case VestingTreasuryActivityAction.StreamClose:
            message += `Close stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        case VestingTreasuryActivityAction.StreamPause:
            message += `Pause stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        case VestingTreasuryActivityAction.StreamResume:
            message += `Resume stream ${item.stream ? shortenAddress(item.stream as string) : ''}`;
            break;
        default:
            message += '--';
            break;
    }
    return message;
  }

  const getStreamingAccountActivityAssociatedToken = (item: VestingTreasuryActivity) => {
    const amount = item.amount ? makeDecimal(new BN(item.amount), selectedToken?.decimals || 6) : 0;
    let message = '';
    switch (item.action) {
        case VestingTreasuryActivityAction.TreasuryAddFunds:
        case VestingTreasuryActivityAction.TreasuryWithdraw:
            message += `${amount} ${selectedToken?.symbol}`;
            break;
        case VestingTreasuryActivityAction.StreamCreate:
        case VestingTreasuryActivityAction.StreamAllocateFunds:
        case VestingTreasuryActivityAction.StreamWithdraw:
            message += `${amount} ${selectedToken?.symbol}`;
            break;
        default:
            message = '';
            break;
    }
    return message;
  }

  const isSuccess = (): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = (): boolean => {
    return  transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
            transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure
            ? true
            : false;
  }

  const refreshPage = () => {
    hideTransactionExecutionModal();
    window.location.reload();
  }

  const isTreasurer = useCallback((): boolean => {
    if (streamingAccountSelected && publicKey) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as Treasury;
      if (v2.version && v2.version >= 2) {
        const isMultisig = isMultisigTreasury();
        if (isMultisig && multisigAccounts) {
          return multisigAccounts.find(m => m.authority.equals(new PublicKey(v2.treasurer as string))) ? true : false;
        }
        return v2.treasurer === publicKey.toBase58() ? true : false;
      }
      return v1.treasurerAddress === publicKey.toBase58() ? true : false;
    }
    return false;
  }, [
    publicKey,
    streamingAccountSelected,
    multisigAccounts,
    isMultisigTreasury
  ]);

  ////////////////
  ///  MODALS  ///
  ////////////////

  // SOL Balance Modal
  const [isSolBalanceModalOpen, setIsSolBalanceModalOpen] = useState(false);
  const hideSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(false), []);
  const showSolBalanceModal = useCallback(() => setIsSolBalanceModalOpen(true), []);

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    resetTransactionStatus();
    refreshUserBalances();
    refreshTokenBalance();
    setIsCreateStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.createStreamWithFunds).then(value => {
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

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    resetTransactionStatus();
    if (selectedMultisig) {
      refreshUserBalances(selectedMultisig.authority);
    } else {
      refreshUserBalances();
    }
    refreshTokenBalance();
    if (streamingAccountSelected) {
      const v2 = streamingAccountSelected as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.addFunds).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
        getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
          setWithdrawTransactionFees(value);
          consoleOut('withdrawTransactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsAddFundsModalVisibility(true);
    }
  }, [
    selectedMultisig,
    streamingAccountSelected,
    resetTransactionStatus,
    getTransactionFeesV2,
    refreshTokenBalance,
    refreshUserBalances,
    getTransactionFees,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
    setHighLightableStreamId(undefined);
    sethHighlightedStream(undefined);
    resetTransactionStatus();
  }, [resetTransactionStatus, setHighLightableStreamId]);

  const onAddFundsTransactionFinished = () => {
    closeAddFundsModal();
    refreshTokenBalance();
    resetTransactionStatus();
  };

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuthority = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryAddFunds);
    setRetryOperationPayload(params);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && streamingAccountSelected) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(streamingAccountSelected.id);
        const associatedToken = new PublicKey(params.associatedToken);
        const amount = parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;
        const data = {
          contributor: publicKey.toBase58(),                        // contributor
          treasury: treasury.toBase58(),                            // treasury
          stream: stream?.toBase58(),                               // stream
          associatedToken: associatedToken.toBase58(),              // associatedToken
          amount: amount,                                           // amount
          allocationType: params.allocationType                     // allocationType
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
        const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
            customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Add Funds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.addFunds(
          publicKey,
          treasury,
          stream,
          associatedToken,
          amount,
          params.allocationType
        )
        .then((value: any) => {
          consoleOut('addFunds returned transaction:', value);
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
        .catch((error: any) => {
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const addFunds = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury() || !params.fundFromSafe) {
        if (data.stream === '') {
          return await msp.addFunds(
            new PublicKey(data.payer),                    // payer
            new PublicKey(data.contributor),              // contributor
            new PublicKey(data.treasury),                 // treasury
            new PublicKey(data.associatedToken),          // associatedToken
            data.amount,                                  // amount
          );
        }

        return await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = streamingAccountSelected as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }
      multisigAuthority = multisig.authority.toBase58();

      let operationType = OperationType.StreamAddFunds;
      let addFundsTx: Transaction;

      if (data.stream) {
        addFundsTx = await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(multisig.authority),           // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      } else {
        operationType = OperationType.TreasuryAddFunds;
        addFundsTx = await msp.addFunds(
          new PublicKey(data.payer),                    // payer
          new PublicKey(data.contributor),              // contributor
          new PublicKey(data.treasury),                 // treasury
          new PublicKey(data.associatedToken),          // associatedToken
          data.amount,                                  // amount
        );
      }

      const ixData = Buffer.from(addFundsTx.instructions[0].data);
      const ixAccounts = addFundsTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.proposalTitle || "Add Funds",
        "", // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {

      if (!publicKey || !streamingAccountSelected || !params || !params.associatedToken || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut("Start transaction for treasury addFunds", '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(streamingAccountSelected.id);
      const associatedToken = new PublicKey(params.associatedToken);
      const amount = params.tokenAmount.toNumber();
      const contributor = params.contributor || publicKey.toBase58();
      const data = {
        proposalTitle: params.proposalTitle,                      // proposalTitle
        payer: publicKey.toBase58(),                              // payer
        contributor: contributor,                                 // contributor
        treasury: treasury.toBase58(),                            // treasury
        associatedToken: associatedToken.toBase58(),              // associatedToken
        stream: params.streamId ? params.streamId : '',           // stream
        amount,                                                   // amount
      }

      consoleOut('data:', data);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
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
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
        customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Add Funds using MSP V2...', '', 'blue');
      consoleOut('onExecuteAddFundsTransaction ->','/src/views/StreamingAccount/index.tsx', 'darkcyan');
      // Create a transaction
      const result = await addFunds(data)
        .then((value: Transaction | null) => {
          if (!value) { return false; }
          consoleOut('addFunds returned transaction:', value);
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
          console.error('addFunds error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Treasury Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (publicKey && streamingAccountSelected) {
      const token = getTokenOrCustomToken(params.associatedToken);
      let created: boolean;
      if ((streamingAccountSelected as Treasury).version && (streamingAccountSelected as Treasury).version >= 2) {
        created = await createTxV2();
      } else {
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            const loadingMessage = multisigAuthority
              ? `Create proposal to fund streaming account with ${formatThousands(
                  parseFloat(params.amount),
                  token?.decimals
                )} ${token?.symbol}`
              : `Fund streaming account with ${formatThousands(
                  parseFloat(params.amount),
                  token?.decimals
                )} ${token?.symbol}`;
            const completed = multisigAuthority
              ? `Streaming account funding has been submitted for approval.`
              : `Streaming account funded with ${formatThousands(
                parseFloat(params.amount),
                token?.decimals
              )} ${token?.symbol}`;
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryAddFunds,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: loadingMessage,
              completedTitle: "Transaction confirmed",
              completedMessage: completed,
              extras: {
                multisigAuthority: multisigAuthority
              }
            });
            onAddFundsTransactionFinished();
            setOngoingOperation(undefined);
            setLoadingStreamingAccountDetails(true);
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Transfer funds modal
  const [isTransferFundsModalVisible, setIsTransferFundsModalVisible] = useState(false);
  const showTransferFundsModal = useCallback(() => {
    setIsTransferFundsModalVisible(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.treasuryWithdraw).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
    resetTransactionStatus();
  }, [getTransactionFeesV2, resetTransactionStatus]);

  const onAcceptTreasuryTransferFunds = (params: any) => {
    consoleOut('params', params, 'blue');
    onExecuteTreasuryTransferFundsTx(params);
  };

  // const onTreasuryFundsTransferred = () => {
  //   setIsTransferFundsModalVisible(false);
  //   resetTransactionStatus();
  // };

  const onExecuteTreasuryTransferFundsTx = async (data: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryWithdraw);
    setRetryOperationPayload(data);
    setIsBusy(true);

    const treasuryWithdraw = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.treasuryWithdraw(
          new PublicKey(data.payer),              // payer
          new PublicKey(data.destination),        // treasurer
          new PublicKey(data.treasury),           // treasury
          data.amount,                            // amount
          true                                    // autoWSol
        );
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = streamingAccountSelected as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const msTreasuryWithdraw = await msp.treasuryWithdraw(
        new PublicKey(data.payer),              // payer
        new PublicKey(data.destination),        // treasurer
        new PublicKey(data.treasury),           // treasury
        data.amount,                            // amount
        false
      );

      const ixData = Buffer.from(msTreasuryWithdraw.instructions[0].data);
      const ixAccounts = msTreasuryWithdraw.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Withdraw treasury funds" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryWithdraw,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async () => {

      if (!connection || !wallet || !publicKey) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      if (!streamingAccountSelected || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! Treasury details or MSP client not found!'
        });
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      /**
       * payer: PublicKey,
       * destination: PublicKey,
       * treasury: PublicKey,
       * amount: number
       */

      const destinationPk = new PublicKey(data.destinationAccount);
      const treasuryPk = new PublicKey(streamingAccountSelected.id);
      const amount = data.tokenAmount;

      // Create a transaction
      const payload = {
        title: data.title,
        payer: publicKey.toBase58(),
        destination: destinationPk.toBase58(),
        treasury: treasuryPk.toBase58(),
        amount: amount.toNumber()
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
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
        customLogger.logWarning('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Treasury Withdraw using MSP V2...', '', 'blue');

      const result = await treasuryWithdraw(payload)
        .then(value => {
          if (!value) { return false; }
          consoleOut('treasuryWithdraw returned transaction:', value);
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
          console.error('treasuryWithdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
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
          customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Treasury withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamingAccountSelected && selectedToken) {
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
            const isMultisig = isMultisigTreasury(streamingAccountSelected) && selectedMultisig
            ? selectedMultisig.authority.toBase58()
            : "";
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryWithdraw,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Withdraw ${formatThousands(
                parseFloat(data.amount),
                selectedToken.decimals
              )} ${selectedToken.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully withdrawn ${formatThousands(
                parseFloat(data.amount),
                selectedToken.decimals
              )} ${selectedToken.symbol}`,
              extras: {
                multisigAuthority: isMultisig
              }
            });
            
            setIsTransferFundsModalVisible(false);
            setLoadingStreamingAccountDetails(true);
            setOngoingOperation(undefined);
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Close treasury modal
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] = useState(false);
  const showCloseTreasuryModal = useCallback(() => {
    resetTransactionStatus();
    if (streamingAccountSelected) {
      const v2 = streamingAccountSelected as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.closeTreasury).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsCloseTreasuryModalVisibility(true);
    }
  }, [
    streamingAccountSelected,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideCloseTreasuryModal = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    setIsCloseTreasuryModalVisibility(false);
  }, [isBusy]);

  const onAcceptCloseTreasury = (title: string) => {
    consoleOut("Input title for close treaury:", title, 'blue');
    onExecuteCloseTreasuryTransaction(title);
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideCloseTreasuryModal();
    refreshTokenBalance();
  };

  const onExecuteCloseTreasuryTransaction = async (title: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryClose);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (publicKey && streamingAccountSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(streamingAccountSelected.id as string);
        const data = {
          title: title as string,                               // title
          treasurer: publicKey.toBase58(),                      // treasurer
          treasury: treasury.toBase58()                         // treasury
        }
        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
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
        const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
            customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Close Treasury using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.closeTreasury(
          publicKey,                                  // treasurer
          treasury,                                   // treasury
        )
        .then((value: any) => {
          consoleOut('closeTreasury returned transaction:', value);
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
        .catch((error: any) => {
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const closeTreasury = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.closeTreasury(
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasurer),              // treasurer
          new PublicKey(data.treasury),               // treasury
          true                                        // TODO: Define if the user can determine this
        );
      }

      if (!streamingAccountSelected || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = streamingAccountSelected as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const closeTreasury = await msp.closeTreasury(
        publicKey,                                  // payer
        multisig.authority,                         // TODO: This should come from the UI        
        new PublicKey(data.treasury),               // treasury
        false
      );

      const ixData = Buffer.from(closeTreasury.instructions[0].data);
      const ixAccounts = closeTreasury.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Close streaming account" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.TreasuryClose,
        multisig.id,
        MSPV2Constants.MSP,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamingAccountSelected || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(streamingAccountSelected.id as string);
      const data = {
        title: title as string,                               // title
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
      }

      consoleOut('data:', data);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
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
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
        customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Close Treasury using MSP V2...', '', 'blue');
      // Create a transaction
      const result = closeTreasury(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('closeTreasury returned transaction:', value);
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
          console.error('closeTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamingAccountSelected) {
      let created: boolean;

      let streamingAccountName = "";
      if (streamingAccountSelected.version && streamingAccountSelected.version >= 2) {
        streamingAccountName = (streamingAccountSelected as Treasury).name as string;
        created = await createTxV2();
      } else {
        streamingAccountName = (streamingAccountSelected as TreasuryInfo).label as string;
        created = await createTxV1();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            const isMultisig = isMultisigTreasury(streamingAccountSelected) && selectedMultisig
            ? selectedMultisig.authority.toBase58()
            : "";
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryClose,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Close streaming account: ${streamingAccountName}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully closed streaming account: ${streamingAccountName}`,
              extras: {
                multisigAuthority: isMultisig
              }
            });

            setIsCloseTreasuryModalVisibility(false);
            setLoadingStreamingAccountDetails(true);
            setOngoingOperation(undefined);
            onCloseTreasuryTransactionFinished();
            resetTransactionStatus();
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Refresh account data
  const onRefreshTreasuryBalanceTransactionFinished = useCallback(() => {
    refreshTokenBalance();
    resetTransactionStatus();
  },[
    refreshTokenBalance, 
    resetTransactionStatus
  ]);
  
  const onExecuteRefreshTreasuryBalance = useCallback(async() => {

    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setOngoingOperation(OperationType.TreasuryRefreshBalance);
    setIsBusy(true);

    const refreshBalance = async (treasury: PublicKey) => {

      if (!connection || !connected || !publicKey || !msp) {
        return false;
      }

      const ixs: TransactionInstruction[] = [];

      const { value } = await connection.getTokenAccountsByOwner(treasury, {
        programId: TOKEN_PROGRAM_ID
      });

      if (!value || !value.length) {
        return false;
      }

      const tokenAddress = value[0].pubkey;
      const tokenAccount = AccountLayout.decode(value[0].account.data);
      const associatedTokenMint = new PublicKey(tokenAccount.mint);
      const mspAddress = isProd() ? Constants.MSP_PROGRAM : Constants.MSP_PROGRAM_DEV;
      const feeTreasuryAddress: PublicKey = new PublicKey(
        "3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw"
      );

      ixs.push(
        await refreshTreasuryBalanceInstruction(
          mspAddress,
          publicKey,
          associatedTokenMint,
          treasury,
          tokenAddress,
          feeTreasuryAddress
        )
      );

      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash("recent");
      tx.recentBlockhash = blockhash;

      return tx;
    };

    const refreshTreasuryData = async (data: any) => {

      if (!publicKey || !streamingAccountSelected || !msp) { return null; }

      const v2 = streamingAccountSelected as Treasury;
      const isNewTreasury = v2.version >= 2 ? true : false;

      if (!isNewTreasury) {
        return await refreshBalance(new PublicKey(data.treasury));
      }

      return await msp.refreshTreasuryData(
        new PublicKey(publicKey),
        new PublicKey(data.treasury)
      );
    }

    const createTx = async (): Promise<boolean> => {

      if (!publicKey || !streamingAccountSelected) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const treasury = new PublicKey(streamingAccountSelected.id as string);
      const data = {
        treasurer: publicKey.toBase58(),                      // treasurer
        treasury: treasury.toBase58()                         // treasury
      }

      consoleOut('data:', data);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data
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
      const minRequired = isMultisigTreasury() ? mp : bf + ff;

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
        customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }

      // Create a transaction
      const result = await refreshTreasuryData(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('refreshBalance returned transaction:', value);
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
          console.error('refreshBalance error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
            customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Refresh Treasury data transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamingAccountSelected) {
      const created = await createTx();
      consoleOut('created:', created);
      if (created && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.TreasuryRefreshBalance,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: "Refresh streaming account data",
              completedTitle: "Transaction confirmed",
              completedMessage: "Successfully refreshed data in streaming account",
              extras: {
                multisigAuthority: ''
              }
            });
            setIsBusy(false);
            onRefreshTreasuryBalanceTransactionFinished();
            setOngoingOperation(undefined);
            setLoadingStreamingAccountDetails(true);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  },[
    msp,
    wallet,
    connected,
    publicKey,
    connection,
    nativeBalance,
    multisigTxFees,
    transactionCancelled,
    streamingAccountSelected,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    onRefreshTreasuryBalanceTransactionFinished,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
    isMultisigTreasury
  ]);

  // Common reusable transaction execution modal
  const [isTransactionExecutionModalVisible, setTransactionExecutionModalVisibility] = useState(false);
  const showTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(true), []);
  const hideTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideTransactionExecutionModal();
    refreshTokenBalance();
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideTransactionExecutionModal();
    }
    resetTransactionStatus();
  }

  // confirmationHistory
  const hasStreamingAccountPendingTx = useCallback(() => {
    if (!streamingAccountSelected) { return false; }

    if (confirmationHistory && confirmationHistory.length > 0) {
      return confirmationHistory.some(h => h.extras === streamingAccountSelected.id && h.txInfoFetchStatus === "fetching");
    }

    return false;
  }, [confirmationHistory, streamingAccountSelected]);

  useEffect(() => {
    if (!streamingAccountSelected) { return; }

    const timeout = setTimeout(() => {
      if (streamingAccountSelected && !loadingStreamingAccountStreams && !hasStreamingAccountPendingTx()) {
        setLoadingStreamingAccountDetails(false);
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  }, [
    streamingAccountSelected,
    loadingStreamingAccountStreams,
    hasStreamingAccountPendingTx,
  ]);

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

  // Keep Streaming Account ATA balance
  useEffect(() => {

    const getStreamingAccountAtaBalance = async (address: string, streamingAccountAddress: string) => {

      if (!connection || !publicKey || !address || !streamingAccountAddress) {
        return null;
      }

      try {
        consoleOut('address', address, 'blue');
        consoleOut('streamingAccountAddress', streamingAccountAddress, 'blue');
        const tokenPk = new PublicKey(address);
        const saPk = new PublicKey(streamingAccountAddress);
        const saAtaTokenAddress = await findATokenAddress(saPk, tokenPk);
        const ta = await getTokenAccountBalanceByAddress(connection, saAtaTokenAddress);
        consoleOut('getTokenAccountBalanceByAddress ->', ta, 'blue');
        return ta;
      } catch (error) {
        return null;
      }

    }

    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      const tokenAddr = isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string;

      let balance = 0;
      let decimals = 0;

      getStreamingAccountAtaBalance(tokenAddr, streamingAccountSelected.id as string)
      .then(value => {
        if (value) {
          balance = new BN(value.amount).toNumber();
          decimals = value.decimals || 0;
        }
      })
      .catch(err => {
        console.error(err);
        setAssociatedTokenBalance(0);
      })
      .finally(() => {
        consoleOut('SA ATA balance:', balance, 'blue');
        setAssociatedTokenBalance(balance);
        setAssociatedTokenDecimals(decimals);
      });

    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, publicKey, streamingAccountSelected]);

  // Automatically update all token balances (in token list)
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshUserBalances();
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    accounts,
    splTokenList,
    publicKey,
    connection,
    refreshUserBalances
  ]);

  // Set a working token based on the Vesting Contract's Associated Token
  useEffect(() => {

    if (!streamingAccountSelected || associatedTokenDecimals === undefined) {
      return;
    }

    const getCustomToken = (address: string, decimals: number) => {
      if (!address || !isValidAddress(address)) {
        return undefined;
      }

      const unknownToken: TokenInfo = {
        address: address,
        name: CUSTOM_TOKEN_NAME,
        chainId: 101,
        decimals: decimals,
        symbol: shortenAddress(address),
      };
      return unknownToken;
    }

    const v1 = streamingAccountSelected as TreasuryInfo;
    const v2 = streamingAccountSelected as Treasury;
    const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
    const ata = isNewTreasury
      ? v2.associatedToken as string
      : v1.associatedTokenAddress as string;
    let token = getTokenByMintAddress(ata);

    if (!token) {
      token = getCustomToken(ata, associatedTokenDecimals);
    } else if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
      token = Object.assign({}, token, {
        symbol: 'SOL'
      }) as TokenInfo;
    }

    consoleOut("Using token:", token, 'blue');
    setSelectedToken(token);

    return () => { }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [associatedTokenDecimals, streamingAccountSelected]);

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
      const decimals = token?.decimals || 6;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += formatThousands(
          item.rateAmount,
          friendlyDisplayDecimalPlaces(item.rateAmount, decimals),
          2
        );
      } else {
        const rateAmount = makeDecimal(new BN(item.rateAmount), decimals);
        value += formatThousands(
          rateAmount,
          friendlyDisplayDecimalPlaces(rateAmount, decimals),
          2
        );
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
      const decimals = token?.decimals || 6;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += formatThousands(
          item.allocationAssigned,
          friendlyDisplayDecimalPlaces(item.allocationAssigned, decimals),
          2
        );
      } else {
        const allocationAssigned = makeDecimal(new BN(item.allocationAssigned), decimals);
        value += formatThousands(
          allocationAssigned,
          friendlyDisplayDecimalPlaces(allocationAssigned, decimals),
          2
        );
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

  const getTreasuryUnallocatedBalance = useCallback(() => {
    if (!streamingAccountSelected || !selectedToken) {
      return 0;
    }

    const isNewTreasury = streamingAccountSelected.version && streamingAccountSelected.version >= 2 ? true : false;
    const decimals = selectedToken ? selectedToken.decimals : 6;
    const unallocated = streamingAccountSelected.balance - streamingAccountSelected.allocationAssigned;
    const ub = isNewTreasury
      ? makeDecimal(new BN(unallocated), decimals)
      : unallocated;
    return ub;
  }, [selectedToken, streamingAccountSelected]);

  const getTreasuryClosureMessage = () => {
    return (
      // <div>{t('treasuries.close-account.close-treasury-confirmation')}</div>
      <div>Since your streaming account has no streams you are able to close it</div>
    );
  };

  const getStreamingAccountContent = useCallback(() => {
    if (streamingAccountSelected) {
      const v1 = streamingAccountSelected as TreasuryInfo;
      const v2 = streamingAccountSelected as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.id as string : v1.id as string;
    }
    return "";
  }, [streamingAccountSelected]);

  const getStreamingAccountResume = useCallback(() => {
    if (selectedToken) {
      return getAmountWithSymbol(
        getTreasuryUnallocatedBalance(),
        selectedToken.address,
        false,
        splTokenList
      );
    }
    return "--";
  }, [getTreasuryUnallocatedBalance, selectedToken, splTokenList]);

  const getStreamingAccountStreams = useCallback((treasuryPk: PublicKey, isNewTreasury: boolean) => {
    if (!publicKey || !ms) { return; }

    consoleOut('Executing getStreamingAccountStreams...', '', 'blue');

    if (isNewTreasury) {
      if (msp) {
        msp.listStreams({treasury: treasuryPk})
          .then((streams: any) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setStreamingAccountStreams(streams);
          })
          .catch((err: any) => {
            console.error(err);
            setStreamingAccountStreams([]);
          })
          .finally(() => {
            setLoadingStreamingAccountStreams(false);
          });
      }
    } else {
      if (ms) {
        ms.listStreams({treasury: treasuryPk })
          .then((streams: any) => {
            consoleOut('treasuryStreams:', streams, 'blue');
            setStreamingAccountStreams(streams);
          })
          .catch((err: any) => {
            console.error(err);
            setStreamingAccountStreams([]);
          })
          .finally(() => {
            setLoadingStreamingAccountStreams(false);
          });
      }
    }
  }, [
    ms,
    msp,
    publicKey
  ]);

  // Reload streaming account streams whenever the selected streaming account changes
  useEffect(() => {
    if (!publicKey || !streamingAccountSelected) { return; }

    if (streamingAccountSelected.id === streamingItemId) {
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(streamingItemId as string);
      const isNewTreasury = (streamingAccountSelected as Treasury).version && (streamingAccountSelected as Treasury).version >= 2
        ? true
        : false;
        getStreamingAccountStreams(treasuryPk, isNewTreasury);
    }
  }, [ms, publicKey, streamingAccountSelected, getStreamingAccountStreams, streamingItemId]);

  // Get the Streeaming Account activity while in "activity" tab
  useEffect(() => {
    if (publicKey && msp && streamingAccountSelected && searchParams.get('v') === "activity" && streamingAccountActivity.length < 5) {
      getStreamingAccountActivity(streamingAccountSelected.id as string);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, msp, publicKey, streamingAccountSelected]);

  // Get the effective balance of the treasury
  useEffect(() => {
    if (!connection || !publicKey) { return; }

    if (streamingAccountSelected) {
      let balance = 0;
      connection.getBalance(new PublicKey(streamingAccountSelected.id))
      .then(solBalance => {
        balance = solBalance / LAMPORTS_PER_SOL;
        connection.getMinimumBalanceForRentExemption(300)
        .then(value => {
          const re = value / LAMPORTS_PER_SOL;
          const eb = balance - re;
          consoleOut('treasuryRentExcemption:', re, 'darkgreen');
          consoleOut('Treasury native balance:', balance, 'darkgreen');
          consoleOut('Effective account balance:', eb, 'darkgreen');
          setTreasuryEffectiveBalance(eb);
        })
        .catch(error => {
          console.error('Failure fetching minimum balance for rent exemption', error);
        });
      })
      .catch(error => {
        console.error('Failure fetching native account balance for Streaming Account', error);
      });
    }

  }, [connection, publicKey, streamingAccountSelected]);


  ///////////////
  // Rendering //
  ///////////////

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      {isXsDevice && (
        <Menu.Item key="ms-00" onClick={showCreateStreamModal} disabled={hasStreamingAccountPendingTx() ||
      (!streamingAccountSelected || streamingAccountSelected.balance - streamingAccountSelected.allocationAssigned <= 0)}>
          <span className="menu-item-text">Create stream</span>
        </Menu.Item>
      )}
      <Menu.Item key="ms-00" onClick={showCloseTreasuryModal} disabled={hasStreamingAccountPendingTx() || (streamingAccountStreams && streamingAccountStreams.length > 0) || !isTreasurer()}>
        <span className="menu-item-text">Close account</span>
      </Menu.Item>
      {streamingAccountSelected && (
        <Menu.Item key="ms-01" disabled={hasStreamingAccountPendingTx()} onClick={() => onExecuteRefreshTreasuryBalance()}>
          <span className="menu-item-text">Refresh account data</span>
        </Menu.Item>
      )}
      {isMultisigTreasury() && (
        <Menu.Item key="ms-02" disabled={hasStreamingAccountPendingTx() || !isTreasurer()} onClick={showSolBalanceModal}>
          <span className="menu-item-text">SOL balance</span>
        </Menu.Item>
      )}
    </Menu>
  );

  const renderStreamingAccountStreams = (
    <>
      {!loadingStreamingAccountStreams ? (
        (streamingAccountStreams !== undefined && streamingAccountStreams.length > 0) ? (
          streamingAccountStreams.map((stream, index) => {
            const onSelectStream = () => {
              // Sends stream value to the parent component "Accounts"
              onSendFromStreamingAccountStreamInfo(stream);
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
                key={index}
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
          <span className="pl-1">This streaming account has no streams</span>
        )
      ) : (
        <span className="pl-1">Loading streams ...</span>
      )}
    </>
  );

  const renderStreamingAccountActivity = (
    <>
      {!loadingStreamingAccountActivity ? (
        streamingAccountActivity !== undefined && streamingAccountActivity.length > 0 ? (
          streamingAccountActivity.map((item, index) => {

            // const img = getActivityIcon(item);
            const title = getStreamingAccountActivityAction(item);
            const subtitle = <CopyExtLinkGroup
              content={item.signature}
              number={8}
              externalLink={false}
            />

            const amount = getStreamingAccountActivityAssociatedToken(item);
            const resume = getShortDate(item.utcDate as string, true);

            return (
              <a
                key={index}
                target="_blank" 
                rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`} 
                className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
              >
                <ResumeItem
                  id={`${index}`}
                  // img={img}
                  title={title}
                  subtitle={subtitle}
                  amount={amount}
                  resume={resume}
                  hasRightIcon={true}
                  rightIcon={<IconExternalLink className="mean-svg-icons external-icon" />}
                  isLink={true}
                />
              </a>
          )})
        ) : (
          <span className="pl-1">This streaming account has no activity</span>
        )
      ) : (
        <span className="pl-1">Loading streaming account activity ...</span>
      )}
      {(streamingAccountActivity && streamingAccountActivity.length >= 5 && hasMoreStreamingAccountActivity) && (
        <div className="mt-1 text-center">
          <span className={loadingStreamingAccountActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
              role="link"
              onClick={() => {
              if (streamingAccountSelected) {
                getStreamingAccountActivity(streamingAccountSelected.id as string);
              }
            }}>
            {t('general.cta-load-more')}
          </span>
        </div>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "streams",
      name: "Streams",
      render: renderStreamingAccountStreams
    },
    {
      id: "activity",
      name: "Activity",
      render: renderStreamingAccountActivity
    }
  ];

  const streamAccountSubtitle = <CopyExtLinkGroup
    content={getStreamingAccountContent()}
    number={8}
    externalLink={true}
  />;

  const streamAccountContent = "Available streaming balance";

  const renderTabset = () => {
    const option = getQueryTabOption() || 'streams'
    return (
      <Tabs activeKey={option} onChange={navigateToTab} className="neutral">
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

  const streamAccountTitle = getStreamingAccountName() ? getStreamingAccountName() : (streamingAccountSelected && shortenAddress(streamingAccountSelected.id as string, 8));

  const renderBadges = () => {
    if (!streamingAccountSelected) { return; }

    const v1 = streamingAccountSelected as unknown as TreasuryInfo;
    const v2 = streamingAccountSelected as Treasury;
    const isNewTreasury = streamingAccountSelected && streamingAccountSelected.version >= 2 ? true : false;

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
    )

    return badges;
  }

  return (
    <>
      <Spin spinning={loadingStreamingAccountDetails}>
        {!isXsDevice && (
          <Row gutter={[8, 8]} className="safe-details-resume mr-0 ml-0">
            <div onClick={hideDetailsHandler} className="back-button icon-button-container">
              <IconArrowBack className="mean-svg-icons" />
              <span className="ml-1">Back</span>
            </div>
          </Row>
        )}

        {streamingAccountSelected && (
          <ResumeItem
            title={streamAccountTitle}
            extraTitle={renderBadges()}
            subtitle={streamAccountSubtitle}
            content={streamAccountContent}
            resume={getStreamingAccountResume()}
            isDetailsPanel={true}
            isLink={false}
            isStreamingAccount={true}
            classNameRightContent="header-streaming-details-row resume-right-content"
            xs={24}
            md={24}
          />
        )}

        {/* CTAs row */}
        <Row gutter={[8, 8]} className="safe-btns-container mb-1 mr-0 ml-0">
          <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke btn-min-width"
              disabled={hasStreamingAccountPendingTx()}
              onClick={showAddFundsModal}>
                <div className="btn-content">
                  Add funds
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke btn-min-width"
              disabled={
                hasStreamingAccountPendingTx() ||
                getTreasuryUnallocatedBalance() <= 0
              }
              onClick={showTransferFundsModal}>
                <div className="btn-content">
                  Withdraw funds
                </div>
            </Button>
            {!isXsDevice && (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                disabled={
                  hasStreamingAccountPendingTx() ||
                  (!streamingAccountSelected || streamingAccountSelected.balance - streamingAccountSelected.allocationAssigned <= 0)
                }
                onClick={showCreateStreamModal}>
                  <div className="btn-content">
                    Create stream
                  </div>
              </Button>
            )}
          </Col>

          <Col xs={4} sm={6} md={4} lg={6}>
            <Dropdown
              overlay={menu}
              placement="bottomRight"
              trigger={["click"]}>
              <span className="ellipsis-icon icon-button-container mr-1">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                  onClick={(e) => e.preventDefault()}
                />
              </span>
            </Dropdown>
          </Col>
        </Row>

        {/* Alert to offer refresh treasury */}
        {streamingAccountSelected && associatedTokenBalance !== streamingAccountSelected.balance && (
          <div className="alert-info-message mb-2 mr-2 pr-2">
            <Alert message={(
                <>
                  <span>This streaming account received an incoming funds transfer.&nbsp;</span>
                  <span className="simplelink underline" onClick={() => onExecuteRefreshTreasuryBalance()}>Refresh the account data</span>
                  <span>&nbsp;to update the account balance.</span>
                </>
              )}
              type="info"
              showIcon
            />
          </div>
        )}

        {tabs && renderTabset()}
      </Spin>

      {multisigClient && isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={
            streamingAccountSelected
              ? (streamingAccountSelected as Treasury).version && (streamingAccountSelected as Treasury).version >= 2
                ? (streamingAccountSelected as Treasury).associatedToken as string
                : (streamingAccountSelected as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={closeCreateStreamModal}
          isVisible={isCreateStreamModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={
            streamingAccountSelected
              ? streamingAccountSelected
              : props.treasuryList && props.treasuryList.length > 0
                ? props.treasuryList[0]
                : undefined
          }
          treasuryList={props.treasuryList?.filter(t => t.version >= 2)}
          minRequiredBalance={minRequiredBalance}
          selectedMultisig={selectedMultisig}
          multisigClient={multisigClient}
          userBalances={userBalances}
        />
      )}

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={(params: TreasuryTopupParams) => onAcceptAddFunds(params)}
          handleClose={closeAddFundsModal}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          treasuryDetails={streamingAccountSelected}
          treasuryList={[]}
          isVisible={isAddFundsModalVisible}
          selectedMultisig={selectedMultisig || undefined}
          userBalances={userBalances}
          treasuryStreams={streamingAccountStreams}
          associatedToken={
            streamingAccountSelected
              ? (streamingAccountSelected as Treasury).version && (streamingAccountSelected as Treasury).version >= 2
                ? (streamingAccountSelected as Treasury).associatedToken as string
                : (streamingAccountSelected as TreasuryInfo).associatedTokenAddress as string
              : ''
          }
          isBusy={isBusy}
          onReloadTokenBalances={(option: string) => {
            if (option === "safe") {
              if (selectedMultisig) {
                refreshUserBalances(selectedMultisig.authority);
              }
            } else {
              if (publicKey) {
                refreshUserBalances(publicKey);
              }
            }
          }}
        />
      )}

      {isTransferFundsModalVisible && (
        <TreasuryTransferFundsModal
          isVisible={isTransferFundsModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          treasuryDetails={streamingAccountSelected}
          multisigAccounts={multisigAccounts}
          minRequiredBalance={minRequiredBalance}
          handleOk={onAcceptTreasuryTransferFunds}
          handleClose={() => {
            setIsTransferFundsModalVisible(false);
          }}
          isBusy={isBusy}
        />
      )}

      {isCloseTreasuryModalVisible && (
        <TreasuryCloseModal
          isVisible={isCloseTreasuryModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          nativeBalance={nativeBalance}
          treasuryDetails={streamingAccountSelected}
          handleOk={onAcceptCloseTreasury}
          handleClose={hideCloseTreasuryModal}
          content={getTreasuryClosureMessage()}
          transactionStatus={transactionStatus.currentOperation}
          isBusy={isBusy}
          selectedMultisig={selectedMultisig || undefined}
        />
      )}

      {isSolBalanceModalOpen && (
        <SolBalanceModal
          address={streamingAccountSelected ? streamingAccountSelected.id as string : ''}
          accountAddress={accountAddress}
          multisigAddress={address as string}
          isVisible={isSolBalanceModalOpen}
          handleClose={hideSolBalanceModal}
          tokenSymbol={NATIVE_SOL.symbol}
          nativeBalance={nativeBalance}
          selectedMultisig={selectedMultisig}
          treasuryBalance={treasuryEffectiveBalance}
          isStreamingAccount={true}
        />
      )}

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionExecutionModalVisible}
        afterClose={onAfterCloseStreamTransactionModalClosed}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideTransactionExecutionModal}
        width={360}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                <div className="indication">{t('transactions.status.instructions')}</div>
              )}
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">
                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
              </h4>
              <p className="operation">{t('transactions.status.tx-generic-operation-success')}</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={() => hideTransactionExecutionModal()}>
                {t('general.cta-finish')}
              </Button>
            </>
          ) : isError() ? (
            <>
              <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
              {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                <h4 className="mb-4">
                  {t('transactions.status.tx-start-failure', {
                    accountBalance: getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getTokenAmountAndSymbolByTokenAddress(
                      minRequiredBalance,
                      NATIVE_SOL_MINT.toBase58()
                    )})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-3">
                  {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                </h4>
              )}
              {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                <div className="row two-col-ctas mt-3">
                  <div className="col-6">
                    <Button
                      block
                      type="text"
                      shape="round"
                      size="middle"
                      onClick={() => hideTransactionExecutionModal()}>
                      {t('general.retry')}
                    </Button>
                  </div>
                  <div className="col-6">
                    <Button
                      block
                      type="primary"
                      shape="round"
                      size="middle"
                      onClick={() => refreshPage()}>
                      {t('general.refresh')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransactionExecutionModal}>
                  {t('general.cta-close')}
                </Button>
              )}
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}