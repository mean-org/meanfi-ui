import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MeanMultisig,
} from '@mean-dao/mean-multisig-sdk';
import { TransactionFees } from '@mean-dao/msp';
import { AnchorProvider, Program } from '@project-serum/anchor';
import {
  ConfirmOptions,
  Connection,
  LAMPORTS_PER_SOL,
  ParsedTransactionWithMeta,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstructionCtorFields,
} from '@solana/web3.js';
import { Button, Col, notification, Row, Tooltip } from 'antd';
import { segmentAnalytics } from 'App';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { MultisigSetProgramAuthModal } from 'components/MultisigSetProgramAuthModal';
import { MultisigUpgradeProgramModal } from 'components/MultisigUpgradeProgramModal';
import { openNotification } from 'components/Notifications';
import { TabsMean } from 'components/TabsMean';
import { MULTISIG_ROUTE_BASE_PATH, NO_FEES } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { useNativeAccount } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { appConfig, customLogger } from 'index';
import { resolveParsedAccountInfo } from 'middleware/accounts';
import { BPF_LOADER_UPGRADEABLE_PID, NATIVE_SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import {
  formatThousands,
  getAmountFromLamports,
  getAmountWithSymbol,
  getTxIxResume,
  shortenAddress,
} from 'middleware/utils';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import { SetProgramAuthPayload } from 'models/multisig';
import { ProgramUpgradeParams } from 'models/programs';
import moment from 'moment';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import ReactJson from 'react-json-view';
import { useNavigate } from 'react-router-dom';
import './style.scss';

let isWorkflowLocked = false;

const ProgramDetailsView = (props: {
  programSelected: any;
}) => {
  const navigate = useNavigate();
  const { account } = useNativeAccount();
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
  const {
    confirmationHistory,
    enqueueTransactionConfirmation,
  } = useContext(TxConfirmationContext);

  const {
    programSelected,
  } = props;

  const [transactionFees, setTransactionFees] =
    useState<TransactionFees>(NO_FEES);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [selectedProgramIdl, setSelectedProgramIdl] = useState<any>(null);
  const [loadingTxs, setLoadingTxs] = useState(true);
  const [programTransactions, setProgramTransactions] = useState<any>();
  const [upgradeAuthority, setUpgradeAuthority] = useState<string | null>(null);
  const [canSubscribe, setCanSubscribe] = useState(true);

  const noIdlInfo =
    'The program IDL is not initialized. To load the IDL info please run `anchor idl init` with the required parameters from your program workspace.';


  /////////////////
  //  Init code  //
  /////////////////

  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  const multisigProgramAddressPK = useMemo(
    () => new PublicKey(appConfig.getConfig().multisigProgramAddress),
    [],
  );

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }
    return new MeanMultisig(
      connectionConfig.endpoint,
      publicKey,
      'confirmed',
      multisigProgramAddressPK,
    );
  }, [publicKey, connection, multisigProgramAddressPK, connectionConfig.endpoint]);

  const isTxInProgress = useCallback(
    (operation?: OperationType) => {
      if (confirmationHistory && confirmationHistory.length > 0) {
        if (operation !== undefined) {
          return confirmationHistory.some(
            h =>
              h.operationType === operation &&
              h.txInfoFetchStatus === 'fetching',
          );
        } else {
          return confirmationHistory.some(
            h => h.txInfoFetchStatus === 'fetching',
          );
        }
      }
      return false;
    },
    [confirmationHistory],
  );

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  const resetTransactionStatus = useCallback(() => {
    setIsBusy(false);
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  const getMultisigList = useCallback(() => {
    if (!publicKey) {
      return;
    }

    refreshMultisigs();
  }, [publicKey, refreshMultisigs]);

  const recordTxConfirmation = useCallback(
    (item: TxConfirmationInfo, success = true) => {
      let event: any = undefined;

      if (item) {
        switch (item.operationType) {
          case OperationType.UpgradeProgram:
            event = success
              ? AppUsageEvent.UpgradeProgramCompleted
              : AppUsageEvent.UpgradeProgramFailed;
            break;
          case OperationType.SetMultisigAuthority:
            event = success
              ? AppUsageEvent.SetMultisigAuthorityCompleted
              : AppUsageEvent.SetMultisigAuthorityFailed;
            break;
          default:
            break;
        }
        if (event) {
          segmentAnalytics.recordEvent(event, { signature: item.signature });
        }
      }
    },
    [],
  );

  const reloadMultisigs = useCallback(() => {
    const refreshCta = document.getElementById('multisig-refresh-cta');
    if (refreshCta) {
      refreshCta.click();
    }
  }, []);

  // Setup event handler for Tx confirmed
  const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {
    const turnOffLockWorkflow = () => {
      isWorkflowLocked = false;
    };

    const notifyMultisigActionFollowup = (item: TxConfirmationInfo) => {
      if (!item || !item.extras || !item.extras.multisigAuthority) {
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
            <div className="mb-2">
              The proposal's status can be reviewed in the Safe's proposal list.
            </div>
            <Button
              type="primary"
              shape="round"
              size="small"
              className="extra-small d-flex align-items-center pb-1"
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
      if (item.extras && item.extras.multisigAuthority) {
        isWorkflowLocked = true;
      }

      consoleOut(`ProgramDetailsView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
      recordTxConfirmation(item, true);
      switch (item.operationType) {
        case OperationType.UpgradeProgram:
          if (item.extras && item.extras.multisigAuthority) {
            notifyMultisigActionFollowup(item);
            reloadMultisigs();
          }
          break;
        case OperationType.SetMultisigAuthority:
          if (item.extras && item.extras.multisigAuthority) {
            notifyMultisigActionFollowup(item);
            reloadMultisigs();
          } else if (!item.extras || !item.extras.multisigAuthority) {
            window.location.href = '/';
          }
          break;
        default:
          break;
      }
    }
  }, [navigate, recordTxConfirmation, reloadMultisigs]);

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    (item: TxConfirmationInfo) => {
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

  const onExecuteUpgradeProgramsTx = useCallback(async (params: ProgramUpgradeParams) => {
    let transaction: Transaction;
    let signature: any;
    let encodedTx: string;
    const transactionLog: any[] = [];

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
        data: dataBuffer
      };

      tx.add(upgradeIxFields);
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;

      return tx;
    }

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

      const expirationTime = parseInt(
        (Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString(),
      );

      const tx = await multisigClient.createTransaction(
        publicKey,
        'Upgrade Program',
        '', // description
        new Date(expirationTime * 1_000),
        OperationType.UpgradeProgram,
        selectedMultisig.id,
        BPF_LOADER_UPGRADEABLE_PID,
        ixAccounts,
        dataBuffer,
      );

      return tx;
    }

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
        consoleOut(
          'blockchainFee:',
          transactionFees.blockchainFee + transactionFees.mspFlatFee,
          'blue',
        );
        consoleOut('nativeBalance:', nativeBalance, 'blue');

        if (
          nativeBalance <
          transactionFees.blockchainFee + transactionFees.mspFlatFee
        ) {
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
              transactionFees.blockchainFee + transactionFees.mspFlatFee,
              NATIVE_SOL_MINT.toBase58(),
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
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionSuccess,
              ),
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
              action: getTransactionStatusForLogs(
                TransactionStatus.InitTransactionFailure,
              ),
              result: `${error}`,
            });
            customLogger.logError('Upgrade Program transaction failed', {
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
        customLogger.logError('Upgrade Program transaction failed', {
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
            customLogger.logError('Upgrade Program transaction failed', {
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
        customLogger.logError('Upgrade Program transaction failed', {
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
          const multisigAuth = isMultisigContext && selectedMultisig
            ? selectedMultisig.authority.toBase58()
            : ''
          const loadingMessage = multisigAuth
            ? `Create proposal to upgrade program ${shortenAddress(params.programAddress)}`
            : `Upgrade program ${shortenAddress(params.programAddress)}`;
          const completedMessage = multisigAuth
            ? `Proposal to upgrade program ${shortenAddress(params.programAddress)} has been submitted for approval.`
            : `Program ${shortenAddress(params.programAddress)} has been upgraded`;
          enqueueTransactionConfirmation({
            signature: signature,
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

          closeUpgradeProgramModal();
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
      isMultisigContext,
      transactionCancelled,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      closeUpgradeProgramModal,
      resetTransactionStatus,
      setTransactionStatus,
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

  const closeSetProgramAuthModal = useCallback(() => {
    resetTransactionStatus();
    setIsSetProgramAuthModalVisible(false);
    setIsBusy(false);
  }, [resetTransactionStatus]);

  const setInmutableProgram = (programId: string) => {
    const programAddress = new PublicKey(programId);
    PublicKey.findProgramAddress(
      [programAddress.toBuffer()],
      BPF_LOADER_UPGRADEABLE_PID,
    )
      .then((result: any) => {
        const programDataAddress = result[0];
        const fees = {
          blockchainFee: 0.000005,
          mspFlatFee: 0.00001,
          mspPercentFee: 0,
        };
        setTransactionFees(fees);
        const params: SetProgramAuthPayload = {
          programAddress: programId,
          programDataAddress: programDataAddress.toBase58(),
          newAuthAddress: '', // Empty to make program non-upgradable (inmutable)
        };
        onAcceptSetProgramAuth(params);
      })
      .catch(err => console.error(err));
  };

  const onAcceptSetProgramAuth = (params: SetProgramAuthPayload) => {
    consoleOut('params', params, 'blue');
    onExecuteSetProgramAuthTx(params);
  };

  const onExecuteSetProgramAuthTx = useCallback(
    async (params: SetProgramAuthPayload) => {
      let transaction: Transaction;
      let signature: any;
      let encodedTx: string;
      const transactionLog: any[] = [];

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
          data: ixData
        };

        tx.add(setAuthIxFields);
        tx.feePayer = publicKey;
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.lastValidBlockHeight = lastValidBlockHeight;

        return tx;
      }

      const setProgramAuthMultiSigner = async (data: SetProgramAuthPayload) => {
        if (!multisigClient || !selectedMultisig || !publicKey) {
          return null;
        }
  
        const [multisigSigner] = await PublicKey.findProgramAddress(
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
  
        const expirationTime = parseInt(
          (Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString(),
        );
  
        const tx = await multisigClient.createTransaction(
          publicKey,
          'Set Program Authority',
          '', // description
          new Date(expirationTime * 1_000),
          OperationType.SetMultisigAuthority,
          selectedMultisig.id,
          BPF_LOADER_UPGRADEABLE_PID,
          ixAccounts,
          ixData,
        );
  
        return tx;
      }

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
            action: getTransactionStatusForLogs(
              TransactionStatus.TransactionStart,
            ),
            inputs: params,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransaction,
            ),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          consoleOut(
            'blockchainFee:',
            transactionFees.blockchainFee + transactionFees.mspFlatFee,
            'blue',
          );
          consoleOut('nativeBalance:', nativeBalance, 'blue');

          if (
            nativeBalance <
            transactionFees.blockchainFee + transactionFees.mspFlatFee
          ) {
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
                transactionFees.blockchainFee + transactionFees.mspFlatFee,
                NATIVE_SOL_MINT.toBase58(),
              )})`,
            });
            customLogger.logWarning(
              'Set program authority transaction failed',
              { transcript: transactionLog },
            );
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
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionSuccess,
                ),
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
                action: getTransactionStatusForLogs(
                  TransactionStatus.InitTransactionFailure,
                ),
                result: `${error}`,
              });
              customLogger.logError(
                'Set program authority transaction failed',
                { transcript: transactionLog },
              );
              return false;
            });
        } else {
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.WalletNotFound,
            ),
            result: 'Cannot start transaction! Wallet not found!',
          });
          customLogger.logError('Set program authority transaction failed', {
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
              customLogger.logError(
                'Set program authority transaction failed',
                { transcript: transactionLog },
              );
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
          customLogger.logError('Set program authority transaction failed', {
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
            const multisigAuth = isMultisigContext && selectedMultisig
              ? selectedMultisig.authority.toBase58()
              : ''
            const isAuthChange = params.newAuthAddress ? true : false;
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
              ? `Proposal to set program ${shortenAddress(params.programAddress)} as non-upgradable has been submitted for approval.`
              : `Program ${shortenAddress(params.programAddress)} is now non-upgradable`;
            enqueueTransactionConfirmation({
              signature: signature,
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
            closeSetProgramAuthModal();
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
      isMultisigContext,
      transactionCancelled,
      multisigProgramAddressPK,
      transactionFees.mspFlatFee,
      transactionFees.blockchainFee,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      closeSetProgramAuthModal,
      resetTransactionStatus,
      setTransactionStatus,
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
    return (
      <CopyExtLinkGroup
        content={programSelected.pubkey.toBase58()}
        number={4}
        externalLink={true}
      />
    );
  };

  // Get the upgrade authority of a program
  useEffect(() => {
    if (!programSelected) {
      return;
    }

    const programData = programSelected.executable.toBase58() as string;
    resolveParsedAccountInfo(connection, programData)
      .then(accountInfo => {
        const authority = accountInfo.data.parsed.info.authority as
          | string
          | null;
        setUpgradeAuthority(authority);
      })
      .catch(error => setUpgradeAuthority(null));
  }, [connection, programSelected]);

  // Upgrade Authority
  const renderUpgradeAuthority = () => {
    if (!upgradeAuthority) {
      return '--';
    }

    return (
      <CopyExtLinkGroup
        content={upgradeAuthority}
        number={4}
        externalLink={true}
      />
    );
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
        setBalanceSol(
          formatThousands(
            balance / LAMPORTS_PER_SOL,
            NATIVE_SOL.decimals,
            NATIVE_SOL.decimals,
          ),
        );
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
      value: balanceSol ? balanceSol : '--',
    },
  ];

  // Get transactions
  const getProgramTxs = useCallback(async () => {
    if (!connection || !programSelected) {
      return null;
    }

    const signaturesInfo = await connection.getConfirmedSignaturesForAddress2(
      programSelected.pubkey,
      { limit: 50 }, // TODO: Implement pagination
    );

    if (signaturesInfo.length === 0) {
      return null;
    }

    const signatures = signaturesInfo.map(data => data.signature);
    const txs = await connection.getParsedTransactions(signatures);

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

  const renderTransactions = (
    <>
      <div className="item-list-header compact mt-2 mr-1">
        <Row gutter={[8, 8]} className="d-flex header-row pb-2">
          <Col span={14} className="std-table-cell pr-1">
            Signatures
          </Col>
          <Col span={5} className="std-table-cell pl-3 pr-1">
            Slots
          </Col>
          <Col span={5} className="std-table-cell pl-3 pr-1">
            Time
          </Col>
        </Row>
      </div>
      {!loadingTxs ? (
        programTransactions && programTransactions.length > 0 ? (
          programTransactions.map((tx: ParsedTransactionWithMeta) => (
            <Row
              gutter={[8, 8]}
              className="item-list-body compact hover-list w-100 pt-1"
              key={tx.blockTime}
            >
              <Col
                span={14}
                className="std-table-cell pr-1 simplelink signature"
              >
                <CopyExtLinkGroup
                  content={tx.transaction.signatures.slice(0, 1).shift() || ''}
                  externalLink={true}
                  className="text-truncate"
                  message="Signature"
                  isTx={true}
                />
              </Col>
              <Col span={5} className="std-table-cell pr-1 simplelink">
                <CopyExtLinkGroup
                  content={formatThousands(tx.slot)}
                  externalLink={false}
                  className="text-truncate"
                  message="Slot"
                />
              </Col>
              <Col span={5} className="std-table-cell pr-1">
                {moment.unix(tx.blockTime as number).fromNow()}
              </Col>
            </Row>
          ))
        ) : (
          <span>This program has no transactions</span>
        )
      ) : (
        <span>Loading transactions ...</span>
      )}
    </>
  );

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
    }
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderIdlTree = () => {
    return !selectedProgramIdl ? (
      <div className={'no-idl-info'}>{noIdlInfo}</div>
    ) : (
      <ReactJson
        theme={'ocean'}
        enableClipboard={false}
        src={selectedProgramIdl}
      />
    );
  };

  // Tabs
  const tabs = [
    {
      id: 'transactions',
      name: 'Transactions',
      render: renderTransactions,
    },
    {
      id: 'anchor-idl',
      name: 'Anchor IDL',
      render: renderIdlTree(),
    },
  ];

  return (
    <>
      <span id="multisig-refresh-cta" onClick={() => getMultisigList()}></span>
      <div className="program-details-container">

        <Row gutter={[8, 8]} className="safe-info-container mr-0 ml-0">
          {infoProgramData.map((info, index) => (
            <Col xs={12} sm={12} md={12} lg={12} key={index}>
              <div className="info-safe-group">
                <span className="info-label">{info.name}</span>
                <span className="info-data">{info.value}</span>
              </div>
            </Col>
          ))}
        </Row>

        <Row
          gutter={[8, 8]}
          className="programs-btns safe-btns-container mt-2 mb-1 mr-0 ml-0"
        >
          <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
            <Tooltip
              title={
                upgradeAuthority
                  ? 'Update the executable data of this program'
                  : 'This program is non-upgradeable'
              }
            >
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showUpgradeProgramModal}
              >
                <div className="btn-content">Upgrade / Deployment</div>
              </Button>
            </Tooltip>
            <Tooltip
              title={
                upgradeAuthority
                  ? 'This changes the authority of this program'
                  : 'This program is non-upgradeable'
              }
            >
              <Button
                type="default"
                shape="round"
                size="small"
                className="thin-stroke"
                disabled={isTxInProgress() || !upgradeAuthority}
                onClick={showSetProgramAuthModal}
              >
                <div className="btn-content">Set authority</div>
              </Button>
            </Tooltip>
            {programSelected && (
              <Tooltip
                title={
                  upgradeAuthority
                    ? 'This makes the program non-upgradable'
                    : 'This program is non-upgradeable'
                }
              >
                <Button
                  type="default"
                  shape="round"
                  size="small"
                  className="thin-stroke"
                  disabled={isTxInProgress() || !upgradeAuthority}
                  onClick={() =>
                    setInmutableProgram(programSelected.pubkey.toBase58())
                  }
                >
                  <div className="btn-content">Make immutable</div>
                </Button>
              </Tooltip>
            )}
          </Col>
        </Row>

        <TabsMean tabs={tabs} defaultTab="transactions" />
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
        />
      )}

      {isSetProgramAuthModalVisible && (
        <MultisigSetProgramAuthModal
          isVisible={isSetProgramAuthModalVisible}
          nativeBalance={nativeBalance}
          transactionFees={transactionFees}
          handleOk={(params: SetProgramAuthPayload) =>
            onAcceptSetProgramAuth(params)
          }
          handleClose={closeSetProgramAuthModal}
          programId={programSelected?.pubkey.toBase58()}
          isBusy={isBusy}
        />
      )}
    </>
  );
};

export default ProgramDetailsView;
