import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { openNotification } from 'components/Notifications';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { appConfig, customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { sendTx, signTx } from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import { getAmountWithSymbol, getUniversalTxIxResume, isVersionedTransaction } from 'middleware/utils';
import { OperationType, TransactionStatus } from 'models/enums';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { LooseObject } from 'types/LooseObject';

import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { useTranslation } from 'react-i18next';

interface Args<T extends LooseObject | undefined> {
  // name of the transaction, i.e. 'Edit Vesting Contract',
  name: string;
  // type of operation, i.e OperationType.TreasuryEdit
  operationType: OperationType;
  // function which returns payload object, if it returns undefined - fails the transaction gracefully
  payload: () => T;

  // function used for transaction generation, accepts multisig info
  generateTransaction: ({
    multisig,
    data,
  }: {
    multisig?: MultisigInfo;
    data: NonNullable<T>;
  }) => Promise<Transaction | VersionedTransaction | undefined | null>;

  // enqueueTransactionConfirmation data:
  loadingMessage: () => string;
  completedMessage: () => string;
  extras?: () => LooseObject | undefined;

  // minRequired & nativeRequired both are used to determine if have enough SOL to pay for the transaction, otherwise handle gracefully
  minRequired?: number;
  nativeBalance?: number;

  // proposalTitle & multisig - both are needed to create a multisig proposal
  proposalTitle?: string;
  multisig?: string;

  // set busy when transaction starts, unset when it ends
  setIsBusy: (isBusy: boolean) => void;

  // This is not really used yet, TODO or remove
  transactionCancelled?: boolean; // Do we need it?
  setTransactionCancelled?: (transactionCancelled: boolean) => void; // Do we need it?
}

const useTransaction = () => {
  const { publicKey, wallet } = useWallet();
  const connectionConfig = useConnectionConfig();

  const connection = useMemo(
    () =>
      new Connection(connectionConfig.endpoint, {
        commitment: 'confirmed',
        disableRetryOnRateLimit: true,
      }),
    [connectionConfig.endpoint],
  );

  const { selectedAccount, multisigAccounts, transactionStatus, setTransactionStatus } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  const mspV2AddressPK = useMemo(() => new PublicKey(appConfig.getConfig().streamV2ProgramAddress), []);
  const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

  const multisigClient = useMemo(() => {
    if (!connection || !publicKey || !connectionConfig.endpoint) {
      return null;
    }

    return new MeanMultisig(connectionConfig.endpoint, publicKey, 'confirmed', multisigAddressPK);
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
    transactionCancelled = false,
    setTransactionCancelled = () => {},
    loadingMessage,
    completedMessage,
    operationType,
    extras = () => undefined,
    nativeBalance,
    minRequired,
    proposalTitle,
    multisig: baseMultisig,
    generateTransaction,
    setIsBusy,
  }: Args<T>) => {
    const payload = basePayload();
    consoleOut('params', payload, 'blue');

    let transaction: Transaction | VersionedTransaction | undefined = undefined;
    let encodedTx: string;
    let transactionLog: any[] = [];
    setTransactionCancelled(false);
    setIsBusy(true);

    const wrappedGenerateTransaction = async ({ data }: { data: NonNullable<T> }) => {
      if (!connection || !publicKey) {
        consoleOut('not connected', '', 'blue');
        return null;
      }

      if (!baseMultisig) {
        consoleOut('received data:', data, 'blue');
        return generateTransaction({ multisig: undefined, data });
      }

      if (!multisigClient || !multisigAccounts) {
        consoleOut('no multisigClient or multisigAccounts', '', 'blue');

        return null;
      }

      const multisig = multisigAccounts.filter(m => m.authority.toBase58() === baseMultisig)[0];

      if (!multisig || !proposalTitle) {
        consoleOut('no multisig or proposal title', { multisig, proposalTitle }, 'blue');

        return null;
      }

      consoleOut('generating transaction', '', 'blue');
      const generatedTransaction = await generateTransaction({ multisig, data });
      if (!generatedTransaction) {
        consoleOut('no transaction generated', '', 'blue');
        return null;
      }
      if (isVersionedTransaction(generatedTransaction))
        throw new Error('TODO: Multisig Versioned transactions are not supported yet');
      const ixData = Buffer.from(generatedTransaction.instructions[0].data);
      const ixAccounts = generatedTransaction.instructions[0].keys;
      const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

      const tx = await multisigClient.createTransaction(
        publicKey,
        proposalTitle,
        '', // description
        new Date(expirationTime * 1_000),
        operationType,
        multisig.id,
        mspV2AddressPK, // program
        ixAccounts, // keys o accounts of the Ix
        ixData, // data of the Ix
        // preInstructions
      );

      if (!tx) {
        return null;
      }

      return tx;
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

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

      if (nativeBalance && minRequired && nativeBalance < minRequired) {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.TransactionStartFailure,
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: `Not enough balance (${getAmountWithSymbol(
            nativeBalance,
            NATIVE_SOL_MINT.toBase58(),
          )}) to pay for network fees (${getAmountWithSymbol(minRequired, NATIVE_SOL_MINT.toBase58())})`,
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
            console.error(`could not initialize ${name} Tx`);
            setTransactionStatus({
              lastOperation: transactionStatus.currentOperation,
              currentOperation: TransactionStatus.InitTransactionFailure,
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
              result: 'could not initialize closeTokenAccountV0 Tx',
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
      if (create && !transactionCancelled && transaction) {
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
          if (sent.signature && !transactionCancelled) {
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
