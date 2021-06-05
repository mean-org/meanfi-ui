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
    CreateTransaction = 2,
    CreateTransactionSuccess = 3,
    CreateTransactionFailure = 4,
    SignTransaction = 5,
    SignTransactionSuccess = 6,
    SignTransactionFailure = 7,
    SendTransaction = 8,
    SendTransactionSuccess = 9,
    SendTransactionFailure = 10,
    ConfirmTransaction = 11,
    ConfirmTransactionSuccess = 12,
    ConfirmTransactionFailure = 13,
    TransactionFinished = 14
}
