import type { Transaction, VersionedTransaction } from '@solana/web3.js';
import type { LooseObject } from 'src/types/LooseObject';

export interface CreateTxResult {
  transaction: Transaction | VersionedTransaction | null;
  log: LooseObject[];
  error?: unknown;
}

export interface SignTxResult {
  encodedTransaction: string | null;
  signedTransaction: Transaction | VersionedTransaction | null;
  log: LooseObject[];
  error?: unknown;
}

export interface SendTxResult {
  signature: string | null;
  log: LooseObject[];
  error?: unknown;
}

export interface ConfirmTxResult {
  confirmed: boolean;
  log: LooseObject[];
}
