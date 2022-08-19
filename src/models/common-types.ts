import { AllocationType } from "@mean-dao/msp";
import { MetaInfoCtaAction } from "./enums";
import { StreamTreasuryType } from "./treasuries";

export interface RoutingInfo {
    key: string;
    path: string;
    parent: string;
}

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
    proposalTitle: string;
    treasuryId?: string;
    contributor?: string;
    fundFromSafe?: boolean;
}

export interface StreamTopupParams {
    amount: string;
    tokenAmount: any;
    treasuryType: StreamTreasuryType | undefined;
    fundFromTreasury: boolean;
    associatedToken: string;
}

export interface StreamTopupTxCreateParams {
    payer: string;
    contributor: string;
    treasury: string;
    stream: string;
    amount: any;
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

export interface MetaInfoCta {
    action: MetaInfoCtaAction;
    isVisible: boolean;
    disabled: boolean;
    caption: string;
    uiComponentType: "button" | "menuitem";
    uiComponentId: string;
    tooltip: string;
    callBack?: any;
}

export type TimeData = {
    total: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
}

export type RecipientAddressInfo = {
    type: string;
    mint: string;
    owner: string;
}
