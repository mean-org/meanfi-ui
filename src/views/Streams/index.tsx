import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin, Dropdown, Menu, Tooltip, Empty } from "antd";
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  EllipsisOutlined,
  LoadingOutlined,
  SearchOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  IconBank,
  IconClock,
  IconDocument,
  IconDownload,
  IconExternalLink,
  IconIncomingPaused,
  IconOutgoingPaused,
  IconRefresh,
  IconShare,
  IconTimer,
  IconUpload,
} from "../../Icons";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import {
  formatAmount,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  getTxIxResume,
  shortenAddress
} from "../../utils/utils";
import {
  consoleOut,
  copyText,
  getFormattedNumberToLocale,
  getIntervalFromSeconds,
  getReadableDate,
  getShortDate,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isValidAddress,
} from "../../utils/ui";
import { StreamOpenModal } from '../../components/StreamOpenModal';
import { StreamWithdrawModal } from '../../components/StreamWithdrawModal';
import {
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
} from "../../constants";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../contexts/connection";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { OperationType, TransactionStatus } from "../../models/enums";
import { notify } from "../../utils/notifications";
import { StreamAddFundsModal } from "../../components/StreamAddFundsModal";
import { TokenInfo } from "@solana/spl-token-registry";
import { StreamCloseModal } from "../../components/StreamCloseModal";
import { useNativeAccount } from "../../contexts/accounts";
import { AllocationType, MSP_ACTIONS, StreamActivity, StreamInfo, STREAM_STATE, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees, getStream } from '@mean-dao/money-streaming/lib/utils';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { useTranslation } from "react-i18next";
import { defaultStreamStats, StreamStats } from "../../models/streams";
import { customLogger } from '../..';
import { useLocation, useNavigate } from "react-router-dom";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { TransactionStatusContext } from "../../contexts/transaction-status";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const Streams = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, wallet, publicKey } = useWallet();
  const {
    streamList,
    streamDetail,
    tokenBalance,
    selectedToken,
    loadingStreams,
    loadingStreamActivity,
    streamActivity,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    customStreamDocked,
    setStreamList,
    openStreamById,
    setStreamDetail,
    setSelectedToken,
    setEffectiveRate,
    setSelectedStream,
    refreshStreamList,
    setDtailsPanelOpen,
    refreshTokenBalance,
    setTransactionStatus,
    setForceReloadTokens,
    setCustomStreamDocked,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    clearTransactionStatusContext,
    startFetchTxSignatureInfo,
  } = useContext(TransactionStatusContext);

  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(endpoint, streamProgramAddress), [endpoint, streamProgramAddress]);

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

  const [streamStats, setStreamStats] = useState<StreamStats>(defaultStreamStats);
  const [oldSelectedToken, setOldSelectedToken] = useState<TokenInfo>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  // Live data calculation
  useEffect(() => {

    const refreshStreams = async () => {
      if (!streamList || !publicKey || loadingStreams) { return; }
      const updatedStreams = await ms.refreshStreams(streamList, publicKey, publicKey);
      const newList: StreamInfo[] = [];
      if (updatedStreams && updatedStreams.length) {
        let freshStream: StreamInfo;
        for (const stream of updatedStreams) {
          if (streamDetail && streamDetail.id === stream.id) {
            freshStream = await ms.refreshStream(streamDetail);
            if (freshStream) {
              setStreamDetail(freshStream);
            }
          }
          freshStream = await ms.refreshStream(stream);
          if (freshStream) {
            newList.push(freshStream);
          }
        }
        if (newList.length) {
          setStreamList(newList);
        }
      }
    }

    const timeout = setTimeout(() => {
      refreshStreams();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    ms,
    publicKey,
    streamList,
    streamDetail,
    loadingStreams,
    setStreamDetail,
    setStreamList,
  ])

  // Handle overflow-ellipsis-middle elements of resize
  useEffect(() => {
    const resizeListener = () => {
      const NUM_CHARS = 4;
      const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (let i = 0; i < ellipsisElements.length; ++i){
        const e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          const text = e.textContent;
          e.dataset.tail = text?.slice(text.length - NUM_CHARS);
        }
      }
    };
    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, []);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    resetTransactionStatus();
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      setIsCloseStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFees,
    resetTransactionStatus
  ]);
  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = () => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction();
  };

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (e: any) => {
    openStreamById(e);
    closeOpenStreamModal();
  };

  const handleCancelCustomStreamClick = () => {
    setCustomStreamDocked(false);
    refreshStreamList(true);
  }

  const setCustomToken = useCallback((address: string) => {

    if (address && isValidAddress(address)) {
      const unkToken: TokenInfo = {
        address: address,
        name: 'Unknown',
        chainId: 101,
        decimals: 6,
        symbol: shortenAddress(address),
      };
      setSelectedToken(unkToken);
      consoleOut("token selected:", unkToken, 'blue');
      setEffectiveRate(0);
    } else {
      notify({
        message: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
    t,
  ]);

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    const token = getTokenByMintAddress(streamDetail?.associatedToken as string);
    consoleOut("selected token:", token?.symbol);

    if (token) {
      if (!selectedToken || selectedToken.address !== token.address) {
        setOldSelectedToken(selectedToken);
        setSelectedToken(token);
      }
    } else if (!token && (!selectedToken || selectedToken.address !== streamDetail?.associatedToken)) {
      setCustomToken(streamDetail?.associatedToken as string);
    }

    if (token) {
      setOldSelectedToken(selectedToken);
      setSelectedToken(token);
    }
    getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
      setTransactionFees(value);
      setIsAddFundsModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    selectedToken,
    streamDetail,
    setCustomToken,
    setSelectedToken,
    getTransactionFees
  ]);

  const closeAddFundsModal = useCallback(() => {
    if (oldSelectedToken) {
      setSelectedToken(oldSelectedToken);
    }
    setIsAddFundsModalVisibility(false);
  }, [oldSelectedToken, setSelectedToken]);

  const [addFundsAmount, setAddFundsAmount] = useState<number>(0);
  const onAcceptAddFunds = (amount: any) => {
    closeAddFundsModal();
    consoleOut('AddFunds amount:', parseFloat(amount));
    onExecuteAddFundsTransaction(amount);
  };

  // Withdraw funds modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(async () => {
    let streamPublicKey: PublicKey;
    const streamId = streamDetail?.id;
    try {
      streamPublicKey = new PublicKey(streamId as string);
      try {
        const detail = await getStream(connection, streamPublicKey);
        if (detail) {
          consoleOut('detail', detail);
          setLastStreamDetail(detail);
          getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
            setTransactionFees(value);
            setIsWithdrawModalVisibility(true);
            consoleOut('transactionFees:', value, 'orange');
          });
        } else {
          notify({
            message: t('notifications.error-title'),
            description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
            type: "error"
          });
        }
      } catch (error) {
        console.error(error);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-streamid-message', {streamId: shortenAddress(streamId as string, 10)}),
          type: "error"
        });
      }
    } catch (error) {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.invalid-streamid-message') + '!',
        type: "error"
      });
    }
  }, [
    connection,
    streamDetail,
    t,
    getTransactionFees,
  ]);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const [lastStreamDetail, setLastStreamDetail] = useState<StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<number>(0);

  const onAcceptWithdraw = (amount: any) => {
    closeWithdrawModal();
    consoleOut('Withdraw amount:', parseFloat(amount));
    onExecuteWithdrawFundsTransaction(amount);
  };

  const onActivateContractScreen = () => {
    setCustomStreamDocked(false);
    navigate("/transfers");
  };

  const isInboundStream = useCallback((item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }, [publicKey]);

  const isAuthority = (): boolean => {
    return streamDetail && wallet && wallet.publicKey &&
           (streamDetail.treasurerAddress === wallet.publicKey.toBase58() ||
            streamDetail.beneficiaryAddress === wallet.publicKey.toBase58())
           ? true : false;
  }

  const getEscrowEstimatedDepletionUtcLabel = (date: Date): string => {
    const today = new Date();
    const miniDate = streamDetail && streamDetail.escrowEstimatedDepletionUtc
      ? getReadableDate(streamDetail.escrowEstimatedDepletionUtc.toString())
      : '';

    if (date > today) {
      return `(${t('streams.stream-detail.label-funds-runout-today')})`;
    } else if (date < today) {
      return '';
    } else {
      return `(${t('streams.stream-detail.label-funds-runout')} ${miniDate})`;
    }
  }

  const getStreamIcon = useCallback((item: StreamInfo) => {
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
  
    if (item.isUpdatePending) {
      return <IconDocument className="mean-svg-icons pending" />;
    }
  
    if (isInbound) {
      switch (item.state) {
        case STREAM_STATE.Schedule:
          return (<IconTimer className="mean-svg-icons incoming" />);
        case STREAM_STATE.Paused:
          return (<IconIncomingPaused className="mean-svg-icons incoming" />);
        default:
          return (<IconDownload className="mean-svg-icons incoming" />);
      }
    } else {
      switch (item.state) {
        case STREAM_STATE.Schedule:
          return (<IconTimer className="mean-svg-icons outgoing" />);
        case STREAM_STATE.Paused:
          return (<IconOutgoingPaused className="mean-svg-icons outgoing" />);
        default:
          return (<IconUpload className="mean-svg-icons outgoing" />);
      }
    }
  }, [
    publicKey
  ]);

  const getStreamDescription = (item: StreamInfo): string => {
    let title = '';
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;

    if (isInbound) {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Schedule) {
        title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (item.state === STREAM_STATE.Paused) {
        title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      }
    }
    return title;
  }

  const getTransactionSubTitle = useCallback((item: StreamInfo) => {
    let title = '';
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
    const isOtp = item.rateAmount === 0 ? true : false;

    if (isInbound) {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-inbound');
        return title;
      }

      switch (item.state) {
        case STREAM_STATE.Schedule:
          title = t('streams.stream-list.subtitle-scheduled-inbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        case STREAM_STATE.Paused:
          if (isOtp) {
            title = t('streams.stream-list.subtitle-paused-otp');
          } else {
            title = t('streams.stream-list.subtitle-paused-inbound');
          }
          break;
        case STREAM_STATE.Running:
          title = t('streams.stream-list.subtitle-running-inbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        default:
          break;
      }
    } else {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-outbound');
        return title;
      }

      switch (item.state) {
        case STREAM_STATE.Schedule:
          title = t('streams.stream-list.subtitle-scheduled-outbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        case STREAM_STATE.Paused:
          if (isOtp) {
            title = t('streams.stream-list.subtitle-paused-otp');
          } else {
            title = t('streams.stream-list.subtitle-paused-outbound');
          }
          break;
        case STREAM_STATE.Running:
          title = t('streams.stream-list.subtitle-running-outbound');
          title += ` ${getShortDate(item.startUtc as string)}`;
          break;
        default:
          break;
      }
    }
    return title;

  }, [
    t,
    publicKey
  ]);

  const isStreamScheduled = (startUtc: string): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const streamStartDate = new Date(startUtc);
    return streamStartDate > nowUtc ? true : false;
  }

  const getStartDateLabel = (): string => {
    let label = t('streams.stream-detail.label-start-date-default');
    if (streamDetail) {
      if (isStreamScheduled(streamDetail.startUtc as string)) {
        if (isOtp()) {
          label = t('streams.stream-detail.label-start-date-scheduled-otp');
        } else {
          label = t('streams.stream-detail.label-start-date-scheduled');
        }
      } else {
        label = t('streams.stream-detail.label-start-date-started');
      }
    }
    return label;
  }

  // Maintain stream stats
  useEffect(() => {

    const updateStats = () => {
      if (streamList && streamList.length) {
        const incoming = streamList.filter(s => isInboundStream(s));
        const outgoing = streamList.filter(s => !isInboundStream(s));
        const stats: StreamStats = {
          incoming: incoming.length,
          outgoing: outgoing.length
        }
        setStreamStats(stats);
      } else {
        setStreamStats(defaultStreamStats);
      }
    }

    updateStats();
  }, [
    publicKey,
    streamList,
    isInboundStream]
  );

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!ms || !streamDetail) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.StreamClose:
        case OperationType.StreamCreate:
          if (streamList && streamList.length > 1) {
            const filteredStreams = streamList.filter(s => s.id !== streamDetail.id);
            setStreamList(filteredStreams);
          }
          refreshStreamList(true);
          break;
        case OperationType.StreamAddFunds:
          if (customStreamDocked) {
            openStreamById(streamDetail?.id as string);
          } else {
            refreshStreamList(false);
          }
          break;
        default:
          refreshStreamList(false);
          break;
      }
    }
  }, [
    ms,
    streamList,
    streamDetail,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    customStreamDocked,
    setStreamList,
    refreshStreamList,
    openStreamById,
  ]);

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

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

  // Add funds Transaction execution modal
  const [isAddFundsTransactionModalVisible, setAddFundsTransactionModalVisibility] = useState(false);
  const showAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(true), []);
  const hideAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(false), []);

  const onAddFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onAfterAddFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteAddFundsTransaction = async (addAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(endpoint, streamProgramAddress, "confirmed");

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey(streamDetail.treasuryAddress as string);
        const contributorMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addAmount);
        setAddFundsAmount(amount);

        const data = {
          contributor: wallet.publicKey.toBase58(),               // contributor
          treasury: treasury.toBase58(), 
          stream: stream.toBase58(),                             // stream
          contributorMint: contributorMint.toBase58(),            // contributorMint
          amount                                                  // amount
        }
        consoleOut('add funds data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await moneyStream.addFunds(
          wallet.publicKey,
          treasury,
          stream,
          contributorMint,
          amount,
          AllocationType.All
        )
        .then(value => {
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
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
            customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail) {
      showAddFundsTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamAddFunds);
            setIsBusy(false);
            onAddFundsTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Withdraw funds Transaction execution modal
  const [isWithdrawFundsTransactionModalVisible, setWithdrawFundsTransactionModalVisibility] = useState(false);
  const showWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(true), []);
  const hideWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(false), []);

  const onWithdrawFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onAfterWithdrawFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(endpoint, streamProgramAddress, "confirmed");

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey(streamDetail.beneficiaryAddress as string);
        const amount = parseFloat(withdrawAmount);
        setWithdrawFundsAmount(amount);

        const data = {
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await moneyStream.withdraw(
          beneficiary,
          stream,
          amount
        )
        .then(value => {
          consoleOut('withdraw returned transaction:', value);
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
          console.error('withdraw error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendSignedTransaction returned a signature:', sig);
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
            customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showWithdrawFundsTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamWithdraw);
            setIsBusy(false);
            onWithdrawFundsTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close stream Transaction execution modal
  const [isCloseStreamTransactionModalVisible, setCloseStreamTransactionModalVisibility] = useState(false);
  const showCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(true), []);
  const hideCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteCloseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(endpoint, streamProgramAddress, "confirmed");

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
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

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${
              getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await moneyStream.closeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
          true                                              // closeTreasury
        )
        .then(value => {
          consoleOut('closeStream returned transaction:', value);
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
          console.error('closeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
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
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showCloseStreamTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamClose);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && streamDetail && streamList) {

      const me = publicKey.toBase58();
      const treasury = streamDetail.treasuryAddress as string;
      const treasurer = streamDetail.treasurerAddress as string;
      const beneficiary = streamDetail.beneficiaryAddress as string;
      // TODO: Account for multiple beneficiaries funded by the same treasury (only 1 right now)
      const numTreasuryBeneficiaries = 1; // streamList.filter(s => s.treasurerAddress === me && s.treasuryAddress === treasury).length;

      if (treasurer === me) {  // If I am the treasurer
        if (numTreasuryBeneficiaries > 1) {
          message = t('close-stream.context-treasurer-multiple-beneficiaries', {
            beneficiary: shortenAddress(beneficiary),
            treasury: shortenAddress(treasury)
          });
        } else {
          message = t('close-stream.context-treasurer-single-beneficiary', {beneficiary: shortenAddress(beneficiary)});
        }
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = t('close-stream.context-beneficiary', { beneficiary: shortenAddress(beneficiary) });
      }

    }

    return (
      <div>{message}</div>
    );
  }

  const onCopyStreamAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.streamid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.streamid-not-copied-message'),
        type: "error"
      });
    }
  }

  const onRefreshStreamsClick = () => {
    refreshStreamList(true);
    setCustomStreamDocked(false);
  };

  const getRateAmountDisplay = (item: StreamInfo): string => {
    let value = '';
    if (item && item.rateAmount && item.associatedToken) {
      value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const getDepositAmountDisplay = (item: StreamInfo): string => {
    let value = '';
    if (item && item.rateAmount === 0 && item.allocationReserved > 0) {
      value += getFormattedNumberToLocale(formatAmount(item.allocationReserved, 2));
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const isOtp = (): boolean => {
    return streamDetail?.rateAmount === 0 ? true : false;
  }

  const getActivityIcon = (item: StreamActivity) => {
    if (isInboundStream(streamDetail as StreamInfo)) {
      if (item.action === 'withdrew') {
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing" />
          );
        } else {
        return (
          <ArrowDownOutlined className="mean-svg-icons incoming" />
          );
      }
    } else {
      if (item.action === 'withdrew') {
        return (
          <ArrowDownOutlined className="mean-svg-icons incoming" />
        );
      } else {
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing" />
        );
      }
    }
  }

  const isAddressMyAccount = (addr: string): boolean => {
    return wallet && addr && wallet.publicKey && addr === wallet.publicKey.toBase58()
           ? true
           : false;
  }

  const getActivityActor = (item: StreamActivity): string => {
    return isAddressMyAccount(item.initializer) ? t('general.you') : shortenAddress(item.initializer);
  }

  const getActivityAction = (item: StreamActivity): string => {
    const actionText = item.action === 'deposited'
      ? t('streams.stream-activity.action-deposit')
      : t('streams.stream-activity.action-withdraw');
    return actionText;
  }

  const isScheduledOtp = (): boolean => {
    if (streamDetail && streamDetail.rateAmount === 0) {
      const now = new Date().toUTCString();
      const nowUtc = new Date(now);
      const streamStartDate = new Date(streamDetail.startUtc as string);
      if (streamStartDate > nowUtc) {
        return true;
      }
    }
    return false;
  }

  const isCreating = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamCreate
            ? true
            : false;
  }

  const isClosing = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamClose
            ? true
            : false;
  }

  const isWithdrawing = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamWithdraw
            ? true
            : false;
  }

  const isAddingFunds = (): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.StreamAddFunds
            ? true
            : false;
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={showCloseStreamModal}>
        <span className="menu-item-text">{t('streams.stream-detail.close-money-stream-menu-item')}</span>
      </Menu.Item>
    </Menu>
  );

  const renderInboundStream = (
    <>
    <div className="stream-details-data-wrapper vertical-scroll">

      <Spin spinning={loadingStreams}>
        <div className="stream-fields-container">
          {/* Background animation */}
          {streamDetail && streamDetail.state === STREAM_STATE.Running ? (
            <div className="stream-background">
              <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
            </div>
            ) : null
          }

          {/* Sender */}
          <Row className="mb-3">
            <Col span={12}>
              <div className="info-label">
                {streamDetail && (
                  <>
                  {streamDetail.state === STREAM_STATE.Schedule
                    ? t('streams.stream-detail.label-receive-from')
                    : streamDetail.state === STREAM_STATE.Running
                      ? t('streams.stream-detail.label-receiving-from')
                      : t('streams.stream-detail.label-received-from')
                  }
                  </>
                )}
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconShare className="mean-svg-icons" />
                </span>
                <span className="info-data">
                  {streamDetail && (
                    <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                      href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamDetail.treasurerAddress}${getSolanaExplorerClusterParam()}`}>
                      {shortenAddress(`${streamDetail.treasurerAddress}`)}
                    </a>
                  )}
                </span>
              </div>
            </Col>
            <Col span={12}>
              {isOtp() ? (
                null
              ) : (
                <>
                <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                <div className="transaction-detail-row">
                  <span className="info-data">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.rateAmount, streamDetail.associatedToken as string)
                      : '--'
                    }
                    {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true, t)}
                  </span>
                </div>
                </>
              )}
            </Col>
          </Row>

          {/* Amount for OTPs */}
          {isOtp() ? (
            <div className="mb-3">
              <div className="info-label">
                {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(streamDetail?.fundedOnUtc as string)})
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconDownload className="mean-svg-icons" />
                </span>
                {streamDetail ?
                  (
                    <span className="info-data">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.allocationReserved, streamDetail.associatedToken as string)
                      : '--'}
                    </span>
                  ) : (
                    <span className="info-data">&nbsp;</span>
                  )}
              </div>
            </div>
          ) : (
            null
          )}

          {/* Started date */}
          <div className="mb-3">
            <div className="info-label">{getStartDateLabel()}</div>
            <div className="transaction-detail-row">
              <span className="info-icon">
                <IconClock className="mean-svg-icons" />
              </span>
              <span className="info-data">
                {getReadableDate(streamDetail?.startUtc as string)}
              </span>
            </div>
          </div>

          {/* Funds left (Total Unvested) */}
          {isOtp() ? (
            null
          ) : streamDetail && streamDetail.escrowUnvestedAmount > 0 && (
            <div className="mb-3">
              <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')} {streamDetail
                ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
                : ''}
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconBank className="mean-svg-icons" />
                </span>
                {streamDetail ? (
                  <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.escrowUnvestedAmount, streamDetail.associatedToken as string)
                    : '--'}
                  </span>
                ) : (
                  <span className="info-data">&nbsp;</span>
                )}
              </div>
            </div>
          )}

          {/* Show only if the stream is not a scheduled Otp */}
          {!isScheduledOtp() && (
            <>
              {/* Amount withdrawn */}
              {/* <div className="mb-3">
                <div className="info-label">{t('streams.stream-detail.label-total-withdrawals')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconDownload className="mean-svg-icons" />
                  </span>
                  {streamDetail ? (
                    <span className="info-data">
                    {/* TODO: How to get totalWithdrawals on new stream version */}
                    {/* {streamDetail
                      ? getAmountWithSymbol(streamDetail.allocationCommitted, streamDetail.associatedToken as string)
                      : '--'}
                    </span>
                  ) : (
                    <span className="info-data">&nbsp;</span>
                  )}
                </div>
              </div> */}

              {/* Funds available to withdraw now (Total Vested) */}
              <div className="mb-3">
                <div className="info-label">{t('streams.stream-detail.label-funds-available-to-withdraw')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    {streamDetail && streamDetail.state === STREAM_STATE.Running ? (
                      <ArrowDownOutlined className="mean-svg-icons success bounce" />
                    ) : (
                      <ArrowDownOutlined className="mean-svg-icons success" />
                    )}
                  </span>
                  {streamDetail ? (
                    <span className="info-data large">
                    {streamDetail
                      ? getAmountWithSymbol(
                          streamDetail.escrowVestedAmount, 
                          streamDetail.associatedToken as string
                        )
                      : '--'}
                    </span>
                  ) : (
                    <span className="info-data large">&nbsp;</span>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Withdraw button */}
          <div className="mt-3 mb-3 withdraw-container">
            <Button
              block
              className="withdraw-cta"
              type="text"
              shape="round"
              size="small"
              disabled={
                isScheduledOtp() ||
                !streamDetail?.escrowVestedAmount ||
                publicKey?.toBase58() !== streamDetail?.beneficiaryAddress ||
                fetchTxInfoStatus === "fetching"
              }
              onClick={showWithdrawModal}>
              {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
              {isClosing()
                ? t("streams.stream-detail.cta-disabled-closing")
                : isCreating()
                  ? t("streams.stream-detail.cta-disabled-creating")
                  : isAddingFunds()
                    ? t("streams.stream-detail.cta-disabled-funding")
                    : isWithdrawing()
                      ? t("streams.stream-detail.cta-disabled-withdrawing")
                      : t("streams.stream-detail.withdraw-funds-cta")
              }
            </Button>
            {(isAuthority() && fetchTxInfoStatus !== "fetching") && (
              <Dropdown overlay={menu} trigger={["click"]}>
                <Button
                  shape="round"
                  type="text"
                  size="small"
                  className="ant-btn-shaded"
                  onClick={(e) => e.preventDefault()}
                  icon={<EllipsisOutlined />}>
                </Button>
              </Dropdown>
            )}
          </div>
        </div>
      </Spin>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">{t('streams.stream-activity.heading')}</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>{t('streams.stream-activity.no-activity')}.</p>
      ) : (
        <div className="activity-list">
          <Spin spinning={loadingStreamActivity}>
            {streamActivity && (
              <>
                <div className="item-list-header compact">
                  <div className="header-row">
                    <div className="std-table-cell first-cell">&nbsp;</div>
                    <div className="std-table-cell fixed-width-80">&nbsp;</div>
                    <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-action')}</div>
                    <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-amount')}</div>
                    <div className="std-table-cell fixed-width-120">{t('streams.stream-activity.label-date')}</div>
                  </div>
                </div>
                <div className="item-list-body compact">
                  {streamActivity.map((item, index) => {
                    return (
                      <a key={`${index}`} className="item-list-row" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                        <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                        <div className="std-table-cell fixed-width-80">
                          <span className={isAddressMyAccount(item.initializer) ? 'text-capitalize align-middle' : 'align-middle'}>{getActivityActor(item)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-60">
                          <span className="align-middle">{getActivityAction(item)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-60">
                          <span className="align-middle">{getAmountWithSymbol(item.amount, item.mint)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-120" >
                          <span className="align-middle">{getShortDate(item.utcDate as string, true)}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </Spin>
        </div>
      )}
    </div>
    {streamDetail && (
      <div className="stream-share-ctas">
        <span className="copy-cta" onClick={() => onCopyStreamAddress(streamDetail.id)}>STREAM ID: {streamDetail.id}</span>
        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
           href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamDetail.id}${getSolanaExplorerClusterParam()}`}>
          <IconExternalLink className="mean-svg-icons" />
        </a>
      </div>
    )}
  </>
  );

  const renderOutboundStream = (
    <>
    <div className="stream-details-data-wrapper vertical-scroll">

      <Spin spinning={loadingStreams}>
        <div className="stream-fields-container">
          {/* Background animation */}
          {streamDetail && streamDetail.state === STREAM_STATE.Running ? (
            <div className="stream-background">
              <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
            </div>
            ) : null
          }

          {/* Beneficiary */}
          <Row className="mb-3">
            <Col span={12}>
              <div className="info-label">
                {streamDetail && (
                  <>
                  {streamDetail.state === STREAM_STATE.Schedule
                    ? t('streams.stream-detail.label-send-to')
                    : streamDetail.state === STREAM_STATE.Running
                      ? t('streams.stream-detail.label-sending-to')
                      : t('streams.stream-detail.label-sent-to')
                  }
                  </>
                )}
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconShare className="mean-svg-icons" />
                </span>
                <span className="info-data">
                  <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                    href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamDetail?.beneficiaryAddress}${getSolanaExplorerClusterParam()}`}>
                    {shortenAddress(`${streamDetail?.beneficiaryAddress}`)}
                  </a>
                </span>
              </div>
            </Col>
            <Col span={12}>
              {isOtp() ? (
                null
              ) : (
                <>
                <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                <div className="transaction-detail-row">
                  <span className="info-data">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.rateAmount, streamDetail.associatedToken as string)
                      : '--'
                    }
                    {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true, t)}
                  </span>
                </div>
                </>
              )}
            </Col>
          </Row>

          {/* Amount for OTPs */}
          {isOtp() ? (
            <div className="mb-3">
              <div className="info-label">
                {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(streamDetail?.fundedOnUtc as string)})
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconUpload className="mean-svg-icons" />
                </span>
                {streamDetail ?
                  (
                    <span className="info-data">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.allocationReserved, streamDetail.associatedToken as string)
                      : '--'}
                    </span>
                  ) : (
                    <span className="info-data">&nbsp;</span>
                  )}
              </div>
            </div>
          ) : (
            null
          )}

          {/* Start date */}
          <div className="mb-3">
            <div className="info-label">{getStartDateLabel()}</div>
            <div className="transaction-detail-row">
              <span className="info-icon">
                <IconClock className="mean-svg-icons" />
              </span>
              <span className="info-data">
                {getReadableDate(streamDetail?.startUtc as string)}
              </span>
            </div>
          </div>

          {/* Total deposit */}
          {isOtp() ? (
            null
          ) : streamDetail && streamDetail.allocation && (
            <div className="mb-3">
              <div className="info-label">{t('streams.stream-detail.label-total-deposits')}</div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconDownload className="mean-svg-icons" />
                </span>
                {streamDetail ? (
                  <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(
                        streamDetail.allocation, 
                        streamDetail.associatedToken as string
                      )
                    : '--'}
                  </span>
                  ) : (
                    <span className="info-data">&nbsp;</span>
                  )}
              </div>
            </div>
          )}

          {/* Funds sent (Total Vested) */}
          {isOtp() ? (
            null
          ) : (
            <div className="mb-3">
              <div className="info-label">{t('streams.stream-detail.label-funds-sent')}</div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconUpload className="mean-svg-icons" />
                </span>
                {streamDetail ? (
                  <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
                    : '--'}
                  </span>
                ) : (
                  <span className="info-data">&nbsp;</span>
                )}
              </div>
            </div>
          )}

          {/* Funds left (Total Unvested) */}
          {isOtp() ? (
            null
          ) : (
            <div className="mb-3">
              <div className="info-label text-truncate">{streamDetail && !streamDetail?.escrowUnvestedAmount
                ? t('streams.stream-detail.label-funds-left-in-account')
                : `${t('streams.stream-detail.label-funds-left-in-account')} (${t('streams.stream-detail.label-funds-runout')} ${streamDetail && streamDetail.escrowEstimatedDepletionUtc
                  ? getReadableDate(streamDetail.escrowEstimatedDepletionUtc.toString())
                  : ''})`}
              </div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  {streamDetail && streamDetail.state === STREAM_STATE.Running ? (
                    <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                  ) : (
                    <ArrowUpOutlined className="mean-svg-icons outgoing" />
                  )}
                </span>
                {streamDetail ? (
                  <span className="info-data large">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.escrowUnvestedAmount, streamDetail.associatedToken as string)
                    : '--'}
                  </span>
                ) : (
                  <span className="info-data large">&nbsp;</span>
                )}
              </div>
            </div>
          )}

          {/* Top up (add funds) button */}
          <div className="mt-3 mb-3 withdraw-container">
            <Button
              block
              className="withdraw-cta"
              type="text"
              shape="round"
              size="small"
              disabled={
                isOtp() ||
                fetchTxInfoStatus === "fetching"
              }
              onClick={showAddFundsModal}>
              {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
              {isClosing()
                ? t("streams.stream-detail.cta-disabled-closing")
                : isCreating()
                  ? t("streams.stream-detail.cta-disabled-creating")
                  : isAddingFunds()
                    ? t("streams.stream-detail.cta-disabled-funding")
                    : isWithdrawing()
                      ? t("streams.stream-detail.cta-disabled-withdrawing")
                      : t("streams.stream-detail.add-funds-cta")
              }
            </Button>
            {(isAuthority() && fetchTxInfoStatus !== "fetching") && (
              <Dropdown overlay={menu} trigger={["click"]}>
                <Button
                  shape="round"
                  type="text"
                  size="small"
                  className="ant-btn-shaded"
                  onClick={(e) => e.preventDefault()}
                  icon={<EllipsisOutlined />}>
                </Button>
              </Dropdown>
            )}
          </div>
        </div>
      </Spin>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">{t('streams.stream-activity.heading')}</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>{t('streams.stream-activity.no-activity')}.</p>
      ) : (
        <div className="activity-list">
          <Spin spinning={loadingStreamActivity}>
            {streamActivity && (
              <>
                <div className="item-list-header compact">
                  <div className="header-row">
                    <div className="std-table-cell first-cell">&nbsp;</div>
                    <div className="std-table-cell fixed-width-80">&nbsp;</div>
                    <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-action')}</div>
                    <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-amount')}</div>
                    <div className="std-table-cell fixed-width-120">{t('streams.stream-activity.label-date')}</div>
                  </div>
                </div>
                <div className="item-list-body compact">
                  {streamActivity.map((item, index) => {
                    return (
                      <a key={`${index}`} className="item-list-row" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                        <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                        <div className="std-table-cell fixed-width-80">
                          <span className={isAddressMyAccount(item.initializer) ? 'text-capitalize align-middle' : 'align-middle'}>{getActivityActor(item)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-60">
                          <span className="align-middle">{getActivityAction(item)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-60">
                          <span className="align-middle">{getAmountWithSymbol(item.amount, item.mint)}</span>
                        </div>
                        <div className="std-table-cell fixed-width-120" >
                          <span className="align-middle">{getShortDate(item.utcDate as string, true)}</span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              </>
            )}
          </Spin>
        </div>
      )}
    </div>
    {streamDetail && (
      <div className="stream-share-ctas">
        <span className="copy-cta" onClick={() => onCopyStreamAddress(streamDetail.id)}>STREAM ID: {streamDetail.id}</span>
        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
           href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamDetail.id}${getSolanaExplorerClusterParam()}`}>
          <IconExternalLink className="mean-svg-icons" />
        </a>
      </div>
    )}
  </>
  );

  const renderStreamList = (
    <>
    {streamList && streamList.length ? (
      streamList.map((item, index) => {
        const onStreamClick = () => {
          consoleOut('selected stream:', item);
          setSelectedStream(item);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onStreamClick}
            className={`transaction-list-row ${streamDetail && streamDetail.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              {getStreamIcon(item)}
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{item.streamName || getStreamDescription(item)}</div>
              <div className="subtitle text-truncate">{getTransactionSubTitle(item)}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount">
                {item && item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item)}
              </div>
              {item && item.rateAmount > 0 && (
                <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds, false, t)}</div>
              )}
            </div>
          </div>
        );
      })
    ) : (
      <>
      {isCreating() ? (
        <div className="h-100 flex-center">
          <Spin indicator={bigLoadingIcon} />
        </div>
      ) : (
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
          ? t('streams.stream-list.no-streams')
          : t('streams.stream-list.not-connected')}</p>} />
        </div>
      )}
      </>
    )}

    </>
  );

  return (
    <>
      <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
        {/* Left / top panel*/}
        <div className="meanfi-two-panel-left">
          <div className="meanfi-panel-heading">
            {location.pathname === '/accounts/streams' && (
              <div className="back-button">
                <span className="icon-button-container">
                  <Tooltip placement="bottom" title={t('assets.back-to-assets-cta')}>
                    <Button
                      type="default"
                      shape="circle"
                      size="middle"
                      icon={<ArrowLeftOutlined />}
                      onClick={() => navigate('/accounts')}
                    />
                  </Tooltip>
                </span>
              </div>
            )}
            <span className="title">{t('streams.screen-title')}</span>
            <Tooltip placement="bottom" title={t('account-area.streams-tooltip')}>
              <div className={`transaction-stats ${loadingStreams ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshStreamsClick}>
                <Spin size="small" />
                {customStreamDocked ? (
                  <span className="transaction-legend neutral">
                    <IconRefresh className="mean-svg-icons"/>
                  </span>
                ) : (
                  <>
                    <span className="transaction-legend incoming">
                      <IconDownload className="mean-svg-icons"/>
                      <span className="incoming-transactions-amout">{streamStats.incoming}</span>
                    </span>
                    <span className="transaction-legend outgoing">
                      <IconUpload className="mean-svg-icons"/>
                      <span className="incoming-transactions-amout">{streamStats.outgoing}</span>
                    </span>
                  </>
                )}
              </div>
            </Tooltip>
          </div>
          <div className="inner-container">
            {/* item block */}
            <div className="item-block vertical-scroll">
              <Spin spinning={loadingStreams}>
                {renderStreamList}
              </Spin>
            </div>
            {/* Bottom CTA */}
            <div className="bottom-ctas">
              {customStreamDocked ? (
                <div className="create-stream">
                  <Button
                    block
                    type="primary"
                    shape="round"
                    onClick={handleCancelCustomStreamClick}>
                    {t('streams.back-to-my-streams-cta')}
                  </Button>
                </div>
              ) : (
                <div className="create-stream">
                  <Button
                    block
                    type="primary"
                    shape="round"
                    onClick={onActivateContractScreen}>
                    {t('streams.create-new-stream-cta')}
                  </Button>
                </div>
              )}
              {!customStreamDocked && (
                <div className="open-stream">
                  <Tooltip title={t('streams.lookup-stream-cta-tooltip')}>
                    <Button
                      shape="round"
                      type="text"
                      size="small"
                      className="ant-btn-shaded"
                      onClick={showOpenStreamModal}
                      icon={<SearchOutlined />}>
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Right / down panel */}
        <div className="meanfi-two-panel-right">
          <div className="meanfi-panel-heading"><span className="title">{t('streams.stream-detail.heading')}</span></div>
          <div className="inner-container">
            {connected && streamDetail ? (
              <>
              {isInboundStream(streamDetail) ? renderInboundStream : renderOutboundStream}
              </>
            ) : (
              <>
              {isCreating() ? (
                <div className="h-100 flex-center">
                  <Spin indicator={bigLoadingIcon} />
                </div>
              ) : (
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
                    ? t('streams.stream-detail.no-stream')
                    : t('streams.stream-list.not-connected')}</p>} />
                </div>
              )}
              </>
            )}
          </div>
        </div>
        <StreamOpenModal
          isVisible={isOpenStreamModalVisible}
          handleOk={onAcceptOpenStream}
          handleClose={closeOpenStreamModal} />
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamDetail}
          handleOk={onAcceptCloseStream}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()} />
        <StreamAddFundsModal
          isVisible={isAddFundsModalVisible}
          transactionFees={transactionFees}
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal} />
        <StreamWithdrawModal
          startUpData={lastStreamDetail}
          transactionFees={transactionFees}
          isVisible={isWithdrawModalVisible}
          handleOk={onAcceptWithdraw}
          handleClose={closeWithdrawModal} />
        {/* Add funds transaction execution modal */}
        <Modal
          className="mean-modal no-full-screen"
          maskClosable={false}
          afterClose={onAfterAddFundsTransactionModalClosed}
          visible={isAddFundsTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideAddFundsTransactionModal}
          width={330}
          footer={null}>
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <h5 className="operation">{t('transactions.status.tx-add-funds-operation')} {getAmountWithSymbol(addFundsAmount, streamDetail?.associatedToken as string)}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <p className="operation">{t('transactions.status.tx-add-funds-operation-success')}</p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={onAddFundsTransactionFinished}>
                  {t('general.cta-close')}
                </Button>
              </>
            ) : isError() ? (
              <>
                <WarningOutlined style={{ fontSize: 48 }} className="icon" />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
                        NATIVE_SOL_MINT.toBase58()
                      )})
                    }
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideAddFundsTransactionModal}>
                  {t('general.cta-close')}
                </Button>
              </>
            ) : (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
              </>
            )}
          </div>
        </Modal>
        {/* Withdraw funds transaction execution modal */}
        <Modal
          className="mean-modal no-full-screen"
          maskClosable={false}
          afterClose={onAfterWithdrawFundsTransactionModalClosed}
          visible={isWithdrawFundsTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideWithdrawFundsTransactionModal}
          width={330}
          footer={null}>
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {getAmountWithSymbol(withdrawFundsAmount, streamDetail?.associatedToken as string)}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <p className="operation">{t('transactions.status.tx-withdraw-operation-success')}</p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={onWithdrawFundsTransactionFinished}>
                  {t('general.cta-close')}
                </Button>
              </>
            ) : isError() ? (
              <>
                <WarningOutlined style={{ fontSize: 48 }} className="icon" />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
                        NATIVE_SOL_MINT.toBase58()
                      )})
                    }
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideWithdrawFundsTransactionModal}>
                  {t('general.cta-close')}
                </Button>
              </>
            ) : (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
              </>
            )}
          </div>
        </Modal>
        {/* Close stream transaction execution modal */}
        <Modal
          className="mean-modal no-full-screen"
          maskClosable={false}
          afterClose={onAfterCloseStreamTransactionModalClosed}
          visible={isCloseStreamTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideCloseStreamTransactionModal}
          width={330}
          footer={null}>
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <h5 className="operation">{t('transactions.status.tx-close-operation')}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                <p className="operation">{t('transactions.status.tx-close-operation-success')}</p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={onCloseStreamTransactionFinished}>
                  {t('general.cta-finish')}
                </Button>
              </>
            ) : isError() ? (
              <>
                <WarningOutlined style={{ fontSize: 48 }} className="icon" />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t('transactions.status.tx-start-failure', {
                      accountBalance: getTokenAmountAndSymbolByTokenAddress(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
                        NATIVE_SOL_MINT.toBase58()
                      )})
                    }
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideCloseStreamTransactionModal}>
                  {t('general.cta-close')}
                </Button>
              </>
            ) : (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
              </>
            )}
          </div>
        </Modal>
      </div>
    </>
  );

};
