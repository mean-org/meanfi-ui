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
    PerMinute = 0,  // 60
    PerHour = 1,    // 3600
    PerDay = 2,     // 86400
    PerWeek = 3,    // 604800
    PerMonth = 4,   // 2629750
    PerYear = 5,    // 31557000
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
}

export enum OperationType {
    Transfer = 0,
    Create = 1,
    AddFunds = 2,
    Withdraw = 3,
    Close = 4,
    Pause = 5,
    Resume = 6
}

export enum TreasuryType {
    Open = 0,
    Locked = 1
}

export enum AllocationType {
    All = 0,
    Specific = 1,
    None = 2
}
