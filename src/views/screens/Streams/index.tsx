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
  IconShare,
  IconUpload,
} from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming } from "../../../money-streaming/money-streaming";
import { getStream } from "../../../money-streaming/utils";
import { useWallet } from "../../../contexts/wallet";
import {
  formatAmount,
  getTokenAmountAndSymbolByTokenAddress,
  getTokenByMintAddress,
  getTokenSymbol,
  shortenAddress
} from "../../../utils/utils";
import {
  consoleOut,
  copyText,
  getFormattedNumberToLocale,
  getIntervalFromSeconds,
  getTransactionOperationDescription,
} from "../../../utils/ui";
import { ContractSelectorModal } from '../../../components/ContractSelectorModal';
import { OpenStreamModal } from '../../../components/OpenStreamModal';
import { WithdrawModal } from '../../../components/WithdrawModal';
import {
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  VERBOSE_DATE_FORMAT,
  VERBOSE_DATE_TIME_FORMAT,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
} from "../../../constants";
import _ from "lodash";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../../contexts/connection";
import { PublicKey, Transaction } from "@solana/web3.js";
import { TransactionStatus } from "../../../models/enums";
import { notify } from "../../../utils/notifications";
import { AddFundsModal } from "../../../components/AddFundsModal";
import { TokenInfo } from "@solana/spl-token-registry";
import { MSP_ACTIONS, StreamActivity, StreamInfo, TransactionFees } from "../../../money-streaming/types";
import { CloseStreamModal } from "../../../components/CloseStreamModal";
import { useNativeAccount } from "../../../contexts/accounts";
import { calculateActionFees } from "../../../money-streaming/utils";

