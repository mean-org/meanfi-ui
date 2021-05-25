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
    PerHour = 0,    // 3600
    PerDay = 1,     // 86400
    PerWeek = 2,    // 604800
    PerMonth = 3,   // 2629750
    PerYear = 4,    // 31557000
    Other = 5,      // >= 60 seconds
}
