import React from 'react';
import { useCallback, useContext, useEffect, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin, Dropdown, Menu, Tooltip } from "antd";
import {
  ArrowDownOutlined,
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
  IconUpload,
} from "../../Icons";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import {
  formatAmount,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  shortenAddress
} from "../../utils/utils";
import {
  consoleOut,
  copyText,
  getFormattedNumberToLocale,
  getIntervalFromSeconds,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTxFeeAmount,
} from "../../utils/ui";
import { ContractSelectorModal } from '../../components/ContractSelectorModal';
import { OpenStreamModal } from '../../components/OpenStreamModal';
import { WithdrawModal } from '../../components/WithdrawModal';
import {
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  VERBOSE_DATE_FORMAT,
  VERBOSE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
  WRAPPED_SOL_MINT_ADDRESS,
} from "../../constants";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../contexts/connection";
import { LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TransactionStatus } from "../../models/enums";
import { notify } from "../../utils/notifications";
import { AddFundsModal } from "../../components/AddFundsModal";
import { TokenInfo } from "@solana/spl-token-registry";
import { CloseStreamModal } from "../../components/CloseStreamModal";
import { useNativeAccount } from "../../contexts/accounts";
import { MSP_ACTIONS, StreamActivity, StreamInfo, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees, getStream } from "money-streaming/lib/utils";
import { MoneyStreaming } from "money-streaming/lib/money-streaming";
import { useTranslation } from "react-i18next";
import { defaultStreamStats, StreamStats } from "../../models/streams";

