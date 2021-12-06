import { TreasuryType } from "@mean-dao/money-streaming/lib/types";
import { TreasuryTypeOption } from "../models/treasury-definition";

export const TREASURY_TYPE_OPTIONS: TreasuryTypeOption[] = [
    {
        name: 'Open Money Streaming Treasury',
        type: TreasuryType.Open,
        translationId: 'treasury-type-open',
        disabled: false,
    },
    {
        name: 'Locked Money Streaming Treasury',
        type: TreasuryType.Lock,
        translationId: 'treasury-type-locked',
        disabled: false,
    },
];
