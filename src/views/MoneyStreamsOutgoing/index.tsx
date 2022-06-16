import { Button, Col, Dropdown, Menu, Modal, Row, Spin } from "antd";
import { IconEllipsisVertical } from "../../Icons";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { useCallback, useContext, useMemo, useState } from "react";
import { Stream, STREAM_STATUS, TransactionFees, MSP_ACTIONS as MSP_ACTIONS_V2, calculateActionFees as calculateActionFeesV2, MSP, AllocationType, } from "@mean-dao/msp";
import { MSP_ACTIONS, StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { ArrowUpOutlined, CheckOutlined, WarningOutlined, LoadingOutlined } from "@ant-design/icons";
import { AppStateContext } from "../../contexts/appstate";
import { formatThousands, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, shortenAddress, toUiAmount } from "../../utils/utils";
import BN from "bn.js";
import { StreamAddFundsModal } from "../../components/StreamAddFundsModal";
import { segmentAnalytics } from "../../App";
import { AppUsageEvent, SegmentStreamAddFundsData } from "../../utils/segment-service";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, isValidAddress } from "../../utils/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { openNotification } from "../../components/Notifications";
import { calculateActionFees } from "@mean-dao/money-streaming/lib/utils";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { NO_FEES } from "../../constants";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { StreamTopupParams } from "../../models/common-types";
import { OperationType, TransactionStatus } from "../../models/enums";
import { PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import { customLogger } from "../..";
import { useWallet } from "../../contexts/wallet";
import { TxConfirmationContext } from "../../contexts/transaction-status";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MoneyStreamsOutgoingView = (props: {
  stream?: any;
  onSendFromOutgoingStreamDetails?: any;
  // tabs?: Array<any>;
}) => {
  const {
    splTokenList,
    streamDetail,
    selectedToken,
    transactionStatus,
    streamProgramAddress,
    streamV2ProgramAddress,
    getTokenByMintAddress,
    getTokenPriceBySymbol,
    setTransactionStatus,
    refreshTokenBalance,
    setSelectedToken,
    setEffectiveRate,
  } = useContext(AppStateContext);
  const {
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);

  const connection = useConnection();
  const { wallet, publicKey } = useWallet();

  const { stream, onSendFromOutgoingStreamDetails } = props;
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();

  const [oldSelectedToken, setOldSelectedToken] = useState<TokenInfo>();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
    blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
  });
  const [nativeBalance, setNativeBalance] = useState(0);

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
    return new MSP(
      endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    endpoint,
    streamV2ProgramAddress
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

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

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupButton);
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
    getTokenByMintAddress,
    getTransactionFeesV2,
    refreshTokenBalance,
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

  const [addFundsPayload, setAddFundsPayload] = useState<StreamTopupParams>();
  const onAcceptAddFunds = (data: StreamTopupParams) => {
    closeAddFundsModal();
    consoleOut('AddFunds input:', data, 'blue');
    onExecuteAddFundsTransaction(data);
  };

  const onAddFundsTransactionFinished = () => {
    resetTransactionStatus();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
  };

  const onExecuteAddFundsTransaction = async (addFundsData: StreamTopupParams) => {
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
      const autoWSol = addFundsData.associatedToken === NATIVE_SOL_MINT.toBase58() ? true : false;
      return await msp.fundStream(
        payload.payer,                                              // payer
        payload.contributor,                                        // contributor
        payload.treasury,                                           // treasury
        payload.stream,                                             // stream
        payload.amount,                                             // amount
        autoWSol                                                    // autoWSol
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
      if (wallet && publicKey && streamDetail) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamDetail.id as string);
        const treasury = new PublicKey((streamDetail as StreamInfo).treasuryAddress as string);
        const contributorMint = new PublicKey(streamDetail.associatedToken as string);
        const amount = parseFloat(addFundsData.amount);
        const price = selectedToken ? getTokenPriceBySymbol(selectedToken.symbol) : 0;
        setAddFundsPayload(addFundsData);

        const data = {
          contributor: publicKey.toBase58(),               // contributor
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
          assetPrice: price,
          amount,
          valueInUsd: price * amount
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
            })`
          });
          customLogger.logWarning('Add funds transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting addFunds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms.addFunds(
          publicKey,
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
      const price = selectedToken ? getTokenPriceBySymbol(selectedToken.symbol) : 0;
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
        assetPrice: price,
        amount: parseFloat(addFundsData.amount),
        valueInUsd: price * parseFloat(addFundsData.amount)
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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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

  const isNewStream = useCallback(() => {
    if (stream) {
      return stream.version >= 2 ? true : false;
    }

    return false;
  }, [stream]);

  const hideDetailsHandler = () => {
    onSendFromOutgoingStreamDetails();
  }

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

  const renderFundsLeftInAccount = () => {
    if (!stream) {return null;}

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        <span className="info-data large mr-1">
          {stream
            ? getTokenAmountAndSymbolByTokenAddress(
                isNewStream()
                  ? toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6)
                  : v1.escrowUnvestedAmount,
                stream.associatedToken as string
              )
            : '--'
          }
        </span>
        <span className="info-icon">
          {(stream && getStreamStatus(stream) === "Running") ? (
            <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
          ) : (
            <ArrowUpOutlined className="mean-svg-icons outgoing" />
          )}
        </span>
      </>
    )
  }

  // Info Data
  const infoData = [
    {
      name: "Funds left in account",
      value: renderFundsLeftInAccount()
    },
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="mso-00" onClick={() => {}}>
        <span className="menu-item-text">Copy stream id</span>
      </Menu.Item>
      <Menu.Item key="mso-01" onClick={() => {}}>
        <span className="menu-item-text">View on Explorer</span>
      </Menu.Item>
      <Menu.Item key="mso-02" onClick={() => {}}>
        <span className="menu-item-text">Close stream</span>
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
          onClick={showAddFundsModal}>
            <div className="btn-content">
              Add funds
            </div>
        </Button>
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke"
          onClick={() => {}}>
            <div className="btn-content">
              Pause stream
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

  return (
    <>
      <MoneyStreamDetails
        stream={stream}
        hideDetailsHandler={hideDetailsHandler}
        infoData={infoData}
        isStreamOutgoing={true}
        buttons={buttons}
      />

      {isAddFundsModalVisible && (
        <StreamAddFundsModal
          isVisible={isAddFundsModalVisible}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          streamDetail={stream}
          nativeBalance={nativeBalance}
          mspClient={
            stream
              ? stream.version < 2
                ? ms
                : msp
              : undefined
          }
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
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
                  parseFloat(addFundsPayload ? addFundsPayload.amount : '0'),
                  streamDetail?.associatedToken as string,
                  false,
                  splTokenList
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
                    accountBalance: getAmountWithSymbol(
                      nativeBalance,
                      NATIVE_SOL_MINT.toBase58(),
                      false,
                      splTokenList
                    ),
                    feeAmount: getAmountWithSymbol(
                      transactionFees.blockchainFee + transactionFees.mspFlatFee,
                      NATIVE_SOL_MINT.toBase58(),
                      false,
                      splTokenList
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
    </>
  )
}