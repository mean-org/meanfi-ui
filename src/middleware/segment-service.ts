/* eslint-disable no-unused-vars */
import { Analytics } from "@segment/analytics-next";
import { consoleOut } from "./ui";

export enum AppUsageEvent {
    // Sitewide Actions
    WalletConnect = "Wallet connect button click",
    WalletConnected = "Wallet connected",
    WalletDisconnect = "Wallet disconnect button click",
    WalletDisconnected = "Wallet disconnected",
    WalletSelected = "Wallet selected",
    WalletChange = "Wallet change button click",
	UserIdentified = "User identified with wallet address",
	UserIdentifiedAnon = "User identified as anonymous",
    // Stream Actions
    // Top Up Funds Action
    StreamRefresh = "Stream list refresh button click",
	// See OTP and RTP for the next actions in this flow
    NewTransferButton = "New transfer button click", 
	// Top Up
    StreamTopupButton = "Stream Top up button click",
    StreamTopupApproveFormButton = "Stream Top up approve button click",
    StreamTopupSigned = "Stream Top up Signed",
    StreamTopupCompleted = "Stream Top up Completed",
    StreamTopupFailed = "Stream Top up Failed",
    // Withdraw Funds Action
    StreamWithdrawalButton = "Stream withdraw funds button click",
    StreamWithdrawalStartFormButton = "Stream withdraw start form button click",
    StreamWithdrawalSigned = "Stream withdraw funds Signed",
    StreamWithdrawalCompleted = "Stream withdraw funds Completed",
    StreamWithdrawalFailed = "Stream withdraw funds Failed",
    // Transfer Ownerships of Stream Action
    StreamTransferOwnershipButton = "Stream Transfer Ownership button click",
    StreamTransferOwnershipFormButton = "Stream Transfer Ownership form button click",
    StreamTransferSigned = "Stream Transfer Ownership Signed",
    StreamTransferCompleted = "Stream Transfer Ownership Completed",
    StreamTransferFailed = "Stream Transfer Ownership Failed",
    // Create a stream
    StreamCreateFormButton = "Create stream form button click",
    StreamCreateSigned = "Create stream Signed",
    StreamCreateCompleted = "Create stream Completed",
    StreamCreateFailed = "Create stream Failed",
    // Close Stream Action
    StreamCloseButton = "Stream Close button click",
    StreamCloseFormButton = "Stream Close form button click",
    StreamCloseSigned = "Stream Close Signed",
    StreamCloseCompleted = "Stream Close Completed",
    StreamCloseFailed = "Stream Close Failed",
    // Pause Stream Action
    StreamPauseButton = "Stream Pause button click",
    StreamPauseFormButton = "Stream Pause form button click",
    StreamPauseSigned = "Stream Pause Signed",
    StreamPauseCompleted = "Stream Pause Completed",
    StreamPauseFailed = "Stream Pause Failed",
    // Resume Stream Action
    StreamResumeButton = "Stream Resume button click",
    StreamResumeFormButton = "Stream Resume form button click",
    StreamResumeSigned = "Stream Resume Signed",
    StreamResumeCompleted = "Stream Resume Completed",
    StreamResumeFailed = "Stream Resume Failed",
    // Stream StatusChange Action
    StreamStatusChangeButton = "Stream Status change button click",
    StreamStatusChangeFormButton = "Stream Status change form button click",
    StreamStatusChangeSigned = "Stream Status change Signed",
    StreamStatusChangeCompleted = "Stream Status change Completed",
    StreamStatusChangeFailed = "Stream Status change Failed",
    // Page /transfers
    TransferOTPFormButton = "New OTP approve form button click",
    TransferOTPSigned = "New OTP Signed",
    TransferOTPCompleted = "New OTP Completed",
    TransferOTPFailed = "New OTP Failed",
    TransferRecurringFormButton = "New RTP approve form button click",
    TransferRecurringSigned = "New RTP Signed",
    TransferRecurringCompleted = "New RTP Completed",
    TransferRecurringFailed = "New RTP Failed",
    // Invest
    StakeMeanFormButton = "Stake mean form button click",
    StakeMeanSigned = "Stake mean Signed",
    StakeMeanCompleted = "Stake mean Completed",
    StakeMeanFailed = "Stake mean Failed",
    UnstakeMeanFormButton = "Unstake mean form button click",
    UnstakeMeanSigned = "Unstake mean Signed",
    UnstakeMeanCompleted = "Unstake mean Completed",
    UnstakeMeanFailed = "Unstake mean Failed",
    DepositInStakingVaultFormButton = "Deposit in Staking vault form button click",
    DepositInStakingVaultSigned = "Deposit in Staking vault Signed",
    DepositInStakingVaultCompleted = "Deposit in Staking vault Completed",
    DepositInStakingVaultFailed = "Deposit in Staking vault Failed",
    // Assets Actions
    // Create Asset
    CreateAssetFormButton = "Create Asset form button click",
    CreateAssetSigned = "Create Asset Signed",
    CreateAssetCompleted = "Create Asset Completed",
    CreateAssetFailed = "Create Asset Failed",
    // Close Token account
    CloseTokenAccountFormButton = "Close token account form button click",
    CloseTokenAccountSigned = "Close token account Signed",
    CloseTokenAccountCompleted = "Close token account Completed",
    CloseTokenAccountFailed = "Close token account Failed",
    // Set asset authority
    SetAssetAutorityFormButton = "Set asset authority form button click",
    SetAssetAutoritySigned = "Set asset authority Signed",
    SetAssetAutorityCompleted = "Set asset authority Completed",
    SetAssetAutorityFailed = "Set asset authority Failed",
    // Delete asset
    DeleteAssetFormButton = "Delete asset form button click",
    DeleteAssetSigned = "Delete asset Signed",
    DeleteAssetCompleted = "Delete asset Completed",
    DeleteAssetFailed = "Delete asset Failed",
    // Asset management
    WrapSolFormButton = "Wrap SOL form button click",
    WrapSolSigned = "Wrap SOL Signed",
    WrapSolCompleted = "Wrap SOL Completed",
    WrapSolFailed = "Wrap SOL Failed",
    UnwrapSolFormButton = "Unwrap SOL form button click",
    UnwrapSolSigned = "Unwrap SOL Signed",
    UnwrapSolCompleted = "Unwrap SOL Completed",
    UnwrapSolFailed = "Unwrap SOL Failed",
    // Multisig
    CreateProposalCompleted = "Create Proposal Completed",
    CreateProposalFailed = "Create Proposal Failed",
    ApproveProposalCompleted = "Approve Proposal Completed",
    ApproveProposalFailed = "Approve Proposal Failed",
    RejectProposalCompleted = "Reject Proposal Completed",
    RejectProposalFailed = "Reject Proposal Failed",
    ExecuteProposalCompleted = "Execute Proposal Completed",
    ExecuteProposalFailed = "Execute Proposal Failed",
    CancelProposalCompleted = "Cancel Proposal Completed",
    CancelProposalFailed = "Cancel Proposal Failed",
    // Streaming Account Actions
    // Create streaming account
    CreateStreamingAccountFormButton = "Create Streaming Account form button click",
    CreateStreamingAccountSigned = "Create Streaming Account Signed",
    CreateStreamingAccountCompleted = "Create Streaming Account Completed",
    CreateStreamingAccountFailed = "Create Streaming Account Failed",
    // Close streaming account
    CloseStreamingAccountFormButton = "Close Streaming Account form button click",
    CloseStreamingAccountSigned = "Close Streaming Account Signed",
    CloseStreamingAccountCompleted = "Close Streaming Account Completed",
    CloseStreamingAccountFailed = "Close Streaming Account Failed",
    // Add funds in streaming account
    AddFundsStreamingAccountFormButton = "Add Funds in Streaming Account form button click",
    AddFundsStreamingAccountSigned = "Add Funds in Streaming Account Signed",
    AddFundsStreamingAccountCompleted = "Add Funds in Streaming Account Completed",
    AddFundsStreamingAccountFailed = "Add Funds in Streaming Account Failed",
    // Withdraw funds in streaming account
    WithdrawFundsStreamingAccountFormButton = "Withdraw Funds in Streaming Account form button click",
    WithdrawFundsStreamingAccountSigned = "Withdraw Funds in Streaming Account Signed",
    WithdrawFundsStreamingAccountCompleted = "Withdraw Funds in Streaming Account Completed",
    WithdrawFundsStreamingAccountFailed = "Withdraw Funds in Streaming Account Failed",
    // Create stream in streaming account
    CreateStreamStreamingAccountFormButton = "Create Stream in Streaming Account form button click",
    CreateStreamStreamingAccountSigned = "Create Stream in Streaming Account Signed",
    CreateStreamStreamingAccountCompleted = "Create Stream in Streaming Account Completed",
    CreateStreamStreamingAccountFailed = "Create Stream in Streaming Account Failed",
    // Refresh account balance
    RefreshAccountBalanceFormButton = "Refresh account balance form button click",
    RefreshAccountBalanceSigned = "Refresh account balance Signed",
    RefreshAccountBalanceCompleted = "Refresh account balance Completed",
    RefreshAccountBalanceFailed = "Refresh account balance Failed",
    // Vesting contract
    VestingContractCreateFormButton = "Create Vesting contract form button click",
    VestingContractCreateSigned = "Create Vesting contract Signed",
    VestingContractCreateCompleted = "Create Vesting contract Completed",
    VestingContractCreateFailed = "Create Vesting contract Failed",
    VestingContractTopupFormButton = "Topup Vesting contract form button click",
    VestingContractTopupSigned = "Topup Vesting contract Signed",
    VestingContractTopupCompleted = "Topup Vesting contract Completed",
    VestingContractTopupFailed = "Topup Vesting contract Failed",
    VestingContractCloseFormButton = "Close Vesting contract form button click",
    VestingContractCloseSigned = "Close Vesting contract Signed",
    VestingContractCloseCompleted = "Close Vesting contract Completed",
    VestingContractCloseFailed = "Close Vesting contract Failed",
    VestingContractWithdrawFundsFormButton = "Withdraw Vesting contract funds form button click",
    VestingContractWithdrawFundsSigned = "Withdraw Vesting contract funds Signed",
    VestingContractWithdrawFundsCompleted = "Withdraw Vesting contract funds Completed",
    VestingContractWithdrawFundsFailed = "Withdraw Vesting contract funds Failed",
}

