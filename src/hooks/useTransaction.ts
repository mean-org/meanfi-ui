import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, type MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { PublicKey, type Transaction, type VersionedTransaction } from '@solana/web3.js';
import { openNotification } from 'components/Notifications';
import { MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { useConnection, useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { appConfig, customLogger } from 'index';
import { SOL_MINT } from 'middleware/ids';
import {
  type ComputeBudgetConfig,
  DEFAULT_BUDGET_CONFIG,
  getProposalWithPrioritizationFees,
  sendTx,
  signTx,
} from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import { getAmountWithSymbol, getUniversalTxIxResume } from 'middleware/utils';
import { type OperationType, TransactionStatus } from 'models/enums';
import type { MultisigTxParams } from 'models/multisig';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { failsafeConnectionConfig } from 'services/connections-hq';
import type { LooseObject } from 'types/LooseObject';
import useLocalStorage from './useLocalStorage';

type BaseArgs<T extends LooseObject | undefined> = {
  // name of the transaction, i.e. 'Edit Vesting Contract',
  name: string;
  // type of operation, i.e OperationType.TreasuryEdit
  operationType: OperationType;
  // function which returns payload object, if it returns undefined - fails the transaction gracefully
  payload: () => T;

  // enqueueTransactionConfirmation data:
  loadingMessage: () => string;
  completedMessage: () => string;
  extras?: () => LooseObject | undefined;

  // minRequired & nativeRequired both are used to determine if have enough SOL to pay for the transaction, otherwise handle gracefully
  minRequired?: number;
  nativeBalance?: number;

  // function used for singlesig transaction generation, accepts multisig info
  generateTransaction?: never;
  // proposalTitle, multisig & generateMultisigArgs are needed to create a multisig proposal
  proposalTitle?: never;
  multisig?: never;
  generateMultisigArgs?: never;

  // set busy when transaction starts, unset when it ends
  setIsBusy: (isBusy: boolean) => void;
  onTxSent?: (txHash: string) => void;
};

type SinglesigArgs<T extends LooseObject | undefined> = Omit<BaseArgs<T>, 'generateTransaction'> & {
  generateTransaction: ({
    multisig,
    data,
  }: {
    multisig?: MultisigInfo;
    data: NonNullable<T>;
  }) => Promise<Transaction | VersionedTransaction | undefined | null>;
};

type MultisigArgs<T extends LooseObject | undefined> = Omit<
  BaseArgs<T>,
  'proposalTitle' | 'multisig' | 'generateMultisigArgs'
> & {
  // proposalTitle & multisig - both are needed to create a multisig proposal
  proposalTitle: string;
  multisig: string;
  // function used for multisig transaction generation, accepts multisig info
  generateMultisigArgs: ({
    multisig,
    data,
  }: {
    multisig?: MultisigInfo;
    data: NonNullable<T>;
  }) => Promise<MultisigTxParams | null>;
};

type BothsigArgs<T extends LooseObject | undefined> = Omit<MultisigArgs<T>, 'generateTransaction'> &
  Omit<SinglesigArgs<T>, 'proposalTitle' | 'multisig' | 'generateMultisigArgs'>;

type Args<T extends LooseObject | undefined> = MultisigArgs<T> | SinglesigArgs<T> | BothsigArgs<T>;

const useTransaction = () => {
  const { publicKey, wallet } = useWallet();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();

  const { selectedAccount, multisigAccounts, transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);

  const isMultisigContext = useMemo(() => {
    return !!(publicKey && selectedAccount.isMultisig);
  }, [publicKey, selectedAccount]);

  const [transactionPriorityOptions] = useLocalStorage<ComputeBudgetConfig>(
    'transactionPriority',
    DEFAULT_BUDGET_CONFIG,
  );

  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(connectionConfig.endpoint, publicKey, failsafeConnectionConfig, multisigAddressPK);
  }, [connection, publicKey, multisigAddressPK, connectionConfig.endpoint]);

  const { t } = useTranslation('common');

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle,
    });
  }, [setTransactionStatus]);

  // reset transaction status when rendered first time(i.e modal)
  useEffect(() => {
    resetTransactionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onExecute = async <T extends LooseObject | undefined>({
    name,
    payload: basePayload,
    loadingMessage,
    completedMessage,
    operationType,
    extras = () => undefined,
    nativeBalance,
    minRequired,
    proposalTitle,
    multisig: baseMultisig,
    generateTransaction,
    generateMultisigArgs,
    setIsBusy,
    onTxSent,
  }: Args<T>) => {
    const payload = basePayload();

    let transaction: Transaction | VersionedTransaction | undefined = undefined;
    let encodedTx: string;
    let transactionLog: any[] = [];
    setIsBusy(true);

    const wrappedGenerateTransaction = async ({ data }: { data: NonNullable<T> }) => {
      if (!publicKey) {
        consoleOut('not connected', '', 'blue');
        return null;
      }

      if (!baseMultisig) {
        consoleOut('received data:', data, 'blue');
        if (!generateTransaction) throw new Error('pass generateTransaction for singlesig context');
        return generateTransaction({ multisig: undefined, data });
      }

      if (!multisigClient) {
        consoleOut('no multisigClient', '', 'blue');
        return null;
      }

      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === baseMultisig)[0];

      if (!multisig || !proposalTitle) {
        consoleOut('no multisig or proposal title', { multisig, proposalTitle }, 'blue');

        return null;
      }

      consoleOut('generating transaction', '', 'blue');
      if (!generateMultisigArgs) throw new Error('pass generateMultisigArgs for multisig context');
      const generatedArgs = await generateMultisigArgs({ multisig, data });
      if (!generatedArgs) {
        consoleOut('no transaction generated', '', 'blue');
        return null;
      }

      const expirationTime = Number.parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await getProposalWithPrioritizationFees(
        {
          multisigClient,
          connection,
          transactionPriorityOptions,
        },
        publicKey,
        proposalTitle,
        '', // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        generatedArgs.programId,
        generatedArgs.ixAccounts,
        generatedArgs.ixData,
        generatedArgs.ixs,
      );

      return tx?.transaction ?? null;
    };

    const createTx = async () => {
      if (!connection || !wallet || !publicKey || !payload) {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
          result: 'Cannot start transaction! Wallet not found!',
        });
        customLogger.logError(`${name} transaction failed`, {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut(`Start transaction for ${name}`, '', 'blue');
      consoleOut('Wallet address:', publicKey.toBase58());

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

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

      const minBalanceRequired = minRequired ?? MIN_SOL_BALANCE_REQUIRED;
      consoleOut('Min balance required:', minBalanceRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance === undefined) {
        consoleOut('Payer native balance unknown', '', 'blue');
        return false;
      }

      if (nativeBalance < minBalanceRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minBalanceRequired, SOL_MINT.toBase58())})`,
        });
        customLogger.logWarning(`${name} transaction failed`, {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut(`Starting ${name}`, '', 'blue');

      const result = await wrappedGenerateTransaction({ data: payload })
        .then(value => {
          if (!value) {
            const error = `could not initialize ${name} Tx`;
            console.error(error);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: error,
            });

            return false;
          }
          consoleOut(`${name} returned transaction:`, value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });

          transaction = value;
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: getUniversalTxIxResume(value),
          });
          return true;
        })
        .catch(error => {
          console.error(`${name} error:`, error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure,
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`,
          });
          customLogger.logError(`${name} transaction failed`, {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    const onError = () => {
      setIsBusy(false);
      throw new Error('Transaction error');
    };

    if (wallet && publicKey) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && transaction) {
        const sign = await signTx(name, wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          transactionLog = transactionLog.concat(sign.log);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionSuccess,
          });
          const sent = await sendTx(name, connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature) {
            const signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature,
              operationType,
              finality: 'confirmed',
              txInfoFetchStatus: 'fetching',
              loadingTitle: 'Confirming transaction',
              loadingMessage: loadingMessage(),
              completedTitle: 'Transaction confirmed',
              completedMessage: completedMessage(),
              completedMessageTimeout: isMultisigContext ? 8 : 5, // May be configurable
              extras: extras(),
            });

            setIsBusy(false);
            resetTransactionStatus();
            onTxSent?.(signature);
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
            onError();
          }
        } else {
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.SignTransactionFailure,
          });
          onError();
        }
      } else {
        onError();
      }
    }
  };

  return { onExecute };
};

export default useTransaction;
