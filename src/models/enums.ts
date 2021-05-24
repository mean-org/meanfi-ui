export enum PaymentStartPlan {
    Now = 0,
    Schedle = 1
}

export enum PaymentScheme {
    OneTimePayment = 0,
    RepeatingPayment = 1
}

export enum PaymentRateType {
    PerHour = 0,    // 3600s
    PerDay = 1,     // 86400s
    PerWeek = 2,    // 604800s,
    PerMonth = 3,   // 2629750s,
                    // 15552000s
    PerYear = 4,    // 31557000s,
    Other = 5,      // >= 60 seconds
}
