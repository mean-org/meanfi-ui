export interface StreamsSummary {
    totalNet: number;
    incomingAmount: number;
    outgoingAmount: number;
    totalAmount: number;
}

export const initialSummary: StreamsSummary = {
    totalNet: 0,
    incomingAmount: 0,
    outgoingAmount: 0,
    totalAmount: 0
};

export interface TreasuryStreamsBreakdown {
    total: number;
    scheduled: number;
    running: number;
    stopped: number;
}

export interface StreamWithdrawData {
    title?: string;
    token: string;
    amount: string;
    inputAmount: number;
    fee: number;
    receiveAmount: number;
}
