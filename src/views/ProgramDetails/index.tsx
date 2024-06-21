import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig } from '@mean-dao/mean-multisig-sdk';
import type { TransactionFees } from '@mean-dao/payment-streaming';
import { AnchorProvider, Program } from '@project-serum/anchor';
import {
  type ConfirmOptions,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  type TransactionInstructionCtorFields,
  type VersionedTransaction,
} from '@solana/web3.js';
import { segmentAnalytics } from 'App';
import { Button, Col, Row, Tooltip, notification } from 'antd';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { MultisigSetProgramAuthModal } from 'components/MultisigSetProgramAuthModal';
import { MultisigUpgradeProgramModal } from 'components/MultisigUpgradeProgramModal';
import { openNotification } from 'components/Notifications';
import { TabsMean } from 'components/TabsMean';
import { MAX_SUPPORTED_TRANSACTION_VERSION, MULTISIG_ROUTE_BASE_PATH, NO_FEES } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnection, useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext, type TxConfirmationInfo, confirmationEvents } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useLocalStorage from 'hooks/useLocalStorage';
import { appConfig, customLogger } from 'index';
import { resolveParsedAccountInfo } from 'middleware/accounts';
import { BPF_LOADER_UPGRADEABLE_PID, SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import {
  type ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  shortenAddress,
} from 'middleware/utils';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import type { SetProgramAuthPayload } from 'models/multisig';
import type { ProgramUpgradeParams } from 'models/programs';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { failsafeConnectionConfig } from 'services/connections-hq';
import IdlTree from './IdlTree';
import { MultisigMakeProgramImmutableModal } from './MultisigMakeProgramImmutableModal';
import Transactions from './Transactions';
import './style.scss';

let isWorkflowLocked = false;

const ProgramDetailsView = (props: { programSelected: any }) => {
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { account } = useNativeAccount();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet } = useWallet();
  const {
    selectedAccount,
    selectedMultisig,
    transactionStatus,
    setTransactionStatus,
    refreshTokenBalance,
    refreshMultisigs,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(TxConfirmationContext);

  const { programSelected } = props;

  const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [selectedProgramIdl, setSelectedProgramIdl] = useState<any>(null);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [programTransactions, setProgramTransactions] = useState<any>();
  const [upgradeAuthority, setUpgradeAuthority] = useState<string | null>(null);
  const [canSubscribe, setCanSubscribe] = useState(true);

  /////////////////
  //  Init code  //
  /////////////////

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const multisigProgramAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }
    return new MeanMultisig(connectionConfig.endpoint, publicKey, failsafeConnectionConfig, multisigProgramAddressPK);
  }, [publicKey, connection, multisigProgramAddressPK, connectionConfig.endpoint]);

  const isTxInProgress = useCallback(
    (operation?: OperationType) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (operation !== undefined) {
          return confirmationHistory.some(h => h.operationType === operation && h.txInfoFetchStatus === 'fetching');
        } else {
          return confirmationHistory.some(h => h.txInfoFetchStatus === 'fetching');
        }
      }
      return false;
    },
    [confirmationHistory],
  );

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const resetTransactionStatus = useCallback(() => {
    setIsBusy(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Idle,
      currentOperation: TransactionStatus.Idle,
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

  const getMultisigList = useCallback(() => {
    if (!publicKey) {
      return;
    }

    refreshMultisigs();
  }, [publicKey, refreshMultisigs]);

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `ProgramDetailsView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const recordTxConfirmation = useCallback((item: TxConfirmationInfo, success = true) => {
    let event: any = undefined;

    if (item) {
      switch (item.operationType) {
        case OperationType.UpgradeProgram:
          event = success ? AppUsageEvent.UpgradeProgramCompleted : AppUsageEvent.UpgradeProgramFailed;
          break;
        case OperationType.SetMultisigAuthority:
          event = success ? AppUsageEvent.SetMultisigAuthorityCompleted : AppUsageEvent.SetMultisigAuthorityFailed;
          break;
        default:
          break;
      }
      if (event) {
        segmentAnalytics.recordEvent(event, { signature: item.signature });
      }
    }
  }, []);

  const reloadMultisigs = useCallback(() => {
    const refreshCta = document.getElementById('multisig-refresh-cta');
    if (refreshCta) {
      refreshCta.click();
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      const turnOffLockWorkflow = () => {
        isWorkflowLocked = false;
      };

      const notifyMultisigActionFollowup = (item: TxConfirmationInfo) => {
        if (!item?.extras?.multisigAuthority) {
          turnOffLockWorkflow();
          return;
        }

        const myNotifyKey = `notify-${Date.now()}`;
        openNotification({
          type: 'info',
          key: myNotifyKey,
          title: 'Review proposal',
          duration: 20,
          description: (
            <>
              <div className='mb-2'>The proposal's status can be reviewed in the Safe's proposal list.</div>
              <Button
                type='primary'
                shape='round'
                size='small'
                className='extra-small d-flex align-items-center pb-1'
                onClick={() => {
                  notification.close(myNotifyKey);
                  const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
                  navigate(url);
                }}
              >
                Review proposal
              </Button>
            </>
          ),
          handleClose: turnOffLockWorkflow,
        });
      };

      if (item) {
        if (isWorkflowLocked) {
          return;
        }

        // Lock the workflow
        if (item.extras?.multisigAuthority) {
          isWorkflowLocked = true;
        }

        recordTxConfirmation(item, true);
        switch (item.operationType) {
          case OperationType.UpgradeProgram:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              notifyMultisigActionFollowup(item);
              reloadMultisigs();
            }
            break;
          case OperationType.SetMultisigAuthority:
            logEventHandling(item);
            if (item.extras?.multisigAuthority) {
              notifyMultisigActionFollowup(item);
              reloadMultisigs();
            } else if (!item.extras?.multisigAuthority) {
              window.location.href = '/';
            }
            break;
          default:
            break;
        }
      }
    },
    [logEventHandling, navigate, recordTxConfirmation, reloadMultisigs],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      if (item) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        recordTxConfirmation(item, false);
        setIsBusy(false);
      }
      resetTransactionStatus();
    },
    [recordTxConfirmation, resetTransactionStatus],
  );

  // Upgrade program modal
  const [isUpgradeProgramModalVisible, setIsUpgradeProgramModalVisible] = useState(false);
  const showUpgradeProgramModal = useCallback(() => {
    setIsUpgradeProgramModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.00001,
      mspPercentFee: 0,
    };
    setTransactionFees(fees);
  }, []);

  const closeUpgradeProgramModal = useCallback(() => {
    resetTransactionStatus();
    setIsUpgradeProgramModalVisible(false);
    setIsBusy(false);
  }, [resetTransactionStatus]);

  const onAcceptUpgradeProgram = (params: ProgramUpgradeParams) => {
    consoleOut('params', params, 'blue');
    onExecuteUpgradeProgramsTx(params);
  };

  const onExecuteUpgradeProgramsTx = useCallback(
    async (params: ProgramUpgradeParams) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const updateProgramSingleSigner = async (data: ProgramUpgradeParams) => {
        if (!publicKey) {
          return null;
        }

        const tx = new Transaction();

        const dataBuffer = Buffer.from([3, 0, 0, 0]);
        const spill = publicKey;
        const ixAccounts = [
          {
            pubkey: new PublicKey(data.programDataAddress),
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: new PublicKey(data.programAddress),
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: new PublicKey(data.bufferAddress),
            isWritable: true,
            isSigner: false,
          },
          { pubkey: spill, isWritable: true, isSigner: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
          { pubkey: publicKey, isWritable: false, isSigner: true },
        ];

        const upgradeIxFields: TransactionInstructionCtorFields = {
          keys: ixAccounts,
          programId: BPF_LOADER_UPGRADEABLE_PID,
          data: dataBuffer,
        };

        tx.add(upgradeIxFields);
        tx.feePayer = publicKey;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;

        return tx;
      };

      const updateProgramMultiSigner = async (data: ProgramUpgradeParams) => {
        if (!multisigClient || !selectedMultisig || !publicKey) {
          return null;
        }

        const dataBuffer = Buffer.from([3, 0, 0, 0]);
        const spill = publicKey;
        const ixAccounts = [
          {
            pubkey: new PublicKey(data.programDataAddress),
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: new PublicKey(data.programAddress),
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: new PublicKey(data.bufferAddress),
            isWritable: true,
            isSigner: false,
          },
          { pubkey: spill, isWritable: true, isSigner: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
          { pubkey: SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
          {
            pubkey: selectedMultisig.authority,
            isWritable: false,
            isSigner: false,
          },
        ];

        const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await getProposalWithPrioritizationFees(
          {
            connection,
            multisigClient,
            transactionPriorityOptions,
          },
          publicKey,
          data.proposalTitle,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.UpgradeProgram,
          selectedMultisig.id,
          BPF_LOADER_UPGRADEABLE_PID,
          ixAccounts,
          dataBuffer,
        );

        return tx?.transaction ?? null;
      };

      const upgradeProgram = async (data: ProgramUpgradeParams) => {
        if (isMultisigContext) {
          return updateProgramMultiSigner(data);
        } else {
          return updateProgramSingleSigner(data);
        }
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && params) {
          consoleOut('Start transaction for create multisig', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = {
            programAddress: params.programAddress,
            programDataAddress: params.programDataAddress,
            bufferAddress: params.bufferAddress,
            proposalTitle: params.proposalTitle,
          };

          consoleOut('data:', payload);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: payload,
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
            customLogger.logWarning('Upgrade Program transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          return upgradeProgram(payload)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('upgradeProgram returned transaction:', value);
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
              console.error('upgradeProgram error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Upgrade Program transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Upgrade Program transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Upgrade Program', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Upgrade Program', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              const multisigAuth = isMultisigContext && selectedMultisig ? selectedMultisig.authority.toBase58() : '';
              const loadingMessage = multisigAuth
                ? `Create proposal to upgrade program ${shortenAddress(params.programAddress)}`
                : `Upgrade program ${shortenAddress(params.programAddress)}`;
              const completedMessage = multisigAuth
                ? `Proposal to upgrade program ${shortenAddress(
                    params.programAddress,
                  )} has been submitted for approval.`
                : `Program ${shortenAddress(params.programAddress)} has been upgraded`;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.UpgradeProgram,
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
              setSuccessStatus();
              closeUpgradeProgramModal();
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
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      isMultisigContext,
      transactionCancelled,
      transactionPriorityOptions,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      closeUpgradeProgramModal,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  // Set program authority modal
  const [isSetProgramAuthModalVisible, setIsSetProgramAuthModalVisible] = useState(false);
  const showSetProgramAuthModal = useCallback(() => {
    setIsSetProgramAuthModalVisible(true);
    const fees = {
      blockchainFee: 0.000005,
      mspFlatFee: 0.00001,
      mspPercentFee: 0,
    };
    setTransactionFees(fees);
  }, []);

  const [isMultisigMakeProgramImmutableModalVisible, setIsMultisigMakeProgramImmutableModalVisible] = useState(false);

  const closeSetProgramAuthModal = useCallback(() => {
    resetTransactionStatus();
    setIsSetProgramAuthModalVisible(false);
    setIsBusy(false);
  }, [resetTransactionStatus]);

  const setImmutableProgram = ({ proposalTitle, programId }: { proposalTitle?: string; programId: string }) => {
    try {
      const programAddress = new PublicKey(programId);
      const [programDataAddress] = PublicKey.findProgramAddressSync(
        [programAddress.toBuffer()],
        BPF_LOADER_UPGRADEABLE_PID,
      );
      const fees = {
        blockchainFee: 0.000005,
        mspFlatFee: 0.00001,
        mspPercentFee: 0,
      };
      setTransactionFees(fees);
      const params: SetProgramAuthPayload = {
        proposalTitle: proposalTitle ?? '',
        programAddress: programId,
        programDataAddress: programDataAddress.toBase58(),
        newAuthAddress: '', // Empty to make program non-upgradable (inmutable)
      };
      onAcceptSetProgramAuth(params);
    } catch (error) {
      console.error(error);
    }
  };

  const onAcceptSetProgramAuth = (params: SetProgramAuthPayload) => {
    consoleOut('params', params, 'blue');
    onExecuteSetProgramAuthTx(params);
  };

  const onExecuteSetProgramAuthTx = useCallback(
    async (params: SetProgramAuthPayload) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: any;
      let encodedTx: string;
      let transactionLog: any[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const setProgramAuthSingleSigner = async (data: SetProgramAuthPayload) => {
        if (!publicKey) {
          return null;
        }

        const tx = new Transaction();

        const spill = publicKey;
        const ixData = Buffer.from([4, 0, 0, 0]);
        const ixAccounts = [
          {
            pubkey: new PublicKey(data.programDataAddress),
            isWritable: true,
            isSigner: false,
          },
          { pubkey: spill, isWritable: false, isSigner: true },
        ];

        // If it is an authority change, add the account of the new authority
        // otherwise the program will be inmutable
        if (data.newAuthAddress) {
          ixAccounts.push({
            pubkey: new PublicKey(data.newAuthAddress),
            isWritable: false,
            isSigner: false,
          });
        }

        const setAuthIxFields: TransactionInstructionCtorFields = {
          keys: ixAccounts,
          programId: BPF_LOADER_UPGRADEABLE_PID,
          data: ixData,
        };

        tx.add(setAuthIxFields);
        tx.feePayer = publicKey;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;

        return tx;
      };

      const setProgramAuthMultiSigner = async (data: SetProgramAuthPayload) => {
        if (!multisigClient || !selectedMultisig || !publicKey) {
          return null;
        }

        const [multisigSigner] = PublicKey.findProgramAddressSync(
          [selectedMultisig.id.toBuffer()],
          multisigProgramAddressPK,
        );

        const ixData = Buffer.from([4, 0, 0, 0]);
        const ixAccounts = [
          {
            pubkey: new PublicKey(data.programDataAddress),
            isWritable: true,
            isSigner: false,
          },
          { pubkey: multisigSigner, isWritable: false, isSigner: true },
        ];

        // If it is an authority change, add the account of the new authority
        // otherwise the program will be inmutable
        if (data.newAuthAddress) {
          ixAccounts.push({
            pubkey: new PublicKey(data.newAuthAddress),
            isWritable: false,
            isSigner: false,
          });
        }

        const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await getProposalWithPrioritizationFees(
          {
            connection,
            multisigClient,
            transactionPriorityOptions,
          },
          publicKey,
          data.proposalTitle,
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.SetMultisigAuthority,
          selectedMultisig.id,
          BPF_LOADER_UPGRADEABLE_PID,
          ixAccounts,
          ixData,
        );

        return tx?.transaction ?? null;
      };

      const setProgramAuth = async (data: SetProgramAuthPayload) => {
        if (isMultisigContext) {
          return setProgramAuthMultiSigner(data);
        } else {
          return setProgramAuthSingleSigner(data);
        }
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && params) {
          consoleOut('Start transaction for create multisig', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          consoleOut('data:', params);

          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: params,
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
            customLogger.logWarning('Set program authority transaction failed', { transcript: transactionLog });
            return false;
          }

          return setProgramAuth(params)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('setProgramAuth returned transaction:', value);
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
              console.error('setProgramAuth error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Set program authority transaction failed', { transcript: transactionLog });
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Set program authority transaction failed', {
            transcript: transactionLog,
          });
          return false;
        }
      };

      if (wallet && publicKey) {
        const create = await createTx();
        consoleOut('created:', create);
        if (create && !transactionCancelled) {
          const sign = await signTx('Set Program Authority', wallet, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Set Program Authority', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              //
              const multisigAuth = isMultisigContext && selectedMultisig ? selectedMultisig.authority.toBase58() : '';
              const isAuthChange = !!params.newAuthAddress;
              const authChangeLoadingMessage = multisigAuth
                ? `Create proposal to set program authority to ${shortenAddress(params.newAuthAddress)}`
                : `Set program authority to ${shortenAddress(params.newAuthAddress)}`;
              const authChangeCompleted = multisigAuth
                ? `Set program authority proposal has been submitted for approval.`
                : `Program authority set to ${shortenAddress(params.newAuthAddress)}`;
              const makeImmutableLoadingMessage = multisigAuth
                ? `Create proposal to make program ${shortenAddress(params.programAddress)} non-upgradable`
                : `Make program ${shortenAddress(params.programAddress)} non-upgradable`;
              const makeImmutableCompleted = multisigAuth
                ? `Proposal to set program ${shortenAddress(
                    params.programAddress,
                  )} as non-upgradable has been submitted for approval.`
                : `Program ${shortenAddress(params.programAddress)} is now non-upgradable`;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.SetMultisigAuthority,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: isAuthChange ? authChangeLoadingMessage : makeImmutableLoadingMessage,
                completedTitle: 'Transaction confirmed',
                completedMessage: isAuthChange ? authChangeCompleted : makeImmutableCompleted,
                extras: {
                  multisigAuthority: multisigAuth,
                },
              });
              setSuccessStatus();
              closeSetProgramAuthModal();
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
    },
    [
      wallet,
      publicKey,
      connection,
      nativeBalance,
      multisigClient,
      selectedMultisig,
      isMultisigContext,
      transactionCancelled,
      multisigProgramAddressPK,
      transactionPriorityOptions,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      closeSetProgramAuthModal,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  // Keep account balance updated
  useEffect(() => {
    if (account?.lamports !== previousBalance || !nativeBalance) {
      refreshTokenBalance();
      setNativeBalance(getAmountFromLamports(account?.lamports));
      setPreviousBalance(account?.lamports);
    }
  }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

  const renderProgramLabel = useCallback(() => {
    if (!selectedProgramIdl) {
      return '--';
    }
    return selectedProgramIdl.name;
  }, [selectedProgramIdl]);

  // Program Address
  const renderProgramAddress = () => {
    if (!programSelected) {
      return '--';
    }
    return <CopyExtLinkGroup content={programSelected.pubkey.toBase58()} number={4} externalLink={true} />;
  };

  // Get the upgrade authority of a program
  useEffect(() => {
    if (!programSelected) {
      return;
    }

    const programData = programSelected.executable.toBase58() as string;
    resolveParsedAccountInfo(connection, programData)
      .then(accountInfo => {
        const authority = accountInfo.data.parsed.info.authority as string | null;
        setUpgradeAuthority(authority);
      })
      .catch(error => setUpgradeAuthority(null));
  }, [connection, programSelected]);

  // Upgrade Authority
  const renderUpgradeAuthority = () => {
    if (!upgradeAuthority) {
      return '--';
    }

    return <CopyExtLinkGroup content={upgradeAuthority} number={4} externalLink={true} />;
  };

  // // Executable
  // const [isExecutable, setIsExecutable] = useState<boolean>();
  // useEffect(() => {
  //   programSelected && programSelected.executable.toBase58() ? (
  //     setIsExecutable(true)
  //   ) : (
  //     setIsExecutable(false)
  //   )
  // }, [programSelected]);

  // Balance SOL
  const [balanceSol, setBalanceSol] = useState<any>();

  useEffect(() => {
    if (!connection || !programSelected || !programSelected.pubkey) {
      return;
    }

    connection
      .getBalance(programSelected.pubkey)
      .then(balance => {
        setBalanceSol(formatThousands(balance / LAMPORTS_PER_SOL, NATIVE_SOL.decimals, NATIVE_SOL.decimals));
      })
      .catch(error => console.error(error));
  }, [connection, programSelected]);

  const infoProgramData = [
    {
      name: 'Address label',
      value: renderProgramLabel(),
    },
    {
      name: 'Program address',
      value: renderProgramAddress(),
    },
    {
      name: 'Upgradeable',
      value: upgradeAuthority ? 'Yes' : 'No',
    },
    {
      name: 'Upgrade authority',
      value: renderUpgradeAuthority(),
    },
    // {
    //   name: "Executable",
    //   value: isExecutable ? "Yes" : "no"
    // },
    {
      name: 'Balance (SOL)',
      value: balanceSol ?? '--',
    },
  ];

  // Get transactions
  const getProgramTxs = useCallback(async () => {
    if (!connection || !programSelected) {
      return null;
    }

    const signaturesInfo = await connection.getConfirmedSignaturesForAddress2(programSelected.pubkey, { limit: 50 });

    if (signaturesInfo.length === 0) {
      return null;
    }

    const signatures = signaturesInfo.map(data => data.signature);
    const txs = await connection.getParsedTransactions(signatures, {
      maxSupportedTransactionVersion: MAX_SUPPORTED_TRANSACTION_VERSION,
    });

    if (txs.length === 0) {
      return null;
    }

    return txs.filter(tx => tx !== null);
  }, [connection, programSelected]);

  useEffect(() => {
    if (!connection || !programSelected || !loadingTxs) {
      return;
    }

    const timeout = setTimeout(() => {
      getProgramTxs()
        .then(txs => setProgramTransactions(txs))
        .catch((err: any) => console.error(err))
        .finally(() => setLoadingTxs(false));
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [connection, programSelected, loadingTxs, getProgramTxs]);

  const getProgramIDL = useCallback(async () => {
    if (!connection || !publicKey || !programSelected) {
      return null;
    }

    const createAnchorProvider = (): AnchorProvider => {
      const opts: ConfirmOptions = {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        maxRetries: 3,
        skipPreflight: false,
      };

      const anchorWallet = {
        publicKey: publicKey,
        signAllTransactions: async (txs: any) => txs,
        signTransaction: async (tx: any) => tx,
      };

      const provider = new AnchorProvider(connection, anchorWallet, opts);

      return provider;
    };

    const provider = createAnchorProvider();

    return Program.fetchIdl(programSelected.pubkey, provider);
  }, [connection, programSelected, publicKey]);

  // Get Anchor IDL
  useEffect(() => {
    if (!connection || !publicKey || !programSelected) {
      return;
    }

    const timeout = setTimeout(() => {
      getProgramIDL()
        .then((idl: any) => {
          if (!idl) {
            return;
          }
          console.log('IDL', idl);
          setSelectedProgramIdl(idl);
        })
        .catch((err: any) => {
          setSelectedProgramIdl(null);
          console.error(err);
        });
    });

    return () => {
      clearTimeout(timeout);
    };
  }, [connection, getProgramIDL, programSelected, publicKey]);

  // Setup event listeners
  useEffect(() => {
    if (canSubscribe) {
      setCanSubscribe(false);
      consoleOut('Setup event subscriptions -> ProgramDetailsView', '', 'brown');
      confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
      confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
    }
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> ProgramDetailsView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
    };
  }, []);

  // Tabs
  const tabs = [
    {
      id: 'transactions',
      name: 'Transactions',
      render: <Transactions loadingTxs={loadingTxs} programTransactions={programTransactions} />,
    },
    {
      id: 'anchor-idl',
      name: 'Anchor IDL',
      render: <IdlTree selectedProgramIdl={selectedProgramIdl} />,
    },
  ];

  return (
    <>
      <span id='multisig-refresh-cta' onClick={() => getMultisigList()}></span>
      <div className='program-details-container'>
        <Row gutter={[8, 8]} className='safe-info-container mr-0 ml-0'>
          {infoProgramData.map(info => (
            <Col xs={12} sm={12} md={12} lg={12} key={info.name}>
              <div className='info-safe-group'>
                <span className='info-label'>{info.name}</span>
                <span className='info-data'>{info.value}</span>
              </div>
            </Col>
          ))}
        </Row>

        <Row gutter={[8, 8]} className='programs-btns safe-btns-container mt-2 mb-1 mr-0 ml-0'>
          <Col xs={24} sm={24} md={24} lg={24} className='btn-group'>
            <Tooltip
              title={
                upgradeAuthority ? 'Update the executable data of this program' : 'This program is non-upgradeable'
              }
            >
              <Button
                type='default'
                shape='round'
                size='small'
                className='thin-stroke'
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showUpgradeProgramModal}
              >
                <div className='btn-content'>Upgrade / Deployment</div>
              </Button>
            </Tooltip>
            <Tooltip
              title={
                upgradeAuthority ? 'This changes the authority of this program' : 'This program is non-upgradeable'
              }
            >
              <Button
                type='default'
                shape='round'
                size='small'
                className='thin-stroke'
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showSetProgramAuthModal}
              >
                <div className='btn-content'>Set authority</div>
              </Button>
            </Tooltip>
            {programSelected && (
              <Tooltip
                title={upgradeAuthority ? 'This makes the program non-upgradable' : 'This program is non-upgradeable'}
              >
                <Button
                  type='default'
                  shape='round'
                  size='small'
                  className='thin-stroke'
                  disabled={isTxInProgress() || !upgradeAuthority}
                  onClick={() => {
                    if (isMultisigContext) {
                      setIsMultisigMakeProgramImmutableModalVisible(true);
                    } else {
                      setImmutableProgram({
                        programId: programSelected.pubkey.toBase58(),
                      });
                    }
                  }}
                >
                  <div className='btn-content'>Make immutable</div>
                </Button>
              </Tooltip>
            )}
          </Col>
        </Row>

        <TabsMean tabs={tabs} defaultTab='transactions' />
      </div>

      {isUpgradeProgramModalVisible && (
        <MultisigUpgradeProgramModal
          isVisible={isUpgradeProgramModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={(params: ProgramUpgradeParams) => onAcceptUpgradeProgram(params)}
          handleClose={closeUpgradeProgramModal}
          programId={programSelected?.pubkey.toBase58()}
          isBusy={isBusy}
          programAddress={programSelected.pubkey.toBase58()}
          isMultisigTreasury={isMultisigContext}
        />
      )}

      {isSetProgramAuthModalVisible && (
        <MultisigSetProgramAuthModal
          isVisible={isSetProgramAuthModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={(params: SetProgramAuthPayload) => onAcceptSetProgramAuth(params)}
          handleClose={closeSetProgramAuthModal}
          programId={programSelected?.pubkey.toBase58()}
          isBusy={isBusy}
          isMultisigTreasury={isMultisigContext}
        />
      )}
      {isMultisigMakeProgramImmutableModalVisible && (
        <MultisigMakeProgramImmutableModal
          handleOk={({ proposalTitle }) => {
            setIsMultisigMakeProgramImmutableModalVisible(false);
            setImmutableProgram({
              proposalTitle,
              programId: programSelected.pubkey.toBase58(),
            });
          }}
          handleClose={() => setIsMultisigMakeProgramImmutableModalVisible(false)}
        />
      )}
    </>
  );
};

export default ProgramDetailsView;
