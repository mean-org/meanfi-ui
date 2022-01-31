import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin, Dropdown, Menu, Tooltip, Empty } from "antd";
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
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
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconShare,
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
  shortenAddress,
  toTokenAmount,
  toUiAmount
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
  FALLBACK_COIN_IMAGE,
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
import { useTranslation } from "react-i18next";
import { customLogger } from '../..';
import { useLocation, useNavigate } from "react-router-dom";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { TransactionStatusContext } from "../../contexts/transaction-status";
import { Identicon } from "../../components/Identicon";
import BN from "bn.js";
import { InfoIcon } from "../../components/InfoIcon";
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { MSP_ACTIONS, StreamActivity, StreamInfo, STREAM_STATE } from '@mean-dao/money-streaming/lib/types';
import {
  AllocationType,
  MSP,
  Stream,
  STREAM_STATUS,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  TransactionFees,
  calculateActionFees as calculateActionFeesV2,
} from "@mean-dao/msp";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const Streams = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const connection = useConnection();
  const { endpoint } = useConnectionConfig();
  const { connected, wallet, publicKey } = useWallet();
  const {
    streamList,
    streamListv1,
    streamListv2,
    streamDetail,
    selectedToken,
    loadingStreams,
    streamsSummary,
    streamActivity,
    detailsPanelOpen,
    transactionStatus,
    customStreamDocked,
    lastStreamsSummary,
    streamProgramAddress,
    loadingStreamActivity,
    highLightableStreamId,
    streamV2ProgramAddress,
    setStreamList,
    openStreamById,
    setStreamDetail,
    setSelectedToken,
    setEffectiveRate,
    setSelectedStream,
    refreshStreamList,
    setDtailsPanelOpen,
    setShouldLoadTokens,
    refreshTokenBalance,
    setTransactionStatus,
    setCustomStreamDocked,
    setHighLightableStreamId,
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
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "finalized"
  ), [
    endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    if (publicKey) {
      console.log('New MSP from streams');
      return new MSP(
        endpoint,
        streamV2ProgramAddress,
        "finalized"
      );
    }
  }, [
    publicKey,
    endpoint,
    streamV2ProgramAddress
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

  const [oldSelectedToken, setOldSelectedToken] = useState<TokenInfo>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  // Live data calculation
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
          if (streamDetail && streamDetail.id === stream.id) {
            freshStream = await msp.refreshStream(streamDetail);
            if (freshStream) {
              setStreamDetail(freshStream);
            }
          }
          freshStream = await msp.refreshStream(stream);
          if (freshStream) {
            newList.push(freshStream);
          }
        }
      }

      // Get an updated version for each v1 stream in the list
      if (updatedStreamsv1 && updatedStreamsv1.length) {
        let freshStream: StreamInfo;
        for (const stream of updatedStreamsv1) {
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
  const onAcceptCloseStream = () => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction();
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
      consoleOut("stream token:", unkToken, 'blue');
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

  // Watch for stream's associated token changes then load the token to the state as selectedToken
  useEffect(() => {
    if (streamDetail && selectedToken?.address !== streamDetail.associatedToken) {
      const token = getTokenByMintAddress(streamDetail.associatedToken as string);
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

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    const token = getTokenByMintAddress(streamDetail?.associatedToken as string);
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

  const [addFundsAmount, setAddFundsAmount] = useState<number>(0);
  const onAcceptAddFunds = (amount: any) => {
    closeAddFundsModal();
    consoleOut('AddFunds amount:', parseFloat(amount));
    onExecuteAddFundsTransaction(amount);
  };

  // Withdraw funds modal
  const [lastStreamDetail, setLastStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<number>(0);
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);

  const showWithdrawModal = useCallback(async () => {
    const lastDetail = Object.assign({}, streamDetail);

    // Abort transaction under the status "FeatureTemporarilyDisabled" if there is no vested cliff
    // since we are allowing withdrawals only for any cliff amount but only for < v2 streams
    // TODO: Remove when withdraw feature goes back to normal

    // if (lastDetail && lastDetail.version < 2) {
    //   if (!lastDetail.cliffVestAmount && (!lastDetail.cliffVestPercent || lastDetail.cliffVestPercent === 100)) {
    //     setTransactionStatus({
    //       lastOperation: transactionStatus.currentOperation,
    //       currentOperation: TransactionStatus.FeatureTemporarilyDisabled
    //     });
    //     setWithdrawFundsTransactionModalVisibility(true);
    //     return;
    //   }
    // } else {
    //   resetTransactionStatus();
    // }

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
    setWithdrawFundsAmount(0);
    setLastStreamDetail(undefined);
    setIsWithdrawModalVisibility(false);
  }, []);

  const onAcceptWithdraw = (amount: any) => {
    closeWithdrawModal();
    consoleOut('Withdraw amount:', parseFloat(amount));
    onExecuteWithdrawFundsTransaction(amount);
  };

  const onActivateContractScreen = () => {
    setCustomStreamDocked(false);
    navigate("/transfers");
  };

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

  const isAuthority = (): boolean => {
    if (streamDetail && publicKey) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if (v1.version < 2 && (v1.treasurerAddress === publicKey.toBase58() || v1.beneficiaryAddress === publicKey.toBase58())) {
        return true;
      } else if (v2.version >= 2 && (v2.treasurer === publicKey.toBase58() || v2.beneficiary === publicKey.toBase58())) {
        return true;
      }
    }
    return false;
  }

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

  }, [
    t,
    isInboundStream
  ]);

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

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!streamDetail) { return; }

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
          clearTransactionStatusContext();
          if (customStreamDocked) {
            openStreamById(streamDetail?.id as string, false);
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
    streamList,
    streamDetail,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    customStreamDocked,
    setStreamList,
    refreshStreamList,
    openStreamById,
    clearTransactionStatusContext
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
            transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure ||
            transactionStatus.currentOperation === TransactionStatus.FeatureTemporarilyDisabled
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
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey((streamDetail as StreamInfo).treasuryAddress as string);
        const contributorMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addAmount);
        setAddFundsAmount(amount);

        const data = {
          contributor: wallet.publicKey.toBase58(),               // contributor
          treasury: treasury.toBase58(),                          // treasury
          stream: stream.toBase58(),                              // stream
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
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

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamDetail && selectedToken && msp) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey((streamDetail as Stream).treasury as string);
        const associatedToken = new PublicKey(streamDetail.associatedToken as string);
        const amount = toTokenAmount(parseFloat(addAmount as string), selectedToken.decimals);
        setAddFundsAmount(parseFloat(addAmount));
        const data = {
          contributor: publicKey.toBase58(),                              // contributor
          treasury: treasury.toBase58(),                                  // treasury
          associatedToken: associatedToken.toBase58(),                    // associatedToken
          stream: stream.toBase58(),                                      // stream
          amount,                                                         // amount
          allocationType: AllocationType.All                              // allocationType
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting addFunds using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.addFunds(
          publicKey,
          treasury,
          associatedToken,
          stream,
          amount,
          AllocationType.Specific
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
            customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamAddFunds);
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
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
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
          customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
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

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamDetail && msp && selectedToken) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey((streamDetail as Stream).beneficiary as string);
        const amount = toTokenAmount(parseFloat(withdrawAmount as string), selectedToken.decimals);
        setWithdrawFundsAmount(parseFloat(withdrawAmount as string));

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
          customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
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
            customLogger.logWarning('Withdraw transaction failed', { transcript: transactionLog });
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

    if (wallet && streamDetail) {
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.StreamWithdraw);
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
    let encodedTx: string;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
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
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting closeStream using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.closeStream(
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

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamDetail && msp) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: publicKey.toBase58(),                      // initializer
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
          customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting closeStream using MSP V2...', '', 'blue');
        // Create a transaction
        return await msp.closeStream(
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
            customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
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
          console.error(error);
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

    if (wallet && streamDetail) {
      showCloseStreamTransactionModal();
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
      const treasury = streamDetail.version < 2 ? (streamDetail as StreamInfo).treasuryAddress as string : (streamDetail as Stream).treasury as string;
      const treasurer = streamDetail.version < 2 ? (streamDetail as StreamInfo).treasurerAddress : (streamDetail as Stream).treasurer;
      const beneficiary = streamDetail.version < 2 ? (streamDetail as StreamInfo).beneficiaryAddress as string : (streamDetail as Stream).beneficiary as string;
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

  const getRateAmountDisplay = (item: Stream | StreamInfo): string => {
    let value = '';

    if (item) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += getTokenSymbol(item.associatedToken as string);
    }
    return value;
  }

  const getDepositAmountDisplay = (item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationReserved > 0) {
      const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
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

  const getActivityAmountDisplay = (item: StreamActivity, streamVersion: number): number => {
    let value = '';

    const token = getTokenByMintAddress(item.mint as string);
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

  const hasAllocation = (): boolean => {
    if (streamDetail) {
      const v1 = streamDetail as StreamInfo;
      const v2 = streamDetail as Stream;
      if (v1.version < 2) {
        return v1.allocationReserved || v1.allocationLeft ? true : false;
      } else {
        return v2.remainingAllocationAmount ? true : false;
      }
    }

    return false;
  }

  ///////////////////
  //   Rendering   //
  ///////////////////

  const renderMoneyStreamsSummary = (
    <>
      {/* Render Money Streams item if they exist and wallet is connected */}
      {publicKey && (
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
              <div className={streamsSummary.totalNet !== lastStreamsSummary.totalNet ? 'token-icon animate-border' : 'token-icon'}>
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
                <div className="rate-amount">${formatAmount(streamsSummary.totalNet, 5)}</div>
                <div className="interval">net-change</div>
              </>
            )}
          </div>
          <div className="operation-vector">
            {streamsSummary.totalNet > lastStreamsSummary.totalNet ? (
              <ArrowUpOutlined className="mean-svg-icons success bounce" />
            ) : streamsSummary.totalNet < lastStreamsSummary.totalNet ? (
              <ArrowDownOutlined className="mean-svg-icons outgoing bounce" />
            ) : (
              <span className="online-status neutral"></span>
            )}
          </div>
        </div>
        <div key="separator1" className="pinned-token-separator"></div>
        </>
      )}
    </>
  );

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={showCloseStreamModal}>
        <span className="menu-item-text">{t('streams.stream-detail.close-money-stream-menu-item')}</span>
      </Menu.Item>
    </Menu>
  );

  const renderActivities = (streamVersion: number) => {
    return (
      <div className="activity-list">
        <Spin spinning={loadingStreamActivity}>
          {streamActivity && (
            <>
              <div className="item-list-header compact">
                <div className="header-row">
                  <div className="std-table-cell first-cell">&nbsp;</div>
                  <div className="std-table-cell fixed-width-80">{t('streams.stream-activity.heading')}</div>
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
                        <span className="align-middle">{
                          getAmountWithSymbol(
                            getActivityAmountDisplay(item, streamVersion), item.mint
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
      </div>
    );
  }

  const renderInboundStreamV1 = (stream: StreamInfo) => {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className="stream-details-data-wrapper vertical-scroll">

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
                        null
                      ) : (
                        <>
                        <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-data">
                            {getAmountWithSymbol(stream.rateAmount, stream.associatedToken as string)}
                            {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
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
                        {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(stream?.fundedOnUtc as string)})
                      </div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconDownload className="mean-svg-icons" />
                        </span>
                        {stream ?
                          (
                            <span className="info-data">
                            {stream
                              ? getAmountWithSymbol(stream.allocationReserved, stream.associatedToken as string)
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
                  <Row className="mb-3">
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
                    {isOtp() && (
                      <Col span={12}>
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
                                stream.associatedToken as string
                              )
                            }
                          </span>
                        </div>
                      </Col>
                    )}
                  </Row>

                  {/* Funds left (Total Unvested) */}
                  {isOtp() ? (
                    null
                  ) : stream && stream.escrowUnvestedAmount > 0 && (
                    <div className="mb-3">
                      <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconBank className="mean-svg-icons" />
                        </span>
                        {stream ? (
                          <span className="info-data">
                          {stream
                            ? getAmountWithSymbol(stream.escrowUnvestedAmount, stream.associatedToken as string)
                            : '--'}
                          </span>
                        ) : (
                          <span className="info-data">&nbsp;</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Allocation info */}
                  {stream && !isScheduledOtp() && hasAllocation() && (
                    <Row className="mb-3">
                      <Col span={24}>
                        <div className="info-label">
                          {stream.allocationReserved
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
                              stream.allocationReserved || stream.allocationLeft,
                              stream.associatedToken as string
                            )}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {!isScheduledOtp() && (
                    <>
                      {/* Funds available to withdraw now (Total Vested) */}
                      <Row className="mb-3">
                        <Col span={24}>
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
                                    stream.associatedToken as string
                                  )
                                : '--'}
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
                  <div className="mt-3 mb-1 withdraw-container">
                    <Button
                      block
                      className="withdraw-cta"
                      type="text"
                      shape="round"
                      size="small"
                      disabled={
                        isScheduledOtp() ||
                        !stream?.escrowVestedAmount ||
                        publicKey?.toBase58() !== stream?.beneficiaryAddress ||
                        fetchTxInfoStatus === "fetching"
                      }
                      onClick={showWithdrawModal}>
                      {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
                      {isClosing()
                        ? t('streams.stream-detail.cta-disabled-closing')
                        : isCreating()
                          ? t('streams.stream-detail.cta-disabled-creating')
                          : isAddingFunds()
                            ? t('streams.stream-detail.cta-disabled-funding')
                            : isWithdrawing()
                              ? t('streams.stream-detail.cta-disabled-withdrawing')
                              : t('streams.stream-detail.withdraw-funds-cta')
                      }
                    </Button>
                    {(isTreasurer() && fetchTxInfoStatus !== "fetching") && (
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
                  <div className="mt-1 mb-2 flex-row flex-center">
                    <span className="simplelink underline-on-hover">V1</span>
                    <InfoIcon content={<p>There is a new and improved version of the streams feature.<br/>You'll be able to upgrade soon to enjoy new features.</p>} placement="leftBottom">
                      <InfoCircleOutlined />
                    </InfoIcon>
                  </div>
                </div>
              </Spin>

              <Divider className="activity-divider" plain></Divider>
              {!streamActivity || streamActivity.length === 0 ? (
                <p>{t('streams.stream-activity.no-activity')}.</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => onCopyStreamAddress(stream.id)}>STREAM ID: {stream.id}</span>
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
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className="stream-details-data-wrapper vertical-scroll">

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
                        null
                      ) : (
                        <>
                        <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-data">
                            {getAmountWithSymbol(toUiAmount(new BN(stream.rateAmount), selectedToken?.decimals || 6), stream.associatedToken as string)}
                            {getIntervalFromSeconds(stream.rateIntervalInSeconds as number, true, t)}
                          </span>
                        </div>
                        </>
                      )}
                    </Col>
                  </Row>

                  {/* Amount for OTPs */}
                  {/* {isOtp() ? (
                    <div className="mb-3">
                      <div className="info-label">
                        {t('streams.stream-detail.label-amount')}&nbsp;({t('streams.stream-detail.amount-funded-date')} {getReadableDate(stream?.fundedOnUtc as string)})
                      </div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconDownload className="mean-svg-icons" />
                        </span>
                        {stream ?
                          (
                            <span className="info-data">
                            {stream
                              ? getAmountWithSymbol(stream.allocationReserved, stream.associatedToken as string)
                              : '--'}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                      </div>
                    </div>
                  ) : (
                    null
                  )} */}

                  {/* Started date */}
                  <Row className="mb-3">
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
                    {isOtp() && (
                      <Col span={12}>
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
                                stream.associatedToken as string
                              )
                            }
                          </span>
                        </div>
                      </Col>
                    )}
                  </Row>

                  {/* Funds left (Total Unvested) */}
                  {isOtp() ? (
                    null
                  ) : stream.fundsLeftInStream > 0 && (
                    <div className="mb-3">
                      <div className="info-label text-truncate">{t('streams.stream-detail.label-funds-left-in-account')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconBank className="mean-svg-icons" />
                        </span>
                        {stream ? (
                          <span className="info-data">
                            {getAmountWithSymbol(
                              toUiAmount(new BN(stream.fundsLeftInStream), selectedToken?.decimals || 6),
                              stream.associatedToken as string
                            )}
                          </span>
                        ) : (
                          <span className="info-data">&nbsp;</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Allocation info */}
                  {stream && !isScheduledOtp() && hasAllocation() && (
                    <Row className="mb-3">
                      <Col span={24}>
                        <div className="info-label">
                          {/* TODO: Check this condition */}
                          {stream.allocationReserved
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
                              stream.associatedToken as string
                            )}
                          </span>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {!isScheduledOtp() && (
                    <>
                      {/* Funds available to withdraw now (Total Vested) */}
                      <Row className="mb-3">
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
                                  stream.associatedToken as string
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
                        isScheduledOtp() ||
                          !stream.withdrawableAmount ||
                          publicKey?.toBase58() !== stream.beneficiary ||
                          fetchTxInfoStatus === "fetching"
                      }
                      onClick={showWithdrawModal}>
                      {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
                      {isClosing()
                        ? t('streams.stream-detail.cta-disabled-closing')
                        : isCreating()
                          ? t('streams.stream-detail.cta-disabled-creating')
                          : isAddingFunds()
                            ? t('streams.stream-detail.cta-disabled-funding')
                            : isWithdrawing()
                              ? t('streams.stream-detail.cta-disabled-withdrawing')
                              : t('streams.stream-detail.withdraw-funds-cta')
                      }
                    </Button>
                    {(isTreasurer() && fetchTxInfoStatus !== "fetching") && (
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
              {!streamActivity || streamActivity.length === 0 ? (
                <p>{t('streams.stream-activity.no-activity')}.</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => onCopyStreamAddress(stream.id)}>STREAM ID: {stream.id}</span>
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
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className="stream-details-data-wrapper vertical-scroll">

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream && stream.state === STREAM_STATE.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

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
                        null
                      ) : (
                        <>
                        <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-data">
                            {stream
                              ? getAmountWithSymbol(stream.rateAmount, stream.associatedToken as string)
                              : '--'
                            }
                            {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
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
                              ? getAmountWithSymbol(stream.allocationAssigned, stream.associatedToken as string)
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
                  <Row className="mb-3">
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
                    {isOtp() && (
                      <Col span={12}>
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
                                stream.associatedToken as string
                              )
                            }
                          </span>
                        </div>
                      </Col>
                    )}
                  </Row>

                  {/* Allocation info */}
                  {isOtp() ? (
                    null
                  ) : hasAllocation() && stream && (
                    <>
                    <Row className="mb-3">
                      <Col span={24}>
                        <div className="info-label">
                          {stream.allocationReserved
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
                              stream.allocationReserved || stream.allocationLeft,
                              stream.associatedToken as string
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
                    <div className="mb-3">
                      <div className="info-label">{t('streams.stream-detail.label-funds-sent')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconUpload className="mean-svg-icons" />
                        </span>
                        {stream ? (
                          <span className="info-data">
                          {stream
                            ? getAmountWithSymbol(
                              stream.allocationAssigned - 
                              stream.allocationLeft + 
                              stream.escrowVestedAmount, 
                              stream.associatedToken as string
                            )
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
                            ? getAmountWithSymbol(stream.escrowUnvestedAmount, stream.associatedToken as string)
                            : '--'}
                          </span>
                        ) : (
                          <span className="info-data large">&nbsp;</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top up (add funds) button */}
                  {/* Withdraw */}
                  <div className="mt-3 mb-1 withdraw-container">
                    {isOtp() ? (
                      <>
                        <Button
                          block
                          className="withdraw-cta"
                          type="text"
                          shape="round"
                          size="small"
                          disabled={fetchTxInfoStatus === "fetching"}
                          onClick={showCloseStreamModal}>
                          {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
                          {isClosing()
                            ? t('streams.stream-detail.cta-disabled-closing')
                            : isCreating()
                              ? t('streams.stream-detail.cta-disabled-creating')
                              : isAddingFunds()
                                ? t('streams.stream-detail.cta-disabled-funding')
                                : isWithdrawing()
                                  ? t('streams.stream-detail.cta-disabled-withdrawing')
                                  : t('streams.stream-detail.cancel-scheduled-transfer')
                          }
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
                            isOtp() ||
                            fetchTxInfoStatus === "fetching"
                          }
                          onClick={showAddFundsModal}>
                          {fetchTxInfoStatus === "fetching" && (<LoadingOutlined />)}
                          {isClosing()
                            ? t('streams.stream-detail.cta-disabled-closing')
                            : isCreating()
                              ? t('streams.stream-detail.cta-disabled-creating')
                              : isAddingFunds()
                                ? t('streams.stream-detail.cta-disabled-funding')
                                : isWithdrawing()
                                  ? t('streams.stream-detail.cta-disabled-withdrawing')
                                  : t('streams.stream-detail.add-funds-cta')
                          }
                        </Button>
                        {(isTreasurer() && fetchTxInfoStatus !== "fetching") && (
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
              {!streamActivity || streamActivity.length === 0 ? (
                <p>{t('streams.stream-activity.no-activity')}.</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => onCopyStreamAddress(stream.id)}>STREAM ID: {stream.id}</span>
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
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;
    return (
      <>
        {stream && (
          <>
            <div className="stream-details-data-wrapper vertical-scroll">

              <Spin spinning={loadingStreams}>
                <div className="stream-fields-container">
                  {/* Background animation */}
                  {stream && stream.status === STREAM_STATUS.Running ? (
                    <div className="stream-background">
                      <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
                    </div>
                    ) : null
                  }

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
                        null
                      ) : (
                        <>
                        <div className="info-label">{t('streams.stream-detail.label-payment-rate')}</div>
                        <div className="transaction-detail-row">
                          <span className="info-data">
                            {getAmountWithSymbol(toUiAmount(new BN(stream.rateAmount), selectedToken?.decimals || 6), stream.associatedToken as string)}
                            {getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}
                          </span>
                        </div>
                        </>
                      )}
                    </Col>
                  </Row>

                  {/* Amount for OTPs */}
                  {/* {isOtp() ? (
                    <div className="mb-3">
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
                              ? getAmountWithSymbol(stream.allocationAssigned, stream.associatedToken as string)
                              : '--'}
                            </span>
                          ) : (
                            <span className="info-data">&nbsp;</span>
                          )}
                      </div>
                    </div>
                  ) : (
                    null
                  )} */}

                  {/* Started date */}
                  <Row className="mb-3">
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
                    {isOtp() && (
                      <Col span={12}>
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
                                stream.associatedToken as string
                              )
                            }
                          </span>
                        </div>
                      </Col>
                    )}
                  </Row>

                  {/* Allocation info */}
                  {isOtp() ? (
                    null
                  ) : hasAllocation() && (
                    <>
                    <Row className="mb-3">
                      <Col span={24}>
                        <div className="info-label">
                          {stream.allocationReserved
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
                              stream.associatedToken as string
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
                    <div className="mb-3">
                      <div className="info-label">{t('streams.stream-detail.label-funds-sent')}</div>
                      <div className="transaction-detail-row">
                        <span className="info-icon">
                          <IconUpload className="mean-svg-icons" />
                        </span>
                        {stream ? (
                          <span className="info-data">
                            {getAmountWithSymbol(
                              toUiAmount(new BN(stream.fundsSentToBeneficiary), selectedToken?.decimals || 6),
                              stream.associatedToken as string
                            )}
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
                              stream.associatedToken as string
                            )}
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
                        ? t('streams.stream-detail.cta-disabled-closing')
                        : isCreating()
                          ? t('streams.stream-detail.cta-disabled-creating')
                          : isAddingFunds()
                            ? t('streams.stream-detail.cta-disabled-funding')
                            : isWithdrawing()
                              ? t('streams.stream-detail.cta-disabled-withdrawing')
                              : t('streams.stream-detail.add-funds-cta')
                      }
                    </Button>
                    {(isTreasurer() && fetchTxInfoStatus !== "fetching") && (
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
              {!streamActivity || streamActivity.length === 0 ? (
                <p>{t('streams.stream-activity.no-activity')}.</p>
              ) : renderActivities(stream.version)}
            </div>
            <div className="stream-share-ctas">
              <span className="copy-cta" onClick={() => onCopyStreamAddress(stream.id)}>STREAM ID: {stream.id}</span>
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
    {streamList && streamList.length ? (
      streamList.map((item, index) => {
        const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
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
          <div key={`${index + 50}`} onClick={onStreamClick}
            id={`${item.id}`}
            className={`transaction-list-row ${streamDetail && streamDetail.id === item.id ? 'selected' : ''}`}>
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
      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="secondary-link" onClick={() => clearTransactionStatusContext()}>[STOP]</span>
          <span className="ml-1">proggress:</span><span className="ml-1 font-bold fg-dark-active">{fetchTxInfoStatus || '-'}</span>
          <span className="ml-1">status:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxStatus || '-'}</span>
          <span className="ml-1">lastSentTxSignature:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxSignature ? shortenAddress(lastSentTxSignature, 8) : '-'}</span>
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
              <div className={`transaction-stats ${loadingStreams ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshStreamsClick}>
                <Spin size="small" />
                {customStreamDocked ? (
                  <span className="transaction-legend neutral">
                    <IconRefresh className="mean-svg-icons"/>
                  </span>
                ) : (
                  <>
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {}}
                        />
                      </span>
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
                {(streamsSummary && streamsSummary.totalAmount > 0) && renderMoneyStreamsSummary}
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
          handleClose={closeOpenStreamModal}
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

        <StreamAddFundsModal
          isVisible={isAddFundsModalVisible}
          transactionFees={transactionFees}
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
        />

        {(isWithdrawModalVisible) && (
          <StreamWithdrawModal
            startUpData={lastStreamDetail}
            selectedToken={selectedToken}
            transactionFees={transactionFees}
            isVisible={isWithdrawModalVisible}
            handleOk={onAcceptWithdraw}
            handleClose={closeWithdrawModal}
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
                <h5 className="operation">{t('transactions.status.tx-add-funds-operation')} {getAmountWithSymbol(addFundsAmount, streamDetail?.associatedToken as string)}</h5>
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
                <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {getAmountWithSymbol(withdrawFundsAmount, streamDetail?.associatedToken as string)}</h5>
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
                    {/* TODO: Remove this when everything is back to normal */}
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
      </div>
    </>
  );

};
