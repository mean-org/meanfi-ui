import { AllocationType } from "@mean-dao/money-streaming";

export interface SelectOption {
    key: number;
    value: number;
    label: string;
    visible?: boolean;
}

export interface TreasuryTopupParams {
    amount: string;
    allocationType: AllocationType;
    streamId?: string;
}
