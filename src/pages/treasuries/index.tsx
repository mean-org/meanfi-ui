import React, { useCallback, useContext, useMemo } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  EllipsisOutlined,
  LoadingOutlined, ReloadOutlined, SearchOutlined, WarningOutlined,
} from '@ant-design/icons';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { useEffect, useState } from 'react';
import { PreFooter } from '../../components/PreFooter';
import { getSolanaExplorerClusterParam, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from '../../contexts/wallet';
import { AppStateContext } from '../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../components/Identicon';
import {
  formatAmount,
  formatThousands,
  getAmountWithSymbol,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenSymbol,
  getTxIxResume,
  shortenAddress
} from '../../utils/utils';
import { Button, Col, Divider, Dropdown, Empty, Menu, Modal, Row, Space, Spin, Tooltip } from 'antd';
import { consoleOut, copyText, getFormattedNumberToLocale, getIntervalFromSeconds, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, isLocal, isValidAddress } from '../../utils/ui';
import {
  FALLBACK_COIN_IMAGE,
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  STREAMS_REFRESH_TIMEOUT,
  VERBOSE_DATE_TIME_FORMAT
} from '../../constants';
import { isDesktop } from "react-device-detect";
import useWindowSize from '../../hooks/useWindowResize';
import { OperationType, TransactionStatus } from '../../models/enums';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { notify } from '../../utils/notifications';
import { IconBank, IconClock, IconExternalLink, IconSort } from '../../Icons';
import { TreasuryOpenModal } from '../../components/TreasuryOpenModal';
import { AllocationType, MSP_ACTIONS, StreamInfo, STREAM_STATE, TransactionFees, TreasuryInfo, TreasuryType } from '@mean-dao/money-streaming/lib/types';
import { TreasuryCreateModal } from '../../components/TreasuryCreateModal';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import dateFormat from 'dateformat';
import './style.less';
import { useNavigate } from 'react-router-dom';
import { PerformanceCounter } from '../../utils/perf-counter';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useAccountsContext, useNativeAccount } from '../../contexts/accounts';
import { NATIVE_SOL_MINT } from '../../utils/ids';
import { customLogger } from '../..';
import { TreasuryAddFundsModal } from '../../components/TreasuryAddFundsModal';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { ACCOUNT_LAYOUT } from '../../utils/layouts';
import { TreasuryCloseModal } from '../../components/TreasuryCloseModal';
import { StreamCloseModal } from '../../components/StreamCloseModal';
import { TreasuryStreamsBreakdown } from '../../models/streams';
import { StreamPauseModal } from '../../components/StreamPauseModal';
import { TreasuryStreamCreateModal } from '../../components/TreasuryStreamCreateModal';
import { StreamResumeModal } from '../../components/StreamResumeModal';
import { TREASURY_TYPE_OPTIONS } from '../../constants/treasury-type-options';
import { TreasuryTopupParams } from '../../models/common-types';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;
const treasuryStreamsPerfCounter = new PerformanceCounter();
const treasuryDetailPerfCounter = new PerformanceCounter();
const treasuryListPerfCounter = new PerformanceCounter();