export enum StatsTriggertEvent {
    TvlCollect = "Event description",
}

export interface SegmentStreamOTPTransferData {
    asset: string;
    assetPrice: number;
    amount: number;
    beneficiary: string;
    startUtc: string;
    valueInUsd: number;
}

export interface SegmentStreamRPTransferData {
    asset: string;
    assetPrice: number;
    allocation: number;
    beneficiary: string;
    rateAmount: number;
    interval: string;
    feePayedByTreasurer: boolean;
    startUtc: string;
    valueInUsd: number;
}

export interface SegmentStreamWithdrawData {
    asset: string;
    assetPrice: number;
    stream: string;
    beneficiary: string;
    inputAmount: number;
    feeAmount: number;
    sentAmount: number;
    valueInUsd: number;
}

export interface SegmentStreamAddFundsData {
    asset: string;
    assetPrice: number;
    contributor: string;
    treasury: string;
    stream: string;
    amount: number | string;
    valueInUsd: number;
}

export interface SegmentStreamCloseData {
    asset: string;
    assetPrice: number;
    stream: string;
    initializer: string;
    closeTreasury: boolean;
    vestedReturns: number | string;
    unvestedReturns: number | string;
    feeAmount: number;
    valueInUsd: number;
}

export interface SegmentStakeMeanData {
    asset: string;
    assetPrice: number;
    stakedAsset: string;
    stakedAssetPrice: number;
    amount: number;
    quote: number;
    valueInUsd: number;
}