const dateFormat = require("dateformat");

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const Streams = () => {
  const connectionConfig = useConnectionConfig();
  const connection = useConnection();
  const { connected, wallet, publicKey } = useWallet();
  const {
    streamList,
    streamDetail,
    selectedToken,
    loadingStreams,
    loadingStreamActivity,
    streamActivity,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    customStreamDocked,
    setSelectedToken,
    setCurrentScreen,
    setStreamDetail,
    setSelectedStream,
    refreshStreamList,
    setTransactionStatus,
    openStreamById,
    setDtailsPanelOpen,
    refreshTokenBalance,
    setCustomStreamDocked
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);

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

    const updateData = async () => {
      if (streamDetail && streamDetail.escrowUnvestedAmount) {

        if (isStreamScheduled(streamDetail.startUtc as string)) {
          return;
        }

        const clonedDetail = Object.assign({}, streamDetail);
        const isStreaming = clonedDetail.streamResumedBlockTime >= clonedDetail.escrowVestedAmountSnapBlockTime ? 1 : 0;
        const lastTimeSnap = isStreaming === 1 ? clonedDetail.streamResumedBlockTime : clonedDetail.escrowVestedAmountSnapBlockTime;
        let escrowVestedAmount = 0.0;
        let rateAmount = clonedDetail.rateAmount;
        let rateIntervalInSeconds = clonedDetail.rateIntervalInSeconds;

        if (rateIntervalInSeconds === 0) {
          rateIntervalInSeconds = 1;
        }

        let rate = rateAmount && rateIntervalInSeconds ? (rateAmount / rateIntervalInSeconds * isStreaming) : 0;

        if (rateAmount === 0) {
            rateAmount = clonedDetail.totalDeposits - clonedDetail.totalWithdrawals;
            rate = rateAmount && rateIntervalInSeconds ? (rateAmount / rateIntervalInSeconds) : 0;
        }

        const slot = await connection.getSlot();
        const currentBlockTime = await connection.getBlockTime(slot) as number;
        const elapsedTime = currentBlockTime - lastTimeSnap;
        if (currentBlockTime >= lastTimeSnap) {
          escrowVestedAmount = clonedDetail.escrowVestedAmountSnap + rate * elapsedTime;
          if (escrowVestedAmount >= clonedDetail.totalDeposits - clonedDetail.totalWithdrawals) {
            escrowVestedAmount = clonedDetail.totalDeposits - clonedDetail.totalWithdrawals;
          }
        }

        clonedDetail.escrowVestedAmount = escrowVestedAmount;
        clonedDetail.escrowUnvestedAmount = clonedDetail.totalDeposits - clonedDetail.totalWithdrawals - escrowVestedAmount;
        setStreamDetail(clonedDetail);
      }
    };

    // Install the timer
    const updateDateTimer = window.setInterval(() => {
      updateData();
    }, 1000);

    // Return callback to run on unmount.
    return () => {
      if (updateDateTimer) {
        window.clearInterval(updateDateTimer);
      }
    };
  }, [
    connection,
    streamDetail,
    setStreamDetail
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

  // Contract switcher modal
  const [isContractSelectorModalVisible, setIsContractSelectorModalVisibility] = useState(false);
  const showContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(true), []);
  const closeContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(false), []);
  const onAcceptContractSelector = () => {
    setCurrentScreen('contract');
    setCustomStreamDocked(false);
    closeContractSelectorModal();
  };

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
      setTransactionFees(value);
      setIsCloseStreamModalVisibility(true)
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFees]);
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

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    const token = getTokenByMintAddress(streamDetail?.associatedToken as string)
    console.log("selected token:", token?.symbol);
    if (token) {
      setOldSelectedToken(selectedToken);
      setSelectedToken(token);
    }
    getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
      setTransactionFees(value);
      setIsAddFundsModalVisibility(true)
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [
    selectedToken,
    streamDetail,
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
    console.log('AddFunds amount:', parseFloat(amount));
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
          console.log('detail', detail);
          setLastStreamDetail(detail);
          getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
            setTransactionFees(value);
            setIsWithdrawModalVisibility(true)
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
        console.log(error);
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
    getTransactionFees
  ]);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const [lastStreamDetail, setLastStreamDetail] = useState<StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<number>(0);

  const onAcceptWithdraw = (amount: any) => {
    closeWithdrawModal();
    console.log('Withdraw amount:', parseFloat(amount));
    onExecuteWithdrawFundsTransaction(amount);
  };

  const isInboundStream = useCallback((item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }, [publicKey]);

  const isStreaming = (item: StreamInfo): boolean => {
    return item && item.escrowVestedAmount < (item.totalDeposits - item.totalWithdrawals) &&
           item.streamResumedBlockTime >= item.escrowVestedAmountSnapBlockTime
           ? true
           : false;
  }

  const isAuthority = (): boolean => {
    return streamDetail && wallet && wallet.publicKey &&
           (streamDetail.treasurerAddress === wallet.publicKey.toBase58() ||
            streamDetail?.beneficiaryAddress === wallet.publicKey.toBase58())
           ? true : false;
  }

  const getAmountWithSymbol = (amount: number, address?: string, onlyValue = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address || '', onlyValue);
  }

  const getStreamIcon = (item: StreamInfo) => {
    const isInbound = isInboundStream(item);

    if (isInbound) {
      if (item.isUpdatePending) {
        return (
          <IconDocument className="mean-svg-icons pending" />
        );
      } else if (!item.isStreaming) {
        return (
          <IconIncomingPaused className="mean-svg-icons incoming" />
        );
      } else {
        return (
          <IconDownload className="mean-svg-icons incoming" />
        );
      }
    } else {
      if (item.isUpdatePending) {
        return (
          <IconDocument className="mean-svg-icons pending" />
        );
      } else if (!item.isStreaming) {
        return (
          <IconOutgoingPaused className="mean-svg-icons outgoing" />
        );
      } else {
        return (
          <IconUpload className="mean-svg-icons outgoing" />
        );
      }
    }
  }

  const getShortDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
    );
  }

  const getReadableDate = (date: string, includeTime = false): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(
      localDate,
      includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT
    );
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

  const getTransactionTitle = (item: StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);

    if (isInbound) {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `${t('streams.stream-list.title-pending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      }
    }
    return title;
  }

  const getTransactionSubTitle = (item: StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);
    const now = new Date();
    const streamStartDate = new Date(item.startUtc as string);
    if (isInbound) {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-inbound');
      } else if (!item.isStreaming) {
        title = t('streams.stream-list.subtitle-paused-inbound');
      } else {
        if (streamStartDate > now) {
          title = t('streams.stream-list.subtitle-scheduled-inbound');
        } else {
          title = t('streams.stream-list.subtitle-running-inbound');
        }
        title += ` ${getShortDate(item.startUtc as string)}`;
      }
    } else {
      if (item.isUpdatePending) {
        title = t('streams.stream-list.subtitle-pending-outbound');
      } else if (!item.isStreaming) {
        title = t('streams.stream-list.subtitle-paused-outbound');
      } else {
        if (streamStartDate > now) {
          title = t('streams.stream-list.subtitle-scheduled-outbound');
        } else {
          title = t('streams.stream-list.subtitle-running-outbound');
        }
        title += ` ${getShortDate(item.startUtc as string)}`;
      }
    }
    return title;
  }

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

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
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

  // Add funds Transaction execution modal
  const [isAddFundsTransactionModalVisible, setAddFundsTransactionModalVisibility] = useState(false);
  const showAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(true), []);
  const hideAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(false), []);

  const onAddFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    if (customStreamDocked) {
      openStreamById(streamDetail?.id as string);
    } else {
      refreshStreamList(false);
    }
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
  }

  const onExecuteAddFundsTransaction = async (addAmount: string) => {
    let transactions: Transaction[];
    let signedTransactions: Transaction[];
    let signatures: any[];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.env, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const contributorMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addAmount);
        setAddFundsAmount(amount);

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        const myFees = getTxFeeAmount(transactionFees, amount);
        if (nativeBalance < transactionFees.blockchainFee + myFees) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          return false;
        }

        // Create a transaction
        return await moneyStream.addFunds(
          wallet.publicKey,
          stream,
          contributorMint,                                  // contributorMint
          amount
        )
        .then(value => {
          console.log('addFundsTransactions returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactions = value;
          return true;
        })
        .catch(error => {
          console.log('addFundsTransactions error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransactions(wallet, transactions)
        .then(signed => {
          console.log('signTransactions returned a signed transaction array:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransactions = signed;
          return true;
        })
        .catch(() => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return connection.sendRawTransaction(signedTransactions[0].serialize(), { skipPreflight: true })
          .then(sig => {
            console.log('sendSignedTransactions returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signatures = [sig];
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await moneyStream.confirmTransactions(...signatures)
        .then(result => {
          console.log('confirmTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(() => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    if (wallet && streamDetail) {
      showAddFundsTransactionModal();
      const create = await createTx();
      console.log('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else { setIsBusy(false); }
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
    refreshStreamList(false);
  };

  const onAfterWithdrawFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      refreshStreamList(false);
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
    }
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
    let signedTransactions: Transaction[];
    let signatures: any[];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.env, streamProgramAddress);

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
          stream: stream,
          beneficiary: beneficiary,
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        const myFees = getTxFeeAmount(transactionFees, amount);
        if (nativeBalance < transactionFees.blockchainFee + myFees) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          return false;
        }

        // Create a transaction
        return await moneyStream.withdraw(
          stream,
          beneficiary,
          amount
        )
        .then(value => {
          console.log('withdrawTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('closeStreamTransaction error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransactions(wallet, [transaction])
        .then(signed => {
          console.log('signTransactions returned a signed transaction array:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransactions = signed;
          return true;
        })
        .catch(() => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return connection.sendRawTransaction(signedTransactions[0].serialize(), { skipPreflight: true })
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signatures = [sig];
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await moneyStream.confirmTransactions(...signatures)
        .then(result => {
          console.log('confirmTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(() => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    if (wallet) {
      showWithdrawFundsTransactionModal();
      const create = await createTx();
      console.log('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else { setIsBusy(false); }
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
    refreshStreamList(true);
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      refreshStreamList(true);
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
    }
  }

  const onExecuteCloseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.env, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);

        // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        const myFees = getTxFeeAmount(transactionFees);
        if (nativeBalance < transactionFees.blockchainFee + myFees) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure
          });
          return false;
        }

        // Create a transaction
        return await moneyStream.closeStream(
          streamPublicKey,                                  // Stream ID
          publicKey as PublicKey                            // Initializer public key
        )
        .then(value => {
          console.log('closeStream returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('closeStream error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransactions(wallet, [transaction])
        .then(signed => {
          console.log('signTransactions returned a signed transaction:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransaction = signed[0];
          return true;
        })
        .catch(() => {
          console.log('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          return false;
        });
      } else {
        console.log('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      if (wallet) {
        return connection.sendRawTransaction(signedTransaction.serialize(), { skipPreflight: true })
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig[0];
            return true;
          })
          .catch(error => {
            console.log(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            return false;
          });
      } else {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {
      return await moneyStream.confirmTransactions(signature)
        .then(result => {
          console.log('confirmTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(() => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          return false;
        });
    }

    if (wallet) {
      showCloseStreamTransactionModal();
      const create = await createTx();
      console.log('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        console.log('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          console.log('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            console.log('confirmed:', confirmed);
            if (confirmed) {
              // Save signature to the state
              setIsBusy(false);
            } else { setIsBusy(false); }
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
    if (item && item.rateAmount === 0 && item.totalDeposits > 0) {
      value += getFormattedNumberToLocale(formatAmount(item.totalDeposits, 2));
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

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={showCloseStreamModal} disabled={!isAuthority()}>
        <span className="menu-item-text">{t('streams.stream-detail.close-money-stream-menu-item')}</span>
      </Menu.Item>
    </Menu>
  );

  const renderInboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconDownload className="mean-svg-icons incoming" />
    </div>
    <div className="stream-details-data-wrapper vertical-scroll">

      <Spin spinning={loadingStreams}>
        <div className="stream-fields-container">
          {/* Background animation */}
          {streamDetail && streamDetail.isStreaming && isStreaming(streamDetail) && !isStreamScheduled(streamDetail.startUtc as string) ? (
            <div className="stream-background">
              <img className="inbound" src="assets/incoming-crypto.svg" alt="" />
            </div>
            ) : null
          }

          {/* Sender */}
          <Row className="mb-3">
            <Col span={12}>
              <div className="info-label">{t('streams.stream-detail.label-receiving-from')}</div>
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
                      ? getAmountWithSymbol(streamDetail.totalDeposits, streamDetail.associatedToken as string)
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
          ) : (
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
              <div className="mb-3">
                <div className="info-label">{t('streams.stream-detail.label-total-withdrawals')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconDownload className="mean-svg-icons" />
                  </span>
                  {streamDetail ? (
                    <span className="info-data">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.totalWithdrawals, streamDetail.associatedToken as string)
                      : '--'}
                    </span>
                  ) : (
                    <span className="info-data">&nbsp;</span>
                  )}
                </div>
              </div>

              {/* Funds available to withdraw now (Total Vested) */}
              <div className="mb-3">
                <div className="info-label">{t('streams.stream-detail.label-funds-available-to-withdraw')}</div>
                <div className="transaction-detail-row">
                  <span className="info-icon">
                    <IconUpload className="mean-svg-icons" />
                  </span>
                  {streamDetail ? (
                    <span className="info-data large">
                    {streamDetail
                      ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
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
              disabled={isScheduledOtp() || !streamDetail?.escrowVestedAmount || publicKey?.toBase58() !== streamDetail?.beneficiaryAddress}
              onClick={showWithdrawModal}>
              {t('streams.stream-detail.withdraw-funds-cta')}
            </Button>
            {!customStreamDocked && (
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
        <span className="copy-cta overflow-ellipsis-middle" onClick={() => onCopyStreamAddress(streamDetail.id)}>STREAM ID: {streamDetail.id}</span>
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
    <div className="stream-type-indicator">
      <IconUpload className="mean-svg-icons outgoing" />
    </div>
    <div className="stream-details-data-wrapper vertical-scroll">

      <Spin spinning={loadingStreams}>
        <div className="stream-fields-container">
          {/* Background animation */}
          {streamDetail && streamDetail.isStreaming && isStreaming(streamDetail) && !isStreamScheduled(streamDetail.startUtc as string) ? (
            <div className="stream-background">
              <img className="inbound" src="assets/outgoing-crypto.svg" alt="" />
            </div>
            ) : null
          }

          {/* Beneficiary */}
          <Row className="mb-3">
            <Col span={12}>
              <div className="info-label">{t('streams.stream-detail.label-sending-to')}</div>
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
                      ? getAmountWithSymbol(streamDetail.totalDeposits, streamDetail.associatedToken as string)
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
          ) : (
            <div className="mb-3">
              <div className="info-label">{t('streams.stream-detail.label-total-deposits')}</div>
              <div className="transaction-detail-row">
                <span className="info-icon">
                  <IconDownload className="mean-svg-icons" />
                </span>
                {streamDetail ? (
                  <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.totalDeposits, streamDetail.associatedToken as string)
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
                  <IconBank className="mean-svg-icons" />
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
              disabled={isOtp()}
              onClick={showAddFundsModal}>
              {t('streams.stream-detail.add-funds-cta')}
            </Button>
            {!customStreamDocked && (
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
        <span className="copy-cta overflow-ellipsis-middle" onClick={() => onCopyStreamAddress(streamDetail.id)}>STREAM ID: {streamDetail.id}</span>
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
          console.log('selected stream:', item);
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
              <div className="title text-truncate">{item.memo || getTransactionTitle(item)}</div>
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
      <p>{t('streams.stream-list.no-streams')}</p>
      </>
    )}

    </>
  );

  return (
    <div className={`streams-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
      {/* Left / top panel*/}
      <div className="streams-container">
        <div className="streams-heading">
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
                  size="small"
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
                  size="small"
                  onClick={showContractSelectorModal}>
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
      <div className="stream-details-container">
        <Divider className="streams-divider" plain></Divider>
        <div className="streams-heading"><span className="title">{t('streams.stream-detail.heading')}</span></div>
        <div className="inner-container">
          {connected && streamDetail ? (
            <>
            {isInboundStream(streamDetail) ? renderInboundStream : renderOutboundStream}
            </>
          ) : (
            <p>{t('streams.stream-detail.no-stream')}</p>
          )}
        </div>
      </div>
      <ContractSelectorModal
        isVisible={isContractSelectorModalVisible}
        handleOk={onAcceptContractSelector}
        handleClose={closeContractSelectorModal}/>
      <OpenStreamModal
        isVisible={isOpenStreamModalVisible}
        handleOk={onAcceptOpenStream}
        handleClose={closeOpenStreamModal} />
      <CloseStreamModal
        isVisible={isCloseStreamModalVisible}
        transactionFees={transactionFees}
        handleOk={onAcceptCloseStream}
        handleClose={hideCloseStreamModal}
        content={getStreamClosureMessage()} />
      <AddFundsModal
        isVisible={isAddFundsModalVisible}
        transactionFees={transactionFees}
        handleOk={onAcceptAddFunds}
        handleClose={closeAddFundsModal} />
      <WithdrawModal
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
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{t('transactions.status.tx-add-funds-operation')} {getAmountWithSymbol(addFundsAmount, streamDetail?.associatedToken as string)}</h5>
              <div className="indication">{t('transactions.status.instructions')}</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                      transactionFees.blockchainFee + getTxFeeAmount(transactionFees, addFundsAmount) - nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {getAmountWithSymbol(withdrawFundsAmount, streamDetail?.associatedToken as string)}</h5>
              <div className="indication">{t('transactions.status.instructions')}</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                      transactionFees.blockchainFee + getTxFeeAmount(transactionFees, withdrawFundsAmount) - nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{t('transactions.status.tx-close-operation')}</h5>
              <div className="indication">{t('transactions.status.instructions')}</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
                    accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                      nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`,
                    feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                      transactionFees.blockchainFee + getTxFeeAmount(transactionFees) - nativeBalance,
                      WRAPPED_SOL_MINT_ADDRESS,
                      true
                    )} SOL`})
                  }
                </h4>
              ) : (
                <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
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
  );

};
