import { TokenInfo } from "@solana/spl-token-registry";
import { type } from "../utils/store-types";

export interface UserTokenAccount extends TokenInfo {
    balance?: number;
}

export interface Action {
    type: string;
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

export const ActionTypes = {
    RESET_STATS:                    type('[Accounts] Reset Tx stats'),
    SET_STATS:                      type('[Accounts] Set new Tx stats'),
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

export class MoveTxIndexToEndAction implements Action {
    type = ActionTypes.ROLL_INDEX;
    payload = null;
}

export type TransactionActions = ResetStatsAction | SetStatsAction | IncrementTransactionIndexAction
                                | MoveTxIndexToEndAction;
