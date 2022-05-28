import { AllocationType } from "@mean-dao/money-streaming";
import { StreamTreasuryType } from "./treasuries";

export interface SelectOption {
    key: number;
    value: number;
    label: string;
    visible?: boolean;
}

export interface TreasuryTopupParams {
    amount: string;
    tokenAmount: any;
    allocationType: AllocationType;
    streamId: string;
    associatedToken: string;
}

export interface StreamTopupParams {
    amount: string;
    tokenAmount: any;
    treasuryType: StreamTreasuryType | undefined;
    fundFromTreasury: boolean;
    associatedToken: string;
}

export interface PartnerImage {
    fileName: string;
    altText?: string;
    size: string;
}

export class Allocation {
    tokenAmount!: number;
    cliffPercent!: number;
    monthlyRate!: number;
    isAirdropCompleted!: boolean;
}
