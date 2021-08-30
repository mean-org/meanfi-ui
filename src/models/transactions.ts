export interface TransactionStats {
    incoming: number;
    outgoing: number;
}

export const defaultTransactionStats: TransactionStats = {
    incoming: 0,
    outgoing: 0
};
