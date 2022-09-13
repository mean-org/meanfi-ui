import { TreasuryType } from "@mean-dao/money-streaming/lib/types";
import { TokenInfo } from "@solana/spl-token-registry";

export interface TreasuryTypeOption {
    name: string;
    type: TreasuryType;
    translationId: string;
    disabled: boolean;
}

export type StreamTreasuryType = "open" | "locked" | "unknown";

export interface TreasuryCreateOptions {
    treasuryTitle: string;
    treasuryName: string;
    treasuryType: TreasuryType;
    multisigId: string;
    token: TokenInfo;
}

export interface CloseStreamTransactionParams {
    title: string,
    payer: string;
    stream: string;
    closeTreasury: boolean;
}

export interface TreasuryWithdrawParams {
    payer: string;
    destination: string;
    treasury: string;
    amount: number | string;
}

export interface UserTreasuriesSummary {
    totalAmount: number;
    openAmount: number;
    lockedAmount: number;
    totalNet: number;
}

export const INITIAL_TREASURIES_SUMMARY: UserTreasuriesSummary = {
    totalAmount: 0,
    openAmount: 0,
    lockedAmount: 0,
    totalNet: 0
}
