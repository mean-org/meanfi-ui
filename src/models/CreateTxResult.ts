import type { Transaction, VersionedTransaction } from '@solana/web3.js';

export interface CreateTxResult {
  transaction: Transaction | VersionedTransaction | null;
  log: any[];
  error?: any;
}

export interface SignTxResult {
  encodedTransaction: string | null;
  signedTransaction: Transaction | VersionedTransaction | null;
  log: any[];
  error?: any;
}

export interface SendTxResult {
  signature: string | null;
  log: any[];
  error?: any;
}

export interface ConfirmTxResult {
  confirmed: boolean;
  log: any[];
}
