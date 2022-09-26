import { TokenInfo } from "models/SolanaTokenInfo";

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
    token: TokenInfo;
    amount: string;
    inputAmount: number;
    fee: number;
    receiveAmount: number;
}

export interface CreateStreamParams {
    proposalTitle?: string;
    payer: string;
    treasurer: string;
    treasury: string;
    beneficiaries: any;
    associatedToken: string;
    allocationAssigned: string;
    rateAmount?: string;
    rateIntervalInSeconds?: number;
    startUtc?: Date;
    cliffVestAmount?: string;
    cliffVestPercent?: number;
    feePayedByTreasurer?: boolean
}