export const TreasuriesView = () => {
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const {
    tokenList,
    tokenBalance,
    selectedToken,
    isWhitelisted,
    treasuryOption,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    previousWalletConnectState,
    setTreasuryOption,
    setDtailsPanelOpen,
    resetContractValues,
    refreshTokenBalance,
    setForceReloadTokens,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    startFetchTxSignatureInfo,
    clearTransactionStatusContext,
  } = useContext(TransactionStatusContext);
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [treasuryList, setTreasuryList] = useState<TreasuryInfo[]>([]);
  const [selectedTreasury, setSelectedTreasury] = useState<TreasuryInfo | undefined>(undefined);
  const [loadingTreasuries, setLoadingTreasuries] = useState(false);
  const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
  const [customStreamDocked, setCustomStreamDocked] = useState(false);
  const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
  const [treasuryStreams, setTreasuryStreams] = useState<StreamInfo[]>([]);
  const [streamStats, setStreamStats] = useState<TreasuryStreamsBreakdown | undefined>(undefined);
  const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<TreasuryInfo | undefined>(undefined);
  const [highlightedStream, sethHighlightedStream] = useState<StreamInfo | undefined>();
  const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(false);

  // Transactions
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  // TODO: Remove when releasing to the public
  useEffect(() => {
    if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    navigate
  ]);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint, streamProgramAddress
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
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

  // Automatically update all token balances (in token list)
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !tokenList || !accounts || !accounts.tokenAccounts) {
      return;
    }

    const timeout = setTimeout(() => {

      const balancesMap: any = {};
      connection.getTokenAccountsByOwner(
        publicKey, 
        { programId: TOKEN_PROGRAM_ID }, 
        connection.commitment
      )
      .then(response => {
        for (let acc of response.value) {
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
        for (let t of tokenList) {
          balancesMap[t.address] = 0;
        }
      })
      .finally(() => setUserBalances(balancesMap));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection,
    tokenList,
    accounts,
    publicKey
  ]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
    if (!publicKey || !ms || loadingTreasuryStreams) { return; }

    setTimeout(() => {
      setLoadingTreasuryStreams(true);
    });

    consoleOut('Executing getTreasuryStreams...', '', 'blue');

    treasuryStreamsPerfCounter.start();
    ms.listStreams({treasury: treasuryPk })
      .then((streams) => {
        consoleOut('treasuryStreams:', streams, 'blue');
        setTreasuryStreams(streams);
        setLoadingTreasuryStreams(false);
      })
      .catch(err => {
        console.error(err);
        setTreasuryStreams([]);
        setLoadingTreasuryStreams(false);
      })
      .finally(() => {
        treasuryStreamsPerfCounter.stop();
        consoleOut(`getTreasuryStreams took ${(treasuryStreamsPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
      });

  }, [
    ms,
    publicKey,
    loadingTreasuryStreams,
  ]);

  const openTreasuryById = useCallback((treasuryId: string, dock = false) => {
    if (!connection || !publicKey || !ms || loadingTreasuryDetails) { return; }

    if (!isValidAddress(treasuryId)) {
      notify({
        message: t('notifications.error-title'),
        description: t('notifications.invalid-publickey-message'),
        type: "error"
      });
      return;
    }

    setTimeout(() => {
      setLoadingTreasuryDetails(true);
    });

    treasuryDetailPerfCounter.start();
    const treasueyPk = new PublicKey(treasuryId);
    ms.getTreasury(treasueyPk)
      .then(details => {
        if (details) {
          consoleOut('treasuryDetails:', details, 'blue');
          setSelectedTreasury(details);
          setTreasuryDetails(details);
          setSignalRefreshTreasuryStreams(true);
          const tOption = TREASURY_TYPE_OPTIONS.find(t => t.type === details.type);
          if (tOption) {
            setTreasuryOption(tOption);
          }
          if (dock) {
            setTreasuryList([details]);
            setCustomStreamDocked(true);
            notify({
              description: t('notifications.success-loading-treasury-message', {treasuryId: shortenAddress(treasuryId, 10)}),
              type: "success"
            });
          }
        } else {
          setTreasuryDetails(undefined);
          setSelectedTreasury(undefined);
          if (dock) {
            notify({
              message: t('notifications.error-title'),
              description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
              type: "error"
            });
          }
        }
        setLoadingTreasuryDetails(false);
      })
      .catch(error => {
        console.error(error);
        setTreasuryDetails(undefined);
        setLoadingTreasuryDetails(false);
        notify({
          message: t('notifications.error-title'),
          description: t('notifications.error-loading-treasuryid-message', {treasuryId: shortenAddress(treasuryId as string, 10)}),
          type: "error"
        });
      })
      .finally(() => {
        treasuryDetailPerfCounter.stop();
        consoleOut(`getTreasury took ${(treasuryDetailPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
      });

  }, [
    t,
    ms,
    publicKey,
    connection,
    loadingTreasuryDetails,
    setTreasuryOption
  ]);

  const refreshTreasuries = useCallback((reset = false) => {
    if (!connection || !publicKey || !ms || loadingTreasuries) { return; }

    if (!loadingTreasuries && fetchTxInfoStatus !== "fetching") {

      // const signature = lastSentTxStatus || '';
      setTimeout(() => {
        setLoadingTreasuries(true);
        clearTransactionStatusContext();
      });

      treasuryListPerfCounter.start();
      ms.listTreasuries(publicKey)
        .then((treasuries) => {
          consoleOut('treasuries:', treasuries, 'blue');
          let item: TreasuryInfo | undefined = undefined;

          if (treasuries.length) {

            if (reset) {
              item = treasuries[0];
            } else {
              // Try to get current item by its original Tx signature then its id
              if (selectedTreasury) {
                const itemFromServer = treasuries.find(i => i.id === selectedTreasury.id);
                item = itemFromServer || treasuries[0];
              } else {
                item = treasuries[0];
              }
            }
            if (!item) {
              item = JSON.parse(JSON.stringify(treasuries[0]));
            }
            if (item) {
              setSelectedTreasury(item);
              openTreasuryById(item.id as string);
            }
          } else {
            setSelectedTreasury(undefined);
            setTreasuryDetails(undefined);
            setTreasuryStreams([]);
          }

          setTreasuryList(treasuries);
          setLoadingTreasuries(false);
        })
        .catch(error => {
          console.error(error);
          setLoadingTreasuries(false);
        })
        .finally(() => {
          treasuryListPerfCounter.stop();
          consoleOut(`listTreasuries took ${(treasuryListPerfCounter.elapsedTime).toLocaleString()}ms`, '', 'crimson');
        });
    }

  }, [
    ms,
    publicKey,
    connection,
    selectedTreasury,
    loadingTreasuries,
    fetchTxInfoStatus,
    clearTransactionStatusContext,
    openTreasuryById,
  ]);

  const numTreasuryStreams = useCallback(() => {
    return treasuryStreams ? treasuryStreams.length : 0;
  }, [treasuryStreams]);

  // Load treasuries once per page access
  useEffect(() => {
    if (!publicKey || !connection || treasuriesLoaded || loadingTreasuries) {
      return;
    }

    setTreasuriesLoaded(true);
    consoleOut('Loading treasuries with wallet connection...', '', 'blue');
    refreshTreasuries(true);
  }, [
    publicKey,
    connection,
    treasuriesLoaded,
    loadingTreasuries,
    refreshTreasuries
  ]);

  // Load/Unload treasuries on wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('User is connecting...', publicKey.toBase58(), 'green');
        setTreasuriesLoaded(false);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'green');
        setTreasuryList([]);
        setTreasuryStreams([]);
        setCustomStreamDocked(false);
        setSelectedTreasury(undefined);
        setTreasuryDetails(undefined);
      }
    }
  }, [
    connected,
    previousWalletConnectState,
    publicKey,
    refreshTreasuries
  ]);

  // Reload Treasury streams whenever the selected treasury changes
  useEffect(() => {
    if (!publicKey || !ms) { return; }

    if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
      setSignalRefreshTreasuryStreams(false);
      consoleOut('calling getTreasuryStreams...', '', 'blue');
      const treasuryPk = new PublicKey(treasuryDetails.id as string);
      getTreasuryStreams(treasuryPk);
    }
  }, [
    ms,
    publicKey,
    treasuryStreams,
    treasuryDetails,
    loadingTreasuryStreams,
    signalRefreshTreasuryStreams,
    getTreasuryStreams,
  ]);

  // Maintain stream stats
  useEffect(() => {

    const updateStats = () => {
      if (treasuryStreams && treasuryStreams.length) {
        const scheduled = treasuryStreams.filter(s => s.state === STREAM_STATE.Schedule);
        const running = treasuryStreams.filter(s => s.state === STREAM_STATE.Running);
        const stopped = treasuryStreams.filter(s => s.state === STREAM_STATE.Paused);
        const stats: TreasuryStreamsBreakdown = {
          total: treasuryStreams.length,
          scheduled: scheduled.length,
          running: running.length,
          stopped: stopped.length
        }
        setStreamStats(stats);
      } else {
        setStreamStats(undefined);
      }
    }

    updateStats();
  }, [
    publicKey,
    treasuryStreams,
  ]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
    setDtailsPanelOpen
  ]);

  // Treasury list refresh timeout
  useEffect(() => {
    let timer: any;

    if (publicKey && treasuriesLoaded && !customStreamDocked) {
      timer = setInterval(() => {
        consoleOut(`Refreshing treasuries past ${STREAMS_REFRESH_TIMEOUT / 60 / 1000}min...`);
        refreshTreasuries(false);
      }, STREAMS_REFRESH_TIMEOUT);
    }

    return () => clearInterval(timer);
  }, [
    publicKey,
    treasuriesLoaded,
    customStreamDocked,
    refreshTreasuries
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      switch (lastSentTxOperationType) {
        case OperationType.TreasuryCreate:
        case OperationType.TreasuryClose:
          refreshTreasuries(true);
          break;
        default:
          refreshTreasuries(false);
          break;
      }
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    lastSentTxOperationType,
    refreshTreasuries,
  ]);

  /////////////////
  //   Getters   //
  /////////////////

  const getShortDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const isAnythingLoading = useCallback((): boolean => {
    return loadingTreasuries || loadingTreasuryDetails || loadingTreasuryStreams
            ? true
            : false;
  }, [
    loadingTreasuries,
    loadingTreasuryDetails,
    loadingTreasuryStreams,
  ]);

  const isCreating = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryCreate
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isClosing = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryClose
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isAddingFunds = useCallback((): boolean => {
    return fetchTxInfoStatus === "fetching" && lastSentTxOperationType === OperationType.TreasuryAddFunds
            ? true
            : false;
  }, [
    fetchTxInfoStatus,
    lastSentTxOperationType,
  ]);

  const isTxInProgress = useCallback((): boolean => {
    return isBusy || fetchTxInfoStatus === "fetching"
            ? true
            : false;
  }, [
    isBusy,
    fetchTxInfoStatus,
  ]);

  const isTreasurer = useCallback((): boolean => {
    return publicKey && treasuryDetails && treasuryDetails.treasurerAddress === publicKey.toBase58()
            ? true
            : false;
  }, [
    publicKey,
    treasuryDetails,
  ]);

  const getStreamIcon = useCallback((item: StreamInfo) => {
    const isInbound = item.beneficiaryAddress === publicKey?.toBase58() ? true : false;
    return isInbound
      ? (<ArrowDownOutlined className="mean-svg-icons incoming" />)
      : (<ArrowUpOutlined className="mean-svg-icons outgoing" />)
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

  const getStreamStatus = useCallback((item: StreamInfo) => {

    if (item.isUpdatePending) {
      return 'Update pending';
    }

    switch (item.state) {
      case STREAM_STATE.Schedule:
        return t('treasuries.treasury-streams.status-scheduled');
      case STREAM_STATE.Paused:
        return t('treasuries.treasury-streams.status-stopped');
      default:
        return t('treasuries.treasury-streams.status-running');
    }
  }, [t]);

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

  const getStreamRateAmount = (item: StreamInfo) => {
    let strOut = '';
    if (item && item.rateAmount > 0) {
      strOut = `${getRateAmountDisplay(item)} ${getIntervalFromSeconds(item.rateIntervalInSeconds, false, t)}`;
    } else {
      strOut = getDepositAmountDisplay(item);
    }
    return strOut;
  }

  const getTreasuryClosureMessage = () => {

    // if (publicKey && treasuryDetails) {
    //   const me = publicKey.toBase58();
    //   const treasury = treasuryDetails.id as string;
    //   const treasurer = treasuryDetails.treasurerAddress as string;
    // }

    return (
      <div>{t('treasuries.close-treasury-confirmation')}</div>
    );
  }

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const me = publicKey.toBase58();
      const treasurer = highlightedStream.treasurerAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      if (treasurer === me) {  // If I am the treasurer
        message = t('close-stream.context-treasurer-single-beneficiary', {beneficiary: shortenAddress(beneficiary)});
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = t('close-stream.context-beneficiary', { beneficiary: shortenAddress(beneficiary) });
      }

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamPauseMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.treasuryAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }

  const getStreamResumeMessage = () => {
    let message = '';

    if (publicKey && highlightedStream) {

      const treasury = highlightedStream.treasuryAddress as string;
      const beneficiary = highlightedStream.beneficiaryAddress as string;

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
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

  ////////////////
  //   Events   //
  ////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

  const onRefreshTreasuriesClick = () => {
    refreshTreasuries(false);
    setCustomStreamDocked(false);
  };

  const onCopyTreasuryAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        description: t('notifications.treasuryid-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.treasuryid-not-copied-message'),
        type: "error"
      });
    }
  }

  // Open treasury modal
  const [isOpenTreasuryModalVisible, setIsOpenTreasuryModalVisibility] = useState(false);
  const showOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(true), []);
  const closeOpenTreasuryModal = useCallback(() => setIsOpenTreasuryModalVisibility(false), []);

  const onAcceptOpenTreasury = (e: any) => {
    closeOpenTreasuryModal();
    consoleOut('treasury id:', e, 'blue');
    openTreasuryById(e, true);
  };

  const onCancelCustomTreasuryClick = () => {
    setCustomStreamDocked(false);
    refreshTreasuries(true);
  }

  const onCreateTreasuryClick = () => {
    setCustomStreamDocked(false);
    showCreateTreasuryModal();
  };

  // Create treasury modal
  const [isCreateTreasuryModalVisible, setIsCreateTreasuryModalVisibility] = useState(false);
  const showCreateTreasuryModal = useCallback(() => {
    setIsCreateTreasuryModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.createTreasury).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const closeCreateTreasuryModal = useCallback(() => setIsCreateTreasuryModalVisibility(false), []);

  const onAcceptCreateTreasury = (e: any) => {
    consoleOut('treasury name:', e, 'blue');
    onExecuteCreateTreasuryTx(e);
  };

  const onTreasuryCreated = () => {
    closeCreateTreasuryModal();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const onExecuteCreateTreasuryTx = async (treasuryName: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryName && treasuryOption) {
        consoleOut("Start transaction for create treasury", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        // Create a transaction
        const data = {
          wallet: publicKey.toBase58(),                               // wallet
          label: treasuryName,                                        // treasury
          type: `${treasuryOption.type} = ${treasuryOption.type === TreasuryType.Open ? 'Open' : 'Locked'}`
        };
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        console.log('type:', treasuryOption.type.toString());
        return await ms.createTreasury(
          publicKey,                                                  // wallet
          treasuryName,                                               // label
          treasuryOption.type                                         // type
        )
        .then(value => {
          consoleOut('createTreasury returned transaction:', value);
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
          console.error('createTreasury error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
          console.error(error);
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: {signer: `${wallet.publicKey.toBase58()}`, error: `${error}`}
          });
          customLogger.logWarning('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
        customLogger.logError('Create Treasury transaction failed', { transcript: transactionLog });
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryCreate);
            setIsBusy(false);
            onTreasuryCreated();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
  }, []);

  const onAcceptAddFunds = (params: TreasuryTopupParams) => {
    consoleOut('AddFunds params:', params, 'blue');
    onExecuteAddFundsTransaction(params);
  };

  const onAddFundsTransactionFinished = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    closeAddFundsModal();
    refreshTokenBalance();
  };

  const onExecuteAddFundsTransaction = async (params: TreasuryTopupParams) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails && selectedToken) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id);
        const associatedToken = new PublicKey(selectedToken.address);
        const amount = parseFloat(params.amount);
        const stream = params.streamId ? new PublicKey(params.streamId) : undefined;

        console.log('params.streamId', params.streamId);

        const data = {
          contributor: publicKey.toBase58(),                       // contributor
          treasury: treasury.toBase58(),                           // treasury
          stream: stream?.toBase58(),                               // stream
          associatedToken: associatedToken.toBase58(),             // associatedToken
          amount,                                                 // amount
          allocationType: params.allocationType                   // allocationType
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.addFunds(
          publicKey,
          treasury,
          stream,
          associatedToken,
          amount,
          params.allocationType
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

    if (publicKey && treasuryDetails && selectedToken) {
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryAddFunds);
            setIsBusy(false);
            onAddFundsTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close treasury modal
  const [isCloseTreasuryModalVisible, setIsCloseTreasuryModalVisibility] = useState(false);

  const showCloseTreasuryModal = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    setIsCloseTreasuryModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    getTransactionFees,
    setTransactionStatus,
  ]);

  const hideCloseTreasuryModal = useCallback(() => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    setIsCloseTreasuryModalVisibility(false);
  }, [isBusy]);

  const onAcceptCloseTreasury = () => {
    onExecuteCloseTreasuryTransaction();
  };

  const onCloseTreasuryTransactionFinished = () => {
    hideCloseTreasuryModal();
    refreshTokenBalance();
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    setForceReloadTokens(true);
  };

  const onExecuteCloseTreasuryTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id as string);
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
          customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.closeTreasury(
          publicKey,                                  // treasurer
          treasury,                                   // treasury
        )
        .then(value => {
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
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Close Treasury transaction failed', { transcript: transactionLog });
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

    if (wallet) {
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
            startFetchTxSignatureInfo(signature, "finalized", OperationType.TreasuryClose);
            setIsBusy(false);
            onCloseTreasuryTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      setIsCloseStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (closeTreasury: boolean) => {
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(closeTreasury);
  };

  // Close stream Transaction execution modal
  const [isCloseStreamTransactionModalVisible, setCloseStreamTransactionModalVisibility] = useState(false);
  const showCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(true), []);
  const hideCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(false), []);

  const onCloseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideCloseStreamTransactionModal();
    }
    resetTransactionStatus();
  }

  const onExecuteCloseStreamTransaction = async (closeTreasury: boolean) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

        const data = {
          stream: streamPublicKey.toBase58(),                     // stream
          initializer: wallet.publicKey.toBase58(),               // initializer
          closeTreasury                                           // closeTreasury
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
        return await ms.closeStream(
          publicKey as PublicKey,                           // Initializer public key
          streamPublicKey,                                  // Stream ID,
          closeTreasury
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

  // Pause stream modal
  const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
  const showPauseStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
      setTransactionFees(value);
      setIsPauseStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
  const onAcceptPauseStream = () => {
    hidePauseStreamModal();
    onExecutePauseStreamTransaction();
  };

  const onPauseStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onExecutePauseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

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
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamPause);
            setIsBusy(false);
            onCloseStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Resume stream modal
  const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
  const showResumeStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
      setTransactionFees(value);
      setIsResumeStreamModalVisibility(true);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
  const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);
  const onAcceptResumeStream = () => {
    hideResumeStreamModal();
    onExecuteResumeStreamTransaction();
  };

  const onResumeStreamTransactionFinished = () => {
    resetTransactionStatus();
    hideCloseStreamTransactionModal();
    refreshTokenBalance();
    setForceReloadTokens(true);
  };

  const onExecuteResumeStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (wallet && highlightedStream) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(highlightedStream.id as string);

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
          customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.resumeStream(
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.StreamResume);
            setIsBusy(false);
            onResumeStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  // Create Stream modal
  const [isCreateStreamModalVisible, setIsCreateStreamModalVisibility] = useState(false);
  const showCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(true);
    getTransactionFees(MSP_ACTIONS.createStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);

  const closeCreateStreamModal = useCallback(() => {
    setIsCreateStreamModalVisibility(false);
  }, []);

  const onAcceptCreateStream = (amount: any) => {
    consoleOut('CreateStream amount:', parseFloat(amount));
    onExecuteCreateStreamTransaction(amount);
  };

  const onCreateStreamTransactionFinished = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
    closeCreateStreamModal();
    resetContractValues();
    setForceReloadTokens(true);
    refreshTokenBalance();
  };

  const onExecuteCreateStreamTransaction = async (addAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    const transactionLog: any[] = [];

    clearTransactionStatusContext();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTx = async (): Promise<boolean> => {
      if (publicKey && treasuryDetails && selectedToken) {
        consoleOut("Start transaction for treasury addFunds", '', 'blue');
        consoleOut('Wallet address:', publicKey.toBase58());

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const treasury = new PublicKey(treasuryDetails.id);
        const associatedToken = new PublicKey(selectedToken.address);
        const amount = parseFloat(addAmount);

        const data = {
          contributor: publicKey,                      // contributor
          treasury: treasury,                          // treasury
          associatedToken: associatedToken,            // associatedToken
          amount                                                  // amount
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
          customLogger.logError('Add funds transaction failed', { transcript: transactionLog });
          return false;
        }

        // Create a transaction
        return await ms.addFunds(
          publicKey,
          treasury,
          undefined,
          associatedToken,
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

    if (publicKey && treasuryDetails && selectedToken) {
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
            startFetchTxSignatureInfo(signature, "confirmed", OperationType.TreasuryStreamCreate);
            setIsBusy(false);
            onCreateStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  ///////////////
  // Rendering //
  ///////////////

  const renderStreamOptions = (item: StreamInfo) => {
    const menu = (
      <Menu>
        {item.state === STREAM_STATE.Paused ? (
          <Menu.Item key="1" onClick={showResumeStreamModal}>
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-resume-stream')}</span>
          </Menu.Item>
        ) : item.state === STREAM_STATE.Running ? (
          <Menu.Item key="1" onClick={showPauseStreamModal}>
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-pause-stream')}</span>
          </Menu.Item>
        ) : null}
        <Menu.Item key="3" onClick={showCloseStreamModal}>
          <span className="menu-item-text">{t('treasuries.treasury-streams.option-close-stream')}</span>
        </Menu.Item>
        <Menu.Item key="4" onClick={() => {}}>
          <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
              target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('treasuries.treasury-streams.option-explorer-link')}</span>
          </a>
        </Menu.Item>
      </Menu>
    );

    return (
      <Dropdown overlay={menu} trigger={["click"]} onVisibleChange={(visibleChange) => {
        if (visibleChange) {
          sethHighlightedStream(item);
        } else {
          sethHighlightedStream(undefined);
        }
      }}>
        <span className="icon-container"><EllipsisOutlined /></span>
      </Dropdown>
    );
  }

  const renderTreasuryStreams = () => {
    if (!treasuryDetails) {
      return null;
    } else if (treasuryDetails && loadingTreasuryStreams) {
      return (
        <div className="mb-2">{t('treasuries.treasury-streams.loading-streams')}</div>
      );
    } else if (treasuryDetails && !loadingTreasuryStreams && treasuryStreams.length === 0) {
      return (
        <div className="mb-2">{t('treasuries.treasury-streams.no-streams')}</div>
      );
    }

    return (
      <>
        <div className="item-list-header compact">
          <div className="header-row">
            <div className="std-table-cell first-cell">&nbsp;</div>
            <div className="std-table-cell responsive-cell">{t('treasuries.treasury-streams.column-activity')}</div>
            <div className="std-table-cell fixed-width-150">{t('treasuries.treasury-streams.column-amount')}</div>
            <div className="std-table-cell fixed-width-120">{t('treasuries.treasury-streams.column-started')}</div>
            <div className="std-table-cell last-cell">&nbsp;</div>
          </div>
        </div>
        <div className="item-list-body compact">
          {treasuryStreams.map((item, index) => {
            const status = getStreamStatus(item);
            return (
              <div className={`item-list-row ${highlightedStream && highlightedStream.id === item.id ? 'selected' : ''}`} key={item.id as string}>
                <div className="std-table-cell first-cell">{getStreamIcon(item)}</div>
                <div className="std-table-cell responsive-cell">
                  {status && (<span className="badge darken small text-uppercase mr-1">{status}</span>)}
                  <span className="align-middle">{item.streamName || getStreamDescription(item)}</span>
                </div>
                <div className="std-table-cell fixed-width-150">
                  <span className="align-middle">{getStreamRateAmount(item)}</span>
                </div>
                <div className="std-table-cell fixed-width-120">
                  <span className="align-middle">{getShortDate(item.startUtc as string, true)}</span>
                </div>
                <div className="std-table-cell last-cell">
                  <span className={`icon-button-container ${isClosing() && highlightedStream ? 'click-disabled' : ''}`}>
                    {renderStreamOptions(item)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  const renderTreasuryMeta = () => {
    const token = tokenList.find(t => t.address === treasuryDetails?.associatedTokenAddress);
    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    return (
      <>
      {treasuryDetails && (
        <div className="stream-fields-container">

          {/* Treasury name and Number of streams */}
          <div className="mb-3">
            <Row>
              <Col span={12}>
                <div className="info-label text-truncate">
                  {t('treasuries.treasury-detail.number-of-streams')}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconSort className="mean-svg-icons" />
                  </span>
                  <span className="info-data flex-row wrap align-items-center">
                    <span className="mr-1">{formatThousands(treasuryDetails.streamsAmount)}</span>
                    {treasuryDetails.streamsAmount > 0 && (
                      <>
                        {streamStats && streamStats.total > 0 && (
                          <>
                          {streamStats.scheduled > 0 && (
                            <div className="badge mr-1 medium font-bold info">{formatThousands(streamStats.scheduled)} {t('treasuries.treasury-streams.status-scheduled')}</div>
                          )}
                          {streamStats.running > 0 && (
                            <div className="badge mr-1 medium font-bold success">{formatThousands(streamStats.running)} {t('treasuries.treasury-streams.status-running')}</div>
                          )}
                          {streamStats.stopped > 0 && (
                            <div className="badge medium font-bold error">{formatThousands(streamStats.stopped)} {t('treasuries.treasury-streams.status-stopped')}</div>
                          )}
                          </>
                        )}
                      </>
                    )}
                  </span>
                </div>
              </Col>
              <Col span={12}>
                <div className="info-label text-truncate">
                  {t('treasuries.treasury-detail.funds-added-to-treasury')}
                </div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconBank className="mean-svg-icons" />
                  </span>
                  <span className="info-data">
                    {
                      getAmountWithSymbol(
                        treasuryDetails.balance,
                        treasuryDetails.associatedTokenAddress as string
                      )
                    }
                  </span>
                </div>
              </Col>
            </Row>
          </div>

          <div className="mb-3">
            <Row>
              {token && (
                <Col span={treasuryDetails.createdOnUtc ? 12 : 24}>
                  <div className="info-label">
                    {t('treasuries.treasury-detail.associated-token')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon token-icon">
                      {token && token.logoURI ? (
                        <img alt={`${token.name}`} width={24} height={24} src={token.logoURI} onError={imageOnErrorHandler} />
                      ) : (
                        <Identicon address={treasuryDetails.associatedTokenAddress} style={{ width: "24", display: "inline-flex" }} />
                      )}
                    </span>
                    <span className="info-data text-truncate">
                      {token && token.symbol ? `${token.symbol} (${token.name})` : shortenAddress(treasuryDetails.associatedTokenAddress as string)}
                    </span>
                  </div>
                </Col>
              )}
              {treasuryDetails.createdOnUtc && (
                <Col span={token ? 12 : 24}>
                  <div className="info-label">
                    {t('treasuries.treasury-detail.created-on')}
                  </div>
                  <div className="transaction-detail-row">
                    <span className="info-icon">
                      <IconClock className="mean-svg-icons" />
                    </span>
                    <span className="info-data">
                      {dateFormat(treasuryDetails.createdOnUtc, VERBOSE_DATE_TIME_FORMAT)}
                    </span>
                  </div>
                </Col>
              )}
            </Row>
          </div>

        </div>
      )}
      </>
    );
  };

  const renderCtaRow = () => {
    return (
      <>
        <Space size="middle">
          {/* Add funds to the treasury */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || loadingTreasuries}
            onClick={showAddFundsModal}>
            {isAddingFunds() && (<LoadingOutlined />)}
            {isAddingFunds()
              ? t('treasuries.treasury-detail.cta-add-funds-busy')
              : t('treasuries.treasury-detail.cta-add-funds')}
          </Button>
          {/* Close treasury */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || (treasuryStreams && treasuryStreams.length > 0) || !isTreasurer() || isAnythingLoading()}
            onClick={showCloseTreasuryModal}>
            {(isClosing() && !highlightedStream) && (<LoadingOutlined />)}
            {isClosing() && !highlightedStream
              ? t('treasuries.treasury-detail.cta-close-busy')
              : t('treasuries.treasury-detail.cta-close')}
          </Button>
          {/* Add translation */}
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            disabled={isTxInProgress() || isAnythingLoading() || (!treasuryDetails || treasuryDetails.balance === 0)}
            onClick={showCreateStreamModal}>
            Create stream
          </Button>
          {(isClosing() && highlightedStream) && (
            <div className="flex-row flex-center">
              <LoadingOutlined />
              <span className="ml-1">{t('streams.stream-detail.cta-disabled-closing')}</span>
            </div>
          )}
        </Space>
      </>
    );
  }

  const renderTreasuryList = (
    <>
    {treasuryList && treasuryList.length ? (
      treasuryList.map((item, index) => {
        const onStreamClick = () => {
          consoleOut('selected treasury:', item, 'blue');
          setSelectedTreasury(item);
          openTreasuryById(item.id as string);
          setDtailsPanelOpen(true);
        };
        return (
          <div key={`${index + 50}`} onClick={onStreamClick}
            className={`transaction-list-row ${selectedTreasury && selectedTreasury.id === item.id ? 'selected' : ''}`}>
            <div className="icon-cell">
              <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
            </div>
            <div className="description-cell">
              {item.label ? (
                <div className="title text-truncate">{item.label}</div>
              ) : (
                <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
              )}
              {item.createdOnUtc && (
                <div className="subtitle text-truncate">{dateFormat(item.createdOnUtc, SIMPLE_DATE_TIME_FORMAT)}</div>
              )}
            </div>
            <div className="rate-cell text-center">
              {item.upgradeRequired ? (
                <span>&nbsp;</span>
              ) : (
                <>
                <div className="rate-amount">
                  {/* <span className="badge small error text-uppercase">missing</span> */}
                  {formatThousands(item.streamsAmount)}
                </div>
                <div className="interval">streams</div>
                </>
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
          ? t('treasuries.treasury-list.no-treasuries')
          : t('treasuries.treasury-list.not-connected')}</p>} />
        </div>
      )}
      </>
    )}

    </>
  );

  return (
    <>
      <div className="container main-container">

        {isLocal() && (
          <div className="debug-bar">
            <span className="ml-1">Treasury type:</span><span className="ml-1 font-bold fg-dark-active">
              {treasuryOption
                ? `${treasuryOption.type} = ${treasuryOption.type === TreasuryType.Open ? 'Open' : 'Locked'}`
                : '-'}
            </span>
          </div>
        )}

        <div className="interaction-area">

          <div className={`meanfi-two-panel-layout ${detailsPanelOpen ? 'details-open' : ''}`}>

            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('treasuries.screen-title')}</span>
                <Tooltip placement="bottom" title={t('treasuries.refresh-tooltip')}>
                  <div className={`transaction-stats ${loadingTreasuries ? 'click-disabled' : 'simplelink'}`} onClick={onRefreshTreasuriesClick}>
                    <Spin size="small" />
                    {customStreamDocked ? (
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
                    ) : (
                      <span className="transaction-legend">
                        <span className="incoming-transactions-amout">({formatThousands(treasuryList.length)})</span>
                      </span>
                    )}
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  <Spin spinning={loadingTreasuries}>
                    {renderTreasuryList}
                  </Spin>
                </div>
                <div className="bottom-ctas">
                  {customStreamDocked ? (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCancelCustomTreasuryClick}>
                        {t('treasuries.back-to-treasuries-cta')}
                      </Button>
                    </div>
                  ) : (
                    <div className="create-stream">
                      <Button
                        block
                        type="primary"
                        shape="round"
                        disabled={!connected}
                        onClick={onCreateTreasuryClick}>
                        {connected
                          ? t('treasuries.create-new-treasury-cta')
                          : t('transactions.validation.not-connected')
                        }
                      </Button>
                    </div>
                  )}
                  {(!customStreamDocked && connected) && (
                    <div className="open-stream">
                      <Tooltip title={t('treasuries.lookup-treasury-cta-tooltip')}>
                        <Button
                          shape="round"
                          type="text"
                          size="small"
                          className="ant-btn-shaded"
                          onClick={showOpenTreasuryModal}
                          icon={<SearchOutlined />}>
                        </Button>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="meanfi-panel-heading"><span className="title">{t('treasuries.treasury-detail-heading')}</span></div>

              <div className="inner-container">
                {connected ? (
                  <>
                    <div className={`stream-details-data-wrapper vertical-scroll ${(loadingTreasuries || loadingTreasuryDetails || !treasuryDetails) ? 'h-100 flex-center' : ''}`}>
                      <Spin spinning={loadingTreasuries || loadingTreasuryDetails}>
                        {treasuryDetails && (
                          <>
                            {renderTreasuryMeta()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderCtaRow()}
                            <Divider className="activity-divider" plain></Divider>
                            {renderTreasuryStreams()}
                          </>
                        )}
                      </Spin>
                      {(!loadingTreasuries && !loadingTreasuryDetails && !loadingTreasuryStreams) && (
                        <>
                        {(!treasuryList || treasuryList.length === 0) && !treasuryDetails && (
                          <div className="h-100 flex-center">
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-detail.no-treasury-loaded')}</p>} />
                          </div>
                        )}
                        </>
                      )}
                    </div>
                    {treasuryDetails && (
                      <div className="stream-share-ctas">
                        <span className="copy-cta" onClick={() => onCopyTreasuryAddress(treasuryDetails.id)}>TREASURY ID: {treasuryDetails.id}</span>
                        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
                          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${treasuryDetails.id}${getSolanaExplorerClusterParam()}`}>
                          <IconExternalLink className="mean-svg-icons" />
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{t('treasuries.treasury-list.not-connected')}</p>} />
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>

      <TreasuryOpenModal
        isVisible={isOpenTreasuryModalVisible}
        handleOk={onAcceptOpenTreasury}
        handleClose={closeOpenTreasuryModal}
      />

      <TreasuryCreateModal
        isVisible={isCreateTreasuryModalVisible}
        handleOk={onAcceptCreateTreasury}
        handleClose={closeCreateTreasuryModal}
        isBusy={isBusy}
      />

      <TreasuryCloseModal
        isVisible={isCloseTreasuryModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        nativeBalance={nativeBalance}
        treasuryDetails={treasuryDetails}
        handleOk={onAcceptCloseTreasury}
        handleClose={hideCloseTreasuryModal}
        content={getTreasuryClosureMessage()}
        transactionStatus={transactionStatus.currentOperation}
        isBusy={isBusy}
      />

      {isCloseStreamModalVisible && (
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={highlightedStream}
          handleOk={onAcceptCloseStream}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()}
          canCloseTreasury={numTreasuryStreams() === 1 ? true : false}
        />
      )}

      <StreamPauseModal
        isVisible={isPauseStreamModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptPauseStream}
        handleClose={hidePauseStreamModal}
        content={getStreamPauseMessage()}
      />

      <StreamResumeModal
        isVisible={isResumeStreamModalVisible}
        transactionFees={transactionFees}
        tokenBalance={tokenBalance}
        streamDetail={highlightedStream}
        handleOk={onAcceptResumeStream}
        handleClose={hideResumeStreamModal}
        content={getStreamResumeMessage()}
      />

      {isAddFundsModalVisible && (
        <TreasuryAddFundsModal
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
          isVisible={isAddFundsModalVisible}
          userBalances={userBalances}
          streamStats={streamStats}
          treasuryStreams={treasuryStreams}
          associatedToken={treasuryDetails ? treasuryDetails.associatedTokenAddress as string : ''}
          isBusy={isBusy}
        />
      )}

      {isCreateStreamModalVisible && (
        <TreasuryStreamCreateModal
          associatedToken={treasuryDetails ? treasuryDetails.associatedTokenAddress as string : ''}
          connection={connection}
          handleClose={closeCreateStreamModal}
          handleOk={onAcceptCreateStream}
          isVisible={isCreateStreamModalVisible}
          moneyStreamingClient={ms}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          treasuryDetails={treasuryDetails}
          userBalances={userBalances}
        />
      )}

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isCloseStreamTransactionModalVisible}
        afterClose={onAfterCloseStreamTransactionModalClosed}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideCloseStreamTransactionModal}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation)}</h4>
              {/* TODO: Conditional output based on OperationType */}
              {/* <h5 className="operation">{t('transactions.status.tx-close-operation')}</h5> */}
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
                onClick={() => lastSentTxOperationType === OperationType.StreamPause
                  ? onPauseStreamTransactionFinished()
                  : lastSentTxOperationType === OperationType.StreamResume
                    ? onResumeStreamTransactionFinished()
                    : lastSentTxOperationType === OperationType.StreamClose
                      ? onCloseStreamTransactionFinished()
                      : hideCloseStreamTransactionModal()}>
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

      <PreFooter />
    </>
  );

};
