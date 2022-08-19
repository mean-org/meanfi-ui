export interface OtpTxParams {
    wallet: string;
    beneficiary: string;
    associatedToken: string;
    amount: string;
    startUtc: Date;
    recipientNote: string;
}
