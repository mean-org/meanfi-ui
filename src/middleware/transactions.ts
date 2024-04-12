import { MeanMultisig } from '@mean-dao/mean-multisig-sdk';
import { Adapter, SignerWalletAdapter } from '@solana/wallet-adapter-base';
import {
  AccountMeta,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  ParsedTransactionMeta,
  PublicKey,
  Signer,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  VersionedTransactionResponse,
} from '@solana/web3.js';
import { MAX_SUPPORTED_TRANSACTION_VERSION } from 'constants/common';
import { customLogger } from 'index';
import { SendTxResult, SignTxResult } from 'models/CreateTxResult';
import { TransactionStatus } from '../models/enums';
import { consoleOut, getTransactionStatusForLogs } from './ui';
import { formatThousands, getAmountFromLamports, readLocalStorageKey, toBuffer } from './utils';

export type PriorityOption = 'basic' | 'standard' | 'fast';

const LOW_VALUE = 127; // 0x7f
const HIGH_VALUE = 16383; // 0x3fff
const COMPUTE_UNIT_LIMIT = 200_000;

export const COMPUTE_UNIT_PRICE = {
  basic: 0,
  standard: 250_000,
  fast: 2_500_000,
};

export interface ComputeBudgetConfig {
  priorityOption: PriorityOption;
  cap?: number;
}

export const DEFAULT_BUDGET_CONFIG: ComputeBudgetConfig = {
  priorityOption: 'standard',
  cap: 0,
};

export class TransactionWithSignature {
  constructor(public signature: string, public confirmedTransaction: VersionedTransactionResponse) {}
}

/**
 * Compact u16 array header size
 * @param n elements in the compact array
 * @returns size in bytes of array header
 */
const compactHeader = (n: number) => (n <= LOW_VALUE ? 1 : n <= HIGH_VALUE ? 2 : 3);

/**
 * Compact u16 array size
 * @param n elements in the compact array
 * @param size bytes per each element
 * @returns size in bytes of array
 */
const compactArraySize = (n: number, size: number) => compactHeader(n) + n * size;

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
  const isOptionOk = o === 'basic' || o === 'standard' || o === 'fast';

  if (o === 'basic') return [];

  // Use 'standard' as default if value is out of range
  if (!isOptionOk) o = 'standard';

  consoleOut('Transaction Priority option:', o, 'darkorange');
  consoleOut('Compute Unit price:', `${formatThousands(COMPUTE_UNIT_PRICE[o])} microlamports`, 'darkorange');
  consoleOut('Compute Unit limit:', formatThousands(cuLimit + 10_000), 'darkorange');

  return [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: COMPUTE_UNIT_PRICE[o] }),
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit + 10_000 }),
  ];
};

/**
 * @param tx a solana transaction
 * @param feePayer the publicKey of the signer
 * @returns size in bytes of the transaction
 */
const getTxSize = (tx: Transaction, feePayer: PublicKey): number => {
  const feePayerPk = [feePayer.toBase58()];

  const signers = new Set<string>(feePayerPk);
  const accounts = new Set<string>(feePayerPk);

  const ixsSize = tx.instructions.reduce((acc, ix) => {
    ix.keys.forEach(({ pubkey, isSigner }) => {
      const pk = pubkey.toBase58();
      if (isSigner) signers.add(pk);
      accounts.add(pk);
    });

    accounts.add(ix.programId.toBase58());

    const nIndexes = ix.keys.length;
    const opaqueData = ix.data.length;

    return (
      acc +
      1 + // PID index
      compactArraySize(nIndexes, 1) +
      compactArraySize(opaqueData, 1)
    );
  }, 0);

  const computedSize =
    compactArraySize(signers.size, 64) + // signatures
    3 + // header
    compactArraySize(accounts.size, 32) + // accounts
    32 + // blockhash
    compactHeader(tx.instructions.length) + // instructions
    ixsSize;
  consoleOut('Transaction size:', computedSize, 'brown');

  return computedSize + 52; // My calculation could be wrong since I am always 52 bytes below what Solana explorer reports
};

const getComputeUnitsEstimate = async (
  connection: Connection,
  payer: PublicKey,
  blockhash: string,
  ixs: TransactionInstruction[],
  signers?: Signer[],
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
  );
  const budgetIxs = getComputeBudgetIx(instrumental.transactionPriorityOptions, unitsConsumed);

  // Rebuild same tx with budget instructions
  if (budgetIxs) {
    const newPreIxs = preInstructions ? [...budgetIxs, ...preInstructions] : budgetIxs;
    const newTx = await instrumental.multisigClient.buildCreateProposalTransaction(
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

    const txSize = getTxSize(result.transaction, proposer);
    if (txSize > 1232) {
      return result;
    }

    return newTx;
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

    const txSize = getTxSize(transaction, payer);
    if (txSize > 1232) {
      return transaction;
    }

    return newTx;
  }

  return transaction;
};

export const composeV0TxWithPrioritizationFees = async (
  connection: Connection,
  feePayer: PublicKey,
  ixs: TransactionInstruction[],
  additionalAccounts?: Keypair[],
) => {
  const config: ComputeBudgetConfig = readLocalStorageKey('transactionPriority') ?? DEFAULT_BUDGET_CONFIG;

  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  const messageV0 = new TransactionMessage({
    payerKey: feePayer,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(messageV0);
  if (additionalAccounts?.length) {
    additionalAccounts.forEach(a => transaction.addSignature(a.publicKey, a.secretKey));
  }

  // Get compute budget
  const unitsConsumed = await getComputeUnitsEstimate(connection, feePayer, blockhash, ixs);
  const budgetIxs = getComputeBudgetIx(config, unitsConsumed);

  // Rebuild same tx with budget instructions
  if (budgetIxs) {
    const newIxs = [...budgetIxs, ...ixs];
    const newTxMessage = new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: newIxs,
    }).compileToV0Message();
    const newTx = new VersionedTransaction(newTxMessage);
    if (additionalAccounts?.length) {
      additionalAccounts.forEach(a => newTx.addSignature(a.publicKey, a.secretKey));
    }

    return newTx;
  }

  return transaction;
};
