import { AllocationType, SubCategory, TimeUnit, TreasuryType } from "@mean-dao/msp";
import { TokenInfo } from "@solana/spl-token-registry";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

export type VestingFlowRateInfo = {
    amount: number;
    durationUnit: TimeUnit;
    streamableAmount: number;
}

export type VestingContractCategory = {
    label: string;
    value: SubCategory;
}

export const VESTING_CATEGORIES: VestingContractCategory[] = [
    {
        label: 'Advisor',
        value: SubCategory.advisor
    },
    {
        label: 'Community',
        value: SubCategory.community
    },
    {
        label: 'Development',
        value: SubCategory.development
    },
    {
        label: 'Foundation',
        value: SubCategory.foundation
    },
    {
        label: 'Investor',
        value: SubCategory.investor
    },
    {
        label: 'Marketing',
        value: SubCategory.marketing
    },
    {
        label: 'Partnership',
        value: SubCategory.partnership
    },
    {
        label: 'Seed round',
        value: SubCategory.seed
    },
    {
        label: 'Team',
        value: SubCategory.team
    }
];

export const getCategoryLabelByValue = (value: SubCategory) => {
    const item = VESTING_CATEGORIES.find(c => c.value === value);
    if (item) {
        return item.label;
    }
    return '-';
}

export interface CreateVestingTreasuryParams {
    payer: PublicKey;
    treasurer: PublicKey;
    label: string;
    type: TreasuryType;
    associatedTokenAddress: string;
    duration: number;
    durationUnit: TimeUnit;
    startUtc: Date;
    vestingCategory: SubCategory;
    cliffVestPercent: number;
    feePayedByTreasurer?: boolean | undefined;
    multisig: string;
    fundingAmount: number | string;
}

export interface VestingContractCreateOptions {
    vestingContractTitle: string;
    vestingContractName: string;
    vestingContractType: TreasuryType;
    vestingCategory: SubCategory;
    amount: string;
    token: TokenInfo;
    feePayedByTreasurer: boolean;
    duration: number;
    durationUnit: TimeUnit;
    cliffVestPercent: number;
    startDate: Date;
    multisig: string;
    fundingAmount: number | string;
}

export interface VestingContractEditOptions {
    // vestingContractName: string;
    // vestingCategory: SubCategory;
    feePayedByTreasurer: boolean;
    duration: number;
    durationUnit: TimeUnit;
    cliffVestPercent: number;
    startDate: Date;
    multisig: string;
}

export interface VestingContractWithdrawOptions {
    amount: string;
    tokenAmount: any;
    destinationAccount: string;
    associatedToken: TokenInfo | undefined;
    multisig: string;
}

export interface VestingContractStreamCreateOptions {
    associatedToken: TokenInfo | undefined;
    beneficiaryAddress: string;
    feePayedByTreasurer: boolean;
    interval: string;
    multisig: string;
    rateAmount: number;
    streamName: string;
    tokenAmount: BN;
    txConfirmDescription: string;
    txConfirmedDescription: string;
    proposalTitle?: string;
}

export interface CreateVestingStreamParams {
    payer: PublicKey;
    treasurer: PublicKey;
    treasury: PublicKey;
    beneficiary: PublicKey;
    treasuryAssociatedTokenMint: PublicKey;
    allocationAssigned: number;
    streamName: string;
    multisig: string;
}

export interface VestingContractCloseStreamOptions {
    closeTreasuryOption: boolean;
    vestedReturns: number;
    unvestedReturns: number;
    feeAmount: number;
}

export interface VestingContractTopupParams {
    amount: string;
    tokenAmount: any;
    allocationType: AllocationType;
    streamId: string;
    associatedToken: TokenInfo | undefined;
    contributor?: string;
    proposalTitle?: string;
    fundFromSafe?: boolean;
}

// Map cache to maintain the vesting flow rates between reloads of the vesting accounts' list
const vfrCache = new Map<string, VestingFlowRateInfo>();

export const vestingFlowRatesCache = {
    add: (
        vcId: string,
        data: VestingFlowRateInfo
    ) => {
        if (!vcId || !data) { return; }

        const isNew = !vfrCache.has(vcId);
        if (isNew) {
            vfrCache.set(vcId, data);
        }
    },
    get: (vcId: string) => {
        return vfrCache.get(vcId);
    },
    delete: (vcId: string) => {
        if (vfrCache.get(vcId)) {
            vfrCache.delete(vcId);
            return true;
        }
        return false;
    },
    update: (
        vcId: string,
        data: VestingFlowRateInfo
    ) => {
        if (vfrCache.get(vcId)) {
            vfrCache.set(vcId, data);
            return true;
        }
        return false;
    },
    clear: () => {
        vfrCache.clear();
    },
};
