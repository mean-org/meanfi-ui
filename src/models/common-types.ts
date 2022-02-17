import { AllocationType } from "@mean-dao/money-streaming";

export interface SelectOption {
    key: number;
    value: number;
    label: string;
    visible?: boolean;
}

export interface TreasuryTopupParams {
    amount: any;
    allocationType: AllocationType;
    streamId: string;
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
