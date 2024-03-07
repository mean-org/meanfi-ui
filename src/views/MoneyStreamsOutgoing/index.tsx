import {
  ArrowUpOutlined,
  CheckOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import { MSP_ACTIONS, StreamInfo, STREAM_STATE, TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import {
  calculateFeesForAction,
  PaymentStreaming,
  ACTION_CODES,
  Stream,
  STREAM_STATUS_CODE,
  TransactionFees,
  PaymentStreamingAccount,
  AccountType,
  FundStreamTransactionAccounts,
  AddFundsToAccountTransactionAccounts,
  AllocateFundsToStreamTransactionAccounts,
  PauseResumeStreamTransactionAccounts,
  CloseStreamTransactionAccounts,
} from '@mean-dao/payment-streaming';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Button, Dropdown, Modal, Space, Spin } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import { MoneyStreamDetails } from 'components/MoneyStreamDetails';
import { openNotification } from 'components/Notifications';
import { StreamAddFundsModal } from 'components/StreamAddFundsModal';
import { StreamCloseModal } from 'components/StreamCloseModal';
import { StreamPauseModal } from 'components/StreamPauseModal';
import { StreamResumeModal } from 'components/StreamResumeModal';
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection, useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { IconEllipsisVertical } from 'Icons';
import { appConfig, customLogger } from 'index';
import { fetchAccountTokens } from 'middleware/accounts';
import { getStreamAssociatedMint } from 'middleware/getStreamAssociatedMint';
import { getStreamingAccountType } from 'middleware/getStreamingAccountType';
import { SOL_MINT } from 'middleware/ids';
import { AppUsageEvent, SegmentStreamAddFundsData, SegmentStreamCloseData } from 'middleware/segment-service';
import { DEFAULT_BUDGET_CONFIG, getComputeBudgetIx, sendTx, signTx } from 'middleware/transactions';
import {
  consoleOut,
  getTransactionModalTitle,
  getTransactionOperationDescription,
  getTransactionStatusForLogs,
} from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTokenOrCustomToken,
  getTxIxResume,
  shortenAddress,
  toUiAmount,
} from 'middleware/utils';
import { StreamTopupParams, StreamTopupTxCreateParams } from 'models/common-types';
import { OperationType, TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { CloseStreamParams } from 'models/streams';
import { CloseStreamTransactionParams, StreamTreasuryType } from 'models/treasuries';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MoneyStreamsOutgoingView = (props: {
  loadingStreams: boolean;
  multisigAccounts: MultisigInfo[] | undefined;
  onSendFromOutgoingStreamDetails?: any;
  streamList?: Array<Stream | StreamInfo>;
  streamSelected: Stream | StreamInfo | undefined;
}) => {
  const { loadingStreams, multisigAccounts, onSendFromOutgoingStreamDetails, streamList, streamSelected } = props;

  const {
    splTokenList,
    tokenBalance,
    deletedStreams,
    selectedAccount,
    transactionStatus,
    streamProgramAddress,
    getTokenPriceByAddress,
    getTokenByMintAddress,
    setTransactionStatus,
    refreshTokenBalance,
    setStreamDetail,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const { wallet, publicKey } = useWallet();
  const connection = useConnection();
  const { t } = useTranslation('common');
  const { endpoint } = useConnectionConfig();
  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [userBalances, setUserBalances] = useState<any>();
  const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
  const [lastOperationPayload, setLastOperationPayload] = useState<string>('');
  const [workingToken, setWorkingToken] = useState<TokenInfo | undefined>(undefined);
  // PaymentStreamingAccount related
  const [treasuryDetails, setTreasuryDetails] = useState<PaymentStreamingAccount | TreasuryInfo | undefined>(undefined);

  ////////////
  //  Init  //
  ////////////

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(
    () => new MoneyStreaming(endpoint, streamProgramAddress, 'confirmed'),
    [endpoint, streamProgramAddress],
  );

  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, mspV2AddressPK, 'confirmed');
  }, [connection, mspV2AddressPK]);

  // Create and cache Multisig client instance
  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !endpoint) {
      return null;
    }

    return new MeanMultisig(endpoint, publicKey, 'confirmed', multisigAddressPK);
  }, [endpoint, publicKey, connection, multisigAddressPK]);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const setFailureStatusAndNotify = useCallback(
    (txStep: 'sign' | 'send') => {
      const operation =
        txStep === 'sign' ? TransactionStatus.SignTransactionFailure : TransactionStatus.SendTransactionFailure;
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: operation,
      });
      openNotification({
        title: t('notifications.error-title'),
        description: t('notifications.error-sending-transaction'),
        type: 'error',
      });
      setIsBusy(false);
    },
    [setTransactionStatus, t, transactionStatus.currentOperation],
  );

  const setSuccessStatus = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  // confirmationHistory
  const hasStreamPendingTx = useCallback(
    (type?: OperationType) => {
      if (!streamSelected) {
        return false;
      }

      if (confirmationHistory && confirmationHistory.length > 0) {
        if (type !== undefined) {
          return confirmationHistory.some(
            h => h.extras === streamSelected.id && h.txInfoFetchStatus === 'fetching' && h.operationType === type,
          );
        }
        if (type !== undefined) {
          return confirmationHistory.some(
            h => h.extras === streamSelected.id && h.txInfoFetchStatus === 'fetching' && h.operationType === type,
          );
        }
        return confirmationHistory.some(h => h.extras === streamSelected.id && h.txInfoFetchStatus === 'fetching');
      }

      return false;
    },
    [confirmationHistory, streamSelected],
  );

  const isOtp = useCallback((): boolean => {
    if (!streamSelected) {
      return false;
    }
    const rate = +streamSelected.rateAmount.toString();
    return !rate;
  }, [streamSelected]);

  const isDeletedStream = useCallback(
    (stream: Stream | StreamInfo) => {
      if (!deletedStreams) {
        return false;
      }
      const v1 = stream as StreamInfo;
      const v2 = stream as Stream;
      const isNew = stream.version >= 2;
      const streamId = isNew ? v2.id?.toString() : (v1.id as string);
      return deletedStreams.some(i => i === streamId);
    },
    [deletedStreams],
  );

  const getTreasuryType = useCallback((): StreamTreasuryType | undefined => {
    if (treasuryDetails) {
      const type = getStreamingAccountType(treasuryDetails);
      if (type === AccountType.Lock) {
        return 'locked';
      } else {
        return 'open';
      }
    }

    return 'unknown';
  }, [treasuryDetails]);

  const getTreasuryByTreasuryId = useCallback(
    async (treasuryId: string, streamVersion: number): Promise<StreamTreasuryType | undefined> => {
      if (!connection || !publicKey || !ms || !paymentStreaming) {
        return undefined;
      }

      const treasuryPk = new PublicKey(treasuryId);
      try {
        let details: PaymentStreamingAccount | TreasuryInfo | undefined = undefined;
        if (streamVersion < 2) {
          details = await ms.getTreasury(treasuryPk);
        } else {
          details = await paymentStreaming.getAccount(treasuryPk);
        }
        setTreasuryDetails(details);
        consoleOut('treasuryDetails:', details, 'blue');
      } catch (error) {
        console.error(error);
      }
    },
    [ms, paymentStreaming, publicKey, connection],
  );

  const refreshUserBalances = useCallback(
    (source?: PublicKey) => {
      if (!connection || !publicKey || !splTokenList) {
        return;
      }

      const balancesMap: any = {};
      const pk = source ?? publicKey;
      consoleOut('Reading balances for:', pk.toBase58(), 'darkpurple');

      connection.getBalance(pk).then(solBalance => {
        const uiBalance = getAmountFromLamports(solBalance);
        balancesMap[NATIVE_SOL.address] = uiBalance;
        setNativeBalance(uiBalance);
      });

      fetchAccountTokens(connection, pk)
        .then(accTks => {
          if (accTks) {
            for (const item of accTks) {
              const address = item.parsedInfo.mint;
              const balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
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
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [publicKey, connection],
  );

  // Transaction execution (Applies to all transactions)
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const isSuccess = useCallback((): boolean => {
    return transactionStatus.currentOperation === TransactionStatus.TransactionFinished;
  }, [transactionStatus.currentOperation]);

  const isError = useCallback((): boolean => {
    return !!(
      transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation === TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure ||
      transactionStatus.currentOperation === TransactionStatus.FeatureTemporarilyDisabled
    );
  }, [transactionStatus.currentOperation]);

  const getTransactionFees = useCallback(
    async (action: MSP_ACTIONS): Promise<TransactionFees> => {
      return await calculateActionFees(connection, action);
    },
    [connection],
  );

  const getTransactionFeesV2 = useCallback(async (action: ACTION_CODES): Promise<TransactionFees> => {
    return await calculateFeesForAction(action);
  }, []);

  //////////////////////
  // MODALS & ACTIONS //
  //////////////////////

  // Close stream Transaction execution modal
  const [isCloseStreamTransactionModalVisible, setCloseStreamTransactionModalVisibility] = useState(false);
  const showCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(true), []);
  const hideCloseStreamTransactionModal = useCallback(() => setCloseStreamTransactionModalVisibility(false), []);

  // Common reusable transaction execution modal
  const [isTransactionExecutionModalVisible, setTransactionExecutionModalVisibility] = useState(false);
  const showTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(true), []);
  const hideTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(false), []);

  // Add funds Transaction execution modal
  const [isAddFundsTransactionModalVisible, setAddFundsTransactionModalVisibility] = useState(false);
  const showAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(true), []);
  const hideAddFundsTransactionModal = useCallback(() => setAddFundsTransactionModalVisibility(false), []);

  const refreshPage = useCallback(() => {
    hideTransactionExecutionModal();
    window.location.reload();
  }, [hideTransactionExecutionModal]);

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
        getTransactionFeesV2(ACTION_CODES.AddFundsToAccount).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
        getTransactionFeesV2(ACTION_CODES.WithdrawFromStream).then(value => {
          setWithdrawTransactionFees(value);
          consoleOut('withdrawTransactionFees:', value, 'orange');
        });
      }
      setIsAddFundsModalVisibility(true);
    }
    setTimeout(() => {
      refreshTokenBalance();
    }, 100);
  }, [streamSelected, getTransactionFeesV2, refreshUserBalances, refreshTokenBalance, getTransactionFees]);

  const closeAddFundsModal = useCallback(() => {
    setIsAddFundsModalVisibility(false);
  }, []);

  const [addFundsPayload, setAddFundsPayload] = useState<StreamTopupParams>();
  const onAcceptAddFunds = (data: StreamTopupParams) => {
    closeAddFundsModal();
    consoleOut('AddFunds input:', data, 'blue');
    onExecuteAddFundsTransaction(data);
  };

  const onAddFundsTransactionFinished = useCallback(() => {
    setSuccessStatus();
    hideAddFundsTransactionModal();
    refreshTokenBalance();
  }, [hideAddFundsTransactionModal, refreshTokenBalance, setSuccessStatus]);

  const onExecuteAddFundsTransaction = async (addFundsData: StreamTopupParams) => {
    let createdTransaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    let transactionLog: any[] = [];

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
      if (!paymentStreaming) {
        return false;
      }

      // Create a transaction
      try {
        const accounts: FundStreamTransactionAccounts = {
          feePayer: payload.payer, // feePayer
          psAccount: payload.treasury, // psAccount
          owner: payload.contributor, // owner
          stream: payload.stream, // stream
        };
        const { transaction } = await paymentStreaming.buildFundStreamTransaction(
          accounts, // accounts
          payload.amount, // amount
          false, // autoWSol
        );
        consoleOut('fundStream returned transaction:', transaction);
        setTransactionStatus({
          lastOperation: TransactionStatus.InitTransactionSuccess,
          currentOperation: TransactionStatus.SignTransaction,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
          result: getTxIxResume(transaction),
        });
        createdTransaction = transaction;
        return true;
      } catch (error) {
        console.error('fundStream error:', error);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.InitTransactionFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
          result: `${error}`,
        });
        customLogger.logError('Add funds transaction failed', {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const allocateToStream = async (data: StreamTopupTxCreateParams) => {
      if (!paymentStreaming) {
        return null;
      }

      if (data.stream === '') {
        const accounts: AddFundsToAccountTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          contributor: new PublicKey(data.contributor), // contributor
          psAccount: new PublicKey(data.treasury), // treasury
          psAccountMint: new PublicKey(data.associatedToken), // psAccountMint
        };
        const { transaction } = await paymentStreaming.buildAddFundsToAccountTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        return transaction;
      }

      if (!isMultisigContext) {
        const accounts: AllocateFundsToStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          psAccount: new PublicKey(data.treasury), // treasury
          owner: new PublicKey(data.contributor), // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
          accounts, // accounts
          data.amount, // amount
        );
        return transaction;
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const treasury = treasuryDetails as PaymentStreamingAccount;
      const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

      if (!multisig) {
        return null;
      }

      multisigAuth = multisig.authority.toBase58();

      const accounts: AllocateFundsToStreamTransactionAccounts = {
        feePayer: new PublicKey(data.payer), // feePayer
        psAccount: new PublicKey(data.treasury), // treasury
        owner: new PublicKey(multisig.authority), // owner
        stream: new PublicKey(data.stream), // stream
      };
      const { transaction } = await paymentStreaming.buildAllocateFundsToStreamTransaction(
        accounts, // accounts
        data.amount, // amount
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());
      const proposalTitle = data.proposalTitle;
      const tx = await multisigClient.buildCreateProposalTransaction(
        publicKey,
        proposalTitle,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.StreamAddFunds,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
        getComputeBudgetIx(DEFAULT_BUDGET_CONFIG),
      );

      return tx?.transaction ?? null;
    };

    const fundFromTreasury = async (payload: {
      payer: PublicKey;
      treasurer: PublicKey;
      treasury: PublicKey;
      stream: PublicKey;
      amount: number | string;
    }) => {
      if (!paymentStreaming) {
        return false;
      }
      // Create a transaction
      const data: StreamTopupTxCreateParams = {
        payer: payload.payer.toBase58(),
        contributor: payload.payer.toBase58(),
        treasury: payload.treasury.toBase58(),
        stream: payload.stream.toBase58(),
        amount: payload.amount,
        associatedToken: addFundsData.associatedToken,
        proposalTitle: addFundsData.proposalTitle,
      };
      return await allocateToStream(data)
        .then(value => {
          if (!value) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: 'Transaction could not be created',
            });
            customLogger.logError('Allocate transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
              transcript: transactionLog,
            });
            return false;
          }
          consoleOut('allocate returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getTxIxResume(value),
          });
          createdTransaction = value;
          return true;
        })
        .catch(error => {
          console.error('allocate error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError('Allocate transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
            transcript: transactionLog,
          });
          return false;
        });
    };

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const stream = new PublicKey(streamSelected.id as string);
        const treasury = new PublicKey((streamSelected as StreamInfo).treasuryAddress as string);
        const contributorMint = getStreamAssociatedMint(streamSelected);
        const amount = parseFloat(addFundsData.amount as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0;
        setAddFundsPayload(addFundsData);

        const data = {
          contributor: publicKey.toBase58(), // contributor
          treasury: treasury.toBase58(), // treasury
          stream: stream.toBase58(), // stream
          contributorMint: contributorMint, // contributorMint
          amount, // amount
        };
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
          valueInUsd: price * amount,
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('Add funds transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting addFunds using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms
          .addFunds(
            publicKey,
            treasury,
            stream,
            new PublicKey(contributorMint),
            amount,
            1, // former AllocationType.Specific
          )
          .then(value => {
            consoleOut('addFunds returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            createdTransaction = value;
            return true;
          })
          .catch(error => {
            console.error('addFunds error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Add funds transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Add funds transaction failed', {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (!publicKey || !streamSelected || !workingToken || !paymentStreaming) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Add funds transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      const stream = (streamSelected as Stream).id;
      const treasury = (streamSelected as Stream).psAccount;
      const streamMint = getStreamAssociatedMint(streamSelected);
      const associatedToken = new PublicKey(streamMint);
      const amount = addFundsData.tokenAmount.toString();
      const price = workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0;
      setAddFundsPayload(addFundsData);

      const data = {
        contributor: selectedAccount.address, // contributor
        treasury: treasury.toBase58(), // treasury
        stream: stream.toBase58(), // stream
        amount: `${amount} (${addFundsData.amount})`, // amount
      };

      consoleOut('add funds data:', data);

      // Report event to Segment analytics
      const segmentData: SegmentStreamAddFundsData = {
        stream: data.stream,
        contributor: data.contributor,
        treasury: data.treasury,
        asset: workingToken ? `${workingToken.symbol} [${workingToken.address}]` : associatedToken.toBase58(),
        assetPrice: price,
        amount: addFundsData.amount,
        valueInUsd: price * parseFloat(addFundsData.amount as string),
      };
      consoleOut('segment data:', segmentData, 'blue');
      segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupApproveFormButton, segmentData);

      // Log input data
      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        inputs: data,
      });

      transactionLog.push({
        action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
        result: '',
      });

      // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
      // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
      consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(
            transactionFees.blockchainFee + transactionFees.mspFlatFee,
            SOL_MINT.toBase58(),
          )})`,
        });
        customLogger.logWarning('Add funds transaction failed', {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamTopupFailed, {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut('onExecuteAddFundsTransaction ->', '/src/views/MoneyStreamsOutgoingView', 'darkcyan');
      if (addFundsData.fundFromTreasury) {
        consoleOut('Starting allocate using MSP V2...', '', 'blue');
        return await fundFromTreasury({
          payer: new PublicKey(data.contributor),
          treasurer: new PublicKey(data.contributor),
          treasury: treasury,
          stream: stream,
          amount: amount,
        });
      } else {
        consoleOut('Starting addFunds using MSP V2...', '', 'blue');
        return await fundFromWallet({
          payer: publicKey,
          contributor: publicKey,
          treasury: treasury,
          stream: stream,
          amount: amount,
        });
      }
    };

    if (wallet && publicKey && streamSelected && workingToken) {
      const token = { ...workingToken } as TokenInfo;
      showAddFundsTransactionModal();
      let created: boolean;
      if (streamSelected.version < 2) {
        created = await createTxV1();
      } else {
        created = await createTxV2();
      }
      consoleOut('created:', created, 'blue');
      if (created && !transactionCancelled) {
        const sign = await signTx('Add Funds', wallet, publicKey, createdTransaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Add Funds', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const fundTargetMultisig = 'fund stream with';
            const fundTargetSingleSigner = 'Fund stream with';
            const targetFundedSingleSigner = 'Stream funded with';
            const loadingMessage = multisigAuth
              ? `Create proposal to ${fundTargetMultisig} ${formatThousands(
                  parseFloat(addFundsData.amount as string),
                  token.decimals,
                )} ${token.symbol}`
              : `${fundTargetSingleSigner} ${formatThousands(
                  parseFloat(addFundsData.amount as string),
                  token.decimals,
                )} ${token.symbol}`;
            const completedMessage = multisigAuth
              ? `Proposal to ${fundTargetMultisig} ${formatThousands(
                  parseFloat(addFundsData.amount as string),
                  token.decimals,
                )} ${token.symbol} was submitted for Multisig approval.`
              : `${targetFundedSingleSigner} ${formatThousands(
                  parseFloat(addFundsData.amount as string),
                  token.decimals,
                )} ${token.symbol}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.StreamAddFunds,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage,
              extras: {
                multisigAuthority: multisigAuth,
              },
            });
            onAddFundsTransactionFinished();
          } else {
            setFailureStatusAndNotify('send');
          }
        } else {
          setFailureStatusAndNotify('sign');
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  // Pause stream modal
  const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
  const showPauseStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as PaymentStreamingAccount;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(ACTION_CODES.PauseStream).then(value => {
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
  }, [treasuryDetails, getTransactionFees, getTransactionFeesV2, resetTransactionStatus]);

  const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
  const onTransactionFinished = useCallback(() => {
    setIsBusy(false);
    resetTransactionStatus();
    hideTransactionExecutionModal();
    refreshTokenBalance();
  }, [hideTransactionExecutionModal, refreshTokenBalance, resetTransactionStatus]);

  const onExecutePauseStreamTransaction = useCallback(
    async (title: string) => {
      let transaction: Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let multisigAuth = '';
      let transactionLog: any[] = [];

      setTransactionCancelled(false);
      setOngoingOperation(OperationType.StreamPause);
      setIsBusy(true);

      const createTxV1 = async (): Promise<boolean> => {
        if (wallet && publicKey && streamSelected) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });
          const streamPublicKey = new PublicKey(streamSelected.id as string);

          const data = {
            title, // title
            stream: streamPublicKey.toBase58(), // stream
            initializer: publicKey.toBase58(), // initializer
          };
          consoleOut('data:', data);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: data,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Pause stream transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          consoleOut('Starting Stream Pause using MSP V1...', '', 'blue');
          // Create a transaction
          return await ms
            .pauseStream(
              publicKey, // Initializer public key
              streamPublicKey, // Stream ID
            )
            .then(value => {
              consoleOut('pauseStream returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('pauseStream error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Pause stream transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Pause stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const pauseStream = async (data: any) => {
        if (!paymentStreaming) {
          return null;
        }

        if (!isMultisigContext) {
          const accounts: PauseResumeStreamTransactionAccounts = {
            feePayer: new PublicKey(data.payer), // feePayer
            owner: new PublicKey(data.payer), // owner
            stream: new PublicKey(data.stream), // stream
          };
          const { transaction } = await paymentStreaming.buildPauseStreamTransaction(accounts);
          return transaction;
        }

        if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) {
          return null;
        }

        const treasury = treasuryDetails as PaymentStreamingAccount;
        const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

        if (!multisig) {
          return null;
        }

        multisigAuth = multisig.authority.toBase58();

        const accounts: PauseResumeStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          owner: multisig.authority, // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await paymentStreaming.buildPauseStreamTransaction(accounts);

        const ixData = Buffer.from(transaction.instructions[0].data);
        const ixAccounts = transaction.instructions[0].keys;
        const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await multisigClient.buildCreateProposalTransaction(
          publicKey,
          data.title === '' ? 'Pause Stream' : (data.title as string),
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.StreamPause,
          multisig.id,
          mspV2AddressPK,
          ixAccounts,
          ixData,
          getComputeBudgetIx(DEFAULT_BUDGET_CONFIG),
        );

        return tx?.transaction ?? null;
      };

      const createTxV2 = async (): Promise<boolean> => {
        if (!publicKey || !streamSelected || !paymentStreaming) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Pause stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const streamPublicKey = new PublicKey(streamSelected.id as string);

        const data = {
          title, // title
          stream: streamPublicKey.toBase58(), // stream
          payer: selectedAccount.address, // payer
        };

        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
              false,
              splTokenList,
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
              false,
              splTokenList,
            )})`,
          });
          customLogger.logWarning('Pause stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Stream Pause using MSP V2...', '', 'blue');
        // Create a transaction
        const result = await pauseStream(data)
          .then(value => {
            if (!value) {
              return false;
            }
            consoleOut('pauseStream returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('pauseStream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Pause stream transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet && publicKey && streamSelected) {
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
          const sign = await signTx('Pause Stream', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Pause Stream', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature && !transactionCancelled) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              const loadingMessage = multisigAuth
                ? `Create proposal to pause stream ${streamName}`
                : `Pause stream: ${streamName}`;
              const completedMessage = multisigAuth
                ? `Proposal to pause stream ${streamName} was submitted for Multisig approval.`
                : `Successfully paused stream: ${streamName}`;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.StreamPause,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage,
                completedTitle: 'Transaction confirmed',
                completedMessage,
                extras: {
                  multisigAuthority: multisigAuth,
                },
              });
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished,
              });
              setIsPauseStreamModalVisibility(false);
              setOngoingOperation(undefined);
              setLastOperationPayload('');
              onTransactionFinished();
            } else {
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.SendTransactionFailure,
              });
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: 'error',
              });
              setIsBusy(false);
            }
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      connection,
      enqueueTransactionConfirmation,
      isMultisigContext,
      ms,
      mspV2AddressPK,
      multisigAccounts,
      multisigClient,
      nativeBalance,
      onTransactionFinished,
      paymentStreaming,
      publicKey,
      selectedAccount.address,
      setTransactionStatus,
      showTransactionExecutionModal,
      splTokenList,
      streamSelected,
      t,
      transactionCancelled,
      transactionFees.blockchainFee,
      transactionFees.mspFlatFee,
      transactionStatus.currentOperation,
      treasuryDetails,
      wallet,
    ],
  );

  const onAcceptPauseStream = useCallback(
    (title: string) => {
      consoleOut('Input title for pause stream:', title, 'blue');
      hidePauseStreamModal();
      setLastOperationPayload(title);
      onExecutePauseStreamTransaction(title);
    },
    [hidePauseStreamModal, onExecutePauseStreamTransaction],
  );

  const getStreamPauseMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamSelected) {
      const treasury =
        streamSelected.version && streamSelected.version >= 2
          ? (streamSelected as Stream).psAccount.toBase58()
          : ((streamSelected as StreamInfo).treasuryAddress as string);

      const beneficiary =
        streamSelected.version && streamSelected.version >= 2
          ? (streamSelected as Stream).beneficiary.toBase58()
          : ((streamSelected as StreamInfo).beneficiaryAddress as string);

      message = t('streams.pause-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary),
      });
    }

    return <div>{message}</div>;
  }, [streamSelected, publicKey, t]);

  // Resume stream modal
  const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
  const showResumeStreamModal = useCallback(() => {
    resetTransactionStatus();
    if (treasuryDetails) {
      const v2 = treasuryDetails as PaymentStreamingAccount;
      if (v2.version && v2.version >= 2) {
        getTransactionFeesV2(ACTION_CODES.ResumeStream).then(value => {
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
  }, [treasuryDetails, getTransactionFees, getTransactionFeesV2, resetTransactionStatus]);

  const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);

  const onExecuteResumeStreamTransaction = useCallback(
    async (title: string) => {
      let transaction: Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let multisigAuth = '';
      let transactionLog: any[] = [];

      setTransactionCancelled(false);
      setOngoingOperation(OperationType.StreamResume);
      setIsBusy(true);

      const createTxV1 = async (): Promise<boolean> => {
        if (wallet && publicKey && streamSelected) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });
          const streamPublicKey = new PublicKey(streamSelected.id as string);

          const data = {
            title, // title
            stream: streamPublicKey.toBase58(), // stream
            initializer: publicKey.toBase58(), // initializer
          };
          consoleOut('data:', data);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: data,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Resume stream transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          consoleOut('Starting Stream Resume using MSP V1...', '', 'blue');
          // Create a transaction
          return await ms
            .resumeStream(
              publicKey, // Initializer public key
              streamPublicKey, // Stream ID
            )
            .then(value => {
              consoleOut('resumeStream returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('resumeStream error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Resume stream transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Resume stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const resumeStream = async (data: any) => {
        if (!paymentStreaming || !multisigAccounts) {
          return null;
        }

        if (!isMultisigContext) {
          const accounts: PauseResumeStreamTransactionAccounts = {
            feePayer: new PublicKey(data.payer), // feePayer
            owner: new PublicKey(data.payer), // owner
            stream: new PublicKey(data.stream), // stream
          };
          const { transaction } = await paymentStreaming.buildResumeStreamTransaction(accounts);
          return transaction;
        }

        if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) {
          return null;
        }

        const treasury = treasuryDetails as PaymentStreamingAccount;
        const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

        if (!multisig) {
          return null;
        }

        multisigAuth = multisig.authority.toBase58();

        const accounts: PauseResumeStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          owner: multisig.authority, // owner
          stream: new PublicKey(data.stream), // stream
        };
        const { transaction } = await paymentStreaming.buildResumeStreamTransaction(accounts);

        const ixData = Buffer.from(transaction.instructions[0].data);
        const ixAccounts = transaction.instructions[0].keys;
        const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await multisigClient.buildCreateProposalTransaction(
          publicKey,
          data.title === '' ? 'Resume Stream' : (data.title as string),
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.StreamResume,
          multisig.id,
          mspV2AddressPK,
          ixAccounts,
          ixData,
          getComputeBudgetIx(DEFAULT_BUDGET_CONFIG),
        );

        return tx?.transaction ?? null;
      };

      const createTxV2 = async (): Promise<boolean> => {
        if (!publicKey || !streamSelected || !paymentStreaming) {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Resume stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });

        const streamPublicKey = new PublicKey(streamSelected.id as string);
        const data = {
          title, // title
          stream: streamPublicKey.toBase58(), // stream
          payer: selectedAccount.address, // payer
        };

        consoleOut('data:', data);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logWarning('Resume stream transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting Stream Resume using MSP V2...', '', 'blue');
        // Create a transaction
        const result = await resumeStream(data)
          .then(value => {
            if (!value) {
              return false;
            }
            consoleOut('resumeStream returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('resumeStream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Resume stream transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet && publicKey && streamSelected) {
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
          const sign = await signTx('Resume Stream', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Resume Stream', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature && !transactionCancelled) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              const loadingMessage = multisigAuth
                ? `Create proposal to resume stream ${streamName}`
                : `Resume stream: ${streamName}`;
              const completedMessage = multisigAuth
                ? `Proposal to resume stream ${streamName} was submitted for Multisig approval.`
                : `Successfully resumed stream: ${streamName}`;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.StreamResume,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage,
                completedTitle: 'Transaction confirmed',
                completedMessage,
                extras: {
                  multisigAuthority: multisigAuth,
                },
              });
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.TransactionFinished,
              });
              setIsResumeStreamModalVisibility(false);
              setOngoingOperation(undefined);
              setLastOperationPayload('');
              onTransactionFinished();
            } else {
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.SendTransactionFailure,
              });
              openNotification({
                title: t('notifications.error-title'),
                description: t('notifications.error-sending-transaction'),
                type: 'error',
              });
              setIsBusy(false);
            }
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionFailure,
            });
            openNotification({
              title: t('notifications.error-title'),
              description: t('notifications.error-sending-transaction'),
              type: 'error',
            });
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      connection,
      enqueueTransactionConfirmation,
      isMultisigContext,
      ms,
      mspV2AddressPK,
      multisigAccounts,
      multisigClient,
      nativeBalance,
      onTransactionFinished,
      paymentStreaming,
      publicKey,
      selectedAccount.address,
      setTransactionStatus,
      showTransactionExecutionModal,
      streamSelected,
      t,
      transactionCancelled,
      transactionFees.blockchainFee,
      transactionFees.mspFlatFee,
      transactionStatus.currentOperation,
      treasuryDetails,
      wallet,
    ],
  );

  const onAcceptResumeStream = useCallback(
    (title: string) => {
      consoleOut('Input title for resume stream:', title, 'blue');
      hideResumeStreamModal();
      setLastOperationPayload(title);
      onExecuteResumeStreamTransaction(title);
    },
    [hideResumeStreamModal, onExecuteResumeStreamTransaction],
  );

  const getStreamResumeMessage = useCallback(() => {
    let message = '';

    if (publicKey && streamSelected) {
      const treasury =
        streamSelected.version && streamSelected.version >= 2
          ? (streamSelected as Stream).psAccount.toBase58()
          : ((streamSelected as StreamInfo).treasuryAddress as string);

      const beneficiary =
        streamSelected.version && streamSelected.version >= 2
          ? (streamSelected as Stream).beneficiary.toBase58()
          : ((streamSelected as StreamInfo).beneficiaryAddress as string);

      message = t('streams.resume-stream-confirmation', {
        treasury: shortenAddress(treasury),
        beneficiary: shortenAddress(beneficiary),
      });
    }

    return <div>{message}</div>;
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
        getTransactionFeesV2(ACTION_CODES.CloseStream).then(value => {
          setTransactionFees(value);
          consoleOut('transactionFees:', value, 'orange');
        });
      }
      setIsCloseStreamModalVisibility(true);
    }
  }, [streamSelected, getTransactionFees, getTransactionFeesV2, resetTransactionStatus]);

  const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
  const onAcceptCloseStream = (data: CloseStreamParams) => {
    consoleOut('onAcceptCloseStream params:', data, 'blue');
    hideCloseStreamModal();
    onExecuteCloseStreamTransaction(data);
  };

  const onExecuteCloseStreamTransaction = async (closeTreasuryData: CloseStreamParams) => {
    let transaction: Transaction | null = null;
    let signature: any;
    let encodedTx: string;
    let multisigAuth = '';
    let transactionLog: any[] = [];

    resetTransactionStatus();
    setTransactionCancelled(false);
    setIsBusy(true);

    const createTxV1 = async (): Promise<boolean> => {
      if (wallet && publicKey && streamSelected) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0;

        const data = {
          title: closeTreasuryData.title, // title
          stream: streamPublicKey.toBase58(), // stream
          initializer: publicKey.toBase58(), // initializer
          autoCloseTreasury: closeTreasuryData.closeTreasuryOption, // closeTreasury
        };
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
          feeAmount: closeTreasuryData.feeAmount ?? 0,
          valueInUsd: price * (closeTreasuryData.vestedReturns + closeTreasuryData.unvestedReturns),
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logError('Close stream transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting closeStream using MSP V1...', '', 'blue');
        // Create a transaction
        return await ms
          .closeStream(
            publicKey, // Initializer public key
            streamPublicKey, // Stream ID
            closeTreasuryData.closeTreasuryOption, // closeTreasury
          )
          .then(value => {
            consoleOut('closeStream returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('closeStream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Close stream transaction failed', {
              transcript: transactionLog,
            });
            segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, {
              transcript: transactionLog,
            });
            return false;
          });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close stream transaction failed', {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, {
          transcript: transactionLog,
        });
        return false;
      }
    };

    const closeStream = async (data: CloseStreamTransactionParams) => {
      consoleOut('closeStream received params:', data, 'blue');

      if (!paymentStreaming) {
        return null;
      }

      if (!isMultisigContext) {
        const accounts: CloseStreamTransactionAccounts = {
          feePayer: new PublicKey(data.payer), // feePayer
          stream: new PublicKey(data.stream), // stream
          destination: new PublicKey(data.payer), // destination
        };
        const { transaction } = await paymentStreaming.buildCloseStreamTransaction(
          accounts, // accounts
          data.closeTreasury, // closeTreasury
          false, // autoWSol
        );
        return transaction;
      }

      if (!treasuryDetails || !multisigClient || !multisigAccounts || !publicKey) {
        return null;
      }

      const treasury = treasuryDetails as PaymentStreamingAccount;
      const multisig = multisigAccounts.find(m => m.authority.equals(treasury.owner));

      if (!multisig) {
        return null;
      }

      multisigAuth = multisig.authority.toBase58();

      if (!multisig) {
        return null;
      }

      const accounts: CloseStreamTransactionAccounts = {
        feePayer: new PublicKey(data.payer), // feePayer
        stream: new PublicKey(data.stream), // stream
        destination: new PublicKey(data.payer), // destination
      };
      const { transaction } = await paymentStreaming.buildCloseStreamTransaction(
        accounts, // accounts
        data.closeTreasury, // closeTreasury
        false, // autoWSol
      );

      const ixData = Buffer.from(transaction.instructions[0].data);
      const ixAccounts = transaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.buildCreateProposalTransaction(
        publicKey,
        data.title === '' ? 'Close Stream' : data.title,
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.StreamClose,
        multisig.id,
        mspV2AddressPK,
        ixAccounts,
        ixData,
        getComputeBudgetIx(DEFAULT_BUDGET_CONFIG),
      );

      return tx?.transaction ?? null;
    };

    const createTxV2 = async (): Promise<boolean> => {
      if (publicKey && streamSelected && paymentStreaming) {
        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction,
        });
        const streamPublicKey = new PublicKey(streamSelected.id as string);
        const price = workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0;

        consoleOut('createTxV2 received params:', closeTreasuryData, 'blue');
        const data = {
          title: closeTreasuryData.title, // title
          payer: selectedAccount.address, // payer
          stream: streamPublicKey.toBase58(), // stream
          closeTreasury: closeTreasuryData.closeTreasuryOption, // closeTreasury
        } as CloseStreamTransactionParams;
        consoleOut('data:', data);

        // Report event to Segment analytics
        const segmentData: SegmentStreamCloseData = {
          asset: workingToken ? workingToken.symbol : '-',
          assetPrice: workingToken ? getTokenPriceByAddress(workingToken.address, workingToken.symbol) : 0,
          stream: data.stream,
          initializer: data.payer,
          closeTreasury: data.closeTreasury,
          vestedReturns: closeTreasuryData.vestedReturns,
          unvestedReturns: closeTreasuryData.unvestedReturns,
          feeAmount: closeTreasuryData.feeAmount ?? 0,
          valueInUsd: price * (closeTreasuryData.vestedReturns + closeTreasuryData.unvestedReturns),
        };
        consoleOut('segment data:', segmentData, 'blue');
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFormButton, segmentData);

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: data,
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: '',
        });

        // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
        // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
        consoleOut('blockchainFee:', transactionFees.blockchainFee + transactionFees.mspFlatFee, 'blue');
        consoleOut('nativeBalance:', nativeBalance, 'blue');
        if (nativeBalance < transactionFees.blockchainFee + transactionFees.mspFlatFee) {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.TransactionStartFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
            result: `Not enough balance (${getAmountWithSymbol(
              nativeBalance,
              SOL_MINT.toBase58(),
            )}) to pay for network fees (${getAmountWithSymbol(
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              SOL_MINT.toBase58(),
            )})`,
          });
          customLogger.logError('Close stream transaction failed', {
            transcript: transactionLog,
          });
          segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, {
            transcript: transactionLog,
          });
          return false;
        }

        consoleOut('Starting closeStream using MSP V2...', '', 'blue');
        // Create a transaction
        const result = await closeStream(data)
          .then(value => {
            if (!value) {
              return false;
            }
            consoleOut('closeStream returned transaction:', value);
            setTransactionStatus({
              lastOperation: TransactionStatus.InitTransactionSuccess,
              currentOperation: TransactionStatus.SignTransaction,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
              result: getTxIxResume(value),
            });
            transaction = value;
            return true;
          })
          .catch(error => {
            console.error('closeStream error:', error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: `${error}`,
            });
            customLogger.logError('Close stream transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Close stream transaction failed', {
          transcript: transactionLog,
        });
        segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFailed, {
          transcript: transactionLog,
        });
        return false;
      }
    };

    if (wallet && publicKey && streamSelected) {
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
        const sign = await signTx('Close Stream', wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx('Close Stream', connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            const loadingMessage = multisigAuth
              ? `Create proposal to close stream ${streamName}`
              : `Close stream: ${streamName}`;
            const completedMessage = multisigAuth
              ? `Proposal to close stream ${streamName} was submitted for Multisig approval.`
              : `Successfully closed stream: ${streamName}`;
            enqueueTransactionConfirmation({
              signature,
              operationType: OperationType.StreamClose,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage,
              completedTitle: 'Transaction confirmed',
              completedMessage,
              extras: {
                multisigAuthority: multisigAuth,
              },
            });
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionFinished,
            });
            setCloseStreamTransactionModalVisibility(false);
            setOngoingOperation(undefined);
            onCloseStreamTransactionFinished();
          } else {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SendTransactionFailure,
            });
            setIsBusy(false);
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          setIsBusy(false);
        }
      } else {
        setIsBusy(false);
      }
    }
  };

  const getStreamClosureMessage = () => {
    let message = '';

    if (publicKey && streamSelected && streamList) {
      const me = publicKey.toBase58();
      const treasury =
        streamSelected.version < 2
          ? ((streamSelected as StreamInfo).treasuryAddress as string)
          : (streamSelected as Stream).psAccount.toBase58();
      const treasurer =
        streamSelected.version < 2
          ? ((streamSelected as StreamInfo).treasurerAddress as string)
          : (streamSelected as Stream).psAccountOwner.toBase58();
      const beneficiary =
        streamSelected.version < 2
          ? ((streamSelected as StreamInfo).beneficiaryAddress as string)
          : (streamSelected as Stream).beneficiary.toBase58();
      // Account for multiple beneficiaries funded by the same treasury (only 1 right now)
      const numTreasuryBeneficiaries = 1;

      if (treasurer === me) {
        // If I am the treasurer
        if (numTreasuryBeneficiaries > 1) {
          message = t('close-stream.context-treasurer-multiple-beneficiaries', {
            beneficiary: shortenAddress(beneficiary),
            treasury: shortenAddress(treasury),
          });
        } else {
          message = t('close-stream.context-treasurer-single-beneficiary', {
            beneficiary: shortenAddress(beneficiary),
          });
        }
      } else if (beneficiary === me) {
        // If I am the beneficiary
        message = t('close-stream.context-beneficiary', {
          beneficiary: shortenAddress(beneficiary),
        });
      }
    }

    return <div>{message}</div>;
  };

  const onAfterAddFundsTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      hideAddFundsTransactionModal();
    }
    resetTransactionStatus();
  };

  const onCloseStreamTransactionFinished = useCallback(() => {
    setIsBusy(false);
    setCloseStreamTransactionModalVisibility(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const isNewStream = useCallback(() => {
    if (streamSelected) {
      return streamSelected.version >= 2;
    }

    return false;
  }, [streamSelected]);

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
    };
  }, [splTokenList, publicKey, connection, refreshUserBalances]);

  // Read treasury data
  useEffect(() => {
    if (!publicKey || !ms || !paymentStreaming || !streamSelected) {
      return;
    }

    const timeout = setTimeout(() => {
      const v1 = streamSelected as StreamInfo;
      const v2 = streamSelected as Stream;
      const isNewStream = streamSelected.version >= 2;
      const treasuryId = isNewStream ? v2.psAccount.toBase58() : (v1.treasuryAddress as string);
      if (!treasuryDetails || treasuryDetails.id.toString() !== treasuryId) {
        consoleOut('Reading treasury data...', '', 'blue');
        getTreasuryByTreasuryId(treasuryId, streamSelected.version);
      }
    });

    return () => {
      clearTimeout(timeout);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, paymentStreaming, publicKey, streamSelected]);

  // Refresh stream data
  useEffect(() => {
    if (!ms || !paymentStreaming || !streamSelected) {
      return;
    }

    const timeout = setTimeout(() => {
      const v1 = streamSelected as StreamInfo;
      const v2 = streamSelected as Stream;
      const isV2 = streamSelected.version >= 2;
      if (isV2) {
        if (v2.statusCode === STREAM_STATUS_CODE.Running) {
          paymentStreaming.refreshStream(streamSelected as Stream).then(detail => {
            setStreamDetail(detail as Stream);
          });
        }
      } else if (v1.state === STREAM_STATE.Running) {
        ms.refreshStream(streamSelected as StreamInfo).then(detail => {
          setStreamDetail(detail);
        });
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, paymentStreaming, streamSelected]);

  // Set selected token to the stream associated token as soon as the stream is available or changes
  useEffect(() => {
    if (!publicKey || !streamSelected) {
      return;
    }
    const associatedToken = getStreamAssociatedMint(streamSelected);

    if (associatedToken && (!workingToken || workingToken.address !== associatedToken)) {
      getTokenOrCustomToken(connection, associatedToken, getTokenByMintAddress).then(token => {
        consoleOut('getTokenOrCustomToken (MoneyStreamsOutgoingView) ->', token, 'blue');
        setWorkingToken(token);
      });
    }
  }, [connection, getTokenByMintAddress, publicKey, streamSelected, workingToken]);

  ///////////////
  // Rendering //
  ///////////////

  const hideDetailsHandler = () => {
    onSendFromOutgoingStreamDetails();
  };

  const getStreamStatus = useCallback(
    (item: Stream | StreamInfo): 'scheduled' | 'stopped' | 'stopped-manually' | 'running' => {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return 'scheduled';
          case STREAM_STATE.Paused:
            return 'stopped';
          default:
            return 'running';
        }
      } else {
        switch (v2.statusCode) {
          case STREAM_STATUS_CODE.Scheduled:
            return 'scheduled';
          case STREAM_STATUS_CODE.Paused:
            if (v2.isManuallyPaused) {
              return 'stopped-manually';
            }
            return 'stopped';
          default:
            return 'running';
        }
      }
    },
    [],
  );

  const renderFundsLeftInAccount = () => {
    if (!streamSelected || !workingToken) {
      return '--';
    }

    const v1 = streamSelected as StreamInfo;
    const v2 = streamSelected as Stream;

    return (
      <>
        <span className="info-data large mr-1">
          {getAmountWithSymbol(
            isNewStream() ? toUiAmount(v2.fundsLeftInStream, workingToken.decimals) : v1.escrowUnvestedAmount,
            workingToken.address,
            false,
            splTokenList,
            workingToken.decimals,
          )}
        </span>
        <span className="info-icon">
          {streamSelected && getStreamStatus(streamSelected) === 'running' ? (
            <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
          ) : (
            <ArrowUpOutlined className="mean-svg-icons outgoing" />
          )}
        </span>
      </>
    );
  };

  // Info Data
  const infoData = [
    {
      name: 'Funds left in account',
      value: streamSelected ? renderFundsLeftInAccount() : '--',
    },
  ];

  const renderDropdownMenu = useCallback(() => {
    const items: ItemType[] = [];
    if (
      getTreasuryType() === 'open' ||
      (getTreasuryType() === 'locked' && streamSelected && getStreamStatus(streamSelected) !== 'running')
    ) {
      items.push({
        key: '01-close-stream',
        label: (
          <div onClick={showCloseStreamModal}>
            <span className="menu-item-text">Close stream</span>
          </div>
        ),
        disabled: isBusy || hasStreamPendingTx(),
      });
    }
    items.push({
      key: '02-explorer-link',
      label: (
        <a
          href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${streamSelected?.id}${getSolanaExplorerClusterParam()}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="menu-item-text">{t('account-area.explorer-link')}</span>
        </a>
      ),
    });

    return { items };
  }, [getStreamStatus, getTreasuryType, hasStreamPendingTx, isBusy, showCloseStreamModal, streamSelected, t]);

  const renderPauseOrResumeCtas = useCallback(() => {
    const isOpenStream = streamSelected && treasuryDetails && getTreasuryType() === 'open';
    if (!isOpenStream) {
      return null;
    }
    const status = getStreamStatus(streamSelected);

    if (status === 'stopped-manually') {
      return (
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke btn-min-width"
          disabled={isBusy || hasStreamPendingTx()}
          onClick={showResumeStreamModal}
        >
          <div className="btn-content">Resume stream</div>
        </Button>
      );
    } else if (status === 'running') {
      return (
        <Button
          type="default"
          shape="round"
          size="small"
          className="thin-stroke btn-min-width"
          disabled={isBusy || hasStreamPendingTx()}
          onClick={showPauseStreamModal}
        >
          <div className="btn-content">Pause stream</div>
        </Button>
      );
    }

    return null;
  }, [
    getStreamStatus,
    getTreasuryType,
    hasStreamPendingTx,
    isBusy,
    showPauseStreamModal,
    showResumeStreamModal,
    streamSelected,
    treasuryDetails,
  ]);

  // Buttons
  const renderButtons = useCallback(() => {
    return (
      <div className="flex-fixed-right cta-row mb-2 pl-1">
        <Space className="left" size="middle" wrap>
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
              getTreasuryType() === 'locked'
            }
            onClick={showAddFundsModal}
          >
            <div className="btn-content">Add funds</div>
          </Button>
          {renderPauseOrResumeCtas()}
        </Space>
        <Dropdown menu={renderDropdownMenu()} placement="bottomRight" trigger={['click']}>
          <span className="ellipsis-icon icon-button-container mr-1">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<IconEllipsisVertical className="mean-svg-icons" />}
              onClick={e => e.preventDefault()}
            />
          </span>
        </Dropdown>
      </div>
    );
  }, [
    isBusy,
    streamSelected,
    treasuryDetails,
    renderPauseOrResumeCtas,
    hasStreamPendingTx,
    renderDropdownMenu,
    showAddFundsModal,
    getTreasuryType,
    isDeletedStream,
    isOtp,
  ]);

  const getMspClientByStreamVersion = useCallback(() => {
    if (!streamSelected) {
      return undefined;
    }

    return streamSelected.version < 2 ? ms : paymentStreaming;
  }, [ms, paymentStreaming, streamSelected]);

  const renderAddFundsModalContent = useCallback(() => {
    if (isBusy) {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <h5 className="operation">
            {t('transactions.status.tx-add-funds-operation')}{' '}
            {getAmountWithSymbol(
              parseFloat(addFundsPayload ? (addFundsPayload.amount as string) : '0'),
              getStreamAssociatedMint(streamSelected),
              false,
              splTokenList,
            )}
          </h5>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </>
      );
    }
    if (isSuccess()) {
      return (
        <>
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <p className="operation">{t('transactions.status.tx-add-funds-operation-success')}</p>
          <Button block type="primary" shape="round" size="middle" onClick={onAddFundsTransactionFinished}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    }
    if (isError()) {
      return (
        <>
          <WarningOutlined style={{ fontSize: 48 }} className="icon" />
          {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
            <h4 className="mb-4">
              {t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58(), false, splTokenList),
                feeAmount: getAmountWithSymbol(
                  transactionFees.blockchainFee + transactionFees.mspFlatFee,
                  SOL_MINT.toBase58(),
                  false,
                  splTokenList,
                ),
              })}
            </h4>
          ) : (
            <h4 className="font-bold mb-1 text-uppercase">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
          )}
          <Button block type="primary" shape="round" size="middle" onClick={hideAddFundsTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    }

    return (
      <>
        <Spin indicator={bigLoadingIcon} className="icon" />
        <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
      </>
    );
  }, [
    addFundsPayload,
    hideAddFundsTransactionModal,
    isBusy,
    isError,
    isSuccess,
    nativeBalance,
    onAddFundsTransactionFinished,
    splTokenList,
    streamSelected,
    t,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
  ]);

  const renderCloseStreamTxExecModalContent = useCallback(() => {
    if (isBusy) {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <h5 className="operation">{t('transactions.status.tx-close-operation')}</h5>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </>
      );
    }
    if (isSuccess()) {
      return (
        <>
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <p className="operation">{t('transactions.status.tx-close-operation-success')}</p>
          <Button block type="primary" shape="round" size="middle" onClick={onCloseStreamTransactionFinished}>
            {t('general.cta-finish')}
          </Button>
        </>
      );
    }
    if (isError()) {
      return (
        <>
          <WarningOutlined style={{ fontSize: 48 }} className="icon" />
          {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
            <h4 className="mb-4">
              {t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                feeAmount: getAmountWithSymbol(
                  transactionFees.blockchainFee + transactionFees.mspFlatFee,
                  SOL_MINT.toBase58(),
                ),
              })}
            </h4>
          ) : (
            <h4 className="font-bold mb-1 text-uppercase">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
          )}
          <Button block type="primary" shape="round" size="middle" onClick={hideCloseStreamTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </>
      );
    }

    return (
      <>
        <Spin indicator={bigLoadingIcon} className="icon" />
        <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
      </>
    );
  }, [
    hideCloseStreamTransactionModal,
    isBusy,
    isError,
    isSuccess,
    nativeBalance,
    onCloseStreamTransactionFinished,
    t,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
  ]);

  const renderCommonTxExecModalContent = useCallback(() => {
    if (isBusy) {
      return (
        <>
          <Spin indicator={bigLoadingIcon} className="icon" />
          <h4 className="font-bold mb-1">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
            <div className="indication">{t('transactions.status.instructions')}</div>
          )}
        </>
      );
    }
    if (isSuccess()) {
      return (
        <>
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
          </h4>
          <p className="operation">{t('transactions.status.tx-generic-operation-success')}</p>
          <Button block type="primary" shape="round" size="middle" onClick={onTransactionFinished}>
            {t('general.cta-finish')}
          </Button>
        </>
      );
    }
    if (isError()) {
      const handler = () => {
        switch (ongoingOperation) {
          case OperationType.StreamPause:
            return onAcceptPauseStream(lastOperationPayload);
          case OperationType.StreamResume:
            return onAcceptResumeStream(lastOperationPayload);
          default:
            return hideTransactionExecutionModal();
        }
      };

      return (
        <>
          <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
          {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
            <h4 className="mb-4">
              {t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                feeAmount: getAmountWithSymbol(
                  transactionFees.blockchainFee + transactionFees.mspFlatFee,
                  SOL_MINT.toBase58(),
                ),
              })}
            </h4>
          ) : (
            <h4 className="font-bold mb-3">
              {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
            </h4>
          )}
          {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
            <div className="row two-col-ctas mt-3">
              <div className="col-6">
                <Button block type="text" shape="round" size="middle" onClick={() => handler()}>
                  {t('general.retry')}
                </Button>
              </div>
              <div className="col-6">
                <Button block type="primary" shape="round" size="middle" onClick={() => refreshPage()}>
                  {t('general.refresh')}
                </Button>
              </div>
            </div>
          ) : (
            <Button block type="primary" shape="round" size="middle" onClick={hideTransactionExecutionModal}>
              {t('general.cta-close')}
            </Button>
          )}
        </>
      );
    }

    return (
      <>
        <Spin indicator={bigLoadingIcon} className="icon" />
        <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
      </>
    );
  }, [
    hideTransactionExecutionModal,
    isBusy,
    isError,
    isSuccess,
    lastOperationPayload,
    nativeBalance,
    onAcceptPauseStream,
    onAcceptResumeStream,
    onTransactionFinished,
    ongoingOperation,
    refreshPage,
    t,
    transactionFees.blockchainFee,
    transactionFees.mspFlatFee,
    transactionStatus.currentOperation,
  ]);

  return (
    <>
      <Spin spinning={loadingStreams}>
        <MoneyStreamDetails
          accountAddress={selectedAccount.address}
          stream={streamSelected}
          hideDetailsHandler={hideDetailsHandler}
          infoData={infoData}
          isStreamOutgoing={true}
          buttons={renderButtons()}
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
          mspClient={getMspClientByStreamVersion()}
          handleOk={onAcceptAddFunds}
          handleClose={closeAddFundsModal}
          selectedToken={workingToken}
          isMultisigContext={isMultisigContext}
        />
      )}

      {isPauseStreamModalVisible && (
        <StreamPauseModal
          isVisible={isPauseStreamModalVisible}
          transactionFees={transactionFees}
          tokenBalance={tokenBalance}
          streamDetail={streamSelected}
          handleOk={(param: string) => onAcceptPauseStream(param)}
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
          handleOk={(param: string) => onAcceptResumeStream(param)}
          handleClose={hideResumeStreamModal}
          content={getStreamResumeMessage()}
        />
      )}

      {isCloseStreamModalVisible && (
        <StreamCloseModal
          isVisible={isCloseStreamModalVisible}
          selectedToken={workingToken}
          transactionFees={transactionFees}
          streamDetail={streamSelected}
          mspClient={getMspClientByStreamVersion()}
          handleOk={(params: CloseStreamParams) => onAcceptCloseStream(params)}
          handleClose={hideCloseStreamModal}
          content={getStreamClosureMessage()}
        />
      )}

      {/* Add funds transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onAfterAddFundsTransactionModalClosed}
        open={isAddFundsTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideAddFundsTransactionModal}
        width={330}
        footer={null}
      >
        <div className="transaction-progress">{renderAddFundsModalContent()}</div>
      </Modal>

      {/* Close stream transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        afterClose={onCloseStreamTransactionFinished}
        open={isCloseStreamTransactionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={onCloseStreamTransactionFinished}
        width={330}
        footer={null}
      >
        <div className="transaction-progress">{renderCloseStreamTxExecModalContent()}</div>
      </Modal>

      {/* Common transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        open={isTransactionExecutionModalVisible}
        title={getTransactionModalTitle(transactionStatus, isBusy, t)}
        onCancel={hideTransactionExecutionModal}
        width={360}
        footer={null}
      >
        <div className="transaction-progress">{renderCommonTxExecModalContent()}</div>
      </Modal>
    </>
  );
};
