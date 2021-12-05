import { TreasuryType } from "./enums";

export interface TreasuryTypeOption {
    name: string;
    type: TreasuryType;
    translationId: string;
    disabled: boolean;
}
