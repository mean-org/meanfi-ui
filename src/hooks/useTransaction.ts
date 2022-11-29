import { MSP, TransactionFees } from '@mean-dao/msp';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { appConfig, customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { sendTx, signTx } from 'middleware/transactions';
import { consoleOut, getTransactionStatusForLogs } from 'middleware/ui';
import { getAmountWithSymbol, getTxIxResume } from 'middleware/utils';
import { OperationType, TransactionStatus } from 'models/enums';
import { useContext, useMemo } from 'react';
import { LooseObject } from 'types/LooseObject';

import {
  DEFAULT_EXPIRATION_TIME_SECONDS,
  MeanMultisig,
  MultisigInfo,
  MultisigTransactionFees,
} from '@mean-dao/mean-multisig-sdk';

interface Args<T> {
  name: string;
  transactionCancelled: boolean; // Do we need it?
  setTransactionCancelled: (transactionCancelled: boolean) => void; // Do we need it?
  loadingMessage: () => string;
  completedMessage: () => string;
  operationType: OperationType;
  extras: () => LooseObject;
  msp?: MSP;
  transactionFees: TransactionFees;
  multisigTxFees: MultisigTransactionFees;
  setMinRequiredBalance: (minRequiredBalance: number) => void;
  nativeBalance: number;
  proposalTitle: string;
  multisig: string;
  generateTransaction: ({
    multisig,
  }: {
    multisig?: MultisigInfo;
    msp: MSP;
  }) => Promise<Transaction | undefined>;
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

  const {
    selectedAccount,
    multisigAccounts,
    transactionStatus,
    setTransactionStatus,
  } = useContext(AppStateContext);
  const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);

  const isMultisigContext = useMemo(() => {
    return publicKey && selectedAccount.isMultisig ? true : false;
  }, [publicKey, selectedAccount]);

  const mspV2AddressPK = useMemo(
    () => new PublicKey(appConfig.getConfig().streamV2ProgramAddress),
    [],
  );
  const multisigAddressPK = useMemo(
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
      multisigAddressPK,
    );
  }, [connection, publicKey, multisigAddressPK, connectionConfig.endpoint]);

  const onExecute = async <T extends LooseObject>(
    payload: T,
    {
      name,
      transactionCancelled,
      setTransactionCancelled,
      loadingMessage,
      completedMessage,
      operationType,
      extras,
      msp,
      transactionFees,
      multisigTxFees,
      setMinRequiredBalance,
      nativeBalance,
      proposalTitle,
      multisig: baseMultisig,
      generateTransaction,
    }: Args<T>,
  ) => {
    consoleOut('params', payload, 'blue');

    let transaction: Transaction | undefined = undefined;
    let encodedTx: string;
    const transactionLog: any[] = [];
    setTransactionCancelled(false);

    const wrappedGenerateTransaction = async () => {
      const data = payload;
      if (!connection || !msp || !publicKey) {
        return null;
      }

      if (!baseMultisig) {
        consoleOut('received data:', data, 'blue');
        return generateTransaction({ multisig: undefined, msp });
      }

      if (!multisigClient || !multisigAccounts) {
        return null;
      }

      const multisig = multisigAccounts.filter(
        m => m.authority.toBase58() === data.multisig,
      )[0];

      if (!multisig) {
        return null;
      }

      const editTreasuryTx = await generateTransaction({ multisig, msp });
      if (!editTreasuryTx) return null;
      const ixData = Buffer.from(editTreasuryTx.instructions[0].data);
      const ixAccounts = editTreasuryTx.instructions[0].keys;
      const expirationTime = parseInt(
        (Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString(),
      );

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
      if (!connection || !wallet || !publicKey || !msp) {
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

      const bf = transactionFees.blockchainFee; // Blockchain fee
      const ff = transactionFees.mspFlatFee; // Flat fee (protocol)
      const mp =
        multisigTxFees.networkFee +
        multisigTxFees.multisigFee +
        multisigTxFees.rentExempt; // Multisig proposal
      const minRequired = isMultisigContext ? mp : bf + ff;

      setMinRequiredBalance(minRequired);

      consoleOut('Min balance required:', minRequired, 'blue');
      consoleOut('nativeBalance:', nativeBalance, 'blue');

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
        customLogger.logWarning('Create vesting account transaction failed', {
          transcript: transactionLog,
        });
        return false;
      }

      consoleOut(`Starting ${name} using MSP V2...`, '', 'blue');

      const result = await wrappedGenerateTransaction()
        .then(value => {
          // TODO: Log the error
          if (!value) {
            return false;
          }
          consoleOut(`${name} returned transaction:`, value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction,
          });
          transaction = value;
          transactionLog.push({
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionSuccess,
            ),
            result: getTxIxResume(transaction),
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
            action: getTransactionStatusForLogs(
              TransactionStatus.InitTransactionFailure,
            ),
            result: `${error}`,
          });
          customLogger.logError(`${name} transaction failed`, {
            transcript: transactionLog,
          });
          return false;
        });

      return result;
    };

    if (wallet && publicKey) {
      const create = await createTx();
      consoleOut('created:', create);
      if (create && !transactionCancelled && transaction) {
        const sign = await signTx(name, wallet, publicKey, transaction);
        if (sign.encodedTransaction) {
          encodedTx = sign.encodedTransaction;
          const sent = await sendTx(name, connection, encodedTx);
          consoleOut('sent:', sent);
          if (sent.signature && !transactionCancelled) {
            const signature = sent.signature;
            consoleOut('Send Tx to confirmation queue:', signature);
            enqueueTransactionConfirmation({
              signature: signature,
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
          } else {
            throw new Error('Transaction error');
          }
        } else {
          throw new Error('Transaction error');
        }
      } else {
        throw new Error('Transaction error');
      }
    }
  };

  return { onExecute };
};

export default useTransaction;
