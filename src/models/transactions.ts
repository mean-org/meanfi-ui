import { TokenInfo } from "@solana/spl-token-registry";
import { ConfirmedTransaction } from "@solana/web3.js";

export type Confirmations = number | "max";
export type Timestamp = number | "unavailable";

export enum FetchStatus {
    Iddle,
    Fetching,
    FetchFailed,
    Fetched,
}

export class TransactionWithSignature {
    constructor(
        public signature: string,
        public confirmedTransaction: ConfirmedTransaction,
        public timestamp: Timestamp
    ) { }
}

export interface UserTokenAccount extends TokenInfo {
    publicAddress?: string;     // Token Account Public Address
    balance?: number;           // To pre-fill balance instead of having to get balance on the fly
    valueInUsd?: number;        // To pre.fill the value in USD from the balance
    displayIndex?: number;      // To keep consecutive indexing while merging lists
    isAta?: boolean;
}

export const isNativeSolAccountUsed = (transaction: TransactionWithSignature): boolean => {
  const meta = transaction && transaction.confirmedTransaction && transaction.confirmedTransaction.meta
    ? transaction.confirmedTransaction.meta
    : null;
  if (meta) {
    return (!meta.preTokenBalances || meta.preTokenBalances.length === 0) &&
           (!meta.postTokenBalances || meta.postTokenBalances.length === 0)
      ? true
      : false;
  }
  return false;
}