export interface SegmentUnstakeMeanData {
    asset: string;
    assetPrice: number;
    unstakedAsset: string;
    unstakedAssetPrice: number;
    amount: number;
    quote: number;
    valueInUsd: number;
}

export interface SegmentStakingRewardsDepositData {
    asset: string;
    assetPrice: number;
    depositPercentage: number;
    amount: number;
    stakingVaultBalance: number;
    valueInUsd: number;
}

export interface SegmentStreamTransferOwnershipData {
    stream: string;
    beneficiary: string;
    newBeneficiary: string;
}

export interface SegmentVestingContractCreateData {
    asset: string;
    assetPrice: number;
    valueInUsd: number;
    contractName: string;
    type: string;
    fundingAmount: number;
    duration: number;
    durationUnit: string;
    subCategory: string;
    cliffVestPercent: number;
    startUtc: string;
    multisig: string;
    feePayedByTreasurer: boolean;
}

export interface SegmentVestingContractWithdrawData {
    asset: string;
    assetPrice: number;
    vestingContract: string;
    destination: string;
    amount: number;
    valueInUsd: number;
}

export interface SegmentStreamCreateData {
    asset: string;
    assetPrice: number;
    treasury: string;
    beneficiary: string;
    allocation: number | string;
    rateAmount: number;
    interval: string;
    category: number;
    feePayedByTreasurer: boolean;
    valueInUsd: number | string;
}

