import { base64 } from '@project-serum/anchor/dist/cjs/utils/bytes';
import { SignerWalletAdapter } from '@solana/wallet-adapter-base';
import {
  Connection,
  PublicKey,
  ConfirmedTransaction,
  TransactionSignature,
  Transaction,
  ParsedTransactionMeta,
} from '@solana/web3.js';
import { MeanFiWallet } from 'contexts/wallet';
import { customLogger } from 'index';
import { SendTxResult, SignTxResult } from 'models/CreateTxResult';
import { TransactionStatus } from '../models/enums';
import { Confirmations, Timestamp } from '../models/transactions';
import { consoleOut, getTransactionStatusForLogs } from './ui';
import { getAmountFromLamports } from './utils';

export class TransactionWithSignature {
  constructor(
    public signature: string,
    public confirmedTransaction: ConfirmedTransaction,
  ) {}
}

export async function getTransactions(
  connection: Connection,
  address: PublicKey,
): Promise<Array<TransactionWithSignature>> {
  const transSignatures = await connection.getConfirmedSignaturesForAddress2(
    address,
  );

  const transactions = new Array<TransactionWithSignature>();
  for (let i = 0; i < transSignatures.length; i++) {
    const signature = transSignatures[i].signature;
    const confirmedTransaction = await connection.getConfirmedTransaction(
      signature,
    );
    if (confirmedTransaction) {
      const transWithSignature = new TransactionWithSignature(
        signature,
        confirmedTransaction,
      );
      transactions.push(transWithSignature);
    }
  }
  return transactions;
}

export async function fetchTransactionStatus(
  connection: Connection,
  signature: TransactionSignature,
) {
  let data;

  return connection
    .getSignatureStatus(signature, { searchTransactionHistory: true })
    .then(async response => {
      let info = null;
      if (response !== null && response.value !== null) {
        const value = response.value;
        let confirmations: Confirmations;
        if (typeof value.confirmations === 'number') {
          confirmations = value.confirmations;
        } else {
          confirmations = 'max';
        }
        let blockTime = null;
        try {
          blockTime = await connection.getBlockTime(value.slot);
        } catch (error) {
          throw new Error(`${error}`);
        }
        const timestamp: Timestamp =
          blockTime !== null ? blockTime : 'unavailable';

        info = {
          slot: value.slot,
          timestamp,
          confirmations,
          confirmationStatus: value.confirmationStatus,
          err: value.err,
        };
      }
      data = { signature, info };
      return data;
    })
    .catch(error => {
      throw error;
    });
}

export const isSuccess = (
  operation: TransactionStatus | undefined,
): boolean => {
  return operation === TransactionStatus.TransactionFinished;
};

export const isError = (operation: TransactionStatus | undefined): boolean => {
  return operation === TransactionStatus.TransactionStartFailure ||
    operation === TransactionStatus.InitTransactionFailure ||
    operation === TransactionStatus.SignTransactionFailure ||
    operation === TransactionStatus.SendTransactionFailure ||
    operation === TransactionStatus.ConfirmTransactionFailure
    ? true
    : false;
};

export const updateCreateStream2Tx = async (
  beneficiary: PublicKey,
  createStream2Tx: Transaction,
  claimType: number,
  apiBaseUrl: string,
) => {
  const url = `${apiBaseUrl}/${beneficiary}`;
  const tempoHeaders = new Headers();
  tempoHeaders.append('content-type', 'application/json;charset=UTF-8');
  tempoHeaders.append('X-Api-Version', '1.0');
  const encodedTx = createStream2Tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });

  const sendCreateStream2UpdateReq = async (): Promise<string> => {
    const options: RequestInit = {
      method: 'POST',
      headers: tempoHeaders,
      body: JSON.stringify({
        base64ClaimTransaction: encodedTx.toString('base64'),
        claimType: claimType,
      }),
    };

    return fetch(url, options)
      .then(async response => {
        if (response.status !== 200) {
          throw new Error('Unable to update create stream tx');
        }
        const updateCreateStream2TxResponse = (await response.json()) as any;
        return updateCreateStream2TxResponse.base64ClaimTransaction;
      })
      .catch(error => {
        throw error;
      });
  };

  const createStream2TxSignedResp = await sendCreateStream2UpdateReq();
  const createStreamTxUpdatedBytes = base64.decode(createStream2TxSignedResp);
  const createStreamTxUpdated = Transaction.from(createStreamTxUpdatedBytes);

  return createStreamTxUpdated;
};

export const getChange = (accountIndex: number, meta: ParsedTransactionMeta | null): number => {
  if (meta !== null && accountIndex !== -1) {
    const prevBalance = meta.preBalances[accountIndex] || 0;
    const postbalance = meta.postBalances[accountIndex] || 0;
    const change = getAmountFromLamports(postbalance) - getAmountFromLamports(prevBalance);
    return change;
  }
  return 0;
};

export const signTx = async (
  title: string,
  wallet: MeanFiWallet,
  publicKey: PublicKey,
  transaction: Transaction | null,
): Promise<SignTxResult> => {
  const txLog: any[] = [];

  if (wallet && publicKey && wallet.signTransaction && transaction) {
    return (wallet as SignerWalletAdapter)
    .signTransaction(transaction)
    .then(async (signed: Transaction) => {
      consoleOut(
        'signTransaction returned a signed transaction:',
        signed,
      );
      txLog.push({
        action: getTransactionStatusForLogs(
          TransactionStatus.SignTransactionSuccess,
        ),
        result: { signer: publicKey.toBase58() },
      });
      const encodedTx = signed.serialize().toString('base64');
      consoleOut('encodedTx:', encodedTx, 'orange');
      return {
        encodedTransaction: encodedTx,
        log: txLog,
      };
    })
    .catch((error: any) => {
      console.error('Signing transaction failed!');
      txLog.push({
        action: getTransactionStatusForLogs(
          TransactionStatus.SignTransactionFailure,
        ),
        result: { signer: `${publicKey.toBase58()}`, error: `${error}` },
      });
      customLogger.logError(`${title || 'Sign'} transaction failed`, {
        transcript: txLog,
      });
      return {
        encodedTransaction: null,
        log: txLog,
      };
      });
  } else {
    txLog.push({
      action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
      result: 'Cannot start transaction or Wallet not found!',
    });
    customLogger.logError(`${title || 'Sign'} transaction failed`, {
      transcript: txLog,
    });
    return {
      encodedTransaction: null,
      log: txLog,
    };
  }
};

export const sendTx = async (
  title: string,
  connection: Connection,
  wallet: MeanFiWallet,
  encodedTx: string,
): Promise<SendTxResult> => {
  const txLog: any[] = [];

  if (
    connection &&
    wallet &&
    wallet.publicKey &&
    encodedTx
  ) {
    return connection
      .sendEncodedTransaction(encodedTx)
      .then(sig => {
        consoleOut('sendEncodedTransaction returned a signature:', sig);
        txLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.SendTransactionSuccess,
          ),
          result: `signature: ${sig}`,
        });
        return {
          signature: sig,
          log: txLog,
        };
      })
      .catch(error => {
        console.error(error);
        txLog.push({
          action: getTransactionStatusForLogs(
            TransactionStatus.SendTransactionFailure,
          ),
          result: { error, encodedTx },
        });
        customLogger.logError(`${title || 'Sign'} transaction failed`, {
          transcript: txLog,
        });
        return {
          signature: null,
          log: txLog,
        };
      });
  } else {
    txLog.push({
      action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
      result: 'Cannot start transaction or Wallet not found!',
    });
    customLogger.logError(`${title || 'Sign'} transaction failed`, {
      transcript: txLog,
    });
    return {
      signature: null,
      log: txLog,
    };
  }
};
