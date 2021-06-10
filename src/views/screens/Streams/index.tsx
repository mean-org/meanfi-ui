import { useCallback, useContext, useEffect, useState } from "react";
import { Divider, Row, Col, Button, Modal, Spin } from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
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
  IconExit,
  IconPause,
  IconShare,
  IconUpload,
} from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { MoneyStreaming, StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenSymbol, isValidNumber, shortenAddress } from "../../../utils/utils";
import { getIntervalFromSeconds, getTransactionOperationDescription } from "../../../utils/ui";
import { SOLANA_EXPLORER_URI } from "../../../constants";
import { ContractSelectorModal } from '../../../components/ContractSelectorModal';
import { OpenStreamModal } from '../../../components/OpenStreamModal';
import { WithdrawModal } from '../../../components/WithdrawModal';
import _ from "lodash";
import { useConnection, useConnectionConfig } from "../../../contexts/connection";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Constants } from "../../../money-streaming/constants";
import { listStreams } from "../../../money-streaming/utils";
import { TransactionStatus } from "../../../models/enums";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const Streams = () => {
  const connectionConfig = useConnectionConfig();
  const connection = useConnection();
  const { connected, wallet, publicKey } = useWallet();
  const {
    streamList,
    streamDetail,
    detailsPanelOpen,
    transactionStatus,
    setCurrentScreen,
    setLoadingStreams,
    setStreamList,
    setStreamDetail,
    setSelectedStream,
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

  useEffect(() => {
    let updateDateTimer: any;

    const updateData = () => {
      if (streamDetail) {
        const clonedDetail = _.cloneDeep(streamDetail);

        let startDateUtc = new Date(clonedDetail.startUtc as string);
        let utcNow = new Date();
        const rate = clonedDetail.rateAmount / clonedDetail.rateIntervalInSeconds;
        const elapsedTime = (utcNow.getTime() - startDateUtc.getTime()) / 1000;

        let escrowVestedAmount = 0;

        if (utcNow.getTime() >= startDateUtc.getTime()) {
          escrowVestedAmount = rate * elapsedTime;;

          if (escrowVestedAmount >= clonedDetail.totalDeposits) {
            escrowVestedAmount = clonedDetail.totalDeposits;
          }
        }

        clonedDetail.escrowVestedAmount = Math.fround(escrowVestedAmount);
        clonedDetail.escrowUnvestedAmount = Math.fround(
          clonedDetail.totalDeposits - clonedDetail.totalWithdrawals - escrowVestedAmount
        );
        setStreamDetail(clonedDetail);
      }
    };

    // Install the timer
    updateDateTimer = window.setInterval(() => {
      updateData();
    }, 1000);

    // Return callback to run on unmount.
    return () => {
      if (updateDateTimer) {
        window.clearInterval(updateDateTimer);
      }
    };
  }, [streamDetail, setStreamDetail]);

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

  // Withdraw funds modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(true), []);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const onAcceptWithdraw = (amount: any) => {
    closeWithdrawModal();
    console.log('Withdraw amout:', parseFloat(amount));
    onExecuteWithdrawFundsTransaction(amount);
  };

  const isInboundStream = (item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }

  const getAmountWithSymbol = (amount: any, address: string, onlyValue = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address, onlyValue);
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

  const getReadableDate = (date: string): string => {
    if (!date) { return ''; }
    const localDate = new Date(date);
    return localDate.toLocaleString();
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
    if (isInbound) {
      if (item.isUpdatePending) {
        title = `This contract is pending your approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        title = `Receiving money since ${getReadableDate(item.startUtc as string)}`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `This contract is pending beneficiary approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        title = `Sending money since ${getReadableDate(item.startUtc as string)}`;
      }
    }
    return title;
  }

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const refreshStreamList = () => {
    if (publicKey) {
      const programId = new PublicKey(Constants.STREAM_PROGRAM_ADDRESS);

      setTimeout(() => {
        setLoadingStreams(true);
        listStreams(connection, programId, publicKey, publicKey, 'confirmed', true)
          .then(async streams => {
            setStreamList(streams);
            setLoadingStreams(false);
            console.log('streamList:', streamList);
            setSelectedStream(streams[0]);
            setStreamDetail(streams[0]);
            hideWithdrawFundsTransactionModal();
            hideCloseStreamTransactionModal();
            setCurrentScreen("streams");
          });
      }, 1000);
    }
  };

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

  // Withdraw funds Transaction execution modal
  const [isWithdrawFundsTransactionModalVisible, setWithdrawFundsTransactionModalVisibility] = useState(false);
  const showWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(true), []);
  const hideWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(false), []);

  const onWithdrawFundsTransactionFinished = () => {
    resetTransactionStatus();
    refreshStreamList();
  };

  const onAfterWithdrawFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
  }

  const onExecuteWithdrawFundsTransaction = async (withdrawAmount: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint);

    const createTx = async (): Promise<boolean> => {
      if (wallet && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.CreateTransaction
        });
        const stream = new PublicKey(streamDetail.id as string);
        const beneficiary = new PublicKey(streamDetail.beneficiaryAddress as string);
        const associatedToken = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(withdrawAmount);

        // Create a transaction
        return await moneyStream.getWithdrawTransaction(
          stream,
          beneficiary,
          associatedToken,
          amount
        )
        .then(value => {
          console.log('getWithdrawTransaction returned transaction:', value);
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
  };

  const onAfterCloseStreamTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
  }

  const onExecuteCloseStreamTransaction = async () => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;

    setTransactionCancelled(false);
    setIsBusy(true);

    // Init a streaming operation
    const moneyStream = new MoneyStreaming(connectionConfig.endpoint);

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

  const renderInboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconDownload className="mean-svg-icons incoming" />
    </div>
    <div className="stream-details-data-wrapper">

      {/* Sender */}
      <Row className="mb-3">
        <Col span={12}>
          <div className="info-label">Sender</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              {streamDetail && (
                <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${streamDetail.treasurerAddress}`} target="_blank" rel="noopener noreferrer">
                  {shortenAddress(`${streamDetail.treasurerAddress}`)}
                </a>
              )}
            </span>
          </div>
        </Col>
        <Col span={12}>
          <div className="info-label">Payment Rate</div>
          <div className="transaction-detail-row">
            <span className="info-data">
              {streamDetail && streamDetail.rateAmount && isValidNumber(streamDetail.rateAmount.toString())
                ? formatAmount(streamDetail.rateAmount as number, 2)
                : '--'}
              &nbsp;
              {streamDetail && streamDetail.associatedToken
                ? getTokenSymbol(streamDetail.associatedToken as string)
                : ''}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
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
              {/* &nbsp;
              {streamDetail && isValidNumber(streamDetail.escrowUnvestedAmount.toString())
              ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
              : ''} */}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

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
            <span className="info-data">&nbsp;</span>
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
          onClick={showWithdrawModal}
        >
          Withdraw funds
        </Button>
        <Button
          shape="round"
          type="text"
          size="small"
          className="ant-btn-shaded"
          onClick={showCloseStreamConfirm}
        >
          <IconExit className="mean-svg-icons" />
        </Button>
      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      <p>No activity so far.</p>

    </div>
  </>
  );

  const renderOutboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconUpload className="mean-svg-icons outgoing" />
    </div>
    <div className="stream-details-data-wrapper">
      {/* Beneficiary */}
      <Row className="mb-3">
        <Col span={12}>
          <div className="info-label">Recipient</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${streamDetail?.beneficiaryAddress}`} target="_blank" rel="noopener noreferrer">
                {shortenAddress(`${streamDetail?.beneficiaryAddress}`)}
              </a>
            </span>
          </div>
        </Col>
        <Col span={12}>
          <div className="info-label">Payment Rate</div>
          <div className="transaction-detail-row">
            <span className="info-data">
              {streamDetail && streamDetail.rateAmount && isValidNumber(streamDetail.rateAmount.toString())
                ? formatAmount(streamDetail.rateAmount as number, 2)
                : '--'}
              &nbsp;
              {streamDetail && streamDetail.associatedToken
                ? getTokenSymbol(streamDetail.associatedToken as string)
                : '0'}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
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

      {/* Total deposit */}
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

      {/* Funds sent (Total Vested) */}
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

      {/* Funds left (Total Unvested) */}
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
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Top up (add funds) */}
      <div className="mt-3 mb-3 withdraw-container">
        <Button
          block
          className="withdraw-cta"
          type="text"
          shape="round"
          size="small"
          onClick={() => {}}
        >
          Top up (add funds)
        </Button>
        <Button
          shape="round"
          type="text"
          size="small"
          className="ant-btn-shaded"
          onClick={showCloseStreamConfirm}
        >
          <IconExit className="mean-svg-icons" />
        </Button>
      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      <p>No activity so far.</p>

    </div>
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
                        {item && item.rateAmount && isValidNumber(item.rateAmount.toString()) ? formatAmount(item.rateAmount, 2) : '--'}
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
      <WithdrawModal
        isVisible={isWithdrawModalVisible}
        handleOk={onAcceptWithdraw}
        handleClose={closeWithdrawModal} />
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
              <h5 className="operation">{`Withdraw ${streamDetail && getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)}`}</h5>
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
