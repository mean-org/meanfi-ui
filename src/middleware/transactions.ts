import { Adapter, SignerWalletAdapter } from '@solana/wallet-adapter-base';
import {
  AccountMeta,
  ComputeBudgetProgram,
  Connection,
  ParsedTransactionMeta,
  PublicKey,
  Signer,
  Transaction,
  TransactionConfirmationStatus,
  TransactionInstruction,
  TransactionMessage,
  TransactionSignature,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { MAX_SUPPORTED_TRANSACTION_VERSION } from 'constants/common';
import { customLogger } from 'index';
import { ConfirmTxResult, SendTxResult, SignTxResult } from 'models/CreateTxResult';
import { TransactionStatus } from '../models/enums';
import { Confirmations, Timestamp } from '../models/transactions';
import { consoleOut, getTransactionStatusForLogs } from './ui';
import { formatThousands, getAmountFromLamports, readLocalStorageKey, toBuffer } from './utils';
import { MeanMultisig } from '@mean-dao/mean-multisig-sdk';

export type PriorityOption = 'normal' | 'fast' | 'turbo';

const COMPUTE_UNIT_LIMIT = 200_000;

export const COMPUTE_UNIT_PRICE = {
  normal: 250_000,
  fast: 2_500_000,
  turbo: 25_000_000,
};

export interface ComputeBudgetConfig {
  priorityOption: PriorityOption;
  cap?: number;
}

export const DEFAULT_BUDGET_CONFIG: ComputeBudgetConfig = {
  priorityOption: 'normal',
  cap: 0,
};

export class TransactionWithSignature {
  constructor(public signature: string, public confirmedTransaction: VersionedTransactionResponse) {}
}

export async function getTransactions(
  connection: Connection,
  address: PublicKey,
): Promise<Array<TransactionWithSignature>> {
  const transSignatures = await connection.getConfirmedSignaturesForAddress2(address);

  const transactions = new Array<TransactionWithSignature>();
  for (const element of transSignatures) {
    const signature = element.signature;
    const confirmedTransaction = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: MAX_SUPPORTED_TRANSACTION_VERSION,
    });
    if (confirmedTransaction) {
      const transWithSignature = new TransactionWithSignature(signature, confirmedTransaction);
      transactions.push(transWithSignature);
    }
  }
  return transactions;
}

export async function fetchTxStatus(
  connection: Connection,
  signature: string,
  targetFinality: TransactionConfirmationStatus,
) {
  if (!connection) {
    return;
  }

  const fetchStatus = async () => {
    try {
      const latestBlockHash = await connection.getLatestBlockhash('confirmed');
      const result = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        },
        targetFinality,
      );
      if (result && result.value && !result.value.err) {
        return targetFinality;
      }
      return undefined;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  };

  return fetchStatus();
}

export async function fetchTransactionStatus(connection: Connection, signature: TransactionSignature) {
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
        const timestamp: Timestamp = blockTime !== null ? blockTime : 'unavailable';

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

export const isSuccess = (operation: TransactionStatus | undefined): boolean => {
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
  wallet: Adapter,
  publicKey: PublicKey,
  transaction: Transaction | VersionedTransaction | null,
): Promise<SignTxResult> => {
  const txLog: any[] = [];

  if (wallet && publicKey && transaction) {
    return (wallet as SignerWalletAdapter)
      .signTransaction(transaction)
      .then(async signed => {
        consoleOut('signTransaction returned a signed transaction:', signed);
        txLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
          result: { signer: publicKey.toBase58() },
        });
        return {
          encodedTransaction: serializeTx(signed),
          signedTransaction: signed,
          log: txLog,
        };
      })
      .catch((error: any) => {
        console.error('Signing transaction failed', error);
        txLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
          result: { signer: `${publicKey.toBase58()}`, error: `${error}` },
        });
        customLogger.logError(`${title || 'Sign'} transaction failed`, {
          transcript: txLog,
        });
        return {
          encodedTransaction: null,
          signedTransaction: null,
          log: txLog,
          error,
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
      signedTransaction: null,
      log: txLog,
    };
  }
};

