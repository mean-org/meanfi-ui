import { Button, Col, Dropdown, Menu, Modal, Row, Spin } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { customLogger } from "../..";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { AppStateContext } from "../../contexts/appstate";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { IconEllipsisVertical } from "../../Icons";
import { OperationType, TransactionStatus } from "../../models/enums";
import { consoleOut, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from "../../utils/ui";
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import {
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  Stream,
  STREAM_STATUS,
  MSP
} from '@mean-dao/msp';
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { NO_FEES, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { formatAmount, formatThousands, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toTokenAmount, toUiAmount } from "../../utils/utils";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { MSP_ACTIONS, StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { TokenInfo } from "@solana/spl-token-registry";
import moment from "moment";
import BN from "bn.js";
import ArrowDownOutlined from "@ant-design/icons/lib/icons/ArrowDownOutlined";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { StreamTransferOpenModal } from "../../components/StreamTransferOpenModal";
import { AppUsageEvent, SegmentStreamTransferOwnershipData, SegmentStreamWithdrawData } from "../../utils/segment-service";
import { segmentAnalytics } from "../../App";
import { StreamWithdrawModal } from "../../components/StreamWithdrawModal";
import { StreamWithdrawData } from "../../models/streams";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MoneyStreamsIncomingView = (props: {
  stream: Stream | StreamInfo | undefined;
  onSendFromIncomingStreamDetails?: any;
}) => {
  const {
    streamDetail,
    selectedToken,
    transactionStatus,
    refreshTokenBalance,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    setStreamDetail,
  } = useContext(AppStateContext);
  const {
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const { stream, onSendFromIncomingStreamDetails } = props;

  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [lastStreamTransferAddress, setLastStreamTransferAddress] = useState('');

  const hideDetailsHandler = () => {
    onSendFromIncomingStreamDetails();
  }

  // Create and cache the connection
  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
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

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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

  // Withdraw funds modal
  const [lastStreamDetail, setLastStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<StreamWithdrawData>();
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

  const onAcceptWithdraw = (data: StreamWithdrawData) => {
    closeWithdrawModal();
    consoleOut('Withdraw data from modal:', data, 'blue');
    onExecuteWithdrawFundsTransaction(data);
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

  const onExecuteWithdrawFundsTransaction = async (withdrawData: StreamWithdrawData) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

    setWithdrawFundsAmount(withdrawData);
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
        const price = selectedToken ? getTokenPriceBySymbol(selectedToken.symbol) : 0;
        const valueInUsd = price * amount;

        const data = {
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Report event to Segment analytics
        const segmentData: SegmentStreamWithdrawData = {
          asset: withdrawData.token,
          assetPrice: price,
          stream: data.stream,
          beneficiary: data.beneficiary,
          feeAmount: withdrawData.fee,
          inputAmount: withdrawData.inputAmount,
          sentAmount: withdrawData.receiveAmount,
          valueInUsd: parseFloat(valueInUsd.toFixed(2))
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
        const price = selectedToken ? getTokenPriceBySymbol(selectedToken.symbol) : 0;
        const valueInUsd = price * parseFloat(withdrawData.amount);

        const data = {
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Report event to Segment analytics
        const segmentData: SegmentStreamWithdrawData = {
          asset: withdrawData.token,
          assetPrice: price,
          stream: data.stream,
          beneficiary: data.beneficiary,
          feeAmount: withdrawData.fee,
          inputAmount: withdrawData.inputAmount,
          sentAmount: withdrawData.receiveAmount,
          valueInUsd: parseFloat(valueInUsd.toFixed(2))
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
          amount,
          true                          // TODO: Define if the user can determine this
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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

  // Withdraw funds Transaction execution modal
  const [isWithdrawFundsTransactionModalVisible, setWithdrawFundsTransactionModalVisibility] = useState(false);
  const showWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(true), []);
  const hideWithdrawFundsTransactionModal = useCallback(() => setWithdrawFundsTransactionModalVisibility(false), []);

  const onWithdrawFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideWithdrawFundsTransactionModal();
    refreshTokenBalance();
  };

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

  useEffect(() => {
    if (!ms || !msp || !stream) {return;}

    const timeout = setTimeout(() => {
      if (msp && stream && stream.version >= 2) {
        msp.refreshStream(stream as Stream).then(detail => {
          setStreamDetail(detail as Stream);
        });
      } else if (ms && stream && stream.version < 2) {
        ms.refreshStream(stream as StreamInfo).then(detail => {
          setStreamDetail(detail as StreamInfo);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  }, [ms, msp, setStreamDetail, stream]);

  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  const isNew = v2.version >= 2 ? true : false;

  const renderFundsToWithdraw = () => {
    if (!stream) {return null;}

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        <span className="info-data large mr-1">
          {stream
            ? getTokenAmountAndSymbolByTokenAddress(isNew ?
                toUiAmount(new BN(v2.withdrawableAmount), token?.decimals || 6) : v1.escrowVestedAmount, 
                stream.associatedToken as string
              )
            : '--'
          }
        </span>
        <span className="info-icon">
          {(stream && getStreamStatus(stream) === "Running") ? (
            <ArrowDownOutlined className="mean-svg-icons success bounce" />
          ) : (
            <ArrowDownOutlined className="mean-svg-icons success" />
          )}
        </span>
      </>
    )
  }

  // Info Data
  const infoData = [
    {
      name: "Funds available to withdraw now",
      value: renderFundsToWithdraw()
    },
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={showTransferStreamModal}>
        <span className="menu-item-text">Transfer ownership</span>
      </Menu.Item>
    </Menu>
  );

  // Buttons
  const buttons = (
    <Row gutter={[8, 8]} className="safe-btns-container mb-1">
      <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={showWithdrawModal}>
            <div className="btn-content">
              Withdraw funds
            </div>
        </Button>
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={() => {}}>
            <div className="btn-content">
              View on Solscan
            </div>
        </Button>
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
  );

  const incomingStream = {
    title: stream ? getStreamTitle(stream) : "Unknown incoming stream",
    subtitle: stream ? getStreamSubtitle(stream) : "--",
    status: stream ? getStreamStatus(stream) : "--",
    resume: stream ? getStreamResume(stream) : "--"
  };

  const renderReceivingFrom = () => {
    if (!stream) {return null;}

    return (
      <CopyExtLinkGroup
        content={isNew ? v2.treasurer as string : v1.treasurerAddress as string}
        number={8}
        externalLink={true}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!stream) {return null;}

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
              toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount, 
              stream.associatedToken as string
            )}  ${getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}`
          : '--'
        }
      </>
    )
  }

  const renderReservedAllocation = () => {
    if (!stream) {return null;}

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
            toUiAmount(new BN(v2.remainingAllocationAmount), token?.decimals || 6) : (v1.allocationAssigned || v1.allocationLeft), 
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!stream) {return null;}

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNew ?
            toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6) : v1.escrowUnvestedAmount, 
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  // Tab details
  const detailsData = [
    {
      label: "Started on:",
      value: stream ? moment(stream.startUtc).format("LLL").toLocaleString() : "--"
    },
    {
      label: "Receiving from:",
      value: renderReceivingFrom() ? renderReceivingFrom() : "--"
    },
    {
      label: "Payment rate:",
      value: renderPaymentRate() ? renderPaymentRate() : "--"
    },
    {
      label: "Reserved allocation:",
      value: renderReservedAllocation() ? renderReservedAllocation() : ""
    },
    {
      label: "Funds left in account:",
      value: renderFundsLeftInAccount() ? renderFundsLeftInAccount() : "--"
    },
    // {
    //   label: "Funds ran out on:",
    //   value: "June 1, 2022 (6 days ago)"
    // },
  ];

  return (
    <>
      <MoneyStreamDetails
        stream={incomingStream}
        hideDetailsHandler={hideDetailsHandler}
        infoData={infoData}
        detailsData={detailsData}
        buttons={buttons}
      />

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

      {isTransferStreamModalVisible && (
        <StreamTransferOpenModal
          isVisible={isTransferStreamModalVisible}
          streamDetail={stream}
          handleOk={onAcceptTransferStream}
          handleClose={closeTransferStreamModal}
        />
      )}

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
                      accountBalance: getAmountWithSymbol(
                        nativeBalance,
                        NATIVE_SOL_MINT.toBase58()
                      ),
                      feeAmount: getAmountWithSymbol(
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
                    accountBalance: getAmountWithSymbol(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58()
                    ),
                    feeAmount: getAmountWithSymbol(
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
    </>
  )
}