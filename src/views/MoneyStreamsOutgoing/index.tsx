import { Button, Col, Dropdown, Menu, Modal, Row, Spin } from "antd";
import { IconEllipsisVertical } from "../../Icons";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Stream,
  STREAM_STATUS,
  TransactionFees,
  MSP_ACTIONS as MSP_ACTIONS_V2,
  calculateActionFees as calculateActionFeesV2,
  MSP,
  AllocationType,
  Treasury,
  TreasuryType
} from "@mean-dao/msp";
import { MSP_ACTIONS, StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { useTranslation } from "react-i18next";
import { ArrowUpOutlined, CheckOutlined, WarningOutlined, LoadingOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { AppStateContext } from "../../contexts/appstate";
import { fetchAccountTokens, formatThousands, getAmountWithSymbol, getTxIxResume, shortenAddress, toUiAmount2 } from "../../middleware/utils";
import { StreamAddFundsModal } from "../../components/StreamAddFundsModal";
import { segmentAnalytics } from "../../App";
import { AppUsageEvent, SegmentStreamAddFundsData, SegmentStreamCloseData } from "../../middleware/segment-service";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from "../../middleware/ui";
import { TokenInfo } from "@solana/spl-token-registry";
import { calculateActionFees } from "@mean-dao/money-streaming/lib/utils";
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from "../../contexts/connection";
import { CUSTOM_TOKEN_NAME, NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import { StreamTopupParams, StreamTopupTxCreateParams } from "../../models/common-types";
import { OperationType, TransactionStatus } from "../../models/enums";
import { AccountInfo, LAMPORTS_PER_SOL, ParsedAccountData, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT } from "../../middleware/ids";
import { customLogger } from "../..";
import { useWallet } from "../../contexts/wallet";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { StreamPauseModal } from "../../components/StreamPauseModal";
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from "@mean-dao/mean-multisig-sdk";
import { StreamResumeModal } from "../../components/StreamResumeModal";
import { CloseStreamTransactionParams, StreamTreasuryType } from "../../models/treasuries";
import { StreamCloseModal } from "../../components/StreamCloseModal";
import { title } from "process";
import { appConfig } from '../..';
import { readAccountInfo } from "../../middleware/accounts";
import { NATIVE_SOL } from "../../middleware/tokens";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MoneyStreamsOutgoingView = (props: {
  accountAddress: string;
  loadingStreams: boolean;
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromOutgoingStreamDetails?: any;
  streamList?: Array<Stream | StreamInfo> | undefined;
  streamSelected: Stream | StreamInfo | undefined;
  streamingAccountSelected: Treasury | TreasuryInfo | undefined;
}) => {

  const {
    accountAddress,
    loadingStreams,
    multisigAccounts,
    onSendFromOutgoingStreamDetails,
    streamList,
    streamSelected,
    streamingAccountSelected,
  } = props;

  const {
    splTokenList,
    tokenBalance,
    deletedStreams,
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
    enqueueTransactionConfirmation
  } = useContext(TxConfirmationContext);
  const { wallet, publicKey } = useWallet();
  const connection = useConnection();
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);
  // Treasury related
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);

  ////////////
  //  Init  //
  ////////////

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

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
    multisigAddressPK,
  ]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  }, [setTransactionStatus]);

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

  const isOtp = useCallback((): boolean => {
    if (!streamSelected) {
      return false;
    }
    const rate = +streamSelected.rateAmount.toString();
    return rate ? false : true;
  }, [streamSelected]);

  const isDeletedStream = useCallback((stream: Stream | StreamInfo) => {
    if (!deletedStreams) {
      return false;
    }
    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const isNew = stream.version >= 2 ? true : false;
    const streamId = isNew ? v2.id?.toString() : v1.id as string;
    return deletedStreams.some(i => i === streamId);
  }, [deletedStreams]);

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
    const treasuryPk = new PublicKey(treasuryId);

    try {
      const details = await mspInstance.getTreasury(treasuryPk);
      if (details) {
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
      } else {
        setTreasuryDetails(undefined);
      }
    } catch (error) {
      console.error(error);
    }
  }, [
    ms,
    msp,
    publicKey,
    connection,
  ]);

  const refreshUserBalances = useCallback((source?: PublicKey) => {

    if (!connection || !publicKey || !splTokenList) {
      return;
    }

    const balancesMap: any = {};
    const pk = source || publicKey;
    consoleOut('Reading balances for:', pk.toBase58(), 'darkpurple');

    connection.getBalance(pk)
    .then(solBalance => {
      const uiBalance = solBalance / LAMPORTS_PER_SOL;
      balancesMap[NATIVE_SOL.address] = uiBalance;
      setNativeBalance(uiBalance);
    });

    fetchAccountTokens(connection, pk)
    .then(accTks => {
      if (accTks) {
        for (const item of accTks) {
          const address = item.parsedInfo.mint;
          const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
          balancesMap[address] = balance;
        }
      } else {
        for (const t of splTokenList) {
          balancesMap[t.address] = 0;
        }
      }
    })
    .catch(error => {
      console.error(error);
      for (const t of splTokenList) {
        balancesMap[t.address] = 0;
      }
    })
    .finally(() => setUserBalances(balancesMap));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    connection,
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

  const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
    return await calculateActionFees(connection, action);
  }, [connection]);

  const getTransactionFeesV2 = useCallback(async (action: MSP_ACTIONS_V2): Promise<TransactionFees> => {
    return await calculateActionFeesV2(connection, action);
  }, [connection]);

  //////////////////////
  // MODALS & ACTIONS //
  //////////////////////

  const refreshPage = () => {
    hideTransactionExecutionModal();
    window.location.reload();
  }

  // Add funds modal
  const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
  const showAddFundsModal = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupButton);
    refreshUserBalances();

    if (streamSelected) {
      if (streamSelected.version < 2) {
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
    streamSelected,
    getTransactionFeesV2,
    refreshUserBalances,
    refreshTokenBalance,
    getTransactionFees,
  ]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
  }, []);

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
    let multisigAuth = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const fundFromWallet = async (payload: {
      payer: PublicKey;
      contributor: PublicKey;
      treasury: PublicKey;
      stream: PublicKey;
      amount: number | string;
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

    const allocateToStream = async (data: StreamTopupTxCreateParams) => {

      if (!msp) { return null; }

      if (data.stream === '') {
        return await msp.addFunds(
          new PublicKey(data.payer),                    // payer
          new PublicKey(data.contributor),              // contributor
          new PublicKey(data.treasury),                 // treasury
          new PublicKey(data.associatedToken),          // associatedToken
          data.amount,                                  // amount
        );
      }

      if (!isMultisigTreasury()) {
        return await msp.allocate(
          new PublicKey(data.payer),                   // payer
          new PublicKey(data.contributor),             // treasurer
          new PublicKey(data.treasury),                // treasury
          new PublicKey(data.stream),                  // stream
          data.amount,                                 // amount
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      multisigAuth = multisig.authority.toBase58();

      const allocateTx = await msp.allocate(
        new PublicKey(data.payer),                   // payer
        new PublicKey(multisig.authority),           // treasurer
        new PublicKey(data.treasury),                // treasury
        new PublicKey(data.stream),                  // stream
        data.amount,                                 // amount
      );

      const ixData = Buffer.from(allocateTx.instructions[0].data);
      const ixAccounts = allocateTx.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        "Add Funds",
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamAddFunds,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const fundFromTreasury = async (payload: {
      payer: PublicKey;
      treasurer: PublicKey;
      treasury: PublicKey;
      stream: PublicKey;
      amount: number | string;
    }) => {
      if (!msp) { return false; }
      // Create a transaction
      const data: StreamTopupTxCreateParams = {
        payer: payload.payer.toBase58(),
        contributor: payload.payer.toBase58(),
        treasury: payload.treasury.toBase58(),
        stream: payload.stream.toBase58(),
        amount: payload.amount,
        associatedToken: addFundsData.associatedToken
      };
      return await allocateToStream(data)
      .then(value => {
        if (!value) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: 'Transaction could not be created'
          });
          customLogger.logError('Allocate transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, { transcript: transactionLog });
          return false;
        }
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
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const stream = new PublicKey(streamSelected.id as string);
        const treasury = new PublicKey((streamSelected as StreamInfo).treasuryAddress as string);
        const contributorMint = new PublicKey(streamSelected.associatedToken as string);
        const amount = parseFloat(addFundsData.amount as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;
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
        const token = workingToken ? workingToken.symbol : '';
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

      if (!publicKey || !streamSelected || !workingToken || !msp) {
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

      const stream = (streamSelected as Stream).id;
      const treasury = (streamSelected as Stream).treasury;
      const associatedToken = new PublicKey(streamSelected.associatedToken as string);
      const amount = addFundsData.tokenAmount.toString();
      const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;
      setAddFundsPayload(addFundsData);

      const data = {
        contributor: publicKey.toBase58(),                              // contributor
        treasury: treasury.toBase58(),                                  // treasury
        stream: stream.toBase58(),                                      // stream
        amount: `${amount} (${addFundsData.amount})`,                   // amount
      }

      consoleOut('add funds data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamAddFundsData = {
        stream: data.stream,
        contributor: data.contributor,
        treasury: data.treasury,
        asset: workingToken
          ? `${workingToken.symbol} [${workingToken.address}]`
          : associatedToken.toBase58(),
        assetPrice: price,
        amount: addFundsData.amount,
        valueInUsd: price * parseFloat(addFundsData.amount as string)
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

    if (wallet && streamSelected && workingToken ) {
      const token = Object.assign({}, workingToken);
      showAddFundsTransactionModal();
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
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.StreamAddFunds,
              finality: "finalized",
              txInfoFetchStatus: "fetching",
              loadingTitle: "Confirming transaction",
              loadingMessage: `Fund stream with ${formatThousands(
                parseFloat(addFundsData.amount as string),
                token.decimals
              )} ${token.symbol}`,
              completedTitle: "Transaction confirmed",
              completedMessage: `Stream funded with ${formatThousands(
                parseFloat(addFundsData.amount as string),
                token.decimals
              )} ${token.symbol}`,
              extras: {
                multisigAuthority: multisigAuth
              }
            });
            setIsBusy(false);
            onAddFundsTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

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
  const onAcceptPauseStream = (title: string) => {
    consoleOut("Input title for pause stream:", title, 'blue');
    hidePauseStreamModal();
    onExecutePauseStreamTransaction(title);
  };

  const onExecutePauseStreamTransaction = async (title: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamPause);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);

        const data = {
          title: title as string,                          // title
          stream: streamPublicKey.toBase58(),              // stream
          initializer: publicKey.toBase58(),               // initializer
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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

      multisigAuth = multisig.authority.toBase58();

      const pauseStream = await msp.pauseStream(
        new PublicKey(data.payer),                   // payer
        multisig.authority,                          // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(pauseStream.instructions[0].data);
      const ixAccounts = pauseStream.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Pause Stream" : data.title as string,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamPause,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamSelected || !msp) {
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
      
      const streamPublicKey = new PublicKey(streamSelected.id as string);

      const data = {
        title: title as string,                           // title
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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58(), false , splTokenList)
          }) to pay for network fees (${
            getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58(), false , splTokenList)
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
            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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

    if (wallet && streamSelected) {
      showTransactionExecutionModal();
      let created: boolean;
      let streamName = '';
      if (streamSelected.version < 2) {
        streamName = (streamSelected as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamSelected as Stream).name;
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
              extras: {
                multisigAuthority: multisigAuth
              }
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });

            setIsPauseStreamModalVisibility(false);
            setOngoingOperation(undefined);
            onTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const getStreamPauseMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamSelected) {

      const treasury = streamSelected.version && streamSelected.version >= 2
        ? (streamSelected as Stream).treasury
        : (streamSelected as StreamInfo).treasuryAddress as string;

      const beneficiary = streamSelected.version && streamSelected.version >= 2
        ? (streamSelected as Stream).beneficiary
        : (streamSelected as StreamInfo).beneficiaryAddress as string;

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }, [streamSelected, publicKey, t]);

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
  const onAcceptResumeStream = (title: string) => {
    consoleOut("Input title for resume stream:", title, 'blue');
    hideResumeStreamModal();
    onExecuteResumeStreamTransaction(title);
  };

  const onExecuteResumeStreamTransaction = async (title: string) => {
    let transaction: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    const transactionLog: any[] = [];

    setTransactionCancelled(false);
    setOngoingOperation(OperationType.StreamResume);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);

        const data = {
          title: title as string,                          // title
          stream: streamPublicKey.toBase58(),              // stream
          initializer: publicKey.toBase58(),               // initializer
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
              getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
            }) to pay for network fees (${
              getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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

      if (!msp || !multisigAccounts) { return null; }

      if (!isMultisigTreasury()) {
        return await msp.resumeStream(
          new PublicKey(data.payer),             // payer,
          new PublicKey(data.payer),             // treasurer,
          new PublicKey(data.stream),            // stream,
        );
      }

      if (!treasuryDetails || !multisigClient || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      if (!multisig) { return null; }

      multisigAuth = multisig.authority.toBase58();

      const resumeStream = await msp.resumeStream(
        new PublicKey(data.payer),                   // payer
        multisig.authority,                          // treasurer
        new PublicKey(data.stream),                  // stream,
      );

      const ixData = Buffer.from(resumeStream.instructions[0].data);
      const ixAccounts = resumeStream.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Resume Stream" : data.title as string,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamResume,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamSelected || !msp) {
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

      const streamPublicKey = new PublicKey(streamSelected.id as string);
      const data = {
        title: title as string,                           // title
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
            getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
          }) to pay for network fees (${
            getAmountWithSymbol(transactionFees.blockchainFee + transactionFees.mspFlatFee, NATIVE_SOL_MINT.toBase58())
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
            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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

    if (wallet && streamSelected) {
      showTransactionExecutionModal();
      let created: boolean;
      let streamName = '';
      if (streamSelected.version < 2) {
        streamName = (streamSelected as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamSelected as Stream).name;
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
              extras: {
                multisigAuthority: multisigAuth
              }
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });
            
            setIsResumeStreamModalVisibility(false);
            setOngoingOperation(undefined);
            onTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const getStreamResumeMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamSelected) {

      const treasury = streamSelected.version && streamSelected.version >= 2
        ? (streamSelected as Stream).treasury
        : (streamSelected as StreamInfo).treasuryAddress as string;

      const beneficiary = streamSelected.version && streamSelected.version >= 2
        ? (streamSelected as Stream).beneficiary
        : (streamSelected as StreamInfo).beneficiaryAddress as string;

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary)
      });

    }

    return (
      <div>{message}</div>
    );
  }, [publicKey, streamSelected, t]);

  // Close stream modal
  const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
  const showCloseStreamModal = useCallback(() => {
    resetTransactionStatus();

    if (streamSelected) {
      if (streamSelected.version < 2) {
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
    streamSelected,
    getTransactionFees,
    getTransactionFeesV2,
    resetTransactionStatus
  ]);

  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (data: any) => {
    consoleOut('onAcceptCloseStream params:', data, 'blue');
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(data);
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
    let multisigAuthority = '';
    const transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;

        const data = {
          title: closeTreasuryData.title,                             // title
          stream: streamPublicKey.toBase58(),                         // stream
          initializer: publicKey.toBase58(),                          // initializer
          autoCloseTreasury: closeTreasuryData.closeTreasuryOption    // closeTreasury
        }
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamCloseData = {
          asset: workingToken ? workingToken.symbol : '-',
          assetPrice: price,
          stream: data.stream,
          initializer: data.initializer,
          closeTreasury: data.autoCloseTreasury,
          vestedReturns: closeTreasuryData.vestedReturns,
          unvestedReturns: closeTreasuryData.unvestedReturns,
          feeAmount: closeTreasuryData.feeAmount,
          valueInUsd: price * (closeTreasuryData.vestedReturns + closeTreasuryData.unvestedReturns)
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFormButton, segmentData);

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

    const closeStream = async (data: CloseStreamTransactionParams) => {

      consoleOut('closeStream received params:', data, 'blue');

      if (!msp) { return null; }

      if (!isMultisigTreasury()) {        
        return await msp.closeStream(
          new PublicKey(data.payer),              // payer
          new PublicKey(data.payer),              // destination
          new PublicKey(data.stream),             // stream,
          data.closeTreasury,                     // closeTreasury
          true                                    // autoWSol
        );
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) { return null; }

      const treasury = treasuryDetails as Treasury;
      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

      multisigAuthority = multisig.authority.toBase58();

      if (!multisig) { return null; }

      const closeStream = await msp.closeStream(
        new PublicKey(data.payer),              // payer
        new PublicKey(data.payer),              // TODO: This should come from the UI
        new PublicKey(data.stream),             // stream,
        data.closeTreasury,                     // closeTreasury
        false
      );

      const ixData = Buffer.from(closeStream.instructions[0].data);
      const ixAccounts = closeStream.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        data.title === "" ? "Close Stream" : data.title,
        "", // description
        new Date(expirationTime * 1_000),
        OperationType.StreamClose,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData
      );

      return tx;
    }

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamSelected && msp) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address) || getTokenPriceBySymbol(workingToken.symbol) : 0;

        consoleOut('createTxV2 received params:', closeTreasuryData, 'blue');
        const data = {
          title: closeTreasuryData.title,                              // title
          payer: publicKey.toBase58(),                                 // payer
          stream: streamPublicKey.toBase58(),                          // stream
          closeTreasury: closeTreasuryData.closeTreasuryOption         // closeTreasury
        } as CloseStreamTransactionParams;
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamCloseData = {
          asset: workingToken ? workingToken.symbol : '-',
          assetPrice: workingToken ? getTokenPriceBySymbol(workingToken.symbol) : 0,
          stream: data.stream,
          initializer: data.payer,
          closeTreasury: data.closeTreasury,
          vestedReturns: closeTreasuryData.vestedReturns,
          unvestedReturns: closeTreasuryData.unvestedReturns,
          feeAmount: closeTreasuryData.feeAmount,
          valueInUsd: price * (closeTreasuryData.vestedReturns + closeTreasuryData.unvestedReturns)
        };
        consoleOut('segment data:', segmentData, 'brown');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFormButton, segmentData);

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
          customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, { transcript: transactionLog });
          return false;
        }

        consoleOut('Starting closeStream using MSP V2...', '', 'blue');
        // Create a transaction
        const result = await closeStream(data)
        .then(value => {
          if (!value) { return false; }
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

        return result;
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

            // TODO: Apply this check for all modules, try to take Sing and send subroutines to a centrali zed
            const encodedTxForDebugging = signedTransaction.serialize({ verifySignatures: false }).toString('base64');
            consoleOut('encodedTx:', encodedTxForDebugging, 'orange');

            setTransactionStatus({
              lastOperation: TransactionStatus.SignTransaction,
              currentOperation: TransactionStatus.SignTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
              result: {
                signer: `${publicKey.toBase58()}`,
                error: `${error}`,
                encodedTx: encodedTxForDebugging
              }
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
            result: {signer: publicKey.toBase58()}
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
            result: {signer: `${publicKey.toBase58()}`, error: `${error}`}
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

    if (wallet && streamSelected) {
      showCloseStreamTransactionModal();
      let created: boolean;
      let streamName = '';
      if (streamSelected.version < 2) {
        streamName = (streamSelected as StreamInfo).streamName as string;
        created = await createTxV1();
      } else {
        streamName = (streamSelected as Stream).name;
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
              extras: {
                multisigAuthority: multisigAuthority
              }
            });

            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished
            });

            setCloseStreamTransactionModalVisibility(false);
            setOngoingOperation(undefined);
            onCloseStreamTransactionFinished();
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }
  };

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && streamSelected && streamList) {

      const me = publicKey.toBase58();
      const treasury = streamSelected.version < 2
        ? (streamSelected as StreamInfo).treasuryAddress as string
        : (streamSelected as Stream).treasury;
      const treasurer = streamSelected.version < 2
        ? (streamSelected as StreamInfo).treasurerAddress as string
        : (streamSelected as Stream).treasurer;
      const beneficiary = streamSelected.version < 2
        ? (streamSelected as StreamInfo).beneficiaryAddress as string
        : (streamSelected as Stream).beneficiary;
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

  const isNewStream = useCallback(() => {
    if (streamSelected) {
      return streamSelected.version >= 2 ? true : false;
    }

    return false;
  }, [streamSelected]);

  const getStreamAssociatedTokenAddress = useCallback(() => {
    if (streamSelected) {
      const v1 = streamSelected as StreamInfo;
      const v2 = streamSelected as Stream;
      const isNew = isNewStream();
      return isNew
        ? v2.associatedToken.toBase58()
        : v1.associatedToken as string;
    }
  }, [isNewStream, streamSelected]);


  /////////////////////
  // Data management //
  /////////////////////


  // Automatically update all token balances (in token list)
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!publicKey || !splTokenList) {
      return;
    }

    const timeout = setTimeout(() => {
      refreshUserBalances();
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    splTokenList,
    publicKey,
    connection,
    refreshUserBalances
  ]);

  // Read treasury data
  useEffect(() => {
    if (!publicKey || !ms || !msp || !streamSelected) { return; }

    const timeout = setTimeout(() => {
      const v1 = streamSelected as StreamInfo;
      const v2 = streamSelected as Stream;
      const isNewStream = streamSelected.version >= 2 ? true : false;
      const treasuryId = isNewStream ? v2.treasury.toBase58() : v1.treasuryAddress as string;
      if (!treasuryDetails || treasuryDetails.id.toString() !== treasuryId) {
        consoleOut('Reading treasury data...', '', 'blue');
        getTreasuryByTreasuryId(treasuryId, streamSelected.version);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, msp, publicKey, streamSelected]);

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
        consoleOut('getTokenOrCustomToken (MoneyStreamsOutgoingView) ->', token, 'blue');
        setWorkingToken(token);
      });
    }
  }, [getTokenOrCustomToken, publicKey, streamSelected, workingToken]);


  ///////////////
  // Rendering //
  ///////////////

  const hideDetailsHandler = () => {
    onSendFromOutgoingStreamDetails();
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
        case STREAM_STATUS.Schedule:
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

  const renderFundsLeftInAccount = () => {
    if (!streamSelected || !workingToken) {return "--";}

    const v1 = streamSelected as StreamInfo;
    const v2 = streamSelected as Stream;

    return (
      <>
        <span className="info-data large mr-1">
          {
            getAmountWithSymbol(
              isNewStream()
                ? toUiAmount2(v2.fundsLeftInStream, workingToken.decimals)
                : v1.escrowUnvestedAmount,
              workingToken.address,
              false,
              splTokenList,
              workingToken.decimals
            )
          }
        </span>
        <span className="info-icon">
          {(streamSelected && getStreamStatus(streamSelected) === "running") ? (
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
      value: streamSelected ? renderFundsLeftInAccount() : "--"
    },
  ];

  // Dropdown (three dots button)
  const renderDropdownMenu = useCallback(() => {
    return (
      <Menu>
        {(getTreasuryType() === "open" || (getTreasuryType() === "locked" && streamSelected && getStreamStatus(streamSelected) === "stopped")) && (
          <Menu.Item key="mso-00" disabled={isBusy || hasStreamPendingTx()} onClick={showCloseStreamModal}>
            <span className="menu-item-text">Close stream</span>
          </Menu.Item>
        )}
        <Menu.Item key="mso-02">
          <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamSelected && streamSelected.id}${getSolanaExplorerClusterParam()}`} target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('account-area.explorer-link')}</span>
          </a>
        </Menu.Item>
      </Menu>
    );
  }, [getStreamStatus, getTreasuryType, hasStreamPendingTx, isBusy, showCloseStreamModal, streamSelected, t]);

  // Buttons
  const renderButtons = useCallback(() => {
    return (
      <Row gutter={[8, 8]} className="safe-btns-container mb-1 mr-0 ml-0">
        <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke btn-min-width"
            disabled={
              isBusy ||
              !streamSelected ||
              !treasuryDetails ||
              hasStreamPendingTx(OperationType.StreamAddFunds) ||
              isOtp() ||
              isDeletedStream(streamSelected) ||
              getTreasuryType() === "locked"
            }
            onClick={showAddFundsModal}>
              <div className="btn-content">
                Add funds
              </div>
          </Button>
          {(streamSelected && treasuryDetails && getTreasuryType() === "open") && (
            (getStreamStatus(streamSelected) === "stopped-manually") ? (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                disabled={isBusy || hasStreamPendingTx()}
                onClick={showResumeStreamModal}>
                  <div className="btn-content">
                    Resume stream
                  </div>
              </Button>
            ) : (getStreamStatus(streamSelected) === "running") ? (
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke btn-min-width"
                disabled={isBusy || hasStreamPendingTx()}
                onClick={showPauseStreamModal}>
                  <div className="btn-content">
                    Pause stream
                  </div>
              </Button>
            ) : null
          )}
        </Col>
        <Col xs={4} sm={6} md={4} lg={6}>
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
        </Col>
      </Row>
    );
  }, [
    isBusy,
    streamSelected,
    treasuryDetails,
    showResumeStreamModal,
    showPauseStreamModal,
    hasStreamPendingTx,
    renderDropdownMenu,
    showAddFundsModal,
    getStreamStatus,
    getTreasuryType,
    isDeletedStream,
    isOtp,
  ]);

  return (
    <>
      <Spin spinning={loadingStreams}>
        <MoneyStreamDetails
          accountAddress={accountAddress}
          stream={streamSelected}
          hideDetailsHandler={hideDetailsHandler}
          infoData={infoData}
          isStreamOutgoing={true}
          buttons={renderButtons()}
          streamingAccountSelected={streamingAccountSelected}
          selectedToken={workingToken}
        />
      </Spin>

      {isAddFundsModalVisible && (
        <StreamAddFundsModal
          isVisible={isAddFundsModalVisible}
          transactionFees={transactionFees}
          withdrawTransactionFees={withdrawTransactionFees}
          streamDetail={streamSelected}
          nativeBalance={nativeBalance}
          userBalances={userBalances}
          mspClient={
            streamSelected
              ? streamSelected.version < 2
                ? ms
                : msp
              : undefined
          }
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
          selectedToken={workingToken}
        />
      )}

      {isPauseStreamModalVisible && (
        <StreamPauseModal
          isVisible={isPauseStreamModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamSelected}
          handleOk={onAcceptPauseStream}
          handleClose={hidePauseStreamModal}
          content={getStreamPauseMessage()}
        />
      )}

      {isResumeStreamModalVisible && (
        <StreamResumeModal
          isVisible={isResumeStreamModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamSelected}
          handleOk={onAcceptResumeStream}
          handleClose={hideResumeStreamModal}
          content={getStreamResumeMessage()}
        />
      )}

      {isCloseStreamModalVisible && (
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          transactionFees={transactionFees}
          streamDetail={streamSelected}
          mspClient={
            streamSelected
              ? streamSelected.version < 2
                ? ms
                : msp
              : undefined
          }
          handleOk={onAcceptCloseStream}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()}
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
                  parseFloat(addFundsPayload ? addFundsPayload.amount as string : '0'),
                  getStreamAssociatedTokenAddress() || '',
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
                        ? onExecutePauseStreamTransaction(title)
                        : ongoingOperation === OperationType.StreamResume
                          ? onExecuteResumeStreamTransaction(title)
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
    </>
  )
}