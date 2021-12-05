import { TreasuryType } from "../models/enums";
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
        type: TreasuryType.Locked,
        translationId: 'treasury-type-locked',
        disabled: false,
    },
];
