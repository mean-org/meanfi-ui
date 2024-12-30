import { ReloadOutlined } from '@ant-design/icons';
import type { App, AppsProvider } from '@mean-dao/mean-multisig-apps';
import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MULTISIG_ACTIONS,
  type MultisigInfo,
  type MultisigParticipant,
  type MultisigTransaction,
  type MultisigTransactionFees,
  getFees,
} from '@mean-dao/mean-multisig-sdk';
import { BN } from '@project-serum/anchor';
import { PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { Button, Empty, Spin, Tooltip } from 'antd';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isDesktop } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { segmentAnalytics } from 'src/App';
import { MULTISIG_ROUTE_BASE_PATH } from 'src/app-constants/common';
import { ErrorReportModal } from 'src/components/ErrorReportModal';
import { MultisigEditModal } from 'src/components/MultisigEditModal';
import { openNotification } from 'src/components/Notifications';
import { useNativeAccount } from 'src/contexts/accounts';
import { AppStateContext, type TransactionStatusInfo } from 'src/contexts/appstate';
import { useConnection } from 'src/contexts/connection';
import { TxConfirmationContext, type TxConfirmationInfo, confirmationEvents } from 'src/contexts/transaction-status';
import { useWallet } from 'src/contexts/wallet';
import useLocalStorage from 'src/hooks/useLocalStorage';
import useWindowSize from 'src/hooks/useWindowResize';
import { customLogger } from 'src/main';
import { SOL_MINT } from 'src/middleware/ids';
import { getMultisigProgramId } from 'src/middleware/multisig-helpers';
import {
  type ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  composeTxWithPrioritizationFees,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'src/middleware/transactions';
import { consoleOut, delay, getTransactionStatusForLogs } from 'src/middleware/ui';
import { getAmountFromLamports, getAmountWithSymbol, getTxIxResume } from 'src/middleware/utils';
import type { ProgramAccounts } from 'src/models/accounts';
import { EventType, OperationType, TransactionStatus } from 'src/models/enums';
import { type EditMultisigParams, type MultisigProposalsWithAuthority, ZERO_FEES } from 'src/models/multisig';
import { useGetMultisigAccounts } from 'src/query-hooks/multisigAccounts/index.ts';
import { useMultisigClient } from 'src/query-hooks/multisigClient';
import { AppUsageEvent } from 'src/services/segment-service';
import type { LooseObject } from 'src/types/LooseObject';
import { ProposalDetailsView } from './components/ProposalDetails';
import { SafeMeanInfo } from './components/SafeMeanInfo';

const proposalLoadStatusRegister = new Map<string, boolean>();

const SafeView = (props: {
  appsProvider: AppsProvider | undefined;
  onNewProposalClicked?: () => void;
  onProposalExecuted?: () => void;
  safeBalance?: number;
  solanaApps: App[];
}) => {
  const { appsProvider, onNewProposalClicked, onProposalExecuted, safeBalance, solanaApps } = props;
  const { publicKey, connected, wallet } = useWallet();

  const {
    multisigTxs,
    selectedAccount,
    selectedMultisig,
    transactionStatus,
    setTransactionStatus,
    refreshTokenBalance,
    setSelectedMultisig,
    setMultisigTxs,
  } = useContext(AppStateContext);
  const { confirmationHistory, enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
  const connection = useConnection();

  const {
    data: multisigAccounts,
    isFetching: loadingMultisigAccounts,
    refetch: refreshMultisigs,
  } = useGetMultisigAccounts(publicKey?.toBase58());

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
  const [transactionFees, setTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
  // Active Txs
  const [needRefreshTxs, setNeedRefreshTxs] = useState(true);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [isProposalDetails, setIsProposalDetails] = useState(false);
  // Tx control
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  // Other
  const [loadingProposalDetails, setLoadingProposalDetails] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<MultisigTransaction | null>(null);
  const [canSubscribe, setCanSubscribe] = useState(true);
  // Vesting contracts
  const [queryParamV, setQueryParamV] = useState<string | null>(null);
  const [lastError, setLastError] = useState<TransactionStatusInfo | undefined>(undefined);
  const [isCancelRejectModalVisible, setIsCancelRejectModalVisible] = useState(false);

  /////////////////
  //  Init code  //
  /////////////////

  const multisigAddressPK = useMemo(() => getMultisigProgramId(), []);

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  useEffect(() => {
    const optionInQuery: string | null = searchParams ? searchParams.get('v') : null;
    setQueryParamV(optionInQuery);
  }, [searchParams]);

  const { data: multisigClient } = useMultisigClient();

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

  const setProposalsLoading = useCallback(
    (loading: boolean) => {
      if (!selectedMultisig) {
        consoleOut('unable to do setProposalsLoading!', 'selectedMultisig not available yet', 'red');
        return;
      }
      const multisigAuth = selectedMultisig.authority.toBase58();
      consoleOut(`setProposalsLoading for ${multisigAuth} with:`, loading, 'orange');
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

  const parseErrorFromExecuteProposal = useCallback(
    (error: LooseObject, transaction: MultisigTransaction) => {
      const txStatus = {
        customError: undefined,
        lastOperation: TransactionStatus.SendTransaction,
        currentOperation: TransactionStatus.SendTransactionFailure,
      } as TransactionStatusInfo;

      let anchorError = '';
      const errorString = error.toString() as string;
      // match returns 3 groups, the whole string at 0, first (.*) group match at 1 and second (.*) groups match at 3
      // that would be the Error Message part
      const anchorErrorMatcher = RegExp(/> Program logged: "AnchorError(.*)Error Message: (.*)"/).exec(errorString);

      if (anchorErrorMatcher) {
        anchorError = anchorErrorMatcher[2];
      }

      if (errorString.indexOf('0x1794') !== -1) {
        let accountIndex = 0;
        if (transaction.operation === OperationType.StreamClose) {
          accountIndex = 5;
        } else if (
          transaction.operation === OperationType.TreasuryStreamCreate ||
          transaction.operation === OperationType.StreamCreate ||
          transaction.operation === OperationType.StreamCreateWithTemplate
        ) {
          accountIndex = 2;
        } else {
          accountIndex = 3;
        }
        consoleOut(
          'accounts:',
          transaction.accounts.map(a => a.pubkey.toBase58()),
          'orange',
        );
        const treasury = transaction.accounts[accountIndex]
          ? transaction.accounts[accountIndex].pubkey.toBase58()
          : '-';
        consoleOut(`Selected account for index [${accountIndex}]`, treasury, 'orange');
        txStatus.customError = {
          title: 'Insufficient balance',
          message:
            'Your transaction failed to submit due to there not being enough SOL to cover the fees. Please fund the treasury with at least 0.00002 SOL and then retry this operation.\n\nTreasury ID: ',
          data: treasury,
        };
      } else if (errorString.indexOf('0x1797') !== -1) {
        let accountIndex = 0;
        if (
          transaction.operation === OperationType.StreamCreate ||
          transaction.operation === OperationType.TreasuryStreamCreate ||
          transaction.operation === OperationType.StreamCreateWithTemplate
        ) {
          accountIndex = 2;
        } else if (transaction.operation === OperationType.TreasuryWithdraw) {
          accountIndex = 5;
        } else {
          accountIndex = 3;
        }
        consoleOut(
          'accounts:',
          transaction.accounts.map(a => a.pubkey.toBase58()),
          'orange',
        );
        const treasury = transaction.accounts[accountIndex]
          ? transaction.accounts[accountIndex].pubkey.toBase58()
          : '-';
        consoleOut(`Selected account for index [${accountIndex}]`, treasury, 'orange');
        txStatus.customError = {
          title: 'Insufficient balance',
          message:
            'Your transaction failed to submit due to insufficient balance in the treasury. Please add funds to the treasury and then retry this operation.\n\nTreasury ID: ',
          data: treasury,
        };
      } else if (errorString.indexOf('0x1786') !== -1) {
        txStatus.customError = {
          message:
            'Your transaction failed to submit due to Invalid Gateway Token. Please activate the Gateway Token and retry this operation.',
          data: undefined,
        };
      } else if (errorString.indexOf('0xbc4') !== -1) {
        txStatus.customError = {
          message:
            'Your transaction failed to submit due to Account Not Initialized. Please initialize and fund the Token and LP Token Accounts of the Investor.\n',
          data: selectedMultisig?.authority.toBase58(),
        };
      } else if (anchorError) {
        // Handle any anchorError not matched above by any "custom program error: 0x1XXX"
        txStatus.customError = {
          message: anchorError,
          data: undefined,
        };
      } else if (errorString.indexOf('0x1') !== -1) {
        // Leave classic Insufficient lamports message for last
        const accountIndex =
          transaction.operation === OperationType.TransferTokens || transaction.operation === OperationType.Transfer
            ? 0
            : 3;
        consoleOut(
          'accounts:',
          transaction.accounts.map(a => a.pubkey.toBase58(), 'orange'),
        );
        const asset = transaction.accounts[accountIndex] ? transaction.accounts[accountIndex].pubkey.toBase58() : '-';
        consoleOut(`Selected account for index [${accountIndex}]`, asset, 'orange');
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
      return txStatus;
    },
    [selectedMultisig?.authority],
  );

  // Search for pending proposal in confirmation history
  const hasMultisigPendingProposal = useCallback(() => {
    if (!selectedMultisigRef?.current) {
      return false;
    }
    const isTheReference = (item: TxConfirmationInfo) => {
      if (
        (item?.extras?.multisigAuthority &&
          item.extras.multisigAuthority === selectedMultisigRef.current?.authority.toBase58()) ||
        (item?.extras?.multisigId && item.extras.multisigId === selectedMultisigRef.current?.authority.toBase58())
      ) {
        return true;
      }
      return false;
    };

    if (confirmationHistory && confirmationHistory.length > 0) {
      const item = confirmationHistory.find(h => isTheReference(h) && h.txInfoFetchStatus === 'fetching');

      if (item) {
        return true;
      }
    }

    return false;
  }, [confirmationHistory]);

  const onMultisigModified = useCallback(() => {
    setIsEditMultisigModalVisible(false);
    openNotification({
      description: "The proposal can be reviewed in the Multisig's proposal list for other owners to approve.",
      duration: 10,
      type: 'success',
    });
  }, []);

  // Modal visibility flags
  const [isEditMultisigModalVisible, setIsEditMultisigModalVisible] = useState(false);
  const [isErrorReportingModalVisible, setIsErrorReportingModalVisible] = useState(false);
  const showErrorReportingModal = useCallback(() => setIsErrorReportingModalVisible(true), []);
  const closeErrorReportingModal = useCallback(() => {
    setIsErrorReportingModalVisible(false);
    resetTransactionStatus();
  }, [resetTransactionStatus]);

  const onEditMultisigClick = useCallback(() => {
    if (!multisigClient) {
      return;
    }

    getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createTransaction).then(value => {
      setTransactionFees(value);
      consoleOut('transactionFees:', value, 'orange');
    });

    resetTransactionStatus();
    setIsEditMultisigModalVisible(true);
  }, [multisigClient, resetTransactionStatus]);

  const onExecuteEditMultisigTx = useCallback(
    async (data: EditMultisigParams) => {
      let transaction: VersionedTransaction | Transaction | null = null;
      let signature: string;
      let encodedTx: string;
      let transactionLog: LooseObject[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const editMultisig = async (data: EditMultisigParams) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          throw new Error('No selected multisig');
        }

        const [multisigSigner] = PublicKey.findProgramAddressSync([selectedMultisig.id.toBuffer()], multisigAddressPK);

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

        const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

        const tx = await getProposalWithPrioritizationFees(
          {
            multisigClient,
            connection,
            transactionPriorityOptions,
          },
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

        return tx?.transaction ?? null;
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
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: payload,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
            result: '',
          });

          // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
          // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('networkFee:', transactionFees.networkFee, 'blue');
          consoleOut('rentExempt:', transactionFees.rentExempt, 'blue');
          consoleOut('multisigFee:', transactionFees.multisigFee, 'blue');
          const minRequired = transactionFees.multisigFee + transactionFees.rentExempt + transactionFees.networkFee;
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
            });
            customLogger.logError('Edit multisig transaction failed', {
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Edit multisig transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        }

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Edit multisig transaction failed', {
          transcript: transactionLog,
        });
        return false;
      };

      if (wallet && publicKey && selectedMultisig) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Edit Multisig', wallet.adapter, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Edit Multisig', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.EditMultisig,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Editing the safe ${selectedMultisig.label}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `The changes to the ${selectedMultisig.label} Multisig Safe have been submitted for approval.`,
                extras: {
                  multisigAuthority: selectedMultisig ? selectedMultisig.authority.toBase58() : '',
                },
              });
              setSuccessStatus();
              await delay(200);
              onMultisigModified();
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
      transactionFees,
      selectedMultisig,
      multisigAddressPK,
      transactionCancelled,
      transactionPriorityOptions,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      onMultisigModified,
      setSuccessStatus,
    ],
  );

  const onAcceptEditMultisig = (data: EditMultisigParams) => {
    consoleOut('multisig:', data, 'blue');
    onExecuteEditMultisigTx(data);
  };

  const onExecuteApproveTx = useCallback(
    async (proposal: MultisigTransaction) => {
      let transaction: Transaction | null = null;
      let signature: string;
      let encodedTx: string;
      let transactionLog: LooseObject[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const approveTx = async (proposal: MultisigTransaction) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          return null;
        }

        const transaction = await multisigClient.approveTransaction(publicKey, proposal.id);

        if (!transaction) return null;

        const prioritizedTx = composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return prioritizedTx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && proposal) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: proposal };

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
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
            });
            customLogger.logError('Approve Multisig Proposal transaction failed', {
              transcript: transactionLog,
            });
            openNotification({
              description: t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                feeAmount: getAmountWithSymbol(minRequired, SOL_MINT.toBase58()),
              }),
              type: 'info',
            });
            return false;
          }

          return approveTx(proposal)
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Approve Multisig Proposal transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        }

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Approve Multisig Proposal transaction failed', {
          transcript: transactionLog,
        });
        return false;
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Approve Multisig Proposal', wallet.adapter, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Approve Multisig Proposal', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.ApproveTransaction,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Approve proposal: ${proposal.details.title}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully approved proposal: ${proposal.details.title}`,
                extras: {
                  multisigAuthority: proposal.multisig.toBase58(),
                  transactionId: proposal.id,
                },
              });
              setSuccessStatus();
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
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
      t,
    ],
  );

  const onExecuteRejectTx = useCallback(
    async (proposal: MultisigTransaction) => {
      let transaction: Transaction | null = null;
      let signature: string;
      let encodedTx: string;
      let transactionLog: LooseObject[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const rejectTx = async (proposal: MultisigTransaction) => {
        if (!selectedMultisig || !multisigClient || !publicKey) {
          return null;
        }

        const transaction = await multisigClient.rejectTransaction(publicKey, proposal.id);

        if (!transaction) return null;

        const prioritizedTx = composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return prioritizedTx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && proposal) {
          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: proposal };
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
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
            });
            customLogger.logError('Multisig Reject transaction failed', {
              transcript: transactionLog,
            });
            openNotification({
              description: t('transactions.status.tx-start-failure', {
                accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
                feeAmount: getAmountWithSymbol(minRequired, SOL_MINT.toBase58()),
              }),
              type: 'info',
            });
            return false;
          }

          return rejectTx(proposal)
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Multisig Reject transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        }

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Multisig Reject transaction failed', {
          transcript: transactionLog,
        });
        return false;
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Reject Multisig Proposal', wallet.adapter, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Reject Multisig Proposal', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.RejectTransaction,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Reject proposal: ${proposal.details.title}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully rejected proposal: ${proposal.details.title}`,
                extras: {
                  multisigAuthority: proposal.multisig.toBase58(),
                  transactionId: proposal.id,
                },
              });
              setSuccessStatus();
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
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
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
    if (lastErrorRef.current?.customError) {
      // Show the error reporting modal
      setTransactionStatus(lastErrorRef.current);
      showErrorReportingModal();
    } else {
      resetTransactionStatus();
    }
    setIsBusy(false);
  }, [showErrorReportingModal, resetTransactionStatus, setTransactionStatus, t]);

  const onExecuteFinishTx = useCallback(
    async (proposal: MultisigTransaction) => {
      let transaction: Transaction | null = null;
      let signature: string;
      let encodedTx: string;
      let transactionLog: LooseObject[] = [];

      resetTransactionStatus();
      setTransactionCancelled(false);
      setIsBusy(true);

      const finishTx = async (msTx: MultisigTransaction) => {
        if (!msTx || !publicKey || !multisigClient) {
          return null;
        }

        const transaction = await multisigClient.executeTransaction(publicKey, msTx.id);

        if (!transaction) return null;

        const prioritizedTx = composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return prioritizedTx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && proposal) {
          consoleOut('Start Multisig ExecuteTransaction Tx', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          consoleOut('data:', proposal);
          // Log input data
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
            inputs: proposal,
          });

          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
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
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
            });
            customLogger.logError('Finish Approoved transaction failed', {
              transcript: transactionLog,
            });
            const notifContent = t('transactions.status.tx-start-failure', {
              accountBalance: getAmountWithSymbol(nativeBalance, SOL_MINT.toBase58()),
              feeAmount: getAmountWithSymbol(minRequired, SOL_MINT.toBase58()),
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

          return finishTx(proposal)
            .then(value => {
              if (!value) {
                return false;
              }
              consoleOut('finishTx returned transaction:', value, 'blue');
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
              console.error('create stream error:', error);
              setTransactionStatus({
                lastOperation: transactionStatus.currentOperation,
                currentOperation: TransactionStatus.InitTransactionFailure,
              });
              transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Finish Approoved transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        }

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Finish Approoved transaction failed', {
          transcript: transactionLog,
        });
        return false;
      };

      if (wallet && publicKey) {
        // Clear any last error recorded
        lastErrorRef.current = undefined;
        setLastError(undefined);
        // Create Tx
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Execute Multisig Proposal', wallet.adapter, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Execute Multisig Proposal', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.ExecuteTransaction,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Execute proposal: ${proposal.details.title}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully executed proposal: ${proposal.details.title}`,
                extras: {
                  multisigAuthority: proposal.multisig.toBase58(),
                  transactionId: proposal.id,
                },
              });
              setSuccessStatus();
            } else if (sent.error) {
              parseErrorFromExecuteProposal(sent.error, proposal);
              setTimeout(() => {
                onExecuteFinishTxCancelled();
              }, 30);
            }
          } else {
            onExecuteFinishTxCancelled();
          }
        } else {
          onExecuteFinishTxCancelled();
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
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      parseErrorFromExecuteProposal,
      onExecuteFinishTxCancelled,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  const onExecuteCancelTx = useCallback(
    async (proposal: MultisigTransaction) => {
      let transaction: Transaction | null = null;
      let signature: string;
      let encodedTx: string;
      let transactionLog: LooseObject[] = [];

      setTransactionCancelled(false);
      setIsBusy(true);
      resetTransactionStatus();

      const cancelTx = async (proposal: MultisigTransaction) => {
        if (
          !publicKey ||
          !multisigClient ||
          !selectedMultisig ||
          selectedMultisig.id.toBase58() !== proposal.multisig.toBase58() ||
          proposal.proposer?.toBase58() !== publicKey.toBase58() ||
          proposal.executedOn
        ) {
          return null;
        }

        const transaction = await multisigClient.cancelTransaction(publicKey, proposal.id);

        if (!transaction) return null;

        const prioritizedTx = composeTxWithPrioritizationFees(connection, publicKey, transaction.instructions);

        return prioritizedTx;
      };

      const createTx = async (): Promise<boolean> => {
        if (publicKey && proposal) {
          consoleOut('Start transaction for create stream', '', 'blue');
          consoleOut('Wallet address:', publicKey.toBase58());

          setTransactionStatus({
            lastOperation: TransactionStatus.TransactionStart,
            currentOperation: TransactionStatus.InitTransaction,
          });

          // Create a transaction
          const payload = { transaction: proposal };
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
          const minRequired = 0.000005;
          consoleOut('nativeBalance:', nativeBalance, 'blue');
          consoleOut('Min required balance:', minRequired, 'blue');

          if (nativeBalance < minRequired) {
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.TransactionStartFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
              result: `Not enough balance (${getAmountWithSymbol(
                nativeBalance,
                SOL_MINT.toBase58(),
              )}) to pay for network fees (${getAmountWithSymbol(minRequired, SOL_MINT.toBase58())})`,
            });
            customLogger.logError('Cancel Multisig Proposal transaction failed', {
              transcript: transactionLog,
            });
            return false;
          }

          return cancelTx(proposal)
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
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
                action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                result: `${error}`,
              });
              customLogger.logError('Cancel Multisig Proposal transaction failed', {
                transcript: transactionLog,
              });
              return false;
            });
        }

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError('Cancel Multisig Proposal transaction failed', {
          transcript: transactionLog,
        });
        return false;
      };

      if (wallet && publicKey) {
        const created = await createTx();
        consoleOut('created:', created);
        if (created && !transactionCancelled) {
          const sign = await signTx('Cancel Multisig Proposal', wallet.adapter, publicKey, transaction);
          if (sign.encodedTransaction) {
            encodedTx = sign.encodedTransaction;
            transactionLog = transactionLog.concat(sign.log);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.SignTransactionSuccess,
            });
            const sent = await sendTx('Cancel Multisig Proposal', connection, encodedTx);
            consoleOut('sent:', sent);
            if (sent.signature) {
              signature = sent.signature;
              consoleOut('Send Tx to confirmation queue:', signature);
              enqueueTransactionConfirmation({
                signature,
                operationType: OperationType.CancelTransaction,
                finality: 'confirmed',
                txInfoFetchStatus: 'fetching',
                loadingTitle: 'Confirming transaction',
                loadingMessage: `Cancel proposal: ${proposal.details.title}`,
                completedTitle: 'Transaction confirmed',
                completedMessage: `Successfully cancelled proposal: ${proposal.details.title}`,
                extras: {
                  multisigAuthority: proposal.multisig.toBase58(),
                  transactionId: proposal.id,
                },
              });
              setSuccessStatus();
              setIsCancelRejectModalVisible(false);
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
      transactionCancelled,
      transactionStatus.currentOperation,
      enqueueTransactionConfirmation,
      setFailureStatusAndNotify,
      resetTransactionStatus,
      setTransactionStatus,
      setSuccessStatus,
    ],
  );

  const refreshSelectedProposal = useCallback(() => {
    consoleOut('running refreshSelectedProposal...', '', 'blue');
    if (publicKey && multisigClient && selectedMultisigRef.current && selectedProposalRef.current) {
      consoleOut('fetching proposal details...', '', 'blue');
      setLoadingProposalDetails(true);
      multisigClient
        .getMultisigTransaction(selectedMultisigRef.current.id, selectedProposalRef.current.id, publicKey)
        .then(tx => {
          consoleOut('proposal refreshed!', tx, 'blue');
          setSelectedProposal(tx);
        })
        .catch(err => console.error(err))
        .finally(() => setLoadingProposalDetails(false));
    }
  }, [multisigClient, publicKey]);

  const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
    let event: AppUsageEvent | undefined = undefined;

    switch (operation) {
      case OperationType.ApproveTransaction:
        event = success ? AppUsageEvent.ApproveProposalCompleted : AppUsageEvent.ApproveProposalFailed;
        break;
      case OperationType.RejectTransaction:
        event = success ? AppUsageEvent.RejectProposalCompleted : AppUsageEvent.RejectProposalFailed;
        break;
      case OperationType.ExecuteTransaction:
        event = success ? AppUsageEvent.ExecuteProposalCompleted : AppUsageEvent.ExecuteProposalFailed;
        break;
      case OperationType.CancelTransaction:
        event = success ? AppUsageEvent.CancelProposalCompleted : AppUsageEvent.CancelProposalFailed;
        break;
      default:
        break;
    }
    if (event) {
      segmentAnalytics.recordEvent(event, { signature: signature });
    }
  }, []);

  const logEventHandling = useCallback((item: TxConfirmationInfo) => {
    consoleOut(
      `SafeView -> onTxConfirmed event handled for operation ${OperationType[item.operationType]}`,
      item,
      'crimson',
    );
  }, []);

  const reloadMultisigs = useCallback(() => {
    const refreshCta = document.getElementById('multisig-refresh-cta');
    if (refreshCta) {
      refreshCta.click();
    }
  }, []);

  const reloadSelectedProposal = useCallback(() => {
    const proposalRefreshCta = document.getElementById('refresh-selected-proposal-cta');
    if (proposalRefreshCta) {
      proposalRefreshCta.click();
    }
  }, []);

  // Setup event handler for Tx confirmed
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  const onTxConfirmed = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      switch (item.operationType) {
        case OperationType.ApproveTransaction:
        case OperationType.RejectTransaction:
        case OperationType.ExecuteTransaction:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          reloadMultisigs();
          reloadSelectedProposal();
          onProposalExecuted?.();
          break;
        case OperationType.CancelTransaction:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          goToProposals();
          break;
        case OperationType.EditMultisig:
          logEventHandling(item);
          recordTxConfirmation(item.signature, item.operationType, true);
          onRefreshProposals();
          reloadMultisigs();
          break;
        default:
          break;
      }
    },
    [],
  );

  // Setup event handler for Tx confirmation error
  const onTxTimedout = useCallback(
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
    (param: any) => {
      const item = param as TxConfirmationInfo;
      // If we have the item, record failure and remove it from the list
      if (item) {
        consoleOut('onTxTimedout event executed:', item, 'crimson');
        reloadMultisigs();
        recordTxConfirmation(item.signature, item.operationType, false);
      }
    },
    [recordTxConfirmation, reloadMultisigs],
  );

  const goToProposals = () => {
    const backCta = document.querySelector('div.back-button') as HTMLElement;
    if (backCta) {
      backCta.click();
    }
  };

  const refreshSafeDetails = useCallback(() => {
    reloadMultisigs();
    onRefreshProposals();
    if (isProposalDetails) {
      reloadSelectedProposal();
    }
  }, [isProposalDetails, reloadMultisigs, reloadSelectedProposal]);

  const getMultisigList = useCallback(() => {
    if (!publicKey) {
      return;
    }

    refreshMultisigs().then(() => proposalLoadStatusRegister.clear());
  }, [publicKey, refreshMultisigs]);

  const getActiveMultisigAuthorityByReference = useCallback(() => {
    if (!selectedMultisigRef?.current) {
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

      const txs = await multisigClient.getMultisigTransactions(multisig.id, publicKey);

      const response = {
        multisigAuth: multisig.authority.toBase58(),
        transactions: txs,
      } as MultisigProposalsWithAuthority;

      return response;
    },
    [connection, multisigClient, publicKey],
  );

  const goToListOfProposals = useCallback(() => {
    setIsProposalDetails(false);
    setNeedRefreshTxs(true);
    const url = `${MULTISIG_ROUTE_BASE_PATH}?v=proposals`;
    navigate(url);
  }, [navigate]);

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
    setNativeBalance(getAmountFromLamports(account?.lamports));
    // Refresh token balance
    refreshTokenBalance();
  }, [account, refreshTokenBalance]);

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
          consoleOut('proposals assigned to:', currentlyActiveMultisig, 'green');
          setMultisigTxs(response.transactions);
          setLoadingProposals(false);
        } else {
          setMultisigTxs([]);
        }
      })
      .catch(err => {
        setMultisigTxs([]);
        console.error('Error fetching all transactions', err);
      })
      .finally(() => setProposalsLoading(false));
  }, [
    publicKey,
    multisigClient,
    needRefreshTxs,
    selectedMultisig,
    getActiveMultisigAuthorityByReference,
    getMultisigProposals,
    setProposalsLoading,
    setMultisigTxs,
  ]);

  // Actually selects a multisig base on currently selected account
  useEffect(() => {
    if (multisigAccounts && selectedAccount && selectedAccount.address && selectedAccount.isMultisig) {
      let item: MultisigInfo | undefined = undefined;
      if (multisigAccounts.length > 0) {
        item = multisigAccounts.find(m => m.authority.toBase58() === selectedAccount.address);
        if (item) {
          if (selectedMultisigRef?.current?.authority.equals(item.authority)) {
            consoleOut('Multisig is already selected!', 'skipping...', 'blue');
            return;
          }
          consoleOut('Making multisig active:', item, 'blue');
          setSelectedMultisig(item);
          setNeedRefreshTxs(true);
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

    const isProposalsFork = ['proposals', 'instruction', 'activity'].includes(queryParamV ?? '');
    if (!isProposalsFork) {
      return;
    }
    consoleOut('id:', id, 'purple');
    consoleOut('queryParamV:', queryParamV, 'purple');
    consoleOut('selectedMultisig:', selectedMultisig.authority.toBase58(), 'purple');
    const filteredMultisigTx = multisigTxs.find(tx => tx.id.toBase58() === id);
    if (filteredMultisigTx) {
      setSelectedProposal(filteredMultisigTx);
      setIsProposalDetails(true);
      consoleOut('filteredMultisigTx:', filteredMultisigTx, 'orange');
      return;
    }
    openNotification({
      title: 'Access forbidden',
      description: `You are trying to access a proposal on a SuperSafe you don't have permission to see. Please connect with a signer account and try again.`,
      type: 'warning',
    });
    goToListOfProposals();
  }, [id, selectedMultisig, publicKey, queryParamV, multisigTxs, goToListOfProposals]);

  // Setup event listeners
  useEffect(() => {
    if (!canSubscribe) {
      return;
    }

    setCanSubscribe(false);
    consoleOut('Setup event subscriptions -> SafeView', '', 'brown');
    confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
    consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'brown');
    confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
    consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'brown');
  }, [canSubscribe, onTxConfirmed, onTxTimedout]);

  // Unsubscribe from events
  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    return () => {
      consoleOut('Stop event subscriptions -> SafeView', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
      consoleOut('Unsubscribed from event txConfirmed!', '', 'brown');
      confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
      consoleOut('Unsubscribed from event onTxTimedout!', '', 'brown');
      setCanSubscribe(true);
      proposalLoadStatusRegister.clear();
    };
  }, []);

  //////////////
  //  Events  //
  //////////////

  const onRefreshProposals = () => {
    setNeedRefreshTxs(true);
  };

  const goToProposalDetailsHandler = (selectedProposal: MultisigTransaction) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/proposals/${selectedProposal.id.toBase58()}?v=instruction`;
    navigate(url);
  };

  const goToProgramDetailsHandler = (selectedProgram: ProgramAccounts) => {
    const url = `${MULTISIG_ROUTE_BASE_PATH}/programs/${selectedProgram.pubkey.toBase58()}?v=transactions`;
    navigate(url);
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderRightPanelInner = () => {
    if (!selectedMultisig) {
      return null;
    }

    if (isProposalDetails) {
      return (
        <ProposalDetailsView
          onDataToSafeView={goToListOfProposals}
          proposal={selectedProposal}
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
          loadingData={loadingMultisigAccounts || loadingProposals || loadingProposalDetails}
          isCancelRejectModalVisible={isCancelRejectModalVisible}
          setIsCancelRejectModalVisible={setIsCancelRejectModalVisible}
        />
      );
    }

    return (
      <SafeMeanInfo
        connection={connection}
        loadingProposals={loadingProposals}
        onDataToProgramView={goToProgramDetailsHandler}
        onProposalSelected={goToProposalDetailsHandler}
        onEditMultisigClick={onEditMultisigClick}
        onNewProposalClicked={onNewProposalClicked}
        safeBalanceInUsd={safeBalance}
        selectedMultisig={selectedMultisig}
        selectedTab={queryParamV ?? ''}
      />
    );
  };

  const getErrorDescription = useCallback(() => {
    let message = '';
    if (!connected) {
      message = t('multisig.multisig-accounts.not-connected');
    } else if (loadingMultisigAccounts) {
      message = t('multisig.multisig-accounts.loading-multisig-accounts');
    } else {
      message = t('multisig.multisig-account-detail.no-multisig-loaded');
    }
    return <p>{message}</p>;
  }, [connected, loadingMultisigAccounts, t]);

  return (
    <>
      <span id='multisig-refresh-cta' onKeyDown={() => {}} onClick={() => getMultisigList()} />
      <span
        id='refresh-selected-proposal-cta'
        onKeyDown={() => {}}
        onClick={() => {
          onRefreshProposals();
          refreshSelectedProposal();
        }}
      />
      <div className='float-top-right mr-1 mt-1'>
        <span className='icon-button-container secondary-button'>
          <Tooltip placement='bottom' title='Refresh safe'>
            <Button
              type='default'
              shape='circle'
              size='middle'
              icon={<ReloadOutlined className='mean-svg-icons' />}
              onClick={() => refreshSafeDetails()}
            />
          </Tooltip>
        </span>
      </div>

      <div className='safe-details-component scroll-wrapper vertical-scroll'>
        {connected && multisigClient && selectedMultisig ? (
          <Spin spinning={loadingMultisigAccounts}>{renderRightPanelInner()}</Spin>
        ) : (
          <div className='h-100 flex-center'>
            <Spin spinning={loadingMultisigAccounts}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={getErrorDescription()} />
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
          inputMultisigThreshold={selectedMultisig.threshold}
          multisigParticipants={selectedMultisig.owners}
          multisigAccounts={multisigAccounts ?? []}
          multisigPendingTxsAmount={selectedMultisig.pendingTxsAmount}
          handleClose={() => setIsEditMultisigModalVisible(false)}
          isBusy={isBusy}
        />
      )}

      {isErrorReportingModalVisible && (
        <ErrorReportModal
          handleClose={closeErrorReportingModal}
          isVisible={isErrorReportingModalVisible}
          title={transactionStatus.customError.title || 'Error submitting transaction'}
        />
      )}
    </>
  );
};

export default SafeView;
