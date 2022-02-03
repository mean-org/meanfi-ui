import { TreasuryType } from "@mean-dao/money-streaming/lib/types";

export interface TreasuryTypeOption {
    name: string;
    type: TreasuryType;
    translationId: string;
    disabled: boolean;
}

export type StreamTreasuryType = "open" | "locked" | "unknown";