export interface SegmentStreamStatusChangeActionData {
    action: string;
    streamId: string;
}

export interface SegmentVestingContractCloseData {
    contractName: string;
    type: string;
    subCategory: string;
}

export interface SegmentRefreshAccountBalanceData {
    treasurer: string;
    treasury: string;
}

///////////////////
// Service Class //
///////////////////

export class SegmentAnalyticsService {

    private _analytics: Analytics | undefined = undefined;
    private _userId = '';

    public set analytics(instance: Analytics | undefined) {
        if (instance) {
            this._analytics = instance;
            console.log(`%cSegment analytics initialized!`, 'color:brown');
        }
    }

    public get analytics(): Analytics | undefined {
        return this._analytics;
    }

    public set userId(value : string) {
        this._userId = value;
    }

    public get userId() : string {
        return this._userId;
    }

    /**
     * Calls Segment Analytics to record page visit
     * @param {string} pageName - The page name or route
     * @returns {void} - Nothing
     * 
     * When to use:
     * Every time the user navigates to a page
     */

    public recordPageVisit(pageName: string): void {
        if (!pageName) {
            consoleOut('recordPageVisit was called without pageName', '', 'red');
            return;
        }
        if (this._analytics) {
            this._analytics.page(pageName);
        }
    }

    /**
     * Calls Segment Analytics to identify the user
     * @param {string} userId - The user's unique ID
     * @param {any} userInfo - An object with user information
     * @returns {void} - Nothing
     * 
     * When to use:
     * Every time the user navigates to a page
     */

    public recordIdentity(userId: string, userInfo: any, callback?: any | undefined): void {
        if (this._analytics) {
            this._analytics.identify(userId, userInfo, callback);
        }
    }

    /**
     * Calls Segment Analytics to set anonymous user
     * @returns {void} - Nothing
     * When to use:
     * Every time the user navigates to a page without wallet connection
     * Call it just before page
     */

    public recordAnonymousIdentity(): void {
        if (this._analytics) {
            this._analytics.setAnonymousId();
            // this.userId = this._analytics.user().id.toString();
        }
    }

    /**
     * Calls Segment Analytics to record and event
     * @param {AppUsageEvent | StatsTriggertEvent} event - The event being recorded
     * @param {any} data - An object with the information to record
     * @returns {void} - Nothing
     * 
     * When to use:
     * Every time the user performs an action that we want to track :D
     */

    public recordEvent(event: AppUsageEvent | StatsTriggertEvent, data?: any, callback?: any | undefined): void {
        if (this._analytics) {
            if (event && !data && !callback) {
                this._analytics.track(event);
            } else {
                this._analytics.track(event, data, callback);
            }
        }
    }

}
