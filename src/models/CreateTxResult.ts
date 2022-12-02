import { Transaction, VersionedTransaction } from '@solana/web3.js';

export interface CreateTxResult {
  transaction: Transaction | VersionedTransaction | null;
  log: any[];
}

export interface SignTxResult {
  encodedTransaction: string | null;
  log: any[];
}

export interface SendTxResult {
  signature: string | null;
  log: any[];
}
