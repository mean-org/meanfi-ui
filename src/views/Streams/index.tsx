import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin, Dropdown, Menu, Tooltip, Empty } from "antd";
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  EllipsisOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  IconBank,
  IconBox,
  IconClock,
  IconExternalLink,
  IconShare,
  IconSwitchRunning,
  IconSwitchStopped,
  IconUpload,
} from "../../Icons";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  getTxIxResume,
  shortenAddress,
  toTokenAmount,
  toUiAmount
} from "../../utils/utils";
import {
  consoleOut,
  copyText,
  friendlyDisplayDecimalPlaces,
  getFormattedNumberToLocale,
  getIntervalFromSeconds,
  getReadableDate,
  getShortDate,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
  isDev,
  isLocal,
  isProd,
  isValidAddress,
} from "../../utils/ui";
import { StreamOpenModal } from '../../components/StreamOpenModal';
import { StreamWithdrawModal } from '../../components/StreamWithdrawModal';
import {
  FALLBACK_COIN_IMAGE,
  NO_FEES,
  PERFORMANCE_THRESHOLD,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
} from "../../constants";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../contexts/connection";
import { ConfirmOptions, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { EventType, OperationType, TransactionStatus } from "../../models/enums";
import { StreamAddFundsModal } from "../../components/StreamAddFundsModal";
import { TokenInfo } from "@solana/spl-token-registry";
import { StreamCloseModal } from "../../components/StreamCloseModal";
import { useNativeAccount } from "../../contexts/accounts";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { MEAN_MULTISIG, NATIVE_SOL_MINT } from "../../utils/ids";
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from "../../contexts/transaction-status";
import { Identicon } from "../../components/Identicon";
import BN from "bn.js";
import { InfoIcon } from "../../components/InfoIcon";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { MSP_ACTIONS, StreamActivity, StreamInfo, STREAM_STATE, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import {
  AllocationType,
  MSP,
  Stream,
  STREAM_STATUS,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  TransactionFees,
  calculateActionFees as calculateActionFeesV2,
  Treasury,
  TreasuryType,
  Constants as MSPV2Constants
} from "@mean-dao/msp";
import { StreamTransferOpenModal } from "../../components/StreamTransferOpenModal";
import { StreamsSummary } from "../../models/streams";
import { UserTokenAccount } from "../../models/transactions";
import { customLogger } from "../..";
import { StreamTreasuryType } from "../../models/treasuries";
import { segmentAnalytics } from "../../App";
import {
  AppUsageEvent,
  SegmentStreamAddFundsData,
  SegmentStreamCloseData,
  SegmentStreamTransferOwnershipData,
  SegmentStreamWithdrawData
} from "../../utils/segment-service";
import { AnchorProvider, Program } from "@project-serum/anchor";
import MultisigIdl from "../../models/mean-multisig-idl";
import { StreamPauseModal } from "../../components/StreamPauseModal";
import { StreamResumeModal } from "../../components/StreamResumeModal";
import { StreamLockedModal } from "../../components/StreamLockedModal";
import { StreamEditModal } from "../../components/StreamEditModal";
import { openNotification } from "../../components/Notifications";
import { CountdownCircleTimer } from "react-countdown-circle-timer";
import { MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { SendAssetModal } from "../../components/SendAssetModal";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
let ds: string[] = [];

export const Streams = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, wallet, publicKey } = useWallet();
  const {
    theme,
    tpsAvg,
    streamList,
    coinPrices,
    streamListv1,
    streamListv2,
    streamDetail,
    activeStream,
    tokenBalance,
    splTokenList,
    isWhitelisted,
    selectedToken,
    loadingStreams,
    streamsSummary,
    deletedStreams,
    streamActivity,
    accountAddress,
    refreshInterval,
    detailsPanelOpen,
    transactionStatus,
    customStreamDocked,
    streamProgramAddress,
    loadingStreamsSummary,
    loadingStreamActivity,
    hasMoreStreamActivity,
    highLightableStreamId,
    streamV2ProgramAddress,
    previousWalletConnectState,
    setLoadingStreamsSummary,
    setHighLightableStreamId,
    setLastStreamsSummary,
    setCustomStreamDocked,
    setTransactionStatus,
    setShouldLoadTokens,
    refreshTokenBalance,
    setDtailsPanelOpen,
    setSelectedStream,
    refreshStreamList,
    getStreamActivity,
    setStreamsSummary,
    setDeletedStream,
    setSelectedToken,
    setEffectiveRate,
    setStreamDetail,
    openStreamById,
    setStreamList,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [lastStreamTransferAddress, setLastStreamTransferAddress] = useState('');
  const [oldSelectedToken, setOldSelectedToken] = useState<TokenInfo>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [multisigAccounts, setMultisigAccounts] = useState<MultisigInfo[] | undefined>(undefined);
  const [canSubscribe, setCanSubscribe] = useState(true);

  // Countdown timer variables
  const [key, setKey] = useState(0);
  const [isCounting, setIsCounting] = useState(true);

  // Treasury related
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);

  const isUnderDevelopment = () => {
    return isLocal() || (isDev() && isWhitelisted) ? true : false;
  }

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    console.log('New MSP from streams');
    return new MSP(
      endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    endpoint,
    streamV2ProgramAddress
  ]);

  const isDowngradedPerformance = useMemo(() => {
    return isProd() && (!tpsAvg || tpsAvg < PERFORMANCE_THRESHOLD)
      ? true
      : false;
  }, [tpsAvg]);

  const streamDetailRef = useRef(streamDetail);
  useEffect(() => {
    streamDetailRef.current = streamDetail;
  }, [streamDetail]);

  /////////////////
  //  CALLBACKS  //
  /////////////////

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  const getPricePerToken = useCallback((token: UserTokenAccount | TokenInfo): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.symbol]
      ? coinPrices[token.symbol]
      : 0;
  }, [coinPrices])

  const getTreasuryName = useCallback(() => {
    if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      return isNewTreasury ? v2.name : v1.label;
    }
    return '-';
  }, [treasuryDetails]);

  const getTreasuryType = useCallback((): StreamTreasuryType | undefined => {
    if (treasuryDetails) {
      const v1 = treasuryDetails as TreasuryInfo;
      const v2 = treasuryDetails as Treasury;
      const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
      const type = isNewTreasury ? v2.treasuryType : v1.type;
      if (type === TreasuryType.Lock) {
        return "locked";
      } else {
        return "open";
      }
    }

    return "unknown";
  }, [treasuryDetails]);

  const getTreasuryByTreasuryId = useCallback(async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
    if (!connection || !publicKey || !ms || !msp) { return undefined; }

    const mspInstance = streamVersion < 2 ? ms : msp;
    const treasueyPk = new PublicKey(treasuryId);

    setTimeout(() => {
      setLoadingTreasuryDetails(true);
    });

    try {
      const details = await mspInstance.getTreasury(treasueyPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
      } else {
        setTreasuryDetails(undefined);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTreasuryDetails(false);
    }

  }, [
    ms,
    msp,
    publicKey,
    connection,
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

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
      consoleOut("stream custom token:", unkToken, 'blue');
      setEffectiveRate(0);
    } else {
      openNotification({
        title: t('notifications.error-title'),
        description: t('transactions.validation.invalid-solana-address'),
        type: "error"
      });
    }
  }, [
    setEffectiveRate,
    setSelectedToken,
    t,
  ]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary === publicKey.toBase58() ? true : false;
      }
    }
    return false;
  }, [publicKey]);

  const isDeletedStream = useCallback((id: string) => {
    if (!deletedStreams) {
      return false;
    }
    return deletedStreams.some(i => i === id);
  }, [deletedStreams]);

  const isTreasurer = (): boolean => {
    if (streamDetail && publicKey) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if ((v1.version < 2 && v1.treasurerAddress === publicKey.toBase58()) || (v2.version >= 2 && v2.treasurer === publicKey.toBase58())) {
        return true;
      }
    }
    return false;
  }

  // confirmationHistory
  const hasStreamPendingTx = useCallback(() => {
    if (!streamDetail) { return false; }

    if (confirmationHistory && confirmationHistory.length > 0) {
      return confirmationHistory.some(h => h.extras === streamDetail.id && h.txInfoFetchStatus === "fetching");
    }

    return false;
  }, [confirmationHistory, streamDetail]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: any;
    switch (operation) {
      case OperationType.StreamCreate:
        event = success ? AppUsageEvent.TransferRecurringCompleted : AppUsageEvent.TransferRecurringFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamWithdraw:
        event = success ? AppUsageEvent.StreamWithdrawalCompleted : AppUsageEvent.StreamWithdrawalFailed;
        consoleOut('reporting to segmentAnalytics:', event, 'green');
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamClose:
        event = success ? AppUsageEvent.StreamCloseCompleted : AppUsageEvent.StreamCloseFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamAddFunds:
        event = success ? AppUsageEvent.StreamTopupCompleted : AppUsageEvent.StreamTopupFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      case OperationType.StreamTransferBeneficiary:
        event = success ? AppUsageEvent.StreamTransferCompleted : AppUsageEvent.StreamTransferFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
        break;
      default:
        break;
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

    const softReloadStreams = () => {
      const streamsRefreshCta = document.getElementById("streams-refresh-noreset-cta");
      if (streamsRefreshCta) {
        streamsRefreshCta.click();
      }
    };

    const hardReloadStreams = () => {
      const streamsRefreshCta = document.getElementById("streams-refresh-cta");
      if (streamsRefreshCta) {
        streamsRefreshCta.click();
      }
    };

    const refreshStream = (id: string) => {
      const isCurrentlySelected = streamDetailRef.current && streamDetailRef.current.id as string === id ? true : false;
      const streamItem = document.getElementById(id);
      if (streamItem && isCurrentlySelected) {
        streamItem.scrollIntoView({ behavior: 'smooth' });
        streamItem.click();
      }
    };

    consoleOut("onTxConfirmed event handled:", item, 'crimson');
    recordTxConfirmation(item.signature, item.operationType, true);
    switch (item.operationType) {
      case OperationType.StreamWithdraw:
        refreshStream(item.extras);
        break;
      case OperationType.StreamClose:
        setDeletedStream(item.extras);
        break;
      case OperationType.StreamTransferBeneficiary:
        setDeletedStream(item.extras);
        break;
      case OperationType.Transfer:
      case OperationType.StreamCreate:
        hardReloadStreams();
        break;
      case OperationType.StreamAddFunds:
        if (customStreamDocked) {
          openStreamById(item.extras, false);
        } else {
          refreshStream(item.extras);
        }
        break;
      default:
        softReloadStreams();
        break;
    }
  }, [
    customStreamDocked,
    recordTxConfirmation,
    setDeletedStream,
    openStreamById,
  ]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
    consoleOut("onTxTimedout event executed:", item, 'crimson');
    // If we have the item, record failure and remove it from the list
    if (item) {
      recordTxConfirmation(item.signature, item.operationType, false);
    }
  }, [
    recordTxConfirmation,
  ]);

  // Copy address to clipboard
  const copyAddressToClipboard = useCallback((address: any) => {

    if (copyText(address.toString())) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }

  },[t])

  /////////////////
  //   EFFECTS   //
  /////////////////

  // Log the list of deleted streams
  useEffect(() => {
    ds = deletedStreams;
    consoleOut('ds:', ds, 'blue');
  }, [deletedStreams]);

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

  // Live data calculation - Streams list
  useEffect(() => {

    const refreshStreams = async () => {
      if (!msp ||!streamList || !publicKey || loadingStreams) { return; }

      const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], publicKey);
      const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], publicKey);

      const newList: Array<Stream | StreamInfo> = [];
      // Get an updated version for each v2 stream in the list
      if (updatedStreamsv2 && updatedStreamsv2.length) {
        let freshStream: Stream;
        for (const stream of updatedStreamsv2) {
          freshStream = await msp.refreshStream(stream);
          if (freshStream) {
            newList.push(freshStream);
            // if (streamDetail && streamDetail.id === stream.id) {
            //   setStreamDetail(freshStream);
            // }
          }
        }
      }

      // Get an updated version for each v1 stream in the list
      if (updatedStreamsv1 && updatedStreamsv1.length) {
        let freshStream: StreamInfo;
        for (const stream of updatedStreamsv1) {
          freshStream = await ms.refreshStream(stream);
          if (freshStream) {
            newList.push(freshStream);
            // if (streamDetail && streamDetail.id === stream.id) {
            //   setStreamDetail(freshStream);
            // }
          }
        }
      }

      // Finally update the combined list
      if (newList.length) {
        setStreamList(newList.sort((a, b) => (a.createdBlockTime < b.createdBlockTime) ? 1 : -1));
      }
    }

    const timeout = setTimeout(() => {
      if (!customStreamDocked) {
        refreshStreams();
      }
      if (msp && streamDetail && streamDetail.version >= 2) {
        msp.refreshStream(streamDetail as Stream).then(detail => {
          setStreamDetail(detail as Stream);
        });
      } else if (ms && streamDetail && streamDetail.version < 2) {
        ms.refreshStream(streamDetail as StreamInfo).then(detail => {
          setStreamDetail(detail as StreamInfo);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    ms,
    msp,
    wallet,
    endpoint,
    publicKey,
    streamList,
    streamListv1,
    streamListv2,
    streamDetail,
    loadingStreams,
    customStreamDocked,
    setStreamDetail,
    setStreamList,
  ]);

  // Reset timer only when we are not loading the streams but we already have streams
  useEffect(() => {
    if (streamList && !loadingStreams && !isCounting) {
      consoleOut('resetting timer...', '', 'blue');
      setIsCounting(true);
      setKey(prevKey => prevKey + 1);
    }
  }, [isCounting, loadingStreams, streamList]);

  const refreshStreamSummary = useCallback(async () => {

    if (!ms || !msp || (!streamListv1 && !streamListv2) || loadingStreamsSummary) { return; }

    if (!publicKey && !accountAddress) { return; }

    setLoadingStreamsSummary(true);

    const resume: StreamsSummary = {
      totalNet: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      totalAmount: 0
    };

    const treasurer = publicKey
      ? publicKey
      : new PublicKey(accountAddress);

      const updatedStreamsv1 = await ms.refreshStreams(streamListv1 || [], treasurer);
      const updatedStreamsv2 = await msp.refreshStreams(streamListv2 || [], treasurer);
  
    // consoleOut('=========== Block start ===========', '', 'orange');

    for (const stream of updatedStreamsv1) {

      const isIncoming = stream.beneficiaryAddress && stream.beneficiaryAddress === treasurer.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      const freshStream = await ms.refreshStream(stream) as StreamInfo;
      if (!freshStream || freshStream.state !== STREAM_STATE.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string, splTokenList);
      const rate = asset ? getPricePerToken(asset as UserTokenAccount) : 0;
      if (isIncoming) {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowVestedAmount || 0) * rate);
      } else {
        resume['totalNet'] = resume['totalNet'] + ((freshStream.escrowUnvestedAmount || 0) * rate);
      }
    }

    resume['totalAmount'] = updatedStreamsv1.length;

    // consoleOut('totalNet v1:', resume['totalNet'], 'blue');

    for (const stream of updatedStreamsv2) {

      const isIncoming = stream.beneficiary && stream.beneficiary === treasurer.toBase58()
        ? true
        : false;

      if (isIncoming) {
        resume['incomingAmount'] = resume['incomingAmount'] + 1;
      } else {
        resume['outgoingAmount'] = resume['outgoingAmount'] + 1;
      }

      // Get refreshed data
      const freshStream = await msp.refreshStream(stream) as Stream;
      if (!freshStream || freshStream.status !== STREAM_STATUS.Running) { continue; }

      const asset = getTokenByMintAddress(freshStream.associatedToken as string, splTokenList);
      const pricePerToken = getPricePerToken(asset as UserTokenAccount);
      const rate = asset ? (pricePerToken ? pricePerToken : 1) : 1;
      const decimals = asset ? asset.decimals : 9;
      // const amount = isIncoming ? freshStream.fundsSentToBeneficiary : freshStream.fundsLeftInStream;
      const amount = freshStream.withdrawableAmount;
      const amountChange = parseFloat((amount / 10 ** decimals).toFixed(decimals)) * rate;

      if (isIncoming) {
        resume['totalNet'] += amountChange;
      } else {
        resume['totalNet'] -= amountChange;
      }
    }

    resume['totalAmount'] += updatedStreamsv2.length;

    // consoleOut('totalNet:', resume['totalNet'], 'blue');
    // consoleOut('=========== Block ends ===========', '', 'orange');

    // Update state
    setLastStreamsSummary(streamsSummary);
    setStreamsSummary(resume);
    setLoadingStreamsSummary(false);

  }, [
    ms,
    msp,
    publicKey,
    streamListv1,
    streamListv2,
    accountAddress,
    streamsSummary,
    loadingStreamsSummary,
    setLastStreamsSummary,
    setLoadingStreamsSummary,
    setStreamsSummary,
    getPricePerToken
  ]);

  // Live data calculation - Stream summary
  useEffect(() => {

    if (!streamList || (!streamListv1 && !streamListv2)) { return; }

    const timeout = setTimeout(() => {
      refreshStreamSummary();
    }, 5000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    streamList,
    streamListv1,
    streamListv2,
    refreshStreamSummary,
  ]);

  useEffect(() => {
    if (!publicKey || !ms || !msp || !activeStream) { return; }

    const timeout = setTimeout(() => {
      const v1 = activeStream as StreamInfo;
      const v2 = activeStream as Stream;
      consoleOut('Reading treasury data...', '', 'blue');
      getTreasuryByTreasuryId(
        activeStream.version < 2 ? v1.treasuryAddress as string : v2.treasury as string,
          activeStream.version
      );
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    ms,
    msp,
    publicKey,
    activeStream,
    getTreasuryByTreasuryId
  ]);

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

  // Scroll to a given stream is specified as highLightableStreamId
  useEffect(() => {
    if (loadingStreams || !streamList || streamList.length === 0 || !highLightableStreamId) {
      return;
    }

    const timeout = setTimeout(() => {
      if (streamDetail && streamDetail.id !== highLightableStreamId) {
        const item = streamList.find(s => s.id === highLightableStreamId);
        if (item) {
          setSelectedStream(item);
        }
      }
      const highlightTarget = document.getElementById(highLightableStreamId);
      if (highlightTarget) {
        consoleOut('Scrolling stream into view...', '', 'green');
        highlightTarget.scrollIntoView({ behavior: 'smooth' });
      }
      setHighLightableStreamId(undefined);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    streamList,
    streamDetail,
    loadingStreams,
    highLightableStreamId,
    setHighLightableStreamId,
    setSelectedStream,
  ]);

  // Watch for stream's associated token changes then load the token to the state as selectedToken
  useEffect(() => {
    if (streamDetail && selectedToken?.address !== streamDetail.associatedToken) {
      const token = getTokenByMintAddress(streamDetail.associatedToken as string, splTokenList);
      if (token) {
        consoleOut("stream token:", token, 'blue');
        if (!selectedToken || selectedToken.address !== token.address) {
          setOldSelectedToken(selectedToken);
          setSelectedToken(token);
        }
      } else if (!token && (!selectedToken || selectedToken.address !== streamDetail.associatedToken)) {
        setCustomToken(streamDetail.associatedToken as string);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[
    selectedToken,
    setCustomToken,
    setSelectedToken,
    streamDetail?.associatedToken
  ]);

  // Hook on wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', '', 'green');
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
        consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
        confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
        consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
        setCanSubscribe(true);
      }
    }

    return () => {
      clearTimeout();
    };

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    onTxConfirmed,
    onTxTimedout,
  ]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
    }
  }, [
    canSubscribe,
    onTxConfirmed,
    onTxTimedout
  ]);

  //////////////////////
  // MODALS & ACTIONS //
  //////////////////////

  const refreshPage = () => {
    hideTransactionExecutionModal();
    window.location.reload();
  }

  // Send selected token modal
  const [isSendAssetModalOpen, setIsSendAssetModalOpen] = useState(false);
  const hideSendAssetModal = useCallback(() => setIsSendAssetModalOpen(false), []);
  const showSendAssetModal = useCallback(() => setIsSendAssetModalOpen(true), []);

  // Common reusable transaction execution modal
  const [isTransactionExecutionModalVisible, setTransactionExecutionModalVisibility] = useState(false);
  const showTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(true), []);
  const hideTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    setIsBusy(false);
    setCloseStreamTransactionModalVisibility(false);
    resetTransactionStatus();
  }

  const onTransactionFinished = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
    hideTransactionExecutionModal();
    refreshTokenBalance();
  }, [
    hideTransactionExecutionModal,
    refreshTokenBalance,
    resetTransactionStatus,
  ]);

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    resetTransactionStatus();

    if (streamDetail) {
      if (streamDetail.version < 2) {
        getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFeesV2(MSP_ACTIONS_V2.closeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsCloseStreamModalVisibility(true);
    }
  }, [
    streamDetail,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (data: any) => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(data);
  };

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (e: any) => {
    openStreamById(e, true);
    closeOpenStreamModal();
  };

  const handleCancelCustomStreamClick = () => {
    setCustomStreamDocked(false);
    refreshStreamList(true);
  }

  // Pause stream modal
  const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
  const showPauseStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.pauseStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsPauseStreamModalVisibility(true);
    }
  }, [
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
  const onAcceptPauseStream = () => {
    hidePauseStreamModal();
    onExecutePauseStreamTransaction();
  };

  const onExecutePauseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamPause);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
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

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
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
          customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Stream Pause using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.pauseStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const pauseStream = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.pauseStream(
          new PublicKey(data.payer),             // payer,
          new PublicKey(data.payer),             // treasurer,
          new PublicKey(data.stream),            // stream,
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const pauseStream = await msp.pauseStream(
        new PublicKey(data.payer),                   // payer
        multisig.authority,                          // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(pauseStream.instructions[0].data);
      const ixAccounts = pauseStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      const tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamPause,
        ixAccounts as any,
        ixData as any,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamDetail || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });
      const streamPublicKey = new PublicKey(streamDetail.id as string);

      const data = {
        stream: streamPublicKey.toBase58(),               // stream
        payer: publicKey.toBase58(),                      // payer
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
            getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58(), false , splTokenList)
          }) to pay for network fees (${
            getTokenAmountAndSymbolByTokenAddress(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58(), false , splTokenList)
          })`
        });
        customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Stream Pause using MSP V2...', '', 'blue');
      // Create a transaction
      const result = await pauseStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('pauseStream returned transaction:', value);
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
          console.error('pauseStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
            return false;
          }
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
          customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      consoleOut('encodedTx:', encodedTx, 'orange');
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx)
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.TransactionFinished
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
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
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail) {
      showTransactionExecutionModal();
      let created: boolean;
      let streamName = '';
      if (streamDetail.version < 2) {
        streamName = (streamDetail as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamDetail as Stream).name;
        created = await createTxV2();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamPause,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Pause stream: ${streamName}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully paused stream: ${streamName}`,
              extras: streamDetail.id as string
            });
            setOngoingOperation(undefined);
            onTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const getStreamPauseMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamDetail) {

      const treasury = streamDetail.version && streamDetail.version >= 2
        ? (streamDetail as Stream).treasury as string
        : (streamDetail as StreamInfo).treasuryAddress as string;

      const beneficiary = streamDetail.version && streamDetail.version >= 2
        ? (streamDetail as Stream).beneficiary as string
        : (streamDetail as StreamInfo).beneficiaryAddress as string;

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }, [streamDetail, publicKey, t]);

  // Resume stream modal
  const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
  const showResumeStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as Treasury;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(MSP_ACTIONS_V2.resumeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFees(MSP_ACTIONS.resumeStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsResumeStreamModalVisibility(true);
    }
  }, [
    treasuryDetails,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);
  const onAcceptResumeStream = () => {
    hideResumeStreamModal();
    onExecuteResumeStreamTransaction();
  };

  const onExecuteResumeStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamResume);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
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

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
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
          customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting Stream Resume using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.resumeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID
        )
        .then(value => {
          consoleOut('resumeStream returned transaction:', value);
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
          console.error('resumeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const resumeStream = async (data: any) => {

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.resumeStream(
          new PublicKey(data.payer),             // payer,
          new PublicKey(data.payer),             // treasurer,
          new PublicKey(data.stream),            // stream,
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      const resumeStream = await msp.resumeStream(
        new PublicKey(data.payer),                   // payer
        multisig.authority,                          // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(resumeStream.instructions[0].data);
      const ixAccounts = resumeStream.instructions[0].keys;
      const transaction = Keypair.generate();
      const txSize = 1000;
      const txSigners = [transaction];
      const createIx = await multisigClient.account.transaction.createInstruction(
        transaction,
        txSize
      );
      
      const tx = multisigClient.transaction.createTransaction(
        MSPV2Constants.MSP, 
        OperationType.StreamResume,
        ixAccounts as any,
        ixData as any,
        new BN(0),
        new BN(0),
        {
          accounts: {
            multisig: multisig.id,
            transaction: transaction.publicKey,
            proposer: publicKey as PublicKey,
          },
          preInstructions: [createIx],
          signers: txSigners,
        }
      );

      tx.feePayer = publicKey;
      const { blockhash } = await connection.getRecentBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.partialSign(...txSigners);

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamDetail || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const streamPublicKey = new PublicKey(streamDetail.id as string);
      const data = {
        stream: streamPublicKey.toBase58(),               // stream
        payer: publicKey.toBase58(),                      // payer
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
        customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }

      consoleOut('Starting Stream Resume using MSP V2...', '', 'blue');
      // Create a transaction
      const result = await resumeStream(data)
        .then(value => {
          if (!value) { return false; }
          consoleOut('resumeStream returned transaction:', value);
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
          console.error('resumeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
          return false;
        });

      return result;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
            return false;
          }
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
          customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
              currentOperation: TransactionStatus.TransactionFinished
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
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
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail) {
      showTransactionExecutionModal();
      let created: boolean;
      let streamName = '';
      if (streamDetail.version < 2) {
        streamName = (streamDetail as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamDetail as Stream).name;
        created = await createTxV2();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamResume,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Resume stream: ${streamName}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully resumed stream: ${streamName}`,
              extras: streamDetail.id as string
            });
            setOngoingOperation(undefined);
            onTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const getStreamResumeMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamDetail) {

      const treasury = streamDetail.version && streamDetail.version >= 2
        ? (streamDetail as Stream).treasury as string
        : (streamDetail as StreamInfo).treasuryAddress as string;

      const beneficiary = streamDetail.version && streamDetail.version >= 2
        ? (streamDetail as Stream).beneficiary as string
        : (streamDetail as StreamInfo).beneficiaryAddress as string;

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }, [publicKey, streamDetail, t]);

  // Locked stream modal
  const [isLockedStreamModalVisible, setIsLockedStreamModalVisibility] = useState(false);
  const showLockedStreamModal = () => {
    setIsLockedStreamModalVisibility(true);
  };

  const hideLockedStreamModal = useCallback(() => setIsLockedStreamModalVisibility(false), []);

  // Edit stream modal
  const [isEditStreamModalVisible, setIsEditStreamModalVisibility] = useState(false);
  const onEditStreamClick = useCallback(() => {
    resetTransactionStatus();
    setIsEditStreamModalVisibility(true);
  },[
    resetTransactionStatus
  ]);

  const hideEditStreamModal = useCallback(() => setIsEditStreamModalVisibility(false), []);
  const onAcceptEditStream = () => {
    hideEditStreamModal();
    // onExecuteResumeStreamTransaction();
  };

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

  // Create and cache Multisig client instance
  const multisigClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };

    const provider = new AnchorProvider(connection, wallet as any, opts);

    return new Program(
      MultisigIdl,
      MEAN_MULTISIG,
      provider
    );

  }, [
    connection, 
    wallet
  ]);

  // Transfer stream modal
  const [isTransferStreamModalVisible, setIsTransferStreamModalVisibility] = useState(false);
  const showTransferStreamModal = useCallback(() => {
    setIsTransferStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.transferStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFeesV2]);
  const closeTransferStreamModal = useCallback(() => setIsTransferStreamModalVisibility(false), []);
  const [isTransferStreamTransactionModalVisible, setTransferStreamTransactionModalVisibility] = useState(false);
  const showTransferStreamTransactionModal = useCallback(() => setTransferStreamTransactionModalVisibility(true), []);
  const hideTransferStreamTransactionModal = useCallback(() => setTransferStreamTransactionModalVisibility(false), []);

  const onAcceptTransferStream = (address: string) => {
    closeTransferStreamModal();
    consoleOut('New beneficiary address:', address);
    setLastStreamTransferAddress(address);
    onExecuteTransferStreamTransaction(address);
  };

  const onTransferStreamTransactionFinished = () => {
    setIsBusy(false);
    hideTransferStreamTransactionModal();
    resetTransactionStatus();
  };

  const onAfterTransferStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      closeTransferStreamModal();
    }
    resetTransactionStatus();
  }

  const onExecuteTransferStreamTransaction = async (address: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && streamDetail && selectedToken && msp) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const newBeneficiary = new PublicKey(address);
        const data = {
          beneficiary: publicKey.toBase58(),                              // beneficiary
          newBeneficiary: newBeneficiary.toBase58(),                      // newBeneficiary
          stream: stream.toBase58()                                       // stream
        }
        consoleOut('Transfer stream data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamTransferOwnershipData = {
          stream: data.stream,
          beneficiary: data.beneficiary,
          newBeneficiary: data.newBeneficiary
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferOwnershipFormButton, segmentData);

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
          customLogger.logWarning('Transfer stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting transferStream using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.transferStream(
          publicKey,
          newBeneficiary,
          stream
        )
        .then(value => {
          consoleOut('transferStream returned transaction:', value);
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
          console.error('transferStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferSigned, {
            signature,
            encodedTx
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
          customLogger.logWarning('Transfer stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
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
        customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
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
            customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
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
        customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail) {
      showTransferStreamTransactionModal();
      const created = await createTx();
      consoleOut('created:', created, 'blue');
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
              operationType: OperationType.StreamTransferBeneficiary,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Transfer stream to: ${shortenAddress(address)}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Stream transferred to: ${shortenAddress(address)}`,
              extras: streamDetail.id as string
            });
            onTransferStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupButton);
    const token = getTokenByMintAddress(streamDetail?.associatedToken as string, splTokenList);
    consoleOut("stream token:", token?.symbol);
    if (token) {
      if (!selectedToken || selectedToken.address !== token.address) {
        setOldSelectedToken(selectedToken);
        setSelectedToken(token);
      }
    } else if (!token && (!selectedToken || selectedToken.address !== streamDetail?.associatedToken)) {
      setCustomToken(streamDetail?.associatedToken as string);
    }

    if (streamDetail) {
      if (streamDetail.version < 2) {
        getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      } else {
        getTransactionFeesV2(MSP_ACTIONS_V2.addFunds).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
        getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
          setWithdrawTransactionFees(value);
          consoleOut('withdrawTransactionFees:', value, 'orange');
        });
      }
      setIsAddFundsModalVisibility(true);
    }
    setTimeout(() => {
      refreshTokenBalance();
    }, 100);
  }, [
    streamDetail,
    selectedToken,
    refreshTokenBalance,
    getTransactionFeesV2,
    getTransactionFees,
    setSelectedToken,
    setCustomToken,
  ]);

  const closeAddFundsModal = useCallback(() => {
    if (oldSelectedToken) {
      setSelectedToken(oldSelectedToken);
    }
    setIsAddFundsModalVisibility(false);
  }, [oldSelectedToken, setSelectedToken]);

  const [addFundsPayload, setAddFundsPayload] = useState<any>();
  const onAcceptAddFunds = (data: any) => {
    closeAddFundsModal();
    consoleOut('AddFunds input:', data, 'blue');
    onExecuteAddFundsTransaction(data);
  };

  const onAddFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
  };

  const onExecuteAddFundsTransaction = async (addFundsData: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const fundFromWallet = async (payload: {
      payer: PublicKey;
      contributor: PublicKey;
      treasury: PublicKey;
      stream: PublicKey;
      amount: number;
    }) => {
      if (!msp) { return false; }
      // Create a transaction
      return await msp.fundStream(
        payload.payer,                                              // payer
        payload.contributor,                                        // contributor
        payload.treasury,                                           // treasury
        payload.stream,                                             // stream
        payload.amount,                                             // amount
      )
      .then(value => {
        consoleOut('fundStream returned transaction:', value);
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
        console.error('fundStream error:', error);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.InitTransactionFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
          result: `${error}`
        });
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
        return false;
      });
    }

    const fundFromTreasury = async (payload: {
      payer: PublicKey;
      treasurer: PublicKey;
      treasury: PublicKey;
      stream: PublicKey;
      amount: number;
    }) => {
      if (!msp) { return false; }
      // Create a transaction
      return await msp.allocate(
        payload.payer,                                              // payer
        payload.treasurer,                                          // contributor
        payload.treasury,                                           // treasury
        payload.stream,                                             // stream
        payload.amount,                                             // amount
      )
      .then(value => {
        consoleOut('allocate returned transaction:', value);
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
        console.error('allocate error:', error);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.InitTransactionFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
          result: `${error}`
        });
        customLogger.logError('Allocate transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
        return false;
      });
    }

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey((streamDetail as StreamInfo).treasuryAddress as string);
        const contributorMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addFundsData.amount);
        setAddFundsPayload(addFundsData);

        const data = {
          contributor: wallet.publicKey.toBase58(),               // contributor
          treasury: treasury.toBase58(),                          // treasury
          stream: stream.toBase58(),                              // stream
          contributorMint: contributorMint.toBase58(),            // contributorMint
          amount                                                  // amount
        }
        consoleOut('add funds data:', data);

        // Report event to Segment analytics
        const token = selectedToken ? selectedToken.symbol : '';
        const segmentData: SegmentStreamAddFundsData = {
          stream: data.stream,
          contributor: data.contributor,
          treasury: data.treasury,
          asset: token ? `${token} [${data.contributorMint}]` : data.contributorMint,
          assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
          amount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);

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
          customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting addFunds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.addFunds(
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
        return false;
      }
    }

    const createTxV2 = async (): Promise<boolean> => {

      if (!publicKey || !streamDetail || !selectedToken || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const stream = new PublicKey(streamDetail.id as string);
      const treasury = new PublicKey((streamDetail as Stream).treasury as string);
      const associatedToken = new PublicKey(streamDetail.associatedToken as string);
      const amount = addFundsData.tokenAmount;
      setAddFundsPayload(addFundsData);

      const data = {
        contributor: publicKey.toBase58(),                              // contributor
        treasury: treasury.toBase58(),                                  // treasury
        stream: stream.toBase58(),                                      // stream
        amount: `${amount.toNumber()} (${addFundsData.amount})`,        // amount
      }

      consoleOut('add funds data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamAddFundsData = {
        stream: data.stream,
        contributor: data.contributor,
        treasury: data.treasury,
        asset: selectedToken
          ? `${selectedToken.symbol} [${selectedToken.address}]`
          : associatedToken.toBase58(),
        assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
        amount: parseFloat(addFundsData.amount)
      };
      consoleOut('segment data:', segmentData, 'brown');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);

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
        customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
        return false;
      }

      if (addFundsData.fundFromTreasury) {
        consoleOut('Starting allocate using MSP V2...', '', 'blue');
        return await fundFromTreasury({
          payer: publicKey,
          treasurer: publicKey,
          treasury: treasury,
          stream: stream,
          amount: amount
        });
      } else {
        consoleOut('Starting addFunds using MSP V2...', '', 'blue');
        return await fundFromWallet({
          payer: publicKey,
          contributor: publicKey,
          treasury: treasury,
          stream: stream,
          amount: amount
        });
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupSigned, {
            signature,
            encodedTx
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
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
            customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail && selectedToken ) {
      const token = Object.assign({}, selectedToken);
      showAddFundsTransactionModal();
      let created: boolean;
      if (streamDetail.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamAddFunds,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Fund stream with ${formatThousands(
                parseFloat(addFundsData.amount),
                token.decimals
              )} ${token.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Stream funded with ${formatThousands(
                parseFloat(addFundsData.amount),
                token.decimals
              )} ${token.symbol}`,
              extras: streamDetail.id as string
            });
            setIsBusy(false);
            onAddFundsTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Withdraw funds modal
  const [lastStreamDetail, setLastStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<any>();
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);

  const showWithdrawModal = useCallback(async () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalButton);
    const lastDetail = Object.assign({}, streamDetail);
    resetTransactionStatus();
    setLastStreamDetail(lastDetail);
    setIsWithdrawModalVisibility(true);
    if (lastDetail.version < 2) {
      getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
    } else {
      getTransactionFeesV2(MSP_ACTIONS_V2.withdraw).then(value => {
        setTransactionFees(value);
        consoleOut('transactionFees:', value, 'orange');
      });
    }
  }, [
    streamDetail,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const closeWithdrawModal = useCallback(() => {
    setWithdrawFundsAmount(undefined);
    setLastStreamDetail(undefined);
    setIsWithdrawModalVisibility(false);
  }, []);

  const onAcceptWithdraw = (data: any) => {
    closeWithdrawModal();
    consoleOut('Withdraw data from modal:', data, 'blue');
    onExecuteWithdrawFundsTransaction(data);
  };

  const onCreateNewTransfer = () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.NewTransferButton);
    setCustomStreamDocked(false);
    showSendAssetModal();
    // navigate("/transfers");
  };

  /*
  const getEscrowEstimatedDepletionUtcLabel = (date: Date): string => {
    const today = new Date();
    let miniDate = '';

    if (streamDetail && publicKey) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if (v1.version < 2) {
        miniDate = v1 && v1.escrowEstimatedDepletionUtc
          ? getReadableDate(v1.escrowEstimatedDepletionUtc.toString())
          : '';
      } else {
        miniDate = v2 && v2.estimatedDepletionDate
          ? getReadableDate(v2.estimatedDepletionDate.toString())
          : '';
      }
    }

    if (date > today) {
      return `(${t('streams.stream-detail.label-funds-runout-today')})`;
    } else if (date < today) {
      return '';
    } else {
      return `(${t('streams.stream-detail.label-funds-runout')} ${miniDate})`;
    }
  }
  */

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string, splTokenList) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [splTokenList]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string, splTokenList) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }, [splTokenList]);

  const getStreamTypeIcon = useCallback((item: Stream | StreamInfo) => {
    if (isInboundStream(item)) {
      return (
        <span className="stream-type incoming">
          <ArrowDownOutlined />
        </span>
      );
    } else {
      return (
        <span className="stream-type outgoing">
          <ArrowUpOutlined />
        </span>
      );
    }
  }, [isInboundStream]);

  const getStreamDescription = (item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      const isInbound = isInboundStream(item);
      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
        if (isInbound) {
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
          if (v1.isUpdatePending) {
            title = `${t('streams.stream-list.title-pending-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
          } else if (v1.state === STREAM_STATE.Schedule) {
            title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
          } else if (v1.state === STREAM_STATE.Paused) {
            title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
          } else {
            title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
          }
        }
      } else {
        if (v2.name) {
          return `${v2.name}`;
        }
        if (isInbound) {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
          } else if (v2.status === STREAM_STATUS.Paused) {
            title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
          } else {
            title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
          }
        } else {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
          } else if (v2.status === STREAM_STATUS.Paused) {
            title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
          } else {
            title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${v2.beneficiary}`)})`;
          }
        }
      }
    }

    return title;
  }

  const getTransactionSubTitle = useCallback((item: Stream | StreamInfo) => {
    let title = '';

    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      const isInbound = isInboundStream(item);
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
      }

      if (v1.version < 2) {
        if (isInbound) {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        } else {
          if (v1.state === STREAM_STATE.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v1.startUtc as string)}`;
          }
        }
      } else {
        if (isInbound) {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        } else {
          if (v2.status === STREAM_STATUS.Schedule) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount
            });
            title += ` ${getShortDate(v2.startUtc as string)}`;
          }
        }
      }
    }

    return title;

  }, [isInboundStream, getRateAmountDisplay, getDepositAmountDisplay, t]);

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
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }

  }, [t]);

  const getStreamStatusSubtitle = useCallback((item: Stream | StreamInfo) => {
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
            return t('streams.status.scheduled', {date: getShortDate(v2.startUtc as string)});
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return t('streams.status.stopped-manually');
            }
            return t('streams.status.stopped');
          default:
            return t('streams.status.streaming');
        }
      }
    }

  }, [t]);

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
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.FeatureTemporarilyDisabled
            ? true
            : false;
  }

  // Add funds Transaction execution modal
  const [isAddFundsTransactionModalVisible, setAddFundsTransactionModalVisibility] = useState(false);
  const showAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(true), []);
  const hideAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(false), []);

  const onAfterAddFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideAddFundsTransactionModal();
    }
    resetTransactionStatus();
  }

  // Withdraw funds Transaction execution modal
  const [isWithdrawFundsTransactionModalVisible, setWithdrawFundsTransactionModalVisibility] = useState(false);
  const showWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(true), []);
  const hideWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(false), []);

  const onWithdrawFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    refreshTokenBalance();
  };

  const onAfterWithdrawFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideWithdrawFundsTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawData: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey((streamDetail as StreamInfo).beneficiaryAddress as string);
        const amount = parseFloat(withdrawData.amount);
        setWithdrawFundsAmount(withdrawData);

        const data = {
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Report event to Segment analytics
        const segmentData: SegmentStreamWithdrawData = {
          asset: withdrawData.token,
          assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
          stream: data.stream,
          beneficiary: data.beneficiary,
          feeAmount: withdrawData.fee,
          inputAmount: withdrawData.inputAmount,
          sentAmount: withdrawData.receiveAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalStartFormButton, segmentData);

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
          customLogger.logWarning('Withdraw transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting withdraw using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.withdraw(
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
        return false;
      }
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamDetail && msp && selectedToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey((streamDetail as Stream).beneficiary as string);
        const amount = toTokenAmount(parseFloat(withdrawData.amount as string), selectedToken.decimals);
        const receiveAmount = toTokenAmount(parseFloat(withdrawData.receiveAmount as string), selectedToken.decimals);
        setWithdrawFundsAmount(Object.assign({}, withdrawData, {
          amount: amount
        }));

        const data = {
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Report event to Segment analytics
        const segmentData: SegmentStreamWithdrawData = {
          asset: withdrawData.token,
          assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
          stream: data.stream,
          beneficiary: data.beneficiary,
          feeAmount: withdrawData.fee,
          inputAmount: amount,
          sentAmount: receiveAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalStartFormButton, segmentData);

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
          customLogger.logWarning('Withdraw transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting withdraw using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.withdraw(
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalSigned, {
            signature,
            encodedTx
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
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
            segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail && selectedToken) {
      const token = Object.assign({}, selectedToken);
      showWithdrawFundsTransactionModal();
      let created: boolean;
      if (streamDetail.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamWithdraw,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Withdraw ${formatThousands(
                parseFloat(withdrawData.amount),
                token.decimals
              )} ${token.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully withdrawn ${formatThousands(
                parseFloat(withdrawData.amount),
                token.decimals
              )} ${token.symbol}`,
              extras: streamDetail.id as string
            });
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

  const onExecuteCloseStreamTransaction = async (closeTreasuryData: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                         // stream
          initializer: wallet.publicKey.toBase58(),                   // initializer
          autoCloseTreasury: closeTreasuryData.closeTreasuryOption    // closeTreasury
        }
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamCloseData = {
          asset: selectedToken ? selectedToken.symbol : '-',
          assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
          stream: data.stream,
          initializer: data.initializer,
          closeTreasury: data.autoCloseTreasury,
          vestedReturns: closeTreasuryData.vestedReturns,
          unvestedReturns: closeTreasuryData.unvestedReturns,
          feeAmount: closeTreasuryData.feeAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseStreamFormButton, segmentData);

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
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting closeStream using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.closeStream(
          publicKey as PublicKey,                             // Initializer public key
          streamPublicKey,                                    // Stream ID
          closeTreasuryData.closeTreasuryOption               // closeTreasury
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
        return false;
      }
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamDetail && msp) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                         // stream
          initializer: publicKey.toBase58(),                          // initializer
          autoCloseTreasury: closeTreasuryData.closeTreasuryOption    // closeTreasury
        }
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamCloseData = {
          asset: selectedToken ? selectedToken.symbol : '-',
          assetPrice: selectedToken ? getPricePerToken(selectedToken) : 0,
          stream: data.stream,
          initializer: data.initializer,
          closeTreasury: data.autoCloseTreasury,
          vestedReturns: closeTreasuryData.vestedReturns,
          unvestedReturns: closeTreasuryData.unvestedReturns,
          feeAmount: closeTreasuryData.feeAmount
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseStreamFormButton, segmentData);

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
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting closeStream using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.closeStream(
          publicKey as PublicKey,                           // payer
          publicKey as PublicKey,                           // destination
          streamPublicKey,                                  // stream
          closeTreasuryData.closeTreasuryOption             // closeTreasury
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
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
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
              result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
            });
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
            return false;
          }
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: {signer: wallet.publicKey.toBase58()}
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseSigned, {
            signature,
            encodedTx
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
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
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
            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
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
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
        return false;
      }
    }

    if (wallet && streamDetail) {
      showCloseStreamTransactionModal();
      let created: boolean;
      let streamName = '';
      if (streamDetail.version < 2) {
        streamName = (streamDetail as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamDetail as Stream).name;
        created = await createTxV2();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamClose,
              finality: "confirmed",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Close stream: ${streamName}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Successfully closed stream: ${streamName}`,
              extras: streamDetail.id as string
            });
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
      const treasury = streamDetail.version < 2 ? (streamDetail as StreamInfo).treasuryAddress as string : (streamDetail as Stream).treasury as string;
      const treasurer = streamDetail.version < 2 ? (streamDetail as StreamInfo).treasurerAddress : (streamDetail as Stream).treasurer;
      const beneficiary = streamDetail.version < 2 ? (streamDetail as StreamInfo).beneficiaryAddress as string : (streamDetail as Stream).beneficiary as string;
      // Account for multiple beneficiaries funded by the same treasury (only 1 right now)
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

  const onRefreshStreams = (manual: boolean) => {
    if (manual) {
      // Record user event in Segment Analytics
      segmentAnalytics.recordEvent(AppUsageEvent.StreamRefresh);
      setIsCounting(false);
      // setKey(prevKey => prevKey + 1);
      refreshStreamList(true);
    } else {
      if (!isDowngradedPerformance) {
        refreshStreamList(false);
      }
    }
    setCustomStreamDocked(false);
  };

  const onRefreshStreamsNoReset = () => {
    refreshStreamList(false);
  };

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

  const getActivityAmountDisplay = (item: StreamActivity, streamVersion: number): number => {
    let value = '';

    const token = getTokenByMintAddress(item.mint as string, splTokenList);
    if (streamVersion < 2) {
      value += formatAmount(item.amount, token?.decimals || 6);
    } else {
      value += formatAmount(toUiAmount(new BN(item.amount), token?.decimals || 6), token?.decimals || 6);
    }

    return parseFloat(value);
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

  const hasAllocation = (): boolean => {
    if (streamDetail) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if (v1.version < 2) {
        return v1.allocationAssigned || v1.allocationLeft ? true : false;
      } else {
        return v2.remainingAllocationAmount ? true : false;
      }
    }

    return false;
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const renderMoneyStreamsSummary = useCallback(() => {
    return (
      <>
        <div key="streams" className="transaction-list-row money-streams-summary no-pointer">
          <div className="icon-cell">
            {loadingStreams ? (
              <div className="token-icon animate-border-loading">
                <div className="streams-count simplelink" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}>
                  <span className="font-bold text-shadow"><SyncOutlined spin /></span>
                </div>
              </div>
            ) : (
              <div className={streamsSummary.totalNet !== 0 ? 'token-icon animate-border' : 'token-icon'}>
                <div className="streams-count simplelink" onClick={(e) => refreshStreamList()}>
                  <span className="font-bold text-shadow">{streamsSummary.totalAmount || 0}</span>
                </div>
              </div>
            )}
          </div>
          <div className="description-cell">
            <div className="title">{t('account-area.money-streams')}</div>
            {streamsSummary.totalAmount === 0 ? (
              <div className="subtitle">{t('account-area.no-money-streams')}</div>
            ) : (
              <div className="subtitle">{streamsSummary.incomingAmount} {t('streams.stream-stats-incoming')}, {streamsSummary.outgoingAmount} {t('streams.stream-stats-outgoing')}</div>
            )}
          </div>
          <div className="rate-cell">
            {streamsSummary.totalAmount === 0 ? (
              <span className="rate-amount">--</span>
            ) : (
              <>
                <div className="rate-amount">$
                  {
                    formatThousands(
                      Math.abs(streamsSummary.totalNet),
                      friendlyDisplayDecimalPlaces(streamsSummary.totalNet),
                      friendlyDisplayDecimalPlaces(streamsSummary.totalNet)
                    )
                  }
                </div>
                <div className="interval">{t('streams.streaming-balance')}</div>
              </>
            )}
          </div>
          <div className="operation-vector">
            {streamsSummary.totalNet > 0 ? (
              <ArrowUpOutlined className="mean-svg-icons success bounce" />
            ) : streamsSummary.totalNet < 0 ? (
              <ArrowDownOutlined className="mean-svg-icons outgoing bounce" />
            ) : (
              <span className="online-status neutral"></span>
            )}
          </div>
        </div>
        <div key="separator1" className="pinned-token-separator"></div>
      </>
    );
  }, [loadingStreams, refreshStreamList, streamsSummary.incomingAmount, streamsSummary.outgoingAmount, streamsSummary.totalAmount, streamsSummary.totalNet, t]);

  const menu = (
    <Menu>
      {isTreasurer() && (
        <Menu.Item key="1" onClick={showCloseStreamModal}>
          <span className="menu-item-text">{t('streams.stream-detail.close-money-stream-menu-item')}</span>
        </Menu.Item>
      )}
      {(streamDetail && isInboundStream(streamDetail) && streamDetail.version >= 2) && (
        <Menu.Item key="2" onClick={showTransferStreamModal}>
          <span className="menu-item-text">{t('streams.stream-detail.transfer-money-stream-menu-item')}</span>
        </Menu.Item>
      )}
    </Menu>
  );

  const renderActivities = (streamVersion: number) => {
    return (
      <>
        {streamActivity && streamActivity.length > 0 && (
          <div className="item-list-header compact">
            <div className="header-row">
              <div className="std-table-cell first-cell">&nbsp;</div>
              <div className="std-table-cell fixed-width-80">{t('streams.stream-activity.heading')}</div>
              <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-action')}</div>
              <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-amount')}</div>
              <div className="std-table-cell fixed-width-120">{t('streams.stream-activity.label-date')}</div>
            </div>
          </div>
        )}
        <div className="activity-list-data-wrapper vertical-scroll">
          <div className="activity-list h-100">
            <Spin spinning={loadingStreamActivity}>
              {streamActivity && streamActivity.length > 0 && (
                <>
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
                            <span className="align-middle">{
                              getAmountWithSymbol(
                                getActivityAmountDisplay(item, streamVersion), item.mint, false, splTokenList
                              )}
                            </span>
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
            {hasMoreStreamActivity && (
              <div className="mt-1 text-center">
                <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                    role="link"
                    onClick={() => {
                    if (streamDetail) {
                        getStreamActivity(streamDetail.id as string, streamDetail.version);
                    }
                  }}>
                  {t('general.cta-load-more')}
                </span>
              </div>
            )}
          </div>
        </div>

      </>
    );
  }

  const renderInboundStreamV1 = (stream: StreamInfo) => {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string, splTokenList) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className={
              `stream-details-data-wrapper vertical-scroll ${isDeletedStream(stream.id as string)
                ? 'disabled blurry-3x'
                : ''}`
              }>

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream.state === STREAM_STATE.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

                  {/* Sender */}
                  <>
                    <h2 className="mb-3">{getStreamDescription(stream)}</h2>
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">
                          {stream.state === STREAM_STATE.Paused
                            ? t('streams.stream-detail.label-received-from')
                            : t('streams.stream-detail.label-receiving-from')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconShare className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.treasurerAddress}${getSolanaExplorerClusterParam()}`}>
                              {shortenAddress(`${stream.treasurerAddress}`)}
                            </a>
                          </span>
                        </div>
                      </Col>
                      <Col span={12}>
                        {isOtp() ? (
                          <>
                            <div className="info-label">
                              Amount
                            </div>
                            <div className="transaction-detail-row">
                              <span className="info-icon token-icon">
                                {token?.logoURI ? (
                                  <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
                                ) : (
                                  <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                                )}
                              </span>
                              <span className="info-data ml-1">
                                {
                                  getTokenAmountAndSymbolByTokenAddress(
                                    toUiAmount(new BN(stream.state === STREAM_STATE.Schedule ? stream.allocationAssigned : stream.escrowVestedAmount), token?.decimals || 6),
                                    stream.associatedToken as string,
                                    false, splTokenList
                                  )
                                }
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                            <div className="transaction-detail-row">
                              <span className="info-data">
                                {getAmountWithSymbol(stream.rateAmount, stream.associatedToken as string, false, splTokenList)}
                                {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
                              </span>
                            </div>
                          </>
                        )}
                      </Col>
                    </Row>

                    {/* Date funded for OTPs */}
                    {isOtp() && (
                      <Row className="mb-3">
                        <Col span={12}>
                          <div className="info-label">
                            {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(stream?.fundedOnUtc as string)})
                          </div>
                          <div className="transaction-detail-row">
                            <span className="info-icon">
                              <IconUpload className="mean-svg-icons" />
                            </span>
                            {stream ?
                              (
                                <span className="info-data">
                                {stream
                                  ? getAmountWithSymbol(stream.allocationAssigned, stream.associatedToken as string, false, splTokenList)
                                  : '--'}
                                </span>
                              ) : (
                                <span className="info-data">&nbsp;</span>
                              )}
                          </div>
                        </Col>
                        <Col span={12}>
                          <div className="info-label">{getStartDateLabel()}</div>
                          <div className="transaction-detail-row">
                            <span className="info-icon">
                              <IconClock className="mean-svg-icons" />
                            </span>
                            <span className="info-data">
                              {getReadableDate(stream?.startUtc as string)}
                            </span>
                          </div>
                        </Col>
                      </Row>
                    )}
                  </>

                  {/* Amount / Funds left (Total Unvested) & Started date */}
                  <Row className="mb-3">
                    {stream && stream.escrowUnvestedAmount > 0 && (
                      <Col span={12}>
                        <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBank className="mean-svg-icons" />
                          </span>
                          {stream ? (
                            <span className="info-data">
                            {stream
                              ? getAmountWithSymbol(stream.escrowUnvestedAmount, stream.associatedToken as string, false, splTokenList)
                              : '--'}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                        </div>
                      </Col>
                    )}
                    {/* Started date */}
                    <Col span={12}>
                      <div className="info-label">{getStartDateLabel()}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconClock className="mean-svg-icons" />
                        </span>
                        <span className="info-data">
                          {getReadableDate(stream?.startUtc as string)}
                        </span>
                      </div>
                    </Col>
                  </Row>

                  {/* Allocation info */}
                  {stream && !isScheduledOtp() && hasAllocation() && (
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">
                          {stream.allocationAssigned
                            ? t('streams.stream-detail.label-reserved-allocation')
                            : t('streams.stream-detail.label-your-allocation')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBox className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            {getAmountWithSymbol(
                              stream.allocationAssigned || stream.allocationLeft,
                              stream.associatedToken as string,
                              false, splTokenList
                            )}
                          </span>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-status')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            {getStreamStatus(stream) === "Running" ? (
                              <IconSwitchRunning className="mean-svg-icons" />
                            ) : (
                              <IconSwitchStopped className="mean-svg-icons" />
                            )}
                          </span>
                          <span className="info-data">
                            {getStreamStatus(stream)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {!isScheduledOtp() && (
                    <>
                      {/* Funds available to withdraw now (Total Vested) */}
                      <Row className="mb-3 mt-4">
                        <Col span={12}>
                          <div className="info-label">{t('streams.stream-detail.label-funds-available-to-withdraw')}</div>
                          <div className="transaction-detail-row">
                            <span className="info-icon">
                              {stream && stream.state === STREAM_STATE.Running ? (
                                <ArrowDownOutlined className="mean-svg-icons success bounce" />
                              ) : (
                                <ArrowDownOutlined className="mean-svg-icons success" />
                              )}
                            </span>
                            {stream ? (
                              <span className="info-data large">
                              {stream
                                ? getAmountWithSymbol(
                                    stream.escrowVestedAmount, 
                                    stream.associatedToken as string,
                                    false, splTokenList
                                  )
                                : '--'}
                              </span>
                            ) : (
                              <span className="info-data large">&nbsp;</span>
                            )}
                          </div>
                        </Col>
                        <Col span={12}>
                          <div className="info-label">{t('streams.stream-detail.label-status')}</div>
                          <div className="transaction-detail-row">
                            <span className="info-icon">
                              {getStreamStatus(stream) === "Running" ? (
                                <IconSwitchRunning className="mean-svg-icons" />
                              ) : (
                                <IconSwitchStopped className="mean-svg-icons" />
                              )}
                            </span>
                            <span className="info-data">
                              {getStreamStatus(stream)}
                            </span>
                          </div>
                        </Col>
                      </Row>
                    </>
                  )}

                  {/* Withdraw button */}
                  <div className="mt-3 mb-1 withdraw-container">
                    <Button
                      block
                      className="withdraw-cta"
                      type="text"
                      shape="round"
                      size="small"
                      disabled={
                        isBusy ||
                        hasStreamPendingTx() ||
                        isScheduledOtp() ||
                        !stream.escrowVestedAmount ||
                        isDeletedStream(stream.id as string) ||
                        publicKey?.toBase58() !== stream.beneficiaryAddress
                      }
                      onClick={showWithdrawModal}>
                      {isBusy && (<LoadingOutlined />)}
                      {t('streams.stream-detail.withdraw-funds-cta')}
                    </Button>
                    {(!isBusy || !hasStreamPendingTx()) && (
                      <Dropdown overlay={menu} trigger={["click"]}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          disabled={isDeletedStream(stream.id as string)}
                          onClick={(e) => e.preventDefault()}
                          icon={<EllipsisOutlined />}>
                        </Button>
                      </Dropdown>
                    )}
                  </div>
                  <div className="mt-1 mb-2 flex-row flex-center">
                    <span className="simplelink underline-on-hover">V1</span>
                    <InfoIcon content={<p>There is a new and improved version of the streams feature.<br/>You'll be able to upgrade soon to enjoy new features.</p>} placement="leftBottom">
                      <InfoCircleOutlined />
                    </InfoIcon>
                  </div>
                </div>
              </Spin>

              <Divider className="activity-divider" plain></Divider>
              {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.loading-activity')}</p>
              ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.no-activity')}</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => copyAddressToClipboard(stream.id)}>STREAM ID: {stream.id}</span>
              <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons" />
              </a>
            </div>
          </>
        )}
      </>
    );
  };

  const renderInboundStreamV2 = (stream: Stream) => {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string, splTokenList) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className={
              `stream-details-data-wrapper vertical-scroll ${isDeletedStream(stream.id as string)
                ? 'disabled blurry-3x'
                : ''}`
              }>

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream.status === STREAM_STATUS.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

                  {/* Sender */}
                  <>
                    <h2 className="mb-3">{getStreamDescription(stream)}</h2>
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">
                          {stream.status === STREAM_STATUS.Paused
                            ? t('streams.stream-detail.label-received-from')
                            : t('streams.stream-detail.label-receiving-from')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconShare className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                              href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.treasurer}${getSolanaExplorerClusterParam()}`}>
                              {shortenAddress(`${stream.treasurer}`)}
                            </a>
                          </span>
                        </div>
                      </Col>
                      <Col span={12}>
                        {isOtp() ? (
                          <>
                            <div className="info-label">
                              Amount
                            </div>
                            <div className="transaction-detail-row">
                              <span className="info-icon token-icon">
                                {token?.logoURI ? (
                                  <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
                                ) : (
                                  <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                                )}
                              </span>
                              <span className="info-data ml-1">
                                {
                                  getTokenAmountAndSymbolByTokenAddress(
                                    toUiAmount(new BN(stream.status === STREAM_STATUS.Schedule ? stream.allocationAssigned : stream.withdrawableAmount), token?.decimals || 6),
                                    stream.associatedToken as string,
                                    false, splTokenList
                                  )
                                }
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                            <div className="transaction-detail-row">
                              <span className="info-data">
                                {getAmountWithSymbol(
                                  toUiAmount(new BN(stream.rateAmount), selectedToken?.decimals || 6),
                                  stream.associatedToken as string,
                                  false, splTokenList
                                )}
                                {getIntervalFromSeconds(stream.rateIntervalInSeconds as number, true, t)}
                              </span>
                            </div>
                          </>
                        )}
                      </Col>
                    </Row>
                  </>

                  {/* Amount / Funds left (Total Unvested) & Started date */}
                  <Row className="mb-3">
                    {stream.fundsLeftInStream > 0 && (
                      <Col span={12}>
                        <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBank className="mean-svg-icons" />
                          </span>
                          {stream ? (
                            <span className="info-data">
                              {getAmountWithSymbol(
                                toUiAmount(new BN(stream.fundsLeftInStream), selectedToken?.decimals || 6),
                                stream.associatedToken as string,
                                false, splTokenList
                              )}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                        </div>
                      </Col>
                    )}
                    {/* Started date */}
                    <Col span={12}>
                      <div className="info-label">{getStartDateLabel()}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconClock className="mean-svg-icons" />
                        </span>
                        <span className="info-data">
                          {getReadableDate(stream?.startUtc as string)}
                        </span>
                      </div>
                    </Col>
                  </Row>

                  {/* Allocation info */}
                  {!isScheduledOtp() && hasAllocation() && (
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">
                          {stream.allocationAssigned
                            ? t('streams.stream-detail.label-reserved-allocation')
                            : t('streams.stream-detail.label-your-allocation')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBox className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            {getAmountWithSymbol(
                              toUiAmount(new BN(stream.remainingAllocationAmount), selectedToken?.decimals || 6),
                              stream.associatedToken as string,
                              false, splTokenList
                            )}
                          </span>
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-status')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            {getStreamStatus(stream) === "Running" ? (
                              <IconSwitchRunning className="mean-svg-icons" />
                            ) : (
                              <IconSwitchStopped className="mean-svg-icons" />
                            )}
                          </span>
                          <span className="info-data">
                            {getStreamStatus(stream)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {!isScheduledOtp() && (
                    <>
                      {/* Funds available to withdraw now (Total Vested) */}
                      <Row className="mb-3 mt-4">
                        <Col span={24}>
                          <div className="info-label">{t('streams.stream-detail.label-funds-available-to-withdraw')}</div>
                          <div className="transaction-detail-row">
                            <span className="info-icon">
                              {stream.status === STREAM_STATUS.Running ? (
                                <ArrowDownOutlined className="mean-svg-icons success bounce" />
                              ) : (
                                <ArrowDownOutlined className="mean-svg-icons success" />
                              )}
                            </span>
                            {stream ? (
                              <span className="info-data large">
                                {getAmountWithSymbol(
                                  toUiAmount(new BN(stream.withdrawableAmount), selectedToken?.decimals || 6),
                                  stream.associatedToken as string,
                                  false, splTokenList
                                )}
                              </span>
                            ) : (
                              <span className="info-data large">&nbsp;</span>
                            )}
                          </div>
                        </Col>
                      </Row>
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
                        isBusy ||
                        hasStreamPendingTx() ||
                        isScheduledOtp() ||
                        !stream.withdrawableAmount ||
                        isDeletedStream(stream.id as string) ||
                        publicKey?.toBase58() !== stream.beneficiary
                      }
                      onClick={showWithdrawModal}>
                      {isBusy && (<LoadingOutlined />)}
                      {t('streams.stream-detail.withdraw-funds-cta')}
                    </Button>
                    {(!isBusy || !hasStreamPendingTx()) && (
                      <Dropdown overlay={menu} trigger={["click"]}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          disabled={isDeletedStream(stream.id as string)}
                          onClick={(e) => e.preventDefault()}
                          icon={<EllipsisOutlined />}>
                        </Button>
                      </Dropdown>
                    )}
                  </div>
                </div>
              </Spin>

              <Divider className="activity-divider" plain></Divider>
              {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.loading-activity')}</p>
              ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.no-activity')}</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => copyAddressToClipboard(stream.id)}>STREAM ID: {stream.id}</span>
              <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons" />
              </a>
            </div>
          </>
        )}
      </>
    );
  };

  const renderOutboundStreamV1 = (stream: StreamInfo) => {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string, splTokenList) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className={
              `stream-details-data-wrapper vertical-scroll ${isDeletedStream(stream.id as string)
                ? 'disabled blurry-3x'
                : ''}`
              }>

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream && stream.state === STREAM_STATE.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

                  {treasuryDetails && !(treasuryDetails as any).autoClose && treasuryDetails.id === stream.treasuryAddress && (
                    <div className="mb-3">
                      <h2 className="mb-0">{getStreamDescription(stream)}</h2>
                      <div className="flex-row align-items-center">
                        <span className="font-bold">Treasury - {getTreasuryName()}</span>
                        <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                          {getTreasuryType() === "locked" ? 'Locked' : 'Open'}
                        </span>
                        <span className="icon-button-container ml-1">
                          <Tooltip placement="bottom" title="Go to treasury">
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<ArrowRightOutlined />}
                              onClick={() => {
                                const url = `/treasuries?treasury=${treasuryDetails.id}`;
                                navigate(url);
                              }}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Beneficiary */}
                  <Row className="mb-3">
                    <Col span={12}>
                      <div className="info-label">
                        {stream && (
                          <>
                          {stream.state === STREAM_STATE.Paused
                            ? t('streams.stream-detail.label-sent-to')
                            : t('streams.stream-detail.label-sending-to')
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
                            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream?.beneficiaryAddress}${getSolanaExplorerClusterParam()}`}>
                            {shortenAddress(`${stream?.beneficiaryAddress}`)}
                          </a>
                        </span>
                      </div>
                    </Col>
                    <Col span={12}>
                      {isOtp() ? (
                        <>
                          <div className="info-label">
                            Amount
                          </div>
                          <div className="transaction-detail-row">
                            <span className="info-icon token-icon">
                              {token?.logoURI ? (
                                <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
                              ) : (
                                <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                              )}
                            </span>
                            <span className="info-data ml-1">
                              {
                                getTokenAmountAndSymbolByTokenAddress(
                                  toUiAmount(new BN(stream.state === STREAM_STATE.Schedule ? stream.allocationAssigned : stream.escrowVestedAmount), token?.decimals || 6),
                                  stream.associatedToken as string,
                                  false, splTokenList
                                )
                              }
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                          <div className="transaction-detail-row">
                            <span className="info-data">
                              {stream
                                ? getAmountWithSymbol(stream.rateAmount, stream.associatedToken as string, false, splTokenList)
                                : '--'
                              }
                              {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
                            </span>
                          </div>
                        </>
                      )}
                    </Col>
                  </Row>

                  {/* Date funded for OTPs */}
                  {isOtp() && (
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">
                          {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(stream?.fundedOnUtc as string)})
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconUpload className="mean-svg-icons" />
                          </span>
                          {stream ?
                            (
                              <span className="info-data">
                              {stream
                                ? getAmountWithSymbol(stream.allocationAssigned, stream.associatedToken as string, false, splTokenList)
                                : '--'}
                              </span>
                            ) : (
                              <span className="info-data">&nbsp;</span>
                            )}
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="info-label">{getStartDateLabel()}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconClock className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            {getReadableDate(stream?.startUtc as string)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* Allocation info */}
                  {isOtp() ? (
                    null
                  ) : hasAllocation() && stream && (
                    <>
                    <Row className="mb-3">
                      <Col span={24}>
                        <div className="info-label">
                          {stream.allocationAssigned
                            ? t('streams.stream-detail.label-reserved-allocation')
                            : t('streams.stream-detail.label-their-allocation')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBox className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            {getAmountWithSymbol(
                              stream.allocationAssigned || stream.allocationLeft,
                              stream.associatedToken as string,
                              false, splTokenList
                            )}
                          </span>
                        </div>
                      </Col>
                    </Row>
                    </>
                  )}

                  {/* Funds sent (Total Vested) */}
                  {isOtp() ? (
                    null
                  ) : (
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-funds-sent')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconUpload className="mean-svg-icons" />
                          </span>
                          {stream ? (
                            <span className="info-data">
                            {stream
                              ? getAmountWithSymbol(
                                  stream.allocationAssigned - stream.allocationLeft + stream.escrowVestedAmount, 
                                  stream.associatedToken as string,
                                  false, splTokenList
                                )
                              : '--'}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-status')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            {getStreamStatus(stream) === "Running" ? (
                              <IconSwitchRunning className="mean-svg-icons" />
                            ) : (
                              <IconSwitchStopped className="mean-svg-icons" />
                            )}
                          </span>
                          <span className="info-data">
                            {getStreamStatus(stream)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* Funds left (Total Unvested) */}
                  {isOtp() ? (
                    null
                  ) : (
                    <div className="mb-3 mt-4">
                      <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          {stream && stream.state === STREAM_STATE.Running ? (
                            <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                          ) : (
                            <ArrowUpOutlined className="mean-svg-icons outgoing" />
                          )}
                        </span>
                        {stream ? (
                          <span className="info-data large">
                          {stream
                            ? getAmountWithSymbol(stream.escrowUnvestedAmount, stream.associatedToken as string, false, splTokenList)
                            : '--'}
                          </span>
                        ) : (
                          <span className="info-data large">&nbsp;</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top up (add funds) button */}
                  <div className="mt-3 mb-1 withdraw-container">
                    {isOtp() ? (
                      <>
                        <Button
                          block
                          className="withdraw-cta"
                          type="text"
                          shape="round"
                          size="small"
                          disabled={
                            isBusy ||
                            isDeletedStream(stream.id as string) ||
                            hasStreamPendingTx()
                          }
                          onClick={showCloseStreamModal}>
                          {(isBusy || hasStreamPendingTx()) && (<LoadingOutlined />)}
                          {t('streams.stream-detail.cancel-scheduled-transfer')}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          block
                          className="withdraw-cta"
                          type="text"
                          shape="round"
                          size="small"
                          disabled={
                            isBusy ||
                            hasStreamPendingTx() ||
                            isOtp() ||
                            isDeletedStream(stream.id as string) ||
                            (getTreasuryType() === "locked" && (stream && stream.state === STREAM_STATE.Running))
                          }
                          onClick={(getTreasuryType() === "open") ? showAddFundsModal : showCloseStreamModal}>
                          {isBusy && (<LoadingOutlined />)}
                          {getTreasuryType() === "open"
                            ? t('streams.stream-detail.add-funds-cta') 
                            : t('streams.stream-detail.close-stream-cta')
                          }
                        </Button>
                        {(getTreasuryType() === "open") && (
                          (!isBusy || !hasStreamPendingTx()) && (
                            <Dropdown overlay={menu} trigger={["click"]}>
                              <Button
                                shape="round"
                                type="text"
                                size="small"
                                className="ant-btn-shaded"
                                disabled={isDeletedStream(stream.id as string)}
                                onClick={(e) => e.preventDefault()}
                                icon={<EllipsisOutlined />}>
                              </Button>
                            </Dropdown>
                          )
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-1 mb-2 flex-row flex-center">
                    <span className="simplelink underline-on-hover">V1</span>
                    <InfoIcon content={<p>There is a new and improved version of the streams feature.<br/>You'll be able to upgrade soon to enjoy new features.</p>} placement="leftBottom">
                      <InfoCircleOutlined />
                    </InfoIcon>
                  </div>
                </div>
              </Spin>

              <Divider className="activity-divider" plain></Divider>
              {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.loading-activity')}</p>
              ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.no-activity')}</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => copyAddressToClipboard(stream.id)}>STREAM ID: {stream.id}</span>
              <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons" />
              </a>
            </div>
          </>
        )}
      </>
    );
  };

  const renderOutboundStreamV2 = (stream: Stream) => {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string, splTokenList) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className={
              `stream-details-data-wrapper vertical-scroll ${isDeletedStream(stream.id as string)
                ? 'disabled blurry-3x'
                : ''}`
              }>

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream && stream.status === STREAM_STATUS.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

                  {treasuryDetails && !(treasuryDetails as any).autoClose && treasuryDetails.id === stream.treasury && (
                    <div className="mb-3">
                      <h2 className="mb-0">{getStreamDescription(stream)}</h2>
                      <div className="flex-row align-items-center">
                        <span className="font-bold">Treasury - {getTreasuryName()}</span>
                        <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                          {getTreasuryType() === "locked" ? 'Locked' : 'Open'}
                        </span>
                        <span className="icon-button-container ml-1">
                          <Tooltip placement="bottom" title="Go to treasury">
                            <Button
                              type="default"
                              shape="circle"
                              size="middle"
                              icon={<ArrowRightOutlined />}
                              onClick={() => {
                                const url = `/treasuries?treasury=${treasuryDetails.id}`;
                                navigate(url);
                              }}
                            />
                          </Tooltip>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Beneficiary */}
                  <Row className="mb-3">
                    <Col span={12}>
                      <div className="info-label">
                        {stream && (
                          <>
                          {stream.status === STREAM_STATUS.Paused
                            ? t('streams.stream-detail.label-sent-to')
                            : t('streams.stream-detail.label-sending-to')
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
                            href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream?.beneficiary}${getSolanaExplorerClusterParam()}`}>
                            {shortenAddress(`${stream?.beneficiary}`)}
                          </a>
                        </span>
                      </div>
                    </Col>
                    <Col span={12}>
                      {isOtp() ? (
                        <>
                          <div className="info-label">
                            Amount
                          </div>
                          <div className="transaction-detail-row">
                            <span className="info-icon token-icon">
                              {token?.logoURI ? (
                                <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} />
                              ) : (
                                <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                              )}
                            </span>
                            <span className="info-data ml-1">
                              {
                                getTokenAmountAndSymbolByTokenAddress(
                                  toUiAmount(new BN(stream.status === STREAM_STATUS.Schedule ? stream.allocationAssigned : stream.withdrawableAmount), token?.decimals || 6),
                                  stream.associatedToken as string,
                                  false, splTokenList
                                )
                              }
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                          <div className="transaction-detail-row">
                            <span className="info-data">
                              {getAmountWithSymbol(
                                toUiAmount(new BN(stream.rateAmount), selectedToken?.decimals || 6),
                                stream.associatedToken as string,
                                false, splTokenList
                              )}
                              {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
                            </span>
                          </div>
                        </>
                      )}
                    </Col>
                  </Row>

                  {/* Allocation info */}
                  <Row className="mb-3">
                    {hasAllocation() && (
                      <Col span={12}>
                        <div className="info-label">
                          {stream.allocationAssigned
                            ? t('streams.stream-detail.label-reserved-allocation')
                            : t('streams.stream-detail.label-their-allocation')
                          }
                        </div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconBox className="mean-svg-icons" />
                          </span>
                          <span className="info-data">
                            {getAmountWithSymbol(
                              toUiAmount(new BN(stream.remainingAllocationAmount), selectedToken?.decimals || 6),
                              stream.associatedToken as string,
                              false, splTokenList
                            )}
                          </span>
                        </div>
                      </Col>
                    )}
                    {/* Started date */}
                    <Col span={12}>
                      <div className="info-label">{getStartDateLabel()}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconClock className="mean-svg-icons" />
                        </span>
                        <span className="info-data">
                          {getReadableDate(stream?.startUtc as string)}
                        </span>
                      </div>
                    </Col>
                  </Row>

                  {/* Funds sent (Total Vested) */}
                  {isOtp() ? (
                    null
                  ) : (
                    <Row className="mb-3">
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-funds-sent')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            <IconUpload className="mean-svg-icons" />
                          </span>
                          {stream ? (
                            <span className="info-data">
                              {getAmountWithSymbol(
                                toUiAmount(new BN(stream.fundsSentToBeneficiary), selectedToken?.decimals || 6),
                                stream.associatedToken as string,
                                false, splTokenList
                              )}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                        </div>
                      </Col>
                      <Col span={12}>
                        <div className="info-label">{t('streams.stream-detail.label-status')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-icon">
                            {getStreamStatus(stream) === "Running" ? (
                              <IconSwitchRunning className="mean-svg-icons" />
                            ) : (
                              <IconSwitchStopped className="mean-svg-icons" />
                            )}
                          </span>
                          <span className="info-data">
                            {getStreamStatus(stream)}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* Funds left (Total Unvested) */}
                  {isOtp() ? (
                    null
                  ) : (
                    <div className="mb-3 mt-4">
                      <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          {stream.status === STREAM_STATUS.Running ? (
                            <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                          ) : (
                            <ArrowUpOutlined className="mean-svg-icons outgoing" />
                          )}
                        </span>
                        {stream ? (
                          <span className="info-data large">
                            {getAmountWithSymbol(
                              toUiAmount(new BN(stream.fundsLeftInStream), selectedToken?.decimals || 6),
                              stream.associatedToken as string,
                              false, splTokenList
                            )}
                          </span>
                        ) : (
                          <span className="info-data large">&nbsp;</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top up (add funds) button */}
                  <Tooltip title={(getTreasuryType() === "locked" && stream.status === STREAM_STATUS.Running) ? t("streams.stream-detail.close-stream-cta-tooltip") : ""}>
                    <div className="mt-3 mb-3 withdraw-container">
                      <Button
                        block
                        className="withdraw-cta"
                        type="text"
                        shape="round"
                        size="small"
                        disabled={
                          isBusy ||
                          hasStreamPendingTx() ||
                          isOtp() ||
                          isDeletedStream(stream.id as string) ||
                          (getTreasuryType() === "locked" && stream.status === STREAM_STATUS.Running)
                        }
                        onClick={(getTreasuryType() === "open") ? showAddFundsModal : showCloseStreamModal}>
                        {isBusy && (<LoadingOutlined />)}
                        {getTreasuryType() === "open"
                          ? t('streams.stream-detail.add-funds-cta') 
                          : t('streams.stream-detail.close-stream-cta')
                        }
                      </Button>
                      {(getTreasuryType() === "open") && (
                        (!isBusy || !hasStreamPendingTx()) && (
                          <Dropdown overlay={menu} trigger={["click"]}>
                            <Button
                              shape="round"
                              type="text"
                              size="small"
                              className="ant-btn-shaded"
                              disabled={isDeletedStream(stream.id as string)}
                              onClick={(e) => e.preventDefault()}
                              icon={<EllipsisOutlined />}>
                            </Button>
                          </Dropdown>
                        )
                      )}
                    </div>
                  </Tooltip>
                  {/* {(getTreasuryType() === "open") && (
                    <span className="icon-button-container">
                      {getStreamStatus(stream) === "Running" && (
                        <Tooltip placement="bottom" title={t("streams.pause-stream-tooltip")}>
                          <Button
                            shape="round"
                            type="text"
                            size="small"
                            className="ant-btn-shaded"
                            disabled={isDeletedStream(stream.id as string)}
                            onClick={showPauseStreamModal}
                            icon={<IconPause className="mean-svg-icons h-100" />}>
                          </Button>
                        </Tooltip>
                      )}
                      {(getStreamStatus(stream) === "Stopped" && (stream && stream.fundsLeftInStream > 0)) && (
                        <Tooltip placement="bottom" title={t("streams.resume-stream-tooltip")}>
                          <Button
                            shape="round"
                            type="text"
                            size="small"
                            className="ant-btn-shaded"
                            disabled={isDeletedStream(stream.id as string)}
                            onClick={showResumeStreamModal}
                            icon={<IconPlay className="mean-svg-icons h-100" />}>
                          </Button>
                        </Tooltip>
                      )}
                    </span>
                  )}
                  {(getTreasuryType() === "locked") && (
                    <span className="icon-button-container">
                      <Tooltip placement="bottom" title={t("streams.locked-stream-tooltip")}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          disabled={isDeletedStream(stream.id as string)}
                          onClick={showLockedStreamModal}
                          icon={getStreamStatus(stream) === "Running" && 
                          (<IconLock className="mean-svg-icons" />)}>
                        </Button>
                      </Tooltip>
                    </span>
                  )} */}
                </div>
              </Spin>

              <Divider className="activity-divider" plain></Divider>
              {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.loading-activity')}</p>
              ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                <p>{t('streams.stream-activity.no-activity')}</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => copyAddressToClipboard(stream.id)}>STREAM ID: {stream.id}</span>
              <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons" />
              </a>
            </div>
          </>
        )}
      </>
    );
  };

  const renderStreamList = (
    <>
    {(connected && streamList && streamList.length > 0) ? (
      streamList.map((item, index) => {
        const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string, splTokenList) : undefined;
        const onStreamClick = () => {
          setSelectedStream(item);
          setDtailsPanelOpen(true);
          consoleOut('list item selected:', item, 'blue');
        };
        const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
          event.currentTarget.src = FALLBACK_COIN_IMAGE;
          event.currentTarget.className = "error";
        };
        return (
          <div key={`${index + 50}`} onClick={onStreamClick} id={`${item.id}`}
            className={
              `transaction-list-row ${isDeletedStream(item.id as string)
                ? 'disabled blurry-1x'
                : streamDetail && streamDetail.id === item.id
                  ? 'selected'
                  : ''}`
            }>
            <div className="icon-cell">
              {getStreamTypeIcon(item)}
              <div className="token-icon">
                {item.associatedToken ? (
                  <>
                    {token ? (
                      <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                    ) : (
                      <Identicon address={item.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                    )}
                  </>
                ) : (
                  <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
                )}
              </div>
            </div>
            <div className="description-cell">
              <div className="title text-truncate">{getStreamDescription(item)}</div>
              <div className="subtitle text-truncate">{getTransactionSubTitle(item)}</div>
            </div>
            <div className="rate-cell">
              <div className="rate-amount text-uppercase">{getStreamStatus(item)}</div>
              <div className="interval">{getStreamStatusSubtitle(item)}</div>
            </div>
          </div>
        );
      })
    ) : !connected ? (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
            <p>{t('streams.stream-list.not-connected')}</p>
          }/>
        </div>
      </>
    ) : (
      <>
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
            <p>{t('streams.stream-list.no-streams')}</p>
          }/>
        </div>
      </>
    )}
    </>
  );

  return (
    <>
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">incoming:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.incomingAmount : '-'}</span>
          <span className="ml-1">outgoing:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.outgoingAmount : '-'}</span>
          <span className="ml-1">totalAmount:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.totalAmount : '-'}</span>
          <span className="ml-1">totalNet:</span><span className="ml-1 font-bold fg-dark-active">{streamsSummary ? streamsSummary.totalNet : '-'}</span>
        </div>
      )} */}

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
                      onClick={() => {
                        setShouldLoadTokens(true);
                        refreshStreamList(true);
                        setTimeout(() => {
                          navigate('/accounts');
                        }, 200);
                      }}
                    />
                  </Tooltip>
                </span>
              </div>
            )}
            <span className="title">{t('streams.screen-title')}</span>
            <Tooltip placement="bottom" title={t('streams.refresh-tooltip')}>
              <div id="streams-refresh-cta" className={`transaction-stats ${loadingStreams ? 'click-disabled' : 'simplelink'}`} onClick={() => onRefreshStreams(true)}>
                <Spin size="small" />
                {customStreamDocked ? (
                  <span className="transaction-legend neutral">
                    <ReloadOutlined className="mean-svg-icons"/>
                  </span>
                ) : (
                  <>
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <CountdownCircleTimer
                          isPlaying={isCounting}
                          key={key}
                          size={18}
                          strokeWidth={3}
                          duration={refreshInterval / 1000}
                          colors={theme === 'dark' ? '#FFFFFF' : '#000000'}
                          trailColor={theme === 'dark' ? '#424242' : '#DDDDDD'}
                          onComplete={() => {
                            setIsCounting(false);
                            onRefreshStreams(false);
                            return { shouldRepeat: false, delay: 1 }
                          }}
                        />
                      </span>
                    </span>
                  </>
                )}
              </div>
              <div id="streams-refresh-noreset-cta" onClick={onRefreshStreamsNoReset}></div>
            </Tooltip>
          </div>
          <div className="inner-container">
            {/* item block */}
            <div className="item-block vertical-scroll">
              <Spin spinning={loadingStreams}>
                {publicKey && renderMoneyStreamsSummary()}
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
                    disabled={!connected}
                    onClick={onCreateNewTransfer}>
                    {connected
                      ? t('streams.create-new-stream-cta')
                      : t('transactions.validation.not-connected')
                    }
                  </Button>
                </div>
              )}
              {!customStreamDocked && connected && (
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
                {/* Top action icons */}
                {/* {isUnderDevelopment() && (
                  <div className="float-top-right">
                    <span className="icon-button-container secondary-button">
                      <Tooltip placement="bottom" title={t('streams.edit-stream.edit-stream-tooltip')}>
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<IconEdit className="mean-svg-icons" style={{padding: "2px 0 0"}} />}
                          onClick={() => onEditStreamClick()}
                          disabled={isInboundStream(streamDetail)}
                        />
                      </Tooltip>
                      <Tooltip placement="bottom" title={t('streams.stream-detail.close-money-stream-menu-item')}>
                        <Button
                          type="default"
                          shape="circle"
                          size="middle"
                          icon={<IconTrash className="mean-svg-icons" />}
                          onClick={showCloseStreamModal}
                          disabled
                        />
                      </Tooltip>
                    </span>
                  </div>
                )} */}

              {isInboundStream(streamDetail)
                ? streamDetail.version < 2
                  ? renderInboundStreamV1(streamDetail as StreamInfo)
                  : renderInboundStreamV2(streamDetail as Stream)
                : streamDetail.version < 2
                  ? renderOutboundStreamV1(streamDetail as StreamInfo)
                  : renderOutboundStreamV2(streamDetail as Stream)
              }
              </>
            ) : (
              <>
                <div className="h-100 flex-center">
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{connected
                    ? t('streams.stream-detail.no-stream')
                    : t('streams.stream-list.not-connected')}</p>} />
                </div>
              </>
            )}
          </div>
        </div>

        <StreamOpenModal
          isVisible={isOpenStreamModalVisible}
          handleOk={onAcceptOpenStream}
          handleClose={closeOpenStreamModal}
        />

        <StreamTransferOpenModal
          isVisible={isTransferStreamModalVisible}
          streamDetail={streamDetail}
          handleOk={onAcceptTransferStream}
          handleClose={closeTransferStreamModal}
        />

        {isCloseStreamModalVisible && (
          <StreamCloseModal
            isVisible={isCloseStreamModalVisible}
            selectedToken={selectedToken}
            transactionFees={transactionFees}
            streamDetail={streamDetail}
            mspClient={
              streamDetail
                ? streamDetail.version < 2
                  ? ms
                  : msp
                : undefined
            }
            handleOk={onAcceptCloseStream}
            handleClose={hideCloseStreamModal}
            content={getStreamClosureMessage()}
          />
        )}

        <StreamPauseModal
          isVisible={isPauseStreamModalVisible}
          selectedToken={selectedToken}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamDetail}
          handleOk={onAcceptPauseStream}
          handleClose={hidePauseStreamModal}
          content={getStreamPauseMessage()}
        />

        <StreamResumeModal
          isVisible={isResumeStreamModalVisible}
          selectedToken={selectedToken}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamDetail}
          handleOk={onAcceptResumeStream}
          handleClose={hideResumeStreamModal}
          content={getStreamResumeMessage()}
        />

        <StreamLockedModal
          isVisible={isLockedStreamModalVisible}
          handleClose={hideLockedStreamModal}
          streamDetail={streamDetail}
          mspClient={
            streamDetail
              ? streamDetail.version < 2
                ? ms
                : msp
              : undefined
          }
        />

        <StreamEditModal
          isVisible={isEditStreamModalVisible}
          handleOk={onAcceptEditStream}
          handleClose={hideEditStreamModal}
          streamDetail={streamDetail}
          isBusy={isBusy}
        />

        {isAddFundsModalVisible && (
          <StreamAddFundsModal
            isVisible={isAddFundsModalVisible}
            transactionFees={transactionFees}
            withdrawTransactionFees={withdrawTransactionFees}
            streamDetail={streamDetail}
            mspClient={
              streamDetail
                ? streamDetail.version < 2
                  ? ms
                  : msp
                : undefined
            }
            handleOk={onAcceptAddFunds}
            handleClose={closeAddFundsModal}
          />
        )}

        {isWithdrawModalVisible && (
          <StreamWithdrawModal
            startUpData={lastStreamDetail}
            selectedToken={selectedToken}
            transactionFees={transactionFees}
            isVisible={isWithdrawModalVisible}
            handleOk={onAcceptWithdraw}
            handleClose={closeWithdrawModal}
          />
        )}

        {isSendAssetModalOpen && (
          <SendAssetModal
            selectedToken={selectedToken as UserTokenAccount}
            isVisible={isSendAssetModalOpen}
            handleClose={hideSendAssetModal}
            selected={"one-time"}
          />
        )}

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
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                <h5 className="operation">{t('transactions.status.tx-add-funds-operation')} {getAmountWithSymbol(
                    parseFloat(addFundsPayload ? addFundsPayload.amount : 0),
                    streamDetail?.associatedToken as string,
                    false, splTokenList
                  )}
                </h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
                        NATIVE_SOL_MINT.toBase58(),
                        false, splTokenList
                      ),
                      feeAmount: getTokenAmountAndSymbolByTokenAddress(
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
                        NATIVE_SOL_MINT.toBase58(),
                        false, splTokenList
                      )})
                    }
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {withdrawFundsAmount ? withdrawFundsAmount.inputAmount : 0}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
                {transactionStatus.currentOperation === TransactionStatus.FeatureTemporarilyDisabled ? (
                  <>
                    <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
                    <h4 className="mb-4">Money Streams are getting a makeover, and we are making them more awesome! Stand by, you'll be able to withdraw shortly.</h4>
                  </>
                ) : transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <>
                    <WarningOutlined style={{ fontSize: 48 }} className="icon" />
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
                  </>
                ) : (
                  <>
                    <WarningOutlined style={{ fontSize: 48 }} className="icon" />
                    <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                  </>
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
          afterClose={onCloseStreamTransactionFinished}
          visible={isCloseStreamTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={onCloseStreamTransactionFinished}
          width={330}
          footer={null}>
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                <h5 className="operation">{t('transactions.status.tx-close-operation')}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
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
        {/* Transfer stream transaction execution modal */}
        <Modal
          className="mean-modal no-full-screen"
          maskClosable={false}
          afterClose={onAfterTransferStreamTransactionModalClosed}
          visible={isTransferStreamTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideTransferStreamTransactionModal}
          width={330}
          footer={null}>
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                <h5 className="operation">{t('transactions.status.tx-transfer-stream', { newAddress: shortenAddress(lastStreamTransferAddress, 8) })}</h5>
                {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                  <div className="indication">{t('transactions.status.instructions')}</div>
                )}
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                <p className="operation">{t('transactions.status.tx-transfer-stream-success')}</p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={onTransferStreamTransactionFinished}>
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
                  <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransferStreamTransactionModal}>
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
        {/* Common transaction execution modal */}
        <Modal
          className="mean-modal no-full-screen"
          maskClosable={false}
          visible={isTransactionExecutionModalVisible}
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
                  onClick={onTransactionFinished}>
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
                        transactionFees.blockchainFee + transactionFees.mspFlatFee,
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
                        onClick={() => ongoingOperation === OperationType.StreamPause
                          ? onExecutePauseStreamTransaction()
                          : ongoingOperation === OperationType.StreamResume
                            ? onExecuteResumeStreamTransaction()
                            : hideTransactionExecutionModal()}>
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
      </div>
    </>
  );

};
