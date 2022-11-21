import { Transaction } from '@solana/web3.js';

export interface CreateTxResult {
  transaction: Transaction | null;
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
