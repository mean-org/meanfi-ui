import { TimeUnit, TreasuryType } from "@mean-dao/msp";
import { TokenInfo } from "@solana/spl-token-registry";
import { PublicKey } from "@solana/web3.js";

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

export interface CreateVestingTreasuryParams {
    payer: PublicKey;
    treasurer: PublicKey;
    label: string;
    type: TreasuryType;
    associatedTokenAddress: string;
    duration: number;
    durationUnit: TimeUnit;
    startUtc: Date;
    cliffVestPercent: number;
    feePayedByTreasurer?: boolean | undefined;
    multisig: string;
    fundingAmount: number;
}

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

export interface VestingContractStreamCreateOptions {
    streamName: string;
    beneficiaryAddress: string;
    tokenAmount: number;
    sendRate: string;
    feePayedByTreasurer: boolean;
    rateAmount: number;
    interval: string;
}
