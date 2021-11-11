import { TokenInfo } from "@solana/spl-token-registry";
import { ConfirmedTransaction } from "@solana/web3.js";
import { type } from "../utils/store-types";

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
    displayIndex?: number;      // To keep consecutive indexing while merging lists
    isMeanSupportedToken?: boolean;
    isAta?: boolean;
}

export class TransactionStats {
    total: number;
    incoming: number;
    outgoing: number;
    index: number;
    constructor() {
        this.total = 0;
        this.incoming = 0;
        this.outgoing = 0;
        this.index = 0;
    }
}

export const defaultTransactionStats = new TransactionStats();
export interface Action {
    type: string;
}

export const ActionTypes = {
    RESET_STATS:                    type('[Accounts] Reset Tx stats'),
    SET_STATS:                      type('[Accounts] Set new Tx stats'),
    RESET_INDEX:                    type('[Accounts] Reset Tx index to start'),
    INCREMENT_INDEX:                type('[Accounts] Increment transaction index'),
    ROLL_INDEX:                     type('[Accounts] Move Tx index to end'),
};

export class ResetStatsAction implements Action {
    type = ActionTypes.RESET_STATS;
    payload = null;
}

export class SetStatsAction implements Action {
    type = ActionTypes.SET_STATS;
    constructor(public payload: TransactionStats) { }
}

export class IncrementTransactionIndexAction implements Action {
    type = ActionTypes.INCREMENT_INDEX;
    payload = null;
}

export class MoveTxIndexToStartAction implements Action {
    type = ActionTypes.RESET_INDEX;
    payload = null;
}

export class MoveTxIndexToEndAction implements Action {
    type = ActionTypes.ROLL_INDEX;
    payload = null;
}

export type TransactionActions = ResetStatsAction
    | SetStatsAction | IncrementTransactionIndexAction
    | MoveTxIndexToStartAction | MoveTxIndexToEndAction;


export const isNativeSolAccountUsed = (transaction: TransactionWithSignature): boolean => {
  const meta = transaction.confirmedTransaction.meta;
  if (meta) {
    return (!meta.preTokenBalances || meta.preTokenBalances.length === 0) &&
           (!meta.postTokenBalances || meta.postTokenBalances.length === 0)
      ? true
      : false;
  }
  return false;
}
