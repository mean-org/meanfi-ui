export interface OtpTxParams {
    wallet: string;
    beneficiary: string;
    associatedToken: string;
    amount: string;
    startUtc: Date;
    recipientNote: string;
}

export interface TreasuryWithdraw {
    title: string;
    payer: string;
    destination: string;
    treasury: string;
    amount: string;
}
