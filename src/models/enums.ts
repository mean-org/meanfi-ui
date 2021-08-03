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
    TransactionStart = 1,
    TransactionStartFailure = 2,
    InitTransaction = 3,
    InitTransactionSuccess = 4,
    InitTransactionFailure = 5,
    SignTransaction = 6,
    SignTransactionSuccess = 7,
    SignTransactionFailure = 8,
    SendTransaction = 9,
    SendTransactionSuccess = 10,
    SendTransactionFailure = 11,
    ConfirmTransaction = 12,
    ConfirmTransactionSuccess = 13,
    ConfirmTransactionFailure = 14,
    TransactionFinished = 15
}

export enum Operations {
    Transfer = 0,
    CreateStream = 1,
    FundStream = 2,
    CloseStream = 3,
    Withdraw = 4,
    ClaimFunds = 5
}
