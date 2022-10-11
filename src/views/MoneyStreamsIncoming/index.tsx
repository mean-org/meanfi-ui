import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import ArrowDownOutlined from "@ant-design/icons/lib/icons/ArrowDownOutlined";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { MSP_ACTIONS, StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import {
  calculateActionFees as calculateActionFeesV2, MSP, MSP_ACTIONS as MSP_ACTIONS_V2, Stream,
  STREAM_STATUS, TransactionFees
} from '@mean-dao/msp';
import { AccountInfo, Connection, ParsedAccountData, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Dropdown, Menu, Modal, Space, Spin } from "antd";
import { ItemType } from "antd/lib/menu/hooks/useItems";
import { segmentAnalytics } from "App";
import BN from "bn.js";
import { MoneyStreamDetails } from "components/MoneyStreamDetails";
import { StreamTransferOpenModal } from "components/StreamTransferOpenModal";
import { StreamWithdrawModal } from "components/StreamWithdrawModal";
import { CUSTOM_TOKEN_NAME, NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "constants/common";
import { useNativeAccount } from "contexts/accounts";
import { AppStateContext } from "contexts/appstate";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "contexts/connection";
import { TxConfirmationContext } from "contexts/transaction-status";
import { useWallet } from "contexts/wallet";
import { IconEllipsisVertical } from "Icons";
import { appConfig, customLogger } from "index";
import { readAccountInfo } from "middleware/accounts";
import { NATIVE_SOL_MINT } from "middleware/ids";
import { AppUsageEvent, SegmentStreamTransferOwnershipData, SegmentStreamWithdrawData } from "middleware/segment-service";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from "middleware/ui";
import { displayAmountWithSymbol, getAmountFromLamports, getAmountWithSymbol, getTxIxResume, shortenAddress } from "middleware/utils";
import { OperationType, TransactionStatus } from "models/enums";
import { TokenInfo } from "models/SolanaTokenInfo";
import { StreamWithdrawData } from "models/streams";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MoneyStreamsIncomingView = (props: {
  loadingStreams: boolean;
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromIncomingStreamDetails?: any;
  streamSelected: Stream | StreamInfo | undefined;
}) => {
  const {
    loadingStreams,
    multisigAccounts,
    onSendFromIncomingStreamDetails,
    streamSelected,
  } = props;

  const {
    splTokenList,
    selectedAccount,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenPriceByAddress,
    getTokenPriceBySymbol,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setStreamDetail,
  } = useContext(AppStateContext);
  const {
    confirmationHistory,
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);
  const connectionConfig = useConnectionConfig();
  const { endpoint } = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [lastStreamTransferAddress, setLastStreamTransferAddress] = useState('');
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  ////////////
  //  Init  //
  ////////////

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

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

  // Create and cache Multisig client instance
  const multisigClient = useMemo(() => {

    if (!connection || !publicKey || !endpoint) { return null; }

    return new MeanMultisig(
      endpoint,
      publicKey,
      "confirmed",
      multisigAddressPK
    );

  }, [
    endpoint,
    publicKey,
    connection,
    multisigAddressPK
  ]);

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const isNewStream = useCallback(() => {
    if (streamSelected) {
      return streamSelected.version >= 2 ? true : false;
    }

    return false;
  }, [streamSelected]);

  const isIncomingMultisigStream = useCallback((stream?: any) => {

    const streamInfo: any = stream ?? streamSelected;

    if (!streamInfo || streamInfo.version < 2 || !streamInfo.beneficiary || !publicKey) {
      return false;
    }

    const beneficiary = new PublicKey(streamInfo.beneficiary as string);

    if (!beneficiary.equals(publicKey) && multisigAccounts && multisigAccounts.findIndex(m => m.authority.equals(beneficiary)) !== -1) {
      return true;
    }

    return false;
  }, [
      publicKey,
      streamSelected,
      multisigAccounts,
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
    resetTransactionStatus();
    setIsTransferStreamModalVisibility(true);
    getTransactionFeesV2(MSP_ACTIONS_V2.transferStream).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });
  }, [getTransactionFeesV2, resetTransactionStatus]);
  const closeTransferStreamModal = useCallback(() => setIsTransferStreamModalVisibility(false), []);
  const [isTransferStreamTransactionModalVisible, setTransferStreamTransactionModalVisibility] = useState(false);
  const showTransferStreamTransactionModal = useCallback(() => setTransferStreamTransactionModalVisibility(true), []);
  const hideTransferStreamTransactionModal = useCallback(() => setTransferStreamTransactionModalVisibility(false), []);

  const onAcceptTransferStream = (dataStream: any) => {
    closeTransferStreamModal();
    consoleOut('New beneficiary address:', dataStream.address);
    setLastStreamTransferAddress(dataStream.address);
    onExecuteTransferStreamTransaction(dataStream);
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

  const onExecuteTransferStreamTransaction = useCallback(async (dataStream: any) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const transferOwnership = async (dataStream: any) => {
      if (!msp || !publicKey || !streamSelected) { return null; }

      if (!isMultisigContext) {
        consoleOut('Creating msp.transferStream() Tx...', '', 'blue');
        return await msp.transferStream(
          publicKey,                                       // beneficiary,
          new PublicKey(dataStream.address),               // newBeneficiary,
          new PublicKey(streamSelected.id as string),      // stream,
        );
      }

      if (!streamSelected || !multisigClient || !multisigAccounts) { return null; }

      const stream = streamSelected as Stream;
      const multisig = multisigAccounts.filter(m => m.authority.equals(stream.beneficiary))[0];

      if (!multisig) { return null; }

      multisigAuth = multisig.authority.toBase58();

      const ownershipTransfer = await msp.transferStream(
        multisig.authority,                              // beneficiary,
        new PublicKey(dataStream.address as string),     // newBeneficiary,
        new PublicKey(streamSelected.id as string),      // stream,
      );

      const ixData = Buffer.from(ownershipTransfer.instructions[0].data);
      const ixAccounts = ownershipTransfer.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        dataStream.title === "" ? "Transfer stream ownership" : dataStream.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamTransferBeneficiary,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTx = async (): Promise<boolean> => {
      if (!publicKey || !streamSelected || !msp) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Transfer stream transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTransferFailed, { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const stream = new PublicKey(streamSelected.id as string);
      const newBeneficiary = new PublicKey(dataStream.address as string);

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

      const result = await transferOwnership(dataStream)
        .then(value => {
          if (!value) { return false; }
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

    if (wallet && streamSelected) {
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
              loadingMessage: `Transfer stream to: ${shortenAddress(dataStream.address, 4)}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Stream transferred to: ${shortenAddress(dataStream.address, 4)}`,
              extras: {
                multisigAuthority: multisigAuth
              }
            });
            setIsBusy(false);
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  }, [
    msp,
    wallet,
    publicKey,
    connection,
    nativeBalance,
    streamSelected,
    multisigClient,
    mspV2AddressPK,
    multisigAccounts,
    isMultisigContext,
    transactionCancelled,
    transactionFees.mspFlatFee,
    transactionFees.blockchainFee,
    transactionStatus.currentOperation,
    showTransferStreamTransactionModal,
    enqueueTransactionConfirmation,
    resetTransactionStatus,
    setTransactionStatus,
  ]);

  // Withdraw funds modal
  const [lastStreamDetail, setLastStreamDetail] = useState<Stream | StreamInfo | undefined>(undefined);
  const [withdrawFundsAmount, setWithdrawFundsAmount] = useState<StreamWithdrawData>();
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);

  const showWithdrawModal = useCallback(async () => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalButton);
    const lastDetail = Object.assign({}, streamSelected);
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
    streamSelected,
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
    let multisigAuth = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setWithdrawFundsAmount(withdrawData);
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamSelected.id as string);

        const beneficiary = new PublicKey((streamSelected as StreamInfo).beneficiaryAddress as string);
        const amount = parseFloat(withdrawData.amount);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;
        const valueInUsd = price * amount;

        const data = {
          title: withdrawData.title,
          stream: stream.toBase58(),
          beneficiary: beneficiary.toBase58(),
          amount: amount
        };
        consoleOut('withdraw params:', data, 'brown');

        // Report event to Segment analytics
        const segmentData: SegmentStreamWithdrawData = {
          asset: withdrawData.token.symbol,
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
          // title,
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

    const withdrawFunds = async (data: any) => {

      if (!msp || !publicKey) { return null; }

      if (!isIncomingMultisigStream()) {
        return await msp.withdraw(
          publicKey,                             // payer,
          new PublicKey(data.stream),            // stream,
          data.amount,                           // amount
        );
      }

      if (!streamSelected || !multisigClient || !multisigAccounts) { return null; }

      const stream = streamSelected as Stream;
      const multisig = multisigAccounts.filter(m => m.authority.equals(stream.beneficiary))[0];

      if (!multisig) { return null; }

      multisigAuth = multisig.authority.toBase58();

      const withdrawFunds = await msp.withdraw(
        multisig.authority,                          // payer
        new PublicKey(data.stream),                  // stream,
        data.amount,                                 // amount
      );

      const ixData = Buffer.from(withdrawFunds.instructions[0].data);
      const ixAccounts = withdrawFunds.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        withdrawData.title === "" ? "Withdraw stream funds" : withdrawData.title as string,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamWithdraw,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamSelected || !msp || !workingToken) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Withdraw transaction failed', { transcript: transactionLog });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamWithdrawalFailed, { transcript: transactionLog });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction
      });

      const stream = (streamSelected as Stream).id;
      const beneficiary = (streamSelected as Stream).beneficiary;
      const amount = withdrawData.amount;
      const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;
      const valueInUsd = price * withdrawData.inputAmount;

      const data = {
        stream: stream.toBase58(),
        beneficiary: beneficiary.toBase58(),
        amount: amount
      };
      consoleOut('withdraw params:', data, 'brown');

      // Report event to Segment analytics
      const segmentData: SegmentStreamWithdrawData = {
        asset: withdrawData.token.symbol,
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
      const result = await withdrawFunds(data)
        .then(value => {
          if (!value) { return false; }
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

    if (wallet && streamSelected && workingToken) {
      const token = withdrawData.token;
      showWithdrawFundsTransactionModal();
      let created: boolean;
      if (streamSelected.version < 2) {
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
            const amountDisplay = displayAmountWithSymbol(
              withdrawData.amount,
              token.address,
              token.decimals,
              splTokenList,
              true
            );
            const loadingMessage = multisigAuth
              ? `Create proposal to withdraw ${amountDisplay}`
              : `Withdraw ${amountDisplay}`;
            const completed = multisigAuth
              ? `Proposal to withdraw ${amountDisplay} has been submitted for approval.`
              : `Successfully withdrawn ${amountDisplay}`;
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamWithdraw,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: loadingMessage,
              completedTitle: "Transaction confirmed",
              completedMessage: completed,
              extras: {
                multisigAuthority: multisigAuth
              }
            });

            setIsWithdrawModalVisibility(false);
            onWithdrawFundsTransactionFinished();
            setIsBusy(false);
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

  const hideDetailsHandler = () => {
    onSendFromIncomingStreamDetails();
  }

  const getStreamStatus = useCallback((item: Stream | StreamInfo): "scheduled" | "stopped" | "stopped-manually" | "running" => {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;
    if (v1.version < 2) {
      switch (v1.state) {
        case STREAM_STATE.Schedule:
          return "scheduled";
        case STREAM_STATE.Paused:
          return "stopped";
        default:
          return "running";
      }
    } else {
      switch (v2.status) {
        case STREAM_STATUS.Scheduled:
          return "scheduled";
        case STREAM_STATUS.Paused:
          if (v2.isManuallyPaused) {
            return "stopped-manually";
          }
          return "stopped";
        default:
          return "running";
      }
    }
  }, []);

  // confirmationHistory
  const hasStreamPendingTx = useCallback((type?: OperationType) => {
    if (!streamSelected) { return false; }

    if (confirmationHistory && confirmationHistory.length > 0) {
      if (type !== undefined) {
        return confirmationHistory.some(h =>
          h.extras === streamSelected.id &&
          h.txInfoFetchStatus === "fetching" &&
          h.operationType === type
        );
      }
      if (type !== undefined) {
        return confirmationHistory.some(h =>
          h.extras === streamSelected.id &&
          h.txInfoFetchStatus === "fetching" &&
          h.operationType === type
        );
      }
      return confirmationHistory.some(h => h.extras === streamSelected.id && h.txInfoFetchStatus === "fetching");
    }

    return false;
  }, [confirmationHistory, streamSelected]);

  const isScheduledOtp = useCallback((): boolean => {
    if (streamSelected) {
      const isNew = streamSelected.version >= 2 ? true : false;
      if (isNew) {
        if ((streamSelected.rateAmount as BN).gtn(0)) { return false; }
      } else {
        if (streamSelected.rateAmount as number > 0) { return false; }
      }
      const now = new Date().toUTCString();
      const nowUtc = new Date(now);
      const streamStartDate = new Date(streamSelected.startUtc as string);
      if (streamStartDate > nowUtc) {
        return true;
      }
    }
    return false;
  }, [streamSelected]);

  const getStreamWithdrawableAmount = useCallback((stream: Stream | StreamInfo) => {
    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const isNew = stream.version >= 2 ? true : false;
    return isNew ? v2.withdrawableAmount : new BN(v1.escrowVestedAmount);
  }, []);

  const canWithdraw = useCallback((stream: StreamInfo | Stream | undefined ) => {
    if (!stream) {
      return false;
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    let beneficiary = '';
    if (v1.version < 2) {
      beneficiary = v1.beneficiaryAddress
        ? typeof v1.beneficiaryAddress === "string"
          ? (v1.beneficiaryAddress as string)
          : (v1.beneficiaryAddress as PublicKey).toBase58()
        : '';
    } else {
      beneficiary = v2.beneficiary
        ? typeof v2.beneficiary === "string"
          ? (v2.beneficiary as string)
          : (v2.beneficiary as PublicKey).toBase58()
        : '';
    }
    return beneficiary === selectedAccount.address ? true : false
  }, [selectedAccount.address]);

  const getTokenOrCustomToken = useCallback(async (address: string) => {

    const token = getTokenByMintAddress(address);

    const unkToken = {
      address: address,
      name: CUSTOM_TOKEN_NAME,
      chainId: 101,
      decimals: 6,
      symbol: `[${shortenAddress(address)}]`,
    };

    if (token) {
      return token;
    } else {
      try {
        const tokeninfo = await readAccountInfo(connection, address);
        if ((tokeninfo as any).data["parsed"]) {
          const decimals = (tokeninfo as AccountInfo<ParsedAccountData>).data.parsed.info.decimals as number;
          unkToken.decimals = decimals || 0;
          return unkToken as TokenInfo;
        } else {
          return unkToken as TokenInfo;
        }
      } catch (error) {
        console.error('Could not get token info, assuming decimals = 6');
        return unkToken as TokenInfo;
      }
    }
  }, [connection, getTokenByMintAddress]);


  /////////////////////
  // Data management //
  /////////////////////

  // Refresh stream data
  useEffect(() => {
    if (!ms || !msp || !streamSelected) { return; }

    const timeout = setTimeout(() => {
      const v1 = streamSelected as StreamInfo;
      const v2 = streamSelected as Stream;
      const isV2 = streamSelected.version >= 2;
      if (isV2) {
        if (v2.status === STREAM_STATUS.Running) {
          msp.refreshStream(streamSelected as Stream).then(detail => {
            setStreamDetail(detail as Stream);
          });
        }
      } else {
        if (v1.state === STREAM_STATE.Running) {
          ms.refreshStream(streamSelected as StreamInfo).then(detail => {
            setStreamDetail(detail as StreamInfo);
          });
        }
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ms,
    msp,
    streamSelected,
  ]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Set selected token to the stream associated token as soon as the stream is available or changes
  useEffect(() => {
    if (!publicKey || !streamSelected) { return; }
    let associatedToken = '';

    if (streamSelected.version < 2) {
      associatedToken = (streamSelected as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (streamSelected as Stream).associatedToken.toBase58();
    }

    if (associatedToken && (!workingToken || workingToken.address !== associatedToken)) {
      getTokenOrCustomToken(associatedToken)
      .then(token => {
        consoleOut('getTokenOrCustomToken (MoneyStreamsIncomingView) ->', token, 'blue');
        setWorkingToken(token);
      });
    }
  }, [getTokenOrCustomToken, publicKey, streamSelected, workingToken]);


  ///////////////
  // Rendering //
  ///////////////

  const renderFundsToWithdraw = useCallback(() => {
    if (!streamSelected || !workingToken) { return null; }

    const v1 = streamSelected as StreamInfo;
    const v2 = streamSelected as Stream;

    return (
      <>
        <span className="info-data large mr-1">
          {
            isNewStream()
              ? displayAmountWithSymbol(
                  v2.withdrawableAmount,
                  workingToken.address,
                  workingToken.decimals,
                  splTokenList,
                )
              : getAmountWithSymbol(
                  v1.escrowVestedAmount,
                  workingToken.address,
                  false,
                  splTokenList,
                  workingToken.decimals,
                )
          }
        </span>
        <span className="info-icon">
          {(streamSelected && getStreamStatus(streamSelected) === "running") ? (
            <ArrowDownOutlined className="mean-svg-icons incoming bounce" />
          ) : (
            <ArrowDownOutlined className="mean-svg-icons incoming" />
          )}
        </span>
      </>
    )
  }, [getStreamStatus, isNewStream, splTokenList, streamSelected, workingToken])

  // Info Data
  const infoData = [
    {
      name: "Funds available to withdraw now",
      value: streamSelected ? renderFundsToWithdraw() : "--"
    },
  ];

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType[] = [];
    items.push({
      key: '01-transfer-ownership',
      label: (
        <div onClick={showTransferStreamModal}>
          <span className="menu-item-text">Transfer ownership</span>
        </div>
      )
    });
    items.push({
      key: '02-explorer-link',
      label: (
        <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamSelected && streamSelected.id}${getSolanaExplorerClusterParam()}`}
           target="_blank" rel="noopener noreferrer">
          <span className="menu-item-text">{t('account-area.explorer-link')}</span>
        </a>
      )
    });

    return <Menu items={items} />;
  }, [showTransferStreamModal, streamSelected, t]);

  // Buttons
  const renderButtons = useCallback(() => {
    if (!streamSelected) { return null; }

    return (
      <div className="flex-fixed-right cta-row mb-2 pl-1">
        <Space className="left" size="middle" wrap>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke btn-min-width"
            disabled={
              !canWithdraw(streamSelected) ||
              isScheduledOtp() ||
              getStreamWithdrawableAmount(streamSelected).isZero() ||
              isBusy ||
              hasStreamPendingTx(OperationType.StreamWithdraw)
            }
            onClick={showWithdrawModal}>
              <div className="btn-content">
                Withdraw funds
              </div>
          </Button>
        </Space>
        <Dropdown
          overlay={renderDropdownMenu()}
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
      </div>
    );
  }, [
    isBusy,
    streamSelected,
    getStreamWithdrawableAmount,
    hasStreamPendingTx,
    renderDropdownMenu,
    showWithdrawModal,
    isScheduledOtp,
    canWithdraw,
  ]);

  return (
    <>
      <Spin spinning={loadingStreams}>
        <MoneyStreamDetails
          accountAddress={selectedAccount.address}
          stream={streamSelected}
          hideDetailsHandler={hideDetailsHandler}
          infoData={infoData}
          isStreamIncoming={true}
          buttons={renderButtons()}
          selectedToken={workingToken}
        />
      </Spin>

      {isWithdrawModalVisible && (
        <StreamWithdrawModal
          startUpData={lastStreamDetail}
          selectedToken={workingToken}
          transactionFees={transactionFees}
          isVisible={isWithdrawModalVisible}
          handleOk={(options: StreamWithdrawData) => onAcceptWithdraw(options)}
          handleClose={closeWithdrawModal}
        />
      )}

      {isTransferStreamModalVisible && (
        <StreamTransferOpenModal
          isVisible={isTransferStreamModalVisible}
          streamDetail={streamSelected}
          handleOk={(dataStream: any) => onAcceptTransferStream(dataStream)}
          handleClose={closeTransferStreamModal}
        />
      )}

      {/* Withdraw funds transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterWithdrawFundsTransactionModalClosed}
        open={isWithdrawFundsTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideWithdrawFundsTransactionModal}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          {isBusy ? (
            <>
              <Spin indicator={bigLoadingIcon} className="icon" />
              <h4 className="font-bold mb-1">{getTransactionOperationDescription(transactionStatus.currentOperation, t)}</h4>
              <h5 className="operation">{t('transactions.status.tx-withdraw-operation')} {withdrawFundsAmount ? withdrawFundsAmount.inputAmount : 0} {workingToken?.symbol}</h5>
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
        open={isTransferStreamTransactionModalVisible}
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