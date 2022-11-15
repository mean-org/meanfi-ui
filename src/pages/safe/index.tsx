import { ReloadOutlined } from '@ant-design/icons';
import { App, AppsProvider } from '@mean-dao/mean-multisig-apps';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  getFees,
  MeanMultisig,
  MultisigInfo,
  MultisigParticipant,
  MultisigTransaction,
  MultisigTransactionFees,
  MULTISIG_ACTIONS,
} from '@mean-dao/mean-multisig-sdk';
import { AnchorProvider, BN, Program } from '@project-serum/anchor';
import {
  ConfirmOptions,
  Connection,
  MemcmpFilter,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { Button, Empty, Spin, Tooltip } from 'antd';
import { segmentAnalytics } from 'App';
import { ErrorReportModal } from 'components/ErrorReportModal';
import { MultisigEditModal } from 'components/MultisigEditModal';
import { openNotification } from 'components/Notifications';
import { MULTISIG_ROUTE_BASE_PATH } from 'constants/common';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext, TransactionStatusInfo } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import {
  confirmationEvents,
  TxConfirmationContext,
  TxConfirmationInfo,
} from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useWindowSize from 'hooks/useWindowResize';
import { appConfig, customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, delay, getTransactionStatusForLogs } from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
} from 'middleware/utils';
import { ProgramAccounts } from 'models/accounts';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import { MultisigProposalsWithAuthority, ZERO_FEES } from 'models/multisig';
import SerumIDL from 'models/serum-multisig-idl';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { isDesktop } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ProgramDetailsView } from './components/ProgramDetails';
import { ProposalDetailsView } from './components/ProposalDetails';
import { SafeMeanInfo } from './components/SafeMeanInfo';
import { SafeSerumInfoView } from './components/SafeSerumInfo';
import './style.scss';

const proposalLoadStatusRegister = new Map<string, boolean>();

