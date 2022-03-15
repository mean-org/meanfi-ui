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
    // Page /accounts/streams
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
    // Page /accounts/streams
    StreamWithdrawalButton = "Stream withdraw funds button click",
    StreamWithdrawalStartFormButton = "Stream withdraw start form button click",
    StreamWithdrawalSigned = "Stream withdraw funds Signed",
    StreamWithdrawalCompleted = "Stream withdraw funds Completed",
    StreamWithdrawalFailed = "Stream withdraw funds Failed",
    // Transfer Ownerships of Stream Action
    // Page /accounts/streams
    StreamTransferOwnershipButton = "Stream Transfer Ownership button click",
    StreamTransferOwnershipFormButton = "Stream Transfer Ownership form button click",
    StreamTransferSigned = "Stream Transfer Ownership Signed",
    StreamTransferCompleted = "Stream Transfer Ownership Completed",
    StreamTransferFailed = "Stream Transfer Ownership Failed",
    // Close Stream Action
    // Page /accounts/streams
    StreamCloseButton = "Stream Close button click",
    StreamCloseStreamFormButton = "Stream Close form button click",
    StreamCloseSigned = "Stream Close Signed",
    StreamCloseCompleted = "Stream Close Completed",
    StreamCloseFailed = "Stream Close Failed",
    // Page /transfers
    TransferOTPFormButton = "New OTP approve form button click",
    TransferOTPSigned = "New OTP Signed",
    TransferOTPCompleted = "New OTP Completed",
    TransferOTPFailed = "New OTP Failed",
    TransferRecurringFormButton = "New RTP approve form button click",
    TransferRecurringSigned = "New RTP Signed",
    TransferRecurringCompleted = "New RTP Completed",
    TransferRecurringFailed = "New RTP Failed",
}

export enum StatsTriggertEvent {
    TvlCollect = "Event description",
}

export interface SegmentStreamOTPTransferData {
    asset: string;
    amount: number;
    beneficiary: string;
    startUtc: string;
}

export interface SegmentStreamRPTransferData {
    asset: string;
    allocation: number;
    beneficiary: string;
    startUtc: string;
    rateAmount: number;
    interval: string;
    feePayedByTreasurer: boolean;
}

export interface SegmentStreamWithdrawData {
    asset: string;
    fee: number;
    stream: string;
    beneficiary: string;
    amount: number;
    inputAmount: number;
    receiveAmount: number;
}

export interface SegmentStreamTransferOwnershipData {
    stream: string;
    beneficiary: string;
    newBeneficiary: string;
}

export interface SegmentStreamAddFundsData {
    contributor: string;
    treasury: string;
    stream: string;
    contributorMint: string;
    amount: number;
}

export interface SegmentStreamCloseData {
    stream: string;
    initializer: string;
    closeTreasury: boolean;
}

export class SegmentAnalyticsService {

    private _analytics: Analytics | undefined = undefined;
    private _userId: string = '';

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
