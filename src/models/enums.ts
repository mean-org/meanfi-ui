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
    TransactionStartFailure = 3,
    InitTransaction = 4,
    InitTransactionSuccess = 5,
    InitTransactionFailure = 6,
    SignTransaction = 7,
    SignTransactionSuccess = 8,
    SignTransactionFailure = 9,
    SendTransaction = 10,
    SendTransactionSuccess = 11,
    SendTransactionFailure = 12,
    ConfirmTransaction = 13,
    ConfirmTransactionSuccess = 14,
    ConfirmTransactionFailure = 15,
    TransactionFinished = 16,
    SendTransactionFailureByMinimumAmount = 17,
    CreateRecurringBuySchedule = 18,
    CreateRecurringBuyScheduleSuccess = 19,
    CreateRecurringBuyScheduleFailure = 20,
}

export enum Operations {
    Transfer = 0,
    CreateStream = 1,
    FundStream = 2,
    CloseStream = 3,
    Withdraw = 4,
    ClaimFunds = 5
}
