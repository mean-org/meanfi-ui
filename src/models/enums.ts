import { SubCategory } from "@mean-dao/msp";

export enum ChainID {
    MainnetBeta = 101,
    Testnet = 102,
    Devnet = 103
}

export enum PaymentStartPlan {
    Now = 0,
    Schedle = 1
}

export enum PaymentScheme {
    OneTimePayment = 0,
    RepeatingPayment = 1
}

// In seconds for the API
export enum PaymentRateType {
    PerMinute = 1,  // 60
    PerHour = 2,    // 3600
    PerDay = 3,     // 86400
    PerWeek = 4,    // 604800
    PerMonth = 5,   // 2629750
    PerYear = 6,    // 31557000
}

export enum TimesheetRequirementOption {
    NotRequired = 0,
    SubmitTimesheets = 1,
    ClockinClockout = 2
}

export enum TransactionStatus {
    Iddle = 0,
    WalletNotFound = 1,
    TransactionStart = 2,
    TransactionStarted = 3,
    TransactionStartFailure = 4,
    InitTransaction = 5,
    InitTransactionSuccess = 6,
    InitTransactionFailure = 7,
    SignTransaction = 8,
    SignTransactionSuccess = 9,
    SignTransactionFailure = 10,
    SendTransaction = 11,
    SendTransactionSuccess = 12,
    SendTransactionFailure = 13,
    ConfirmTransaction = 14,
    ConfirmTransactionSuccess = 15,
    ConfirmTransactionFailure = 16,
    TransactionFinished = 17,
    SendTransactionFailureByMinimumAmount = 18,
    CreateRecurringBuySchedule = 19,
    CreateRecurringBuyScheduleSuccess = 20,
    CreateRecurringBuyScheduleFailure = 21,
    FeatureTemporarilyDisabled = 50
}

export enum OperationType {
    Transfer = 0,
    // Stream options
    StreamCreate = 1,
    StreamAddFunds = 2,
    StreamWithdraw = 3,
    StreamClose = 4,
    StreamPause = 5,
    StreamResume = 6,
    StreamTransferBeneficiary = 7,
    StreamCreateWithTemplate = 8,
    // Treasury options
    TreasuryCreate = 10,
    TreasuryStreamCreate = 11,
    TreasuryAddFunds = 12,
    TreasuryWithdraw = 13,
    TreasuryClose = 14,
    TreasuryRefreshBalance = 15,
    // DDCA Options
    DdcaCreate = 20,
    DdcaAddFunds = 21,
    DdcaWithdraw = 22,
    DdcaClose = 23,
    // Multisig options
    CreateMultisig = 30,
    EditMultisig = 31,
    CreateMint = 32,
    MintTokens = 33,
    TransferTokens = 34,
    SetMintAuthority = 35,
    UpgradeProgram = 36,
    UpgradeIDL = 37,
    SetMultisigAuthority = 38,
    SetAssetAuthority = 39,
    ApproveTransaction = 40,
    ExecuteTransaction = 41,
    CancelTransaction = 42,
    DeleteAsset = 43,
    CreateTransaction = 44,
    RejectTransaction = 45,
    UpdateSettings = 46,
    Custom = 49,
    // Tools
    Wrap = 50,
    Unwrap = 51,
    Swap = 52,
    CreateAsset = 37,
    CloseTokenAccount = 38,
    // Invest
    Stake = 53,
    Unstake = 54,
    Deposit = 55,
    // IDO
    IdoDeposit = 100,
    IdoWithdraw = 101,
    IdoClaim = 102,
    IdoLpClaim = 103,
    IdoCollectFunds = 104,
    // Credix
    CredixDepositFunds = 110,
    CredixWithdrawFunds = 111,
    CredixDepositTranche = 112,
    CredixWithdrawTranche = 113,
}

export enum WhitelistClaimType
{
    Solanium = 0,
    Airdrop = 1,
    IDO = 2
}

export enum EventType {
    TxConfirmSuccess = 'txConfirmed',
    TxConfirmTimeout = 'txTimedout',
}

export enum MetaInfoCtaAction {
    Send = 0,
    Buy = 1,
    Exchange = 2,
    Invest = 3,
    Deposit = 4,
    UnwrapSol = 5,
    WrapSol = 6,
    MergeAccounts = 7,
    Divider = 10,
    Refresh = 11,
    CloseAccount = 12,
    Share = 13,
    Close = 14,
    CopyAssetMintAddress = 15,
    VestingContractCreateStreamOnce = 20,
    VestingContractCreateStreamBulk = 21,
    VestingContractAddFunds = 21,
    VestingContractViewSolBalance = 22,
    VestingContractWithdrawFunds = 23,
    VestingContractRefreshAccount = 24,
    VestingContractClose = 25,
    VestingContractEditSettings = 26,
}

export type VestingContractCategory = {
    label: string;
    value: SubCategory;
}