const SafeView = (props: {
  appsProvider: AppsProvider | undefined;
  safeBalance?: number;
  solanaApps: App[];
  onNewProposalClicked?: any;
}) => {
  const { appsProvider, safeBalance, solanaApps, onNewProposalClicked } = props;
  const {
    programs,
    multisigTxs,
    multisigAccounts,
    selectedAccount,
    selectedMultisig,
    transactionStatus,
    loadingMultisigAccounts,
    setTransactionStatus,
    refreshTokenBalance,
    setSelectedMultisig,
    refreshMultisigs,
    setMultisigTxs,
    setPrograms,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(
    TxConfirmationContext,
  );
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const [searchParams] = useSearchParams();
  const { id } = useParams();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const navigate = useNavigate();
  // Misc hooks
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  // Balance and fees
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [transactionFees, setTransactionFees] =
    useState<MultisigTransactionFees>(ZERO_FEES);
  // Active Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(false);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [isProposalDetails, setIsProposalDetails] = useState(false);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  // Programs
  const [programSelected, setProgramSelected] = useState<any>();
  const [needReloadPrograms, setNeedReloadPrograms] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [isProgramDetails, setIsProgramDetails] = useState(false);
  // Other
  const [loadingProposalDetails, setLoadingProposalDetails] = useState(false);
  const [selectedProposal, setSelectedProposal] =
    useState<MultisigTransaction | null>(null);
  const [canSubscribe, setCanSubscribe] = useState(true);
  // Vesting contracts
  const [queryParamV, setQueryParamV] = useState<string | null>(null);
  const [lastError, setLastError] = useState<TransactionStatusInfo | undefined>(
    undefined,
  );

  /////////////////
  //  Init code  //
  /////////////////

  const multisigAddressPK = useMemo(
    () => new PublicKey(appConfig.getConfig().multisigProgramAddress),
    [],
  );

  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  useEffect(() => {
    let optionInQuery: string | null = null;
    if (searchParams) {
      optionInQuery = searchParams.get('v');
    }
    setQueryParamV(optionInQuery);
  }, [searchParams]);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return undefined;
    }

    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      'confirmed',
      multisigAddressPK,
    );
  }, [connection, publicKey, multisigAddressPK, connectionConfig.endpoint]);

  const multisigSerumClient = useMemo(() => {
    const opts: ConfirmOptions = {
      preflightCommitment: 'confirmed',
      commitment: 'confirmed',
      skipPreflight: true,
      maxRetries: 3,
    };

    const provider = new AnchorProvider(connection, wallet as any, opts);

    return new Program(
      SerumIDL,
      'msigmtwzgXJHj2ext4XJjCDmpbcMuufFb5cHuwg6Xdt',
      provider,
    );
  }, [connection, wallet]);

  // Live reference to the selected multisig
  const selectedMultisigRef = useRef(selectedMultisig);
  useEffect(() => {
    selectedMultisigRef.current = selectedMultisig;
  }, [selectedMultisig]);

  // Live reference to the selected proposal
  const selectedProposalRef = useRef(selectedProposal);
  useEffect(() => {
    selectedProposalRef.current = selectedProposal;
  }, [selectedProposal]);

  // Live reference to the last reflected error
  const lastErrorRef = useRef(lastError);
  useEffect(() => {
    lastErrorRef.current = lastError;
  }, [lastError]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const setProposalsLoading = useCallback(
    (loading: boolean) => {
      if (!selectedMultisig) {
        consoleOut(
          'unable to do setProposalsLoading!',
          'selectedMultisig not available yet',
          'red',
        );
        return;
      }
      const multisigAuth = selectedMultisig.authority.toBase58();
      consoleOut(
        `setProposalsLoading for ${multisigAuth} with:`,
        loading,
        'orange',
      );
      if (loading) {
        proposalLoadStatusRegister.set(multisigAuth, loading);
        setLoadingProposals(true);
      } else {
        if (proposalLoadStatusRegister.has(multisigAuth)) {
          proposalLoadStatusRegister.delete(multisigAuth);
        } else {
          proposalLoadStatusRegister.set(multisigAuth, loading);
        }
      }
    },
    [selectedMultisig],
  );

  // Search for pending proposal in confirmation history
  const hasMultisigPendingProposal = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) {
      return false;
    }
    const isTheReference = (item: TxConfirmationInfo) => {
      if (
        (item &&
          item.extras &&
          item.extras.multisigAuthority &&
          item.extras.multisigAuthority ===
          selectedMultisigRef.current?.authority.toBase58()) ||
        (item &&
          item.extras &&
          item.extras.multisigId &&
          item.extras.multisigId ===
          selectedMultisigRef.current?.authority.toBase58())
      ) {
        return true;
      }
      return false;
    };

    if (confirmationHistory && confirmationHistory.length > 0) {
      const item = confirmationHistory.find(
        h => isTheReference(h) && h.txInfoFetchStatus === 'fetching',
      );

      if (item) {
        return true;
      }
    }

    return false;
  }, [confirmationHistory]);

  const onMultisigModified = useCallback(() => {
    setIsBusy(false);
    setIsEditMultisigModalVisible(false);
    resetTransactionStatus();

    openNotification({
      description:
        "The proposal can be reviewed in the Multisig's proposal list for other owners to approve.",
      duration: 10,
      type: 'success',
    });
  }, [resetTransactionStatus]);

  // Modal visibility flags
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] =
    useState(false);
  const [isErrorReportingModalVisible, setIsErrorReportingModalVisible] =
    useState(false);
  const showErrorReportingModal = useCallback(
    () => setIsErrorReportingModalVisible(true),
    [],
  );
  const closeErrorReportingModal = useCallback(() => {
    setIsErrorReportingModalVisible(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onEditMultisigClick = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(
      multisigClient.getProgram(),
      MULTISIG_ACTIONS.createTransaction,
    ).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });

    resetTransactionStatus();
    setIsEditMultisigModalVisible(true);
  }, [multisigClient, resetTransactionStatus]);

  const onExecuteEditMultisigTx = useCallback(
    async (data: any) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const editMultisig = async (data: any) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          throw new Error('No selected multisig');
        }

        const [multisigSigner] = await PublicKey.findProgramAddress(
          [selectedMultisig.id.toBuffer()],
          multisigAddressPK,
        );

        const owners = data.owners.map((p: MultisigParticipant) => {
          return {
            address: new PublicKey(p.address),
            name: p.name,
          };
        });

        const program = multisigClient.getProgram();
        // Edit Multisig
        const ixData = program.coder.instruction.encode('edit_multisig', {
          owners: owners,
          threshold: new BN(data.threshold),
          label: data.label,
          title: data.title,
        });

        const ixAccounts = [
          {
            pubkey: selectedMultisig.id,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: multisigSigner,
            isWritable: false,
            isSigner: true,
          },
        ];

        const expirationTime = parseInt(
          (Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString(),
        );

        const tx = await multisigClient.createTransaction(
          publicKey,
          data.title === '' ? 'Edit safe' : data.title,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.EditMultisig,
          selectedMultisig.id,
          program.programId,
          ixAccounts,
          ixData,
        );

        return tx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && data) {
          consoleOut('Start transaction for create multisig', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = {
            wallet: publicKey.toBase58(), // wallet
            title: data.title,
            label: data.label, // multisig label
            threshold: data.threshold,
            owners: data.owners,
          };

          consoleOut('data:', payload);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: payload,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('networkFee:', transactionFees.networkFee, 'blue');
          consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
          consoleOut('multisigFee:', transactionFees.multisigFee, 'blue');
          const minRequired =
            transactionFees.multisigFee +
            transactionFees.rentExempt +
            transactionFees.networkFee;
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.TransactionStartFailure,
              ),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Edit multisig transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          return editMultisig(data)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('editMultisig returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('editMultisig error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError('Edit multisig transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Edit multisig transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const sendTx = async (): Promise<boolean> => {
        if (connection && wallet && wallet.publicKey && transaction) {
          const {
            context: { slot: minContextSlot },
            value: { blockhash },
          } = await connection.getLatestBlockhashAndContext();

          transaction.feePayer = wallet.publicKey;
          transaction.recentBlockhash = blockhash;

          return wallet
            .sendTransaction(transaction, connection, { minContextSlot })
            .then(sig => {
              consoleOut('sendEncodedTransaction returned a signature:', sig);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransactionSuccess,
                currentOperation: TransactionStatus.ConfirmTransaction,
              });
              signature = sig;
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionSuccess,
                ),
                result: `signature: ${signature}`,
              });
              return true;
            })
            .catch((error: any) => {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransaction,
                currentOperation: TransactionStatus.SendTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionFailure,
                ),
                result: { error, encodedTx },
              });
              customLogger.logError('Edit multisig transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          console.error('Cannot send transaction! Wallet not found!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.WalletNotFound,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot send transaction! Wallet not found!',
          });
          customLogger.logError('Edit multisig transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      if (wallet && selectedMultisig) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.EditMultisig,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Editing the safe ${selectedMultisig.label}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `The changes to the ${selectedMultisig.label} Multisig Safe have been submitted for approval.`,
              extras: {
                multisigAuthority: selectedMultisig
                  ? selectedMultisig.authority.toBase58()
                  : '',
              },
            });
            await delay(500);
            onMultisigModified();
          } else {
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      transactionFees,
      selectedMultisig,
      multisigAddressPK,
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      resetTransactionStatus,
      setTransactionStatus,
      onMultisigModified,
    ],
  );

  const onAcceptEditMultisig = (data: any) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

  const onExecuteApproveTx = useCallback(
    async (data: any) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const approveTx = async (data: any) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          return null;
        }

        const tx = await multisigClient.approveTransaction(
          publicKey,
          data.transaction.id,
        );

        return tx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && data) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: data.transaction };
          consoleOut('data:', payload);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: payload,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.TransactionStartFailure,
              ),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Multisig Approve transaction failed', {
              transcript: transactionLog,
            });
            openNotification({
              description: t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(
                  nativeBalance,
                  NATIVE_SOL_MINT.toBase58(),
                ),
                feeAmount: getAmountWithSymbol(
                  minRequired,
                  NATIVE_SOL_MINT.toBase58(),
                ),
              }),
              type: 'info',
            });
            return false;
          }

          return approveTx(payload)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('approveTx returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('approveTx error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError('Multisig Approve transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Multisig Approve transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const sendTx = async (): Promise<boolean> => {
        if (connection && wallet && wallet.publicKey && transaction) {
          const {
            context: { slot: minContextSlot },
            value: { blockhash },
          } = await connection.getLatestBlockhashAndContext();

          transaction.feePayer = wallet.publicKey;
          transaction.recentBlockhash = blockhash;

          return wallet
            .sendTransaction(transaction, connection, { minContextSlot })
            .then(sig => {
              consoleOut('sendEncodedTransaction returned a signature:', sig);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransactionSuccess,
                currentOperation: TransactionStatus.ConfirmTransaction,
              });
              signature = sig;
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionSuccess,
                ),
                result: `signature: ${signature}`,
              });
              return true;
            })
            .catch(error => {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransaction,
                currentOperation: TransactionStatus.SendTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionFailure,
                ),
                result: { error, encodedTx },
              });
              customLogger.logError('Multisig Approve transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          console.error('Cannot send transaction! Wallet not found!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.WalletNotFound,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot send transaction! Wallet not found!',
          });
          customLogger.logError('Multisig Approve transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      if (wallet) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.ApproveTransaction,
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Approve proposal: ${data.transaction.details.title}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully approved proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id,
              },
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else {
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      resetTransactionStatus,
      wallet,
      selectedMultisig,
      multisigClient,
      publicKey,
      setTransactionStatus,
      nativeBalance,
      transactionStatus.currentOperation,
      t,
      connection,
      transactionCancelled,
      enqueueTransactionConfirmation,
    ],
  );

  const onExecuteRejectTx = useCallback(
    async (data: any) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const rejectTx = async (data: any) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          return null;
        }

        const tx = await multisigClient.rejectTransaction(
          publicKey,
          data.transaction.id,
        );

        return tx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && data) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: data.transaction };
          consoleOut('data:', payload);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: payload,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.TransactionStartFailure,
              ),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Multisig Reject transaction failed', {
              transcript: transactionLog,
            });
            openNotification({
              description: t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(
                  nativeBalance,
                  NATIVE_SOL_MINT.toBase58(),
                ),
                feeAmount: getAmountWithSymbol(
                  minRequired,
                  NATIVE_SOL_MINT.toBase58(),
                ),
              }),
              type: 'info',
            });
            return false;
          }

          return rejectTx(payload)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('approveTx returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('rejectTx error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError('Multisig Reject transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Multisig Reject transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const sendTx = async (): Promise<boolean> => {
        if (connection && wallet && wallet.publicKey && transaction) {
          const {
            context: { slot: minContextSlot },
            value: { blockhash },
          } = await connection.getLatestBlockhashAndContext();

          transaction.feePayer = wallet.publicKey;
          transaction.recentBlockhash = blockhash;

          return wallet
            .sendTransaction(transaction, connection, { minContextSlot })
            .then(sig => {
              consoleOut('sendEncodedTransaction returned a signature:', sig);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransactionSuccess,
                currentOperation: TransactionStatus.ConfirmTransaction,
              });
              signature = sig;
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionSuccess,
                ),
                result: `signature: ${signature}`,
              });
              return true;
            })
            .catch(error => {
              console.error(error);
              setTransactionStatus({
                lastOperation: TransactionStatus.SendTransaction,
                currentOperation: TransactionStatus.SendTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.SendTransactionFailure,
                ),
                result: { error, encodedTx },
              });
              customLogger.logError('Multisig Reject transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          console.error('Cannot send transaction! Wallet not found!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.WalletNotFound,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot send transaction! Wallet not found!',
          });
          customLogger.logError('Multisig Reject transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      if (wallet) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.RejectTransaction,
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Reject proposal: ${data.transaction.details.title}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully rejected proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id,
              },
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else {
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      resetTransactionStatus,
      setTransactionStatus,
      t,
    ],
  );

  const onExecuteFinishTxCancelled = useCallback(() => {
    openNotification({
      type: 'info',
      duration: 5,
      description: t('notifications.tx-not-executed'),
    });
    consoleOut('lastError:', lastErrorRef.current, 'blue');
    if (lastErrorRef.current && lastErrorRef.current.customError) {
      // Show the error reporting modal
      setTransactionStatus(lastErrorRef.current);
      showErrorReportingModal();
    } else {
      resetTransactionStatus();
    }
  }, [
    showErrorReportingModal,
    resetTransactionStatus,
    setTransactionStatus,
    t,
  ]);

  const onExecuteFinishTx = useCallback(
    async (data: any) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const finishTx = async (data: any) => {
        if (!data.transaction || !publicKey || !multisigClient) {
          return null;
        }

        let tx = await multisigClient.executeTransaction(
          publicKey,
          data.transaction.id,
        );

        if (
          data.transaction.operation === OperationType.StreamCreate ||
          data.transaction.operation === OperationType.TreasuryStreamCreate ||
          data.transaction.operation === OperationType.StreamCreateWithTemplate
        ) {
          tx = await multisigClient.executeTransaction(
            publicKey,
            data.transaction.id,
          );
        }

        return tx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && data) {
          consoleOut('Start Multisig ExecuteTransaction Tx', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          consoleOut('data:', data);
          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: data,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.TransactionStartFailure,
              ),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Finish Approoved transaction failed', {
              transcript: transactionLog,
            });
            const notifContent = t('transactions.status.tx-start-failure', {
              accountBalance: getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              ),
              feeAmount: getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              ),
            });
            openNotification({
              description: notifContent,
              type: 'info',
            });

            const txStatus = {
              customError: notifContent,
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            } as TransactionStatusInfo;
            setTransactionStatus(txStatus);

            return false;
          }

          return finishTx(data)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('multisig returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('create stream error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError('Finish Approoved transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Finish Approoved transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const sendTx = async (): Promise<boolean> => {
        if (!connection || !wallet || !wallet.publicKey || !transaction) {
          console.error(
            'Cannot send transaction! Wallet not found or no connection!',
          );
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.WalletNotFound,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot send transaction! Wallet not found!',
          });
          customLogger.logError('Finish Approoved transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        const result = wallet
          .sendTransaction(transaction, connection, { minContextSlot })
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess,
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch((error: any) => {
            consoleOut(
              'operation:',
              OperationType[data.transaction.operation],
              'orange',
            );
            const txStatus = {
              customError: undefined,
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            } as TransactionStatusInfo;
            if (error.toString().indexOf('0x1794') !== -1) {
              let accountIndex = 0;
              if (data.transaction.operation === OperationType.StreamClose) {
                accountIndex = 5;
              } else if (
                data.transaction.operation ===
                OperationType.TreasuryStreamCreate ||
                data.transaction.operation === OperationType.StreamCreate ||
                data.transaction.operation ===
                OperationType.StreamCreateWithTemplate
              ) {
                accountIndex = 2;
              } else {
                accountIndex = 3;
              }
              consoleOut(
                'accounts:',
                data.transaction.accounts.map((a: any) => a.pubkey.toBase58()),
                'orange',
              );
              const treasury = data.transaction.accounts[accountIndex]
                ? data.transaction.accounts[accountIndex].pubkey.toBase58()
                : '-';
              consoleOut(
                `Selected account for index [${accountIndex}]`,
                treasury,
                'orange',
              );
              txStatus.customError = {
                title: 'Insufficient balance',
                message:
                  'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
                data: treasury,
              };
            } else if (error.toString().indexOf('0x1797') !== -1) {
              let accountIndex = 0;
              if (
                data.transaction.operation === OperationType.StreamCreate ||
                data.transaction.operation ===
                OperationType.TreasuryStreamCreate ||
                data.transaction.operation ===
                OperationType.StreamCreateWithTemplate
              ) {
                accountIndex = 2;
              } else if (
                data.transaction.operation === OperationType.TreasuryWithdraw
              ) {
                accountIndex = 5;
              } else {
                accountIndex = 3;
              }
              consoleOut(
                'accounts:',
                data.transaction.accounts.map((a: any) => a.pubkey.toBase58()),
                'orange',
              );
              const treasury = data.transaction.accounts[accountIndex]
                ? data.transaction.accounts[accountIndex].pubkey.toBase58()
                : '-';
              consoleOut(
                `Selected account for index [${accountIndex}]`,
                treasury,
                'orange',
              );
              txStatus.customError = {
                title: 'Insufficient balance',
                message:
                  'Your transaction failed to submit due to insufficient balance in the treasury. Please add funds to the treasury and then retry this operation.\n\nTreasury ID: ',
                data: treasury,
              };
            } else if (error.toString().indexOf('0x1786') !== -1) {
              txStatus.customError = {
                message:
                  'Your transaction failed to submit due to Invalid Gateway Token. Please activate the Gateway Token and retry this operation.',
                data: undefined,
              };
            } else if (error.toString().indexOf('0xbc4') !== -1) {
              txStatus.customError = {
                message:
                  'Your transaction failed to submit due to Account Not Initialized. Please initialize and fund the Token and LP Token Accounts of the Investor.\n',
                data: selectedMultisig?.authority.toBase58(),
              };
            } else if (error.toString().indexOf('0x1') !== -1) {
              const accountIndex =
                data.transaction.operation === OperationType.TransferTokens ||
                  data.transaction.operation === OperationType.Transfer
                  ? 0
                  : 3;
              consoleOut(
                'accounts:',
                data.transaction.accounts.map((a: any) => a.pubkey.toBase58()),
                'orange',
              );
              const asset = data.transaction.accounts[accountIndex]
                ? data.transaction.accounts[accountIndex].pubkey.toBase58()
                : '-';
              consoleOut(
                `Selected account for index [${accountIndex}]`,
                asset,
                'orange',
              );
              txStatus.customError = {
                title: 'Insufficient balance',
                // message: 'Your transaction failed to submit due to insufficient balance in the asset. Please add funds to the asset and then retry this operation.\n\nAsset ID: ',
                message:
                  'Your transaction failed to submit due to insufficient balance. Please add SOL to the safe and then retry this operation.\n\nSafe: ',
                data: selectedMultisig?.authority.toBase58(),
              };
            }
            consoleOut('setLastError ->', txStatus, 'blue');
            lastErrorRef.current = txStatus;
            setLastError(txStatus);
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure,
              ),
              result: { error, encodedTx },
            });
            customLogger.logError('Finish Approoved transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature, 'blue');
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.ExecuteTransaction,
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Execute proposal: ${data.transaction.details.title}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully executed proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id,
              },
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else {
            setTimeout(() => {
              onExecuteFinishTxCancelled();
            }, 30);
            setIsBusy(false);
          }
        } else {
          onExecuteFinishTxCancelled();
          setIsBusy(false);
        }
      }
    },
    [
      t,
      wallet,
      publicKey,
      nativeBalance,
      connection,
      multisigClient,
      selectedMultisig,
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      onExecuteFinishTxCancelled,
      resetTransactionStatus,
      setTransactionStatus,
    ],
  );

  const onExecuteCancelTx = useCallback(
    async (data: any) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

      setTransactionCancelled(false);
      setIsBusy(true);
      resetTransactionStatus();

      const cancelTx = async (data: any) => {
        if (
          !publicKey ||
          !multisigClient ||
          !selectedMultisig ||
          selectedMultisig.id.toBase58() !==
          data.transaction.multisig.toBase58() ||
          data.transaction.proposer.toBase58() !== publicKey.toBase58() ||
          data.transaction.executedOn
        ) {
          return null;
        }

        const tx = await multisigClient.cancelTransaction(
          publicKey,
          data.transaction.id,
        );

        return tx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && data) {
          consoleOut('Start transaction for create stream', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: data.transaction };
          consoleOut('data:', payload);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: payload,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.TransactionStartFailure,
              ),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                NATIVE_SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(
                minRequired,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning('Finish Cancel transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          return cancelTx(payload)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('Returned transaction:', value);
              setTransactionStatus({
                lastOperation: TransactionStatus.InitTransactionSuccess,
                currentOperation: TransactionStatus.SignTransaction,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
                result: getTxIxResume(value),
              });
              transaction = value;
              return true;
            })
            .catch(error => {
              console.error('cancel tx error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError('Finish Cancel transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Finish Cancel transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      const sendTx = async (): Promise<boolean> => {
        if (!connection || !wallet || !wallet.publicKey || !transaction) {
          console.error('Cannot send transaction! Wallet not found!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SendTransaction,
            currentOperation: TransactionStatus.WalletNotFound,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot send transaction! Wallet not found!',
          });
          customLogger.logError('Finish Cancel transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }

        const {
          context: { slot: minContextSlot },
          value: { blockhash },
        } = await connection.getLatestBlockhashAndContext();

        transaction.feePayer = wallet.publicKey;
        transaction.recentBlockhash = blockhash;

        const result = wallet
          .sendTransaction(transaction, connection, { minContextSlot })
          .then(sig => {
            consoleOut('sendEncodedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction,
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionSuccess,
              ),
              result: `signature: ${signature}`,
            });
            return true;
          })
          .catch((error: any) => {
            console.error(error);
            const txStatus = {
              customError: undefined,
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure,
            } as TransactionStatusInfo;
            if (error.toString().indexOf('0x1794') !== -1) {
              const accountIndex =
                data.transaction.operation === OperationType.StreamClose
                  ? 5
                  : 3;
              consoleOut(
                'accounts:',
                data.transaction.accounts.map((a: any) => a.pubkey.toBase58()),
                'orange',
              );
              const treasury = data.transaction.accounts[accountIndex]
                ? data.transaction.accounts[accountIndex].pubkey.toBase58()
                : '-';
              consoleOut(
                `Selected account for index [${accountIndex}]`,
                treasury,
                'orange',
              );
              txStatus.customError = {
                message:
                  'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
                data: treasury,
              };
            }
            setTransactionStatus(txStatus);
            transactionLog.push({
              action: getTransactionStatusForLogs(
                TransactionStatus.SendTransactionFailure,
              ),
              result: { error, encodedTx },
            });
            customLogger.logError('Finish Cancel transaction failed', {
              transcript: transactionLog,
            });
            return false;
          });

        return result;
      };

      if (wallet) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
              operationType: OperationType.CancelTransaction,
              finality: 'finalized',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: `Cancel proposal: ${data.transaction.details.title}`,
              completedTitle: 'Transaction confirmed',
              completedMessage: `Successfully cancelled proposal: ${data.transaction.details.title}`,
              extras: {
                multisigAuthority: data.transaction.multisig.toBase58(),
                transactionId: data.transaction.id,
              },
            });
            setIsBusy(false);
            resetTransactionStatus();
          } else {
            setIsBusy(false);
          }
        } else {
          setIsBusy(false);
        }
      }
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      resetTransactionStatus,
      setTransactionStatus,
    ],
  );

  const refreshSelectedProposal = useCallback(() => {
    consoleOut('running refreshSelectedProposal...', '', 'brown');
    if (
      publicKey &&
      multisigClient &&
      selectedMultisigRef.current &&
      selectedProposalRef.current
    ) {
      consoleOut('fetching proposal details...', '', 'brown');
      consoleOut(
        'selectedMultisigRef:',
        selectedMultisigRef.current.id.toBase58(),
        'brown',
      );
      consoleOut(
        'selectedProposalRef:',
        selectedProposalRef.current.id.toBase58(),
        'brown',
      );
      setLoadingProposalDetails(true);
      multisigClient
        .getMultisigTransaction(
          selectedMultisigRef.current.id,
          selectedProposalRef.current.id,
          publicKey,
        )
        .then((tx: any) => {
          consoleOut('proposal refreshed!', tx, 'brown');
          setSelectedProposal(tx);
        })
        .catch((err: any) => console.error(err))
        .finally(() => setLoadingProposalDetails(false));
    }
  }, [multisigClient, publicKey]);

  const recordTxConfirmation = useCallback(
    (signature: string, operation: OperationType, success = true) => {
      let event: any = undefined;

      switch (operation) {
        case OperationType.ApproveTransaction:
          event = success
            ? AppUsageEvent.ApproveProposalCompleted
            : AppUsageEvent.ApproveProposalFailed;
          break;
        case OperationType.RejectTransaction:
          event = success
            ? AppUsageEvent.RejectProposalCompleted
            : AppUsageEvent.RejectProposalFailed;
          break;
        case OperationType.ExecuteTransaction:
          event = success
            ? AppUsageEvent.ExecuteProposalCompleted
            : AppUsageEvent.ExecuteProposalFailed;
          break;
        case OperationType.CancelTransaction:
          event = success
            ? AppUsageEvent.CancelProposalCompleted
            : AppUsageEvent.CancelProposalFailed;
          break;
        default:
          break;
      }
      if (event) {
        segmentAnalytics.recordEvent(event, { signature: signature });
      }
    },
    [],
  );

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    (item: TxConfirmationInfo) => {
      console.log('onTxConfirmed event handled:', item);
      recordTxConfirmation(item.signature, item.operationType, true);

      switch (item.operationType) {
        case OperationType.ApproveTransaction:
        case OperationType.RejectTransaction:
        case OperationType.ExecuteTransaction:
          reloadMultisigs();
          reloadSelectedProposal();
          break;
        case OperationType.CancelTransaction:
          goToProposals();
          break;
        case OperationType.EditMultisig:
          reloadMultisigs();
          break;
        default:
          break;
      }
    },
    [recordTxConfirmation],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    (item: TxConfirmationInfo) => {
      // If we have the item, record failure and remove it from the list
      if (item) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        reloadMultisigs();
        recordTxConfirmation(item.signature, item.operationType, false);
      }
    },
    [recordTxConfirmation],
  );

  const reloadMultisigs = () => {
    const refreshCta = document.getElementById('multisig-refresh-cta');
    if (refreshCta) {
      refreshCta.click();
    }
  };

  const reloadSelectedProposal = () => {
    const proposalRefreshCta = document.getElementById(
      'refresh-selected-proposal-cta',
    );
    if (proposalRefreshCta) {
      proposalRefreshCta.click();
    }
  };

  const goToProposals = () => {
    const backCta = document.querySelector('div.back-button') as HTMLElement;
    if (backCta) {
      backCta.click();
    }
  };

  const refreshSafeDetails = useCallback(() => {
    reloadMultisigs();
    if (isProposalDetails) {
      reloadSelectedProposal();
    }
  }, [isProposalDetails]);

  const getMultisigList = useCallback(() => {
    if (!publicKey) {
      return;
    }

    refreshMultisigs().then(() => proposalLoadStatusRegister.clear());
  }, [publicKey, refreshMultisigs]);

  const getProgramsByUpgradeAuthority = useCallback(async (): Promise<
    ProgramAccounts[]
  > => {
    if (!connection || !selectedMultisig || !selectedMultisig.authority) {
      return [];
    }

    const BPFLoaderUpgradeab1e = new PublicKey(
      'BPFLoaderUpgradeab1e11111111111111111111111',
    );
    const execDataAccountsFilter: MemcmpFilter = {
      memcmp: { offset: 13, bytes: selectedMultisig.authority.toBase58() },
    };

    const execDataAccounts = await connection.getProgramAccounts(
      BPFLoaderUpgradeab1e,
      {
        filters: [execDataAccountsFilter],
      },
    );

    if (execDataAccounts.length === 0) {
      return [];
    }

    const programs: ProgramAccounts[] = [];
    const group = (size: number, data: any) => {
      const result = [];
      for (let i = 0; i < data.length; i += size) {
        result.push(data.slice(i, i + size));
      }
      return result;
    };

    const sleep = (ms: number, log = true) => {
      if (log) {
        consoleOut('Sleeping for', ms / 1000, 'seconds');
      }
      return new Promise(resolve => setTimeout(resolve, ms));
    };

    const getProgramAccountsPromise = async (execDataAccount: any) => {
      const execAccountsFilter: MemcmpFilter = {
        memcmp: { offset: 4, bytes: execDataAccount.pubkey.toBase58() },
      };

      const execAccounts = await connection.getProgramAccounts(
        BPFLoaderUpgradeab1e,
        {
          dataSlice: { offset: 0, length: 0 },
          filters: [execAccountsFilter],
        },
      );

      if (execAccounts.length === 0) {
        return;
      }

      if (execAccounts.length > 1) {
        throw new Error(
          `More than one program was found for program data account '${execDataAccount.pubkey.toBase58()}'`,
        );
      }

      consoleOut('programAccounts:', execAccounts, 'blue');

      programs.push({
        pubkey: execAccounts[0].pubkey,
        owner: execAccounts[0].account.owner,
        executable: execDataAccount.pubkey,
        upgradeAuthority: selectedMultisig.authority,
        size: execDataAccount.account.data.byteLength,
      } as ProgramAccounts);
    };

    const execDataAccountsGroups = group(8, execDataAccounts);

    for (const groupItem of execDataAccountsGroups) {
      const promises: Promise<any>[] = [];
      for (const dataAcc of groupItem) {
        promises.push(getProgramAccountsPromise(dataAcc));
      }
      await Promise.all(promises);
      sleep(1_000, false);
    }

    return programs;
  }, [connection, selectedMultisig]);

  const getActiveMultisigAuthorityByReference = useCallback(() => {
    if (!selectedMultisigRef || !selectedMultisigRef.current) {
      return '';
    }
    return selectedMultisigRef.current.authority.toBase58();
  }, []);

  const getMultisigProposals = useCallback(
    async (multisig: MultisigInfo) => {
      if (!connection || !publicKey || !multisigClient || !multisig) {
        return {
          multisigAuth: multisig.authority.toBase58(),
          transactions: [],
        } as MultisigProposalsWithAuthority;
      }

      const txs = await multisigClient.getMultisigTransactions(
        multisig.id,
        publicKey,
      );

      const response = {
        multisigAuth: multisig.authority.toBase58(),
        transactions: txs,
      } as MultisigProposalsWithAuthority;

      return response;
    },
    [connection, multisigClient, publicKey],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [width, isSmallUpScreen]);

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  // Get Programs
  useEffect(() => {
    if (!connection || !selectedMultisig || !needReloadPrograms) {
      return;
    }

    setTimeout(() => {
      setNeedReloadPrograms(false);
      setLoadingPrograms(true);
    });

    setPrograms([]);
    getProgramsByUpgradeAuthority()
      .then(progs => {
        setPrograms(progs);
        consoleOut('programs:', progs);
      })
      .catch(error => console.error(error))
      .finally(() => setLoadingPrograms(false));
  }, [
    connection,
    needReloadPrograms,
    selectedMultisig,
    getProgramsByUpgradeAuthority,
    setPrograms,
  ]);

  // Get MultisigTxs (proposals)
  useEffect(() => {
    if (!publicKey || !multisigClient || !needRefreshTxs || !selectedMultisig) {
      return;
    }

    consoleOut('Triggered load proposals...', '', 'blue');

    setNeedRefreshTxs(false);
    setProposalsLoading(true);
    setMultisigTxs(undefined);

    getMultisigProposals(selectedMultisig)
      .then((response: MultisigProposalsWithAuthority) => {
        consoleOut('response:', response, 'orange');
        const currentlyActiveMultisig = getActiveMultisigAuthorityByReference();
        if (response.multisigAuth === currentlyActiveMultisig) {
          consoleOut(
            'proposals assigned to:',
            currentlyActiveMultisig,
            'green',
          );
          setMultisigTxs(response.transactions);
          setLoadingProposals(false);
        } else {
          setMultisigTxs([]);
        }
      })
      .catch((err: any) => {
        setMultisigTxs([]);
        console.error('Error fetching all transactions', err);
      })
      .finally(() => setProposalsLoading(false));

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    publicKey,
    multisigClient,
    needRefreshTxs,
    selectedMultisig,
    getActiveMultisigAuthorityByReference,
    getMultisigProposals,
  ]);

  // Actually selects a multisig base on currently selected account
  useEffect(() => {
    if (
      multisigAccounts &&
      selectedAccount &&
      selectedAccount.address &&
      selectedAccount.isMultisig
    ) {
      let item: MultisigInfo | undefined = undefined;
      if (multisigAccounts.length > 0) {
        item = multisigAccounts.find(
          m => m.authority.toBase58() === selectedAccount.address,
        );
        if (item) {
          if (
            selectedMultisigRef.current &&
            selectedMultisigRef.current.authority.equals(item.authority)
          ) {
            consoleOut('Multisig is already selected!', 'skipping...', 'blue');
            setNeedRefreshTxs(true);
            setNeedReloadPrograms(true);
            return;
          }
          consoleOut('Making multisig active:', item, 'blue');
          setSelectedMultisig(item);
          setNeedRefreshTxs(true);
          setNeedReloadPrograms(true);
        }
      } else {
        setSelectedMultisig(undefined);
      }
    } else {
      setSelectedMultisig(undefined);
    }
  }, [multisigAccounts, selectedAccount, setSelectedMultisig]);

  // Process route params and set item (proposal) specified in the url by id
  useEffect(() => {
    if (!publicKey || !selectedMultisig || multisigTxs === undefined || !id) {
      setIsProposalDetails(false);
      return;
    }

    const isProposalsFork =
      queryParamV === 'proposals' ||
        queryParamV === 'instruction' ||
        queryParamV === 'activity'
        ? true
        : false;
    if (isProposalsFork) {
      consoleOut('id:', id, 'purple');
      consoleOut('queryParamV:', queryParamV, 'purple');
      consoleOut(
        'selectedMultisig:',
        selectedMultisig.authority.toBase58(),
        'purple',
      );
      const filteredMultisigTx = multisigTxs.find(
        tx => tx.id.toBase58() === id,
      );
      if (filteredMultisigTx) {
        setSelectedProposal(filteredMultisigTx);
        setIsProposalDetails(true);
        setIsProgramDetails(false);
        consoleOut('filteredMultisigTx:', filteredMultisigTx, 'orange');
      }
    }
  }, [id, selectedMultisig, publicKey, queryParamV, multisigTxs]);

  // Process route params and set item (program) specified in the url by id
  useEffect(() => {
    if (!publicKey || !selectedMultisig || programs === undefined || !id) {
      setIsProgramDetails(false);
      return;
    }

    const isProgramsFork =
      queryParamV === 'programs' ||
        queryParamV === 'transactions' ||
        queryParamV === 'anchor-idl'
        ? true
        : false;

    if (isProgramsFork) {
      consoleOut('id:', id, 'purple');
      consoleOut('queryParamV:', queryParamV, 'purple');
      consoleOut(
        'selectedMultisig:',
        selectedMultisig.authority.toBase58(),
        'purple',
      );
      const filteredProgram = programs.filter(
        program => program.pubkey.toBase58() === id,
      )[0];
      if (filteredProgram) {
        setProgramSelected(filteredProgram);
        setIsProposalDetails(false);
        setIsProgramDetails(true);
        consoleOut('filteredProgram:', filteredProgram, 'orange');
        consoleOut(
          'filteredProgram details:',
          {
            pubkey: filteredProgram.pubkey.toBase58(),
            owner: filteredProgram.owner.toBase58(),
            upgradeAuthority: filteredProgram.upgradeAuthority ? filteredProgram.upgradeAuthority.toBase58() : null,
            executable: filteredProgram.executable.toBase58(),
            size: formatThousands(filteredProgram.size),
          },
          'orange',
        );
      }
    }
  }, [id, programs, publicKey, queryParamV, selectedMultisig]);

  // Setup event listeners
  useEffect(() => {
    if (!canSubscribe) {
      return;
    }

    const timeout = setTimeout(() => {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut(
        'Subscribed to event txConfirmed with:',
        'onTxConfirmed',
        'blue',
      );
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut(
        'Subscribed to event txTimedout with:',
        'onTxTimedout',
        'blue',
      );
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  useEffect(() => {
    // Do unmounting stuff here
    return () => {
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
      setCanSubscribe(true);
      proposalLoadStatusRegister.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  //////////////
  //  Events  //
  //////////////

  const onRefresProposals = () => {
    setNeedRefreshTxs(true);
  };

  const onRefresMultisigDetailTabs = () => {
    setNeedRefreshTxs(true);
    setNeedReloadPrograms(true);
  };

  const goToProposalDetailsHandler = (selectedProposal: any) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/proposals/${selectedProposal.id.toBase58()}?v=instruction`;
    navigate(url);
  };

  const goToProgramDetailsHandler = (selectedProgram: any) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/programs/${selectedProgram.pubkey.toBase58()}?v=transactions`;
    navigate(url);
  };

  const returnFromProposalDetailsHandler = () => {
    setIsProposalDetails(false);
    setNeedRefreshTxs(true);
    const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
    navigate(url);
  };

  const returnFromProgramDetailsHandler = () => {
    setIsProgramDetails(false);
    const url = `${MULTISIG_ROUTE_BASE_PATH}?v=programs`;
    navigate(url);
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderRightPanelInner = () => {
    if (!selectedMultisig) {
      return null;
    }

    if (!isProposalDetails && !isProgramDetails) {
      if (selectedMultisig.version === 0) {
        return (
          <SafeSerumInfoView
            connection={connection}
            isProgramDetails={isProgramDetails}
            isProposalDetails={isProposalDetails}
            multisigClient={multisigSerumClient}
            onNewProposalClicked={onNewProposalClicked}
            multisigTxs={[]}
            onDataToProgramView={goToProgramDetailsHandler}
            onDataToSafeView={goToProposalDetailsHandler}
            onEditMultisigClick={onEditMultisigClick}
            selectedMultisig={selectedMultisig}
          />
        );
      } else {
        return (
          <SafeMeanInfo
            connection={connection}
            loadingPrograms={loadingPrograms}
            loadingProposals={loadingProposals}
            multisigClient={multisigClient}
            onDataToProgramView={goToProgramDetailsHandler}
            onDataToSafeView={goToProposalDetailsHandler}
            onEditMultisigClick={onEditMultisigClick}
            onNewProposalClicked={onNewProposalClicked}
            safeBalanceInUsd={safeBalance}
            selectedMultisig={selectedMultisig}
            selectedTab={queryParamV}
          />
        );
      }
    } else if (isProposalDetails) {
      return (
        <ProposalDetailsView
          onDataToSafeView={returnFromProposalDetailsHandler}
          proposalSelected={selectedProposal}
          selectedMultisig={selectedMultisig}
          onProposalApprove={onExecuteApproveTx}
          onProposalReject={onExecuteRejectTx}
          onProposalExecute={onExecuteFinishTx}
          onProposalCancel={onExecuteCancelTx}
          connection={connection}
          solanaApps={solanaApps}
          appsProvider={appsProvider}
          multisigClient={multisigClient}
          hasMultisigPendingProposal={hasMultisigPendingProposal()}
          isBusy={isBusy}
          loadingData={
            loadingMultisigAccounts ||
            loadingProposals ||
            loadingProposalDetails
          }
        />
      );
    } else if (isProgramDetails) {
      return (
        <ProgramDetailsView
          onDataToProgramView={returnFromProgramDetailsHandler}
          programSelected={programSelected}
          selectedMultisig={selectedMultisig}
        />
      );
    } else {
      return null;
    }
  };

  return (
    <>
      <span id="multisig-refresh-cta" onClick={() => getMultisigList()}></span>
      <span
        id="refresh-selected-proposal-cta"
        onClick={() => {
          onRefresProposals();
          refreshSelectedProposal();
        }}
      ></span>
      <div className="float-top-right mr-1 mt-1">
        <span className="icon-button-container secondary-button">
          <Tooltip placement="bottom" title="Refresh safe">
            <Button
              type="default"
              shape="circle"
              size="middle"
              icon={<ReloadOutlined className="mean-svg-icons" />}
              onClick={() => refreshSafeDetails()}
            />
          </Tooltip>
        </span>
      </div>

      <div className="safe-details-component scroll-wrapper vertical-scroll">
        {connected && multisigClient && selectedMultisig ? (
          <>
            <Spin spinning={loadingMultisigAccounts}>
              {renderRightPanelInner()}
            </Spin>
          </>
        ) : (
          <div className="h-100 flex-center">
            <Spin spinning={loadingMultisigAccounts}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <p>
                    {!connected
                      ? t('multisig.multisig-accounts.not-connected')
                      : loadingMultisigAccounts
                        ? t(
                          'multisig.multisig-accounts.loading-multisig-accounts',
                        )
                        : t(
                          'multisig.multisig-account-detail.no-multisig-loaded',
                        )}
                  </p>
                }
              />
            </Spin>
          </div>
        )}
      </div>

      {isEditMultisigModalVisible && selectedMultisig && (
        <MultisigEditModal
          isVisible={isEditMultisigModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={onAcceptEditMultisig}
          multisigName={selectedMultisig.label}
          multisigThreshold={selectedMultisig.threshold}
          multisigParticipants={selectedMultisig.owners}
          multisigAccounts={multisigAccounts}
          multisigPendingTxsAmount={selectedMultisig.pendingTxsAmount}
          handleClose={() => setIsEditMultisigModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {isErrorReportingModalVisible && (
        <ErrorReportModal
          handleClose={closeErrorReportingModal}
          isVisible={isErrorReportingModalVisible}
          title={
            transactionStatus.customError.title ||
            'Error submitting transaction'
          }
        />
      )}
    </>
  );
};

export default SafeView;