export const sendTx = async (title: string, connection: Connection, encodedTx: string): Promise<SendTxResult> => {
  const txLog: any[] = [];

  if (connection && encodedTx) {
    return connection
      .sendEncodedTransaction(encodedTx, { preflightCommitment: 'confirmed' })
      .then(sig => {
        consoleOut('sendEncodedTransaction returned a signature:', sig);
        txLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
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
          action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
          result: { error, encodedTx },
        });
        customLogger.logError(`${title || 'Sign'} transaction failed`, {
          transcript: txLog,
        });
        return {
          signature: null,
          log: txLog,
          error,
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

export const confirmTx = async (
  title: string,
  connection: Connection,
  signature: string,
  finality: TransactionConfirmationStatus = 'confirmed',
): Promise<ConfirmTxResult> => {
  const txLog: any[] = [];

  try {
    const confirmation = await fetchTxStatus(connection, signature, finality);
    if (confirmation) {
      return {
        confirmed: true,
        log: txLog,
      };
    }
  } catch (error) {
    console.error(error);
  }

  txLog.push({
    action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
    result: signature,
  });
  customLogger.logError(`${title || 'Confirm'} transaction failed`, {
    transcript: txLog,
  });
  return {
    confirmed: false,
    log: txLog,
  };
};

export const serializeTx = (signed: Transaction | VersionedTransaction) => {
  let base64Tx = '';
  const isVersioned = 'version' in signed ? true : false;

  if (isVersioned) {
    const encodedTx = signed.serialize();
    const asBuffer = toBuffer(encodedTx);
    base64Tx = asBuffer.toString('base64');
  } else {
    base64Tx = signed.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
  }

  consoleOut('encodedTx:', base64Tx, 'orange');
  return base64Tx;
};

export const getComputeBudgetIx = (config: ComputeBudgetConfig, cuLimit = COMPUTE_UNIT_LIMIT) => {
  let o = config.priorityOption;

  // Use 'normal' as default if previously configured for 'disabled' or 'ultra'
  if (o !== 'normal' && o !== 'fast' && o !== 'turbo') o = 'normal';

  consoleOut('Transaction Priority option:', o, 'darkorange');
  consoleOut('Compute Unit price:', `${formatThousands(COMPUTE_UNIT_PRICE[o])} microlamports`, 'darkorange');
  consoleOut('Compute Unit limit:', formatThousands(cuLimit), 'darkorange');

  return [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE[o] }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
  ];
};

const getComputeUnitsEstimate = async (
  connection: Connection,
  payer: PublicKey,
  blockhash: string,
  ixs: TransactionInstruction[],
  signers: Signer[] | undefined,
) => {
  // Create a VersionedTransaction
  const messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const v0Tx = new VersionedTransaction(messageV0);
  if (signers?.length) {
    v0Tx.sign(signers);
  }
  // Simulate tx without signature verification
  const { value } = await connection.simulateTransaction(v0Tx, { sigVerify: false });

  return !value.err && value.unitsConsumed ? value.unitsConsumed : undefined;
};

export const getProposalWithPrioritizationFees = async (
  instrumental: {
    multisigClient: MeanMultisig;
    connection: Connection;
    transactionPriorityOptions: ComputeBudgetConfig;
  },
  proposer: PublicKey,
  title: string,
  description: string | undefined,
  expirationDate: Date | undefined,
  operation: number,
  multisig: PublicKey,
  program: PublicKey,
  accounts: AccountMeta[],
  data: Buffer | undefined,
  preInstructions?: TransactionInstruction[],
) => {
  const result = await instrumental.multisigClient.buildCreateProposalTransaction(
    proposer,
    title,
    description,
    expirationDate,
    operation,
    multisig,
    program,
    accounts,
    data,
    preInstructions,
  );

  if (!result) {
    return null;
  }

  const { blockhash } = await instrumental.connection.getLatestBlockhash('confirmed');

  // Get compute budget
  const unitsConsumed = await getComputeUnitsEstimate(
    instrumental.connection,
    proposer,
    blockhash,
    result.transaction.instructions,
    undefined,
  );
  const budgetIxs = getComputeBudgetIx(instrumental.transactionPriorityOptions, unitsConsumed);

  // Rebuild same tx with budget instructions
  if (budgetIxs) {
    const newPreIxs = preInstructions ? [...budgetIxs, ...preInstructions] : budgetIxs;
    return await instrumental.multisigClient.buildCreateProposalTransaction(
      proposer,
      title,
      description,
      expirationDate,
      operation,
      multisig,
      program,
      accounts,
      data,
      newPreIxs,
    );
  }

  return result;
};

export const composeTxWithPrioritizationFees = async (
  connection: Connection,
  payer: PublicKey,
  ixs: TransactionInstruction[],
  signers?: Signer[],
) => {
  const config: ComputeBudgetConfig = readLocalStorageKey('transactionPriority') ?? DEFAULT_BUDGET_CONFIG;

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const transaction = new Transaction().add(...ixs);
  transaction.feePayer = payer;
  transaction.recentBlockhash = blockhash;
  if (signers?.length) {
    transaction.partialSign(...signers);
  }

  // Get compute budget
  const unitsConsumed = await getComputeUnitsEstimate(connection, payer, blockhash, ixs, signers);
  const budgetIxs = getComputeBudgetIx(config, unitsConsumed);

  // Rebuild same tx with budget instructions
  if (budgetIxs) {
    const newPreIxs = [...budgetIxs, ...ixs];
    const newTx = new Transaction().add(...newPreIxs);
    newTx.feePayer = payer;
    newTx.recentBlockhash = blockhash;
    if (signers?.length) {
      newTx.partialSign(...signers);
    }

    return newTx;
  }

  return transaction;
};
