import { Analytics } from "@segment/analytics-next";
import { consoleOut } from "./ui";

export enum AppUsageEvent {
    // Sitewide Actions
    WalletConnected = "Wallet Connected",
    WalletDisconnected = "Wallet Disconnected",
    WalletChange = "Wallet Change",
    StreamRefresh = "Stream List Refresh",
    // Stream Actions
    // Top Up Funds Action
    // Page /accounts/streams
    StreamTopupButton = "Stream Top up Button",
    StreamTopupCreated = "Stream Top up Create",
    StreamTopupSigned = "Stream Top up Signed",
    StreamTopupCompleted = "Stream Top up Completed",
    StreamTopupFailed = "Stream Top up Failed",
    // Withdraw Funds Action
    // Page /accounts/streams
    StreamWithdrawalButton = "Stream withdraw funds Button",
    StreamWithdrawalCreated = "Stream withdraw funds Create",
    StreamWithdrawalSigned = "Stream withdraw funds Signed",
    StreamWithdrawalCompleted = "Stream withdraw funds Completed",
    StreamWithdrawalFailed = "Stream withdraw funds Failed",
    // Transfer Stream Action
    // Page /accounts/streams
    StreamTransferCreated = "Stream Transfer Create",
    StreamTransferSigned = "Stream Transfer Signed",
    StreamTransferCompleted = "Stream Transfer Completed",
    StreamTransferFailed = "Stream Transfer Failed",
    // Close Stream Action
    // Page /accounts/streams
    StreamCloseCreated = "Stream Close Create",
    StreamCloseSigned = "Stream Close Signed",
    StreamCloseCompleted = "Stream Close Completed",
    StreamCloseFailed = "Stream Close Failed",
    // Page /transfers
    TransferOTPCreated = "New OTP Created",
    TransferOTPSigned = "New OTP Signed",
    TransferOTPCompleted = "New OTP Completed",
    TransferOTPFailed = "New OTP Failed",
    TransferRecurringCreated = "New RTP Created",
    TransferRecurringSigned = "New RTP Signed",
    TransferRecurringCompleted = "New RTP Completed",
}

export enum StatsTriggertEvent {
    TvlCollect = "Event description",
}

export interface SegmentTransferData {
    type: string;
    token: string;
    rate: number;
    amount: string;
    startUtc: string;
    error: string;
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

    public recordEvent(event: AppUsageEvent | StatsTriggertEvent, data: any): void {
        if (!event || !data) {
            consoleOut('recordEvent was called without necessary params', '', 'red');
            return;
        }
        if (this._analytics) {
            this._analytics.track(event, data);
        }
    }

}