var dateFormat = require("dateformat");

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
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [oldSelectedToken, setOldSelectedToken] = useState<TokenInfo>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });

  useEffect(() => {
    if (!connected) {
      setCurrentScreen("contract");
    } else {
      if (streamList && streamList.length === 0) {
        setCurrentScreen("contract");
      }
    }
  });

  useEffect(() => {
    if (account?.lamports !== previousBalance) {
      // Refresh token balance
      refreshTokenBalance();
      // Update previous balance
      setPreviousBalance(account.lamports);
    }
  }, [account, previousBalance, refreshTokenBalance]);

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  // Live data calculation
  useEffect(() => {
    let updateDateTimer: any;

    const updateData = () => {
      if (streamDetail) {
        const clonedDetail = _.cloneDeep(streamDetail);
        const isStreaming = clonedDetail.streamResumedBlockTime >= clonedDetail.escrowVestedAmountSnapBlockTime ? 1 : 0;
        const lastTimeSnap = isStreaming === 1 ? clonedDetail.streamResumedBlockTime : clonedDetail.escrowVestedAmountSnapBlockTime;
        const currentBlockTime = Date.now() / 1000;
        let rate = clonedDetail.rateAmount / clonedDetail.rateIntervalInSeconds * isStreaming;
        const elapsedTime = currentBlockTime - lastTimeSnap;
        let escrowVestedAmount = 0;
        let rateAmount = clonedDetail.rateAmount;
    
        if (rateAmount === 0) {
            rateAmount = clonedDetail.totalDeposits - clonedDetail.totalWithdrawals;
            rate = rateAmount / clonedDetail.rateIntervalInSeconds;
        }

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
  const onAcceptCloseStream = (e: any) => {
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
        const detail = await getStream(connection, streamPublicKey, 'finalized', true);
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
            message: "Error",
            description: `Could not find or load stream with ID ${shortenAddress(streamId as string, 10)}`,
            type: "error"
          });
        }
      } catch (error) {
        console.log(error);
        notify({
          message: "Error",
          description: (error),
          type: "error"
        });
      }
    } catch (error) {
      notify({
        message: "Error",
        description: 'Invalid stream id!',
        type: "error"
      });
    }
  }, [
    connection,
    streamDetail,
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

  const isInboundStream = (item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }

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
        if (isOtp()) {
          label = 'Scheduled delivery';
        } else {
          label = 'Scheduled';
        }
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
    return transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
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
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint, streamProgramAddress);

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

        // Create a transaction
        return await moneyStream.addFunds(
          wallet,
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
        return moneyStream.sendSignedTransactions(...signedTransactions)
          .then(sig => {
            console.log('sendSignedTransactions returned a signature:', sig);
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
      setCurrentScreen("streams");
    }
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
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
        return moneyStream.sendSignedTransactions(...signedTransactions)
          .then(sig => {
            console.log('sendSignedTransaction returned a signature:', sig);
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
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamDetail.id as string);
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
        return moneyStream.sendSignedTransactions(signedTransaction)
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

  const getStreamClosureMessage = () => {
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
          message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (${shortenAddress(beneficiary as string)}), and return the unvested amounts back to the original treasury (${shortenAddress(treasury as string)}).`
        } else {
          message = `Closing a stream will stop the flow of money, send the vested amount to the beneficiary (${shortenAddress(beneficiary as string)}), and return the unvested amount back to the contributor.`
        }
      } else if (beneficiary === me)  {  // If I am the beneficiary
        message = `Closing a stream will send ~${withdrawAmount} to your account (${shortenAddress(beneficiary)}) and stop the flow of money immediately.`;
      }

    }

    return (
      <div>
        {message}<br/><span>Are you sure you want to do this?</span>
      </div>
    );
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

  const isAddressMyAccount = (addr: string): Boolean => {
    return wallet && addr && wallet.publicKey && addr === wallet.publicKey.toBase58()
           ? true
           : false;
  }

  const getActivityActor = (item: StreamActivity): string => {
    return isAddressMyAccount(item.initializer) ? "You" : shortenAddress(item.initializer);
  }

  const getActivityAction = (item: StreamActivity): string => {
    const amount = getAmountWithSymbol(item.amount, item.mint);
    return `${item.action} ${amount}`;
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
        <span className="menu-item-text">Close money stream</span>
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

          {/* Amount for OTPs */}
          {isOtp() ? (
            <div className="mb-3">
              <div className="info-label">
                Amount&nbsp;(funded on {getReadableDate(streamDetail?.fundedOnUtc as string)})
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
              <div className="info-label text-truncate">Funds left in account {streamDetail
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
              Withdraw funds
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
      <div className="activity-title">Activity</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>No activity so far.</p>
      ) : (
        <div className="activity-list">
          <Spin spinning={loadingStreamActivity}>
            {streamActivity.map((item, index) => {
              return (
                <a key={`${index}`} className="activity-list-row" target="_blank" rel="noopener noreferrer"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                  <div className="activity-highlight">
                    <div className="icon-cell">
                      {getActivityIcon(item)}
                    </div>
                    <div className="description-cell text-truncate">
                      <span>{getActivityActor(item)}</span>
                      <span className="activity-action">{getActivityAction(item)}</span>
                    </div>
                  </div>
                  <div className="date-cell">
                    {getShortDate(item.utcDate as string, true)}
                  </div>
                </a>
              );
            })}
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

          {/* Amount for OTPs */}
          {isOtp() ? (
            <div className="mb-3">
              <div className="info-label">
                Amount&nbsp;(funded on {getReadableDate(streamDetail?.fundedOnUtc as string)})
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
          {isOtp() ? (
            null
          ) : (
            <div className="mb-3">
              <div className="info-label">Funds sent to recepient</div>
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
              Top up (add funds)
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
      <div className="activity-title">Activity</div>
      {!streamActivity || streamActivity.length === 0 ? (
        <p>No activity so far.</p>
      ) : (
        <div className="activity-list">
          <Spin spinning={loadingStreamActivity}>
            {streamActivity.map((item, index) => {
              return (
                <a key={`${index}`} className="activity-list-row" target="_blank" rel="noopener noreferrer"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                  <div className="activity-highlight">
                    <div className="icon-cell">
                      {getActivityIcon(item)}
                    </div>
                    <div className="description-cell text-truncate">
                      <span>{getActivityActor(item)}</span>
                      <span className="activity-action">{getActivityAction(item)}</span>
                    </div>
                  </div>
                  <div className="date-cell">
                    {getShortDate(item.utcDate as string, true)}
                  </div>
                </a>
              );
            })}
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

  return (
    <div className={`streams-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
      {/* Left / top panel*/}
      <div className="streams-container">
        <div className="streams-heading">My Money Streams</div>
        <div className="inner-container">
          {/* item block */}
          <div className="item-block vertical-scroll">
            <Spin spinning={loadingStreams}>
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
                          <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds)}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <>
                <p>No streams available</p>
                </>
              )}
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
                  Back to My Streams
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
                  Create new money stream
                </Button>
              </div>
            )}
            {!customStreamDocked && (
              <div className="open-stream">
                <Tooltip title="Lookup a stream">
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
        <div className="streams-heading">Stream details</div>
        <div className="inner-container">
          {connected && streamDetail ? (
            <>
            {isInboundStream(streamDetail) ? renderInboundStream : renderOutboundStream}
            </>
          ) : (
            <p>Please select or lookup a stream to view details</p>
          )}
        </div>
      </div>
      <ContractSelectorModal
        isVisible={isContractSelectorModalVisible}
        handleOk={onAcceptContractSelector}
        handleClose={closeContractSelectorModal}/>
      <CloseStreamModal
        isVisible={isCloseStreamModalVisible}
        transactionFees={transactionFees}
        handleOk={onAcceptCloseStream}
        handleClose={hideCloseStreamModal}
        content={getStreamClosureMessage()} />
      <OpenStreamModal
        isVisible={isOpenStreamModalVisible}
        handleOk={onAcceptOpenStream}
        handleClose={closeOpenStreamModal} />
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
              <p className="operation">Funds added successfully!</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onAddFundsTransactionFinished}>
                Close
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
              <p className="operation">Funds withdrawn successfully!</p>
              <Button
                block
                type="primary"
                shape="round"
                size="middle"
                onClick={onWithdrawFundsTransactionFinished}>
                Close
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
