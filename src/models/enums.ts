export enum PaymentStartPlan {
    Now = 0,
    Schedle = 1
}

export enum PaymentScheme {
    OneTimePayment = 0,
    RepeatingPayment = 1
}

export enum PaymentRateType {
    PerHour = 3600,
    PerDay = 86400,
    PerWeek = 604800,
    PerMonth = 2629750,
    PerYear = 31557000,
    Other = 60
}

// per hour
// per day
// per week
// per month
// per year
// Other (defined in seconds)
