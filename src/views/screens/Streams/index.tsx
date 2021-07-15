import { useCallback, useContext, useEffect, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin, Dropdown, Menu } from "antd";
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  EllipsisOutlined,
  ExclamationCircleOutlined,
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
  IconPause,
  IconShare,
  IconUpload,
} from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming, StreamActivity, StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, isValidNumber, shortenAddress } from "../../../utils/utils";
import { copyText, getFormattedNumberToLocale, getIntervalFromSeconds, getTransactionOperationDescription } from "../../../utils/ui";
import { ContractSelectorModal } from '../../../components/ContractSelectorModal';
import { OpenStreamModal } from '../../../components/OpenStreamModal';
import { WithdrawModal } from '../../../components/WithdrawModal';
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../../constants";
import _ from "lodash";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../../contexts/connection";
import { Commitment, PublicKey, Transaction } from "@solana/web3.js";
import { TransactionStatus } from "../../../models/enums";
import { notify } from "../../../utils/notifications";
import { AddFundsModal } from "../../../components/AddFundsModal";

var dateFormat = require("dateformat");

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const Streams = () => {
  const connectionConfig = useConnectionConfig();
  const connection = useConnection();
  const { connected, wallet, publicKey } = useWallet();
  const {
    streamList,
    streamDetail,
    streamActivity,
    detailsPanelOpen,
    transactionStatus,
    streamProgramAddress,
    setCurrentScreen,
    setStreamDetail,
    setSelectedStream,
    refreshStreamList,
    setTransactionStatus,
    openStreamById,
    setDtailsPanelOpen
  } = useContext(AppStateContext);
  const { confirm } = Modal;

  useEffect(() => {
    if (!connected) {
      setCurrentScreen("contract");
    } else {
      if (streamList && streamList.length === 0) {
        setCurrentScreen("contract");
      }
    }
  });

  // Live data calculation
  useEffect(() => {
    let updateDateTimer: any;

    const updateData = () => {
      if (streamDetail) {
        const clonedDetail = _.cloneDeep(streamDetail);

        const isStreaming = clonedDetail.streamResumedBlockTime >= clonedDetail.escrowVestedAmountSnapBlockTime ? 1 : 0;
        const lastTimeSnap = isStreaming === 1 ? clonedDetail.streamResumedBlockTime : clonedDetail.escrowVestedAmountSnapBlockTime;
        // const slot = await connection.getSlot(connection.commitment);
        // const currentBlockTime = await connection.getBlockTime(slot) as number;
        const currentBlockTime = Date.now() / 1000;

        const rate = clonedDetail.rateAmount / clonedDetail.rateIntervalInSeconds * isStreaming;
        const elapsedTime = currentBlockTime - lastTimeSnap;

        let escrowVestedAmount = 0;

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
    updateDateTimer = window.setInterval(() => {
      updateData();
    }, 200);

    // Return callback to run on unmount.
    return () => {
      if (updateDateTimer) {
        window.clearInterval(updateDateTimer);
      }
    };
  }, [connection, streamDetail, setStreamDetail]);

  useEffect(() => {
    const resizeListener = () => {
      var NUM_CHARS = 4;
      var ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
      for (var i = 0; i < ellipsisElements.length; ++i){
        var e = ellipsisElements[i] as HTMLElement;
        if (e.offsetWidth < e.scrollWidth){
          var text = e.textContent;
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
    setCurrentScreen("contract");
    closeContractSelectorModal();
  };

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (e: any) => {
    openStreamById(e);
    closeOpenStreamModal();
  };

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => setIsAddFundsModalVisibility(true), []);
  const closeAddFundsModal = useCallback(() => setIsAddFundsModalVisibility(false), []);
  const [addFundsAmount, setAddFundsAmount] = useState<number>(0);
  const onAcceptAddFunds = (amount: any) => {
    closeAddFundsModal();
    console.log('AddFunds amount:', parseFloat(amount));
    onExecuteAddFundsTransaction(amount);
  };

  // Withdraw funds modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => {
    setLastStreamDetail(streamDetail);
    setIsWithdrawModalVisibility(true)
  }, [streamDetail]);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const [lastStreamDetail, setLastStreamDetail] = useState<StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<number>(0);
  const onAcceptWithdraw = (amount: any) => {
    closeWithdrawModal();
    console.log('Withdraw amount:', parseFloat(amount));
    onExecuteWithdrawFundsTransaction(amount);
  };

  const isInboundStream = (item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }

  const isStreaming = (item: StreamInfo): boolean => {
    return item && item.escrowVestedAmount < (item.totalDeposits - item.totalWithdrawals) &&
           item.streamResumedBlockTime >= item.escrowVestedAmountSnapBlockTime
           ? true
           : false;
  }

  const getAmountWithSymbol = (amount: any, address?: string, onlyValue = false) => {
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
          <IconPause className="mean-svg-icons paused" />
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
          <IconPause className="mean-svg-icons paused" />
        );
      } else {
        return (
          <IconUpload className="mean-svg-icons outgoing" />
        );
      }
    }
  }

  const getShortDate = (date: string): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(localDate, "mm/dd/yyyy HH:MM TT");
  }

  const getReadableDate = (date: string): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return dateFormat(localDate, "ddd mmm dd yyyy HH:MM TT");
  }

  const getEscrowEstimatedDepletionUtcLabel = (date: Date): string => {
    const today = new Date();
    const miniDate = streamDetail && streamDetail.escrowEstimatedDepletionUtc
      ? getReadableDate(streamDetail.escrowEstimatedDepletionUtc.toString())
      : '';

    if (date > today) {
      return '(will run out today)';
    } else if (date < today) {
      return '';
    } else {
      return `(will run out by ${miniDate})`;
    }
  }

  const getTransactionTitle = (item: StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);
    if (isInbound) {
      if (item.isUpdatePending) {
        title = `Pending execution from (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `Paused stream from (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `Receiving from (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `Pending execution to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `Paused stream to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `Sending to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
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
        title = `This contract is pending your approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        if (streamStartDate > now) {
          title = `Set to receive money on`;
        } else {
          title = `Receiving money since`;
        }
        title += ` ${getShortDate(item.startUtc as string)}`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `This contract is pending beneficiary approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        if (streamStartDate > now) {
          title = `Set to start on`;
        } else {
          title = `Sending money since`;
        }
        title += ` ${getShortDate(item.startUtc as string)}`;
      }
    }
    return title;
  }

  const getStartDateLabel = (): string => {
    let label = 'Start Date';
    if (streamDetail) {
      const now = new Date().toUTCString();
      const nowUtc = new Date(now);
      const streamStartDate = new Date(streamDetail?.startUtc as string);
      if (streamStartDate > nowUtc) {
        label = 'Scheduled';
      } else {
        label = 'Started'
      }
    }
    return label;
  }

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const resetTransactionStatus = () => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = 'Executing transaction';
    } else {
      if (transactionStatus.lastOperation === TransactionStatus.Iddle &&
          transactionStatus.currentOperation === TransactionStatus.Iddle) {
        title = null;
      } else if (transactionStatus.lastOperation === TransactionStatus.TransactionFinished) {
        title = 'Transaction completed'
      } else {
        title = null;
      }
    }
    return title;
  }

  const isSuccess = () => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }

  const isError = () => {
    return transactionStatus.currentOperation === TransactionStatus.CreateTransactionFailure ||
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
    refreshStreamList();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    setCurrentScreen("streams");
  };

  const onAfterAddFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      refreshStreamList();
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
      setCurrentScreen("streams");
    }
  }

  const onExecuteAddFundsTransaction = async (addAmount: string) => {
    let transactions: Transaction[];
    let signedTransactions: Transaction[];
    let signatures: any[];

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey(streamDetail.treasuryAddress as string);
        const treasuryInfo = await moneyStream.getTreasury(treasury, connection.commitment as Commitment);
        const treasuryMintAddress = new PublicKey(treasuryInfo.treasuryMintAddress as string);
        const beneficiaryMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addAmount);
        setAddFundsAmount(amount);

        // Create a transaction
        return await moneyStream.addFunds(
          wallet,
          stream,
          beneficiaryMint,                                  // contributorMint
          beneficiaryMint,                                  // beneficiaryMint
          treasuryMintAddress,                              // treasuryMint
          amount
        )
        .then(value => {
          console.log('addFundsTransactions returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.CreateTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactions = value;
          return true;
        })
        .catch(error => {
          console.log('addFundsTransactions error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.CreateTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signAllTransactions(wallet, ...transactions)
        .then(signed => {
          console.log('signAllTransactions returned a signed transaction array:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransactions = signed;
          return true;
        })
        .catch(error => {
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
        return moneyStream.sendAllSignedTransactions(...signedTransactions)
          .then(sig => {
            console.log('sendAllSignedTransactions returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signatures = sig;
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
      return await moneyStream.confirmAllTransactions(signatures)
        .then(result => {
          console.log('confirmAllTransactions result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
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
    refreshStreamList();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    setCurrentScreen("streams");
  };

  const onAfterWithdrawFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      refreshStreamList();
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
      setCurrentScreen("streams");
    }
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey(streamDetail.beneficiaryAddress as string);
        const amount = parseFloat(withdrawAmount);
        setWithdrawFundsAmount(amount);

        // Create a transaction
        return await moneyStream.withdrawTransaction(
          stream,
          beneficiary,
          amount
        )
        .then(value => {
          console.log('withdrawTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.CreateTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('closeStreamTransaction error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.CreateTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransaction(wallet, transaction)
        .then(signed => {
          console.log('signTransaction returned a signed transaction array:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransaction = signed;
          return true;
        })
        .catch(error => {
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
        return moneyStream.sendSignedTransaction(signedTransaction)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
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
      return await moneyStream.confirmTransaction(signature)
        .then(result => {
          console.log('confirmTransaction result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
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
    refreshStreamList();
    hideWithdrawFundsTransactionModal();
    hideCloseStreamTransactionModal();
    hideAddFundsTransactionModal();
    setCurrentScreen("streams");
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      refreshStreamList();
      hideWithdrawFundsTransactionModal();
      hideCloseStreamTransactionModal();
      hideAddFundsTransactionModal();
      setCurrentScreen("streams");
    }
  }

  const onExecuteCloseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint, streamProgramAddress);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);
        // Create a transaction
        return await moneyStream.closeStreamTransaction(
          streamPublicKey,                                  // Stream ID
          publicKey as PublicKey                            // Initializer public key
        )
        .then(value => {
          console.log('closeStreamTransaction returned transaction:', value);
          // Stage 1 completed - The transaction is created and returned
          setTransactionStatus({
            lastOperation: TransactionStatus.CreateTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transaction = value;
          return true;
        })
        .catch(error => {
          console.log('closeStreamTransaction error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.CreateTransactionFailure
          });
          return false;
        });
      }
      return false;
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        console.log('Signing transaction...');
        return await moneyStream.signTransaction(wallet, transaction)
        .then(signed => {
          console.log('signTransaction returned a signed transaction:', signed);
          // Stage 2 completed - The transaction was signed
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          signedTransaction = signed;
          return true;
        })
        .catch(error => {
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
        return moneyStream.sendSignedTransaction(signedTransaction)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
            // Stage 3 completed - The transaction was sent and a signature was returned
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
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
      return await moneyStream.confirmTransaction(signature)
        .then(result => {
          console.log('confirmTransaction result:', result);
          // Stage 4 completed - The transaction was confirmed!
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return true;
        })
        .catch(error => {
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

  const getStreamClosureMessage = (): string => {
    let message = '';

    if (publicKey && streamDetail && streamList) {

      const me = publicKey.toBase58();
      const treasury = streamDetail.treasuryAddress;
      const treasurer = streamDetail.treasurerAddress;
      const beneficiary = streamDetail.beneficiaryAddress;
      const withdrawAmount = getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string);
      // TODO: Account for multiple beneficiaries funded by the same treasury (only 1 right now)
      const numTreasuryBeneficiaries = 1; // streamList.filter(s => s.treasurerAddress === me && s.treasuryAddress === treasury).length;

      if (treasurer === me) {  // If I am the treasurer
        if (numTreasuryBeneficiaries > 1) {
          message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (${shortenAddress(beneficiary as string)}), and return the unvested amounts back to the original treasury (${shortenAddress(treasury as string)}).\nAre you sure you want to do this?`
        } else {
          message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (${shortenAddress(beneficiary as string)}), and return the unvested amount back to the contributor.\nAre you sure you want to do this?`
        }
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = `Closing a stream will send ~${withdrawAmount} to your account (${shortenAddress(beneficiary)}) and stop the flow of money immediately.\nAre you sure you want to do this?`;
      }

    }
    // If ( I am the treasurer )
    // {
    //   If ( Number of Beneficiaries benefiting from Treasury > 1 )
    //   {
    //     message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (AB5…HYU89), and return the unvested amounts back to the original treasury (TR3…SU81). Are you sure you want to do this?`
    //   }
    //   else
    //   {
    //     message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (AB5…HYU89), and return the unvested amount back to the contributor (HnH…B4CF). Are you sure you want to do this?`
    //   }
    // }
    // Else if ( I am the beneficiary )
    // {
    //   message = Closing a stream will send ~$66.98 to your account (AC4…UIUI8) and stop the flow of money immediately. Are you sure you want to do this?
    // }

    return message;
  }

  const showCloseStreamConfirm = () => {
    confirm({
      title: 'Close stream',
      icon: <ExclamationCircleOutlined />,
      content: getStreamClosureMessage(),
      okText: 'CLOSE STREAM',
      okType: 'danger',
      cancelText: 'CANCEL',
      onOk() {
        onExecuteCloseStreamTransaction();
      },
      onCancel() {},
    });
  }

  const onCopyStreamAddress = (data: any) => {
    if (copyText(data.toString())) {
      notify({
        message: "Copy to Clipboard",
        description: "Stream address successfully copied",
      });
    } else {
      notify({
        message: "Copy to Clipboard",
        description: "Could not copy stream Address",
      });
    }
  }

  const isOtp = (): boolean => {
    return streamDetail?.rateAmount === 0 ? true : false;
  }

  const isAddressMyAccount = (addr: string): Boolean => {
    return wallet && addr && addr === wallet.publicKey.toBase58()
           ? true
           : false;
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

  const getActivityActionDescription = (item: StreamActivity): string => {
    let who = '';
    who = isAddressMyAccount(item.initializer) ? 'You' : shortenAddress(item.initializer);
    const amount = getAmountWithSymbol(item.amount, item.mint);
    return `${who} ${item.action} ${amount}`;
  }

  const menu = (
    <Menu>
      <Menu.Item key="1" onClick={showCloseStreamConfirm}>
        <span className="menu-item-text">Close money stream</span>
      </Menu.Item>
    </Menu>
  );

  const renderInboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconDownload className="mean-svg-icons incoming" />
    </div>
    <div className="stream-details-data-wrapper">

      <div className="stream-fields-container">
        {streamDetail && streamDetail.isStreaming && isStreaming(streamDetail) ? (
          <div className="stream-background">
            <img className="inbound" src="assets/incoming-crypto.svg" alt="" />
          </div>
          ) : null
        }

        {/* Sender */}
        <Row className="mb-3">
          <Col span={12}>
            <div className="info-label">Receiving from</div>
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
              <div className="info-label">Payment Rate</div>
              <div className="transaction-detail-row">
                <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.rateAmount, streamDetail.associatedToken as string)
                    : '--'
                  }
                  {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
                </span>
              </div>
              </>
            )}
          </Col>
        </Row>

        {/* Started date */}
        <div className="mb-3">
          <div className="info-label">Started</div>
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
            <div className="info-label text-truncate">Funds left in account {streamDetail
              ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
              : ''}
            </div>
            <div className="transaction-detail-row">
              <span className="info-icon">
                <IconBank className="mean-svg-icons" />
              </span>
              {/* {streamDetail ? (
                <span className="info-data">
                  {streamDetail.isStreaming && streamDetail.escrowUnvestedAmount > 0
                  ? (
                    <>
                    <CountUp
                      delay={0}
                      duration={500}
                      decimals={getTokenDecimals(streamDetail.associatedToken as string)}
                      start={previousStreamDetail?.escrowUnvestedAmount || 0}
                      end={streamDetail?.escrowUnvestedAmount || 0} />
                    <span>{getTokenSymbol(streamDetail.associatedToken as string)}</span>
                    </>
                  )
                  : getAmountWithSymbol(streamDetail.escrowUnvestedAmount, streamDetail.associatedToken as string)
                  }
                </span>
              ) : (
                <span className="info-data">&nbsp;</span>
              )} */}
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

        {/* Amount withdrawn */}
        <div className="mb-3">
          <div className="info-label">Total amount you have withdrawn since stream started</div>
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
          <div className="info-label">Funds available to withdraw now</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconUpload className="mean-svg-icons" />
            </span>
            {/* {streamDetail ? (
              <span className="info-data large">
                {streamDetail.isStreaming && streamDetail.escrowUnvestedAmount > 0
                ? (
                  <>
                  <CountUp
                    delay={0}
                    duration={500}
                    decimals={getTokenDecimals(streamDetail.associatedToken as string)}
                    start={previousStreamDetail?.escrowVestedAmount || 0}
                    end={streamDetail?.escrowVestedAmount || 0} />
                  <span>{getTokenSymbol(streamDetail.associatedToken as string)}</span>
                  </>
                )
                : getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
                }
              </span>
            ) : (
              <span className="info-data large">&nbsp;</span>
            )} */}
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

        {/* Withdraw button */}
        <div className="mt-3 mb-3 withdraw-container">
          <Button
            block
            className="withdraw-cta"
            type="text"
            shape="round"
            size="small"
            disabled={!streamDetail ||
                      !streamDetail.escrowVestedAmount ||
                      publicKey?.toBase58() !== streamDetail.beneficiaryAddress}
            onClick={showWithdrawModal}>
            Withdraw funds
          </Button>
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
        </div>
      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>No activity so far.</p>
      ) : (
        <div className="activity-list">
          {streamActivity.map((item, index) => {
            return (
              <a key={`${index}`} className="activity-list-row" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                <div className="activity-highlight">
                  <div className="icon-cell">
                    {getActivityIcon(item)}
                  </div>
                  <div className="description-cell text-truncate">
                    {getActivityActionDescription(item)}
                  </div>
                </div>
                <div className="date-cell">
                  {getShortDate(item.utcDate as string)}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
    {streamDetail && (
      <div className="stream-share-ctas">
        <span className="copy-cta overflow-ellipsis-middle" onClick={() => onCopyStreamAddress(streamDetail.id)}>{streamDetail.id}</span>
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
    <div className="stream-details-data-wrapper">

      <div className="stream-fields-container">
        {streamDetail && streamDetail.isStreaming && isStreaming(streamDetail) ? (
          <div className="stream-background">
            <img className="inbound" src="assets/outgoing-crypto.svg" alt="" />
          </div>
          ) : null
        }

        {/* Beneficiary */}
        <Row className="mb-3">
          <Col span={12}>
            <div className="info-label">Sending to</div>
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
              <div className="info-label">Payment Rate</div>
              <div className="transaction-detail-row">
                <span className="info-data">
                  {streamDetail
                    ? getAmountWithSymbol(streamDetail.rateAmount, streamDetail.associatedToken as string)
                    : '--'
                  }
                  {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
                </span>
              </div>
              </>
            )}
          </Col>
        </Row>

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
            <div className="info-label">Total amount you have deposited since stream started</div>
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
        <div className="mb-3">
          <div className="info-label">Funds sent to recepient</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconUpload className="mean-svg-icons" />
            </span>
            {/* {streamDetail ? (
              <span className="info-data">
                {streamDetail.isStreaming && streamDetail.escrowUnvestedAmount > 0
                ? (
                  <>
                  <CountUp
                    delay={0}
                    duration={500}
                    decimals={getTokenDecimals(streamDetail.associatedToken as string)}
                    start={previousStreamDetail?.escrowVestedAmount || 0}
                    end={streamDetail?.escrowVestedAmount || 0} />
                  <span>{getTokenSymbol(streamDetail.associatedToken as string)}</span>
                  </>
                )
                : getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
                }
              </span>
            ) : (
              <span className="info-data">&nbsp;</span>
            )} */}
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

        {/* Funds left (Total Unvested) */}
        {isOtp() ? (
          null
        ) : (
          <div className="mb-3">
            <div className="info-label text-truncate">{streamDetail && !streamDetail?.escrowUnvestedAmount
              ? `Funds left in account`
              : `Funds left in account (will run out by ${streamDetail && streamDetail.escrowEstimatedDepletionUtc
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

        {/* Top up (add funds) */}
        {isOtp() ? (
          null
        ) : (
          <div className="mt-3 mb-3 withdraw-container">
            <Button
              block
              className="withdraw-cta"
              type="text"
              shape="round"
              size="small"
              onClick={showAddFundsModal}>
              Top up (add funds)
            </Button>
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
          </div>
        )}

      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>No activity so far.</p>
      ) : (
        <div className="activity-list">
          {streamActivity.map((item, index) => {
            return (
              <a key={`${index}`} className="activity-list-row" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                <div className="activity-highlight">
                  <div className="icon-cell">
                    {getActivityIcon(item)}
                  </div>
                  <div className="description-cell text-truncate">
                    {getActivityActionDescription(item)}
                  </div>
                </div>
                <div className="date-cell">
                  {getShortDate(item.utcDate as string)}
                </div>
              </a>
            );
          })}
        </div>
      )}

    </div>
    {streamDetail && (
      <div className="stream-share-ctas">
        <span className="copy-cta overflow-ellipsis-middle" onClick={() => onCopyStreamAddress(streamDetail.id)}>{streamDetail.id}</span>
        <a className="explorer-cta" target="_blank" rel="noopener noreferrer"
           href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamDetail.id}${getSolanaExplorerClusterParam()}`}>
          <IconExternalLink className="mean-svg-icons" />
        </a>
      </div>
    )}
  </>
  );

  return (
    <div className={`streams-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
      {/* Left / top panel*/}
      <div className="streams-container">
        <div className="streams-heading">My Money Streams</div>
        <div className="inner-container">
          {/* item block */}
          <div className="item-block vertical-scroll">
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
                        {item && item.rateAmount && isValidNumber(item.rateAmount.toString())
                          ? getFormattedNumberToLocale(formatAmount(item.rateAmount, 2))
                          : '--'}
                        &nbsp;
                        {item && item.associatedToken ? getTokenSymbol(item.associatedToken as string) : ''}
                      </div>
                      <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds)}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <>
              <p>No streams available</p>
              </>
            )}
          </div>
          {/* Bottom CTA */}
          <div className="bottom-ctas">
            <div className="create-stream">
              <Button
                block
                type="primary"
                shape="round"
                size="small"
                onClick={showContractSelectorModal}>
                Create new money stream
              </Button>
            </div>
            <div className="open-stream">
              <Button
                shape="round"
                type="text"
                size="small"
                className="ant-btn-shaded"
                onClick={showOpenStreamModal}
                icon={<SearchOutlined />}>
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Right / down panel */}
      <div className="stream-details-container">
        <Divider className="streams-divider" plain></Divider>
        <div className="streams-heading">Stream details</div>
        <div className="inner-container">
          {connected && streamDetail ? (
            <>
            {isInboundStream(streamDetail) ? renderInboundStream : renderOutboundStream}
            </>
          ) : (
            <p>Please select a stream to view details</p>
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
      <AddFundsModal
        isVisible={isAddFundsModalVisible}
        handleOk={onAcceptAddFunds}
        handleClose={closeAddFundsModal} />
      <WithdrawModal
        startUpData={lastStreamDetail}
        isVisible={isWithdrawModalVisible}
        handleOk={onAcceptWithdraw}
        handleClose={closeWithdrawModal} />
      {/* Add funds transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterAddFundsTransactionModalClosed}
        visible={isAddFundsTransactionModalVisible}
        title={getTransactionModalTitle()}
        onCancel={hideAddFundsTransactionModal}
        width={280}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{`Add ${getAmountWithSymbol(addFundsAmount, streamDetail?.associatedToken as string)}`}</h5>
              <div className="indication">Confirm this transaction in your wallet</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">Funds withdrawn successfuly!</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onAddFundsTransactionFinished}>
                Finish
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideAddFundsTransactionModal}>
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">Working, please wait...</h4>
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
        title={getTransactionModalTitle()}
        onCancel={hideWithdrawFundsTransactionModal}
        width={280}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">{`Withdraw ${getAmountWithSymbol(withdrawFundsAmount, streamDetail?.associatedToken as string)}`}</h5>
              <div className="indication">Confirm this transaction in your wallet</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">Funds withdrawn successfuly!</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onWithdrawFundsTransactionFinished}>
                Finish
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideWithdrawFundsTransactionModal}>
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">Working, please wait...</h4>
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
        title={getTransactionModalTitle()}
        onCancel={hideCloseStreamTransactionModal}
        width={280}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus)}</h4>
              <h5 className="operation">Close stream operation</h5>
              <div className="indication">Confirm this transaction in your wallet</div>
            </>
          ) : isSuccess() ? (
            <>
              <CheckOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-1 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <p className="operation">Stream successfully closed!</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onCloseStreamTransactionFinished}>
                Finish
              </Button>
            </>
          ) : isError() ? (
            <>
              <WarningOutlined style={{ fontSize: 48 }} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">{getTransactionOperationDescription(transactionStatus)}</h4>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={hideCloseStreamTransactionModal}>
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-4 text-uppercase">Working, please wait...</h4>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
