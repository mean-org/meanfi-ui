import { TimeUnit, TreasuryType } from "@mean-dao/msp";
import { TokenInfo } from "@solana/spl-token-registry";

export const VESTING_CATEGORIES: string[] = [
    'Advisor',
    'Development',
    'Foundation',
    'Investor',
    'Marketing',
    'Partnership',
    'Seed round',
    'Team',
];

export interface VestingContractCreateOptions {
    vestingContractName: string;
    vestingContractType: TreasuryType;
    vestingContractCategory: string;
    amount: string;
    token: TokenInfo;
    feePayedByTreasurer: boolean;
    duration: number;
    durationUnit: TimeUnit;
    cliffVestPercent: number;
    startDate: Date;
    fundingAmount: number;
}

export interface VestingContractWithdrawOptions {
    amount: string;
    tokenAmount: any;
    destinationAccount: string;
}
