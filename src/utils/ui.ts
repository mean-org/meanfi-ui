import { PaymentStartPlan } from "../models/enums";
import { formatAmount } from "./utils";

export const copyText = (val: any): boolean => {
    if (!val) { return false; }
    const selBox = document.createElement('textarea');
    selBox.style.position = 'fixed';
    selBox.id = 'copyContainerInputElement';
    selBox.style.left = '0';
    selBox.style.top = '0';
    selBox.style.opacity = '0';
    selBox.value = val.toString();
    document.body.appendChild(selBox);
    const element = document.getElementById('copyContainerInputElement') as HTMLInputElement;
    if (element) {
        element.focus();
        element.select();
        document.execCommand('copy', false);
        document.body.removeChild(selBox);
        return true;
    } else {
        console.log('copyContainerInputElement could not be ', 'created/found', 'blue');
    }
    return false;
}

export function timeConvert(n: number): string {
    const num = n;
    const hours = (num / 60);
    const rhours = Math.floor(hours);
    const minutes = (hours - rhours) * 60;
    const rminutes = Math.round(minutes);
    const rdays = Math.round(rhours / 24);
    let returnString = '';
    returnString = `${formatAmount(num, 0, true)} minutes = ${formatAmount(rhours, 0, true)} hour(s) and ${rminutes} minute(s).`;
    if (rhours > 24) {
        returnString += ` ${rdays} day(s)`;
    }
    return returnString;
}

export const getPaymentStartPlanOptionLabel = (val: PaymentStartPlan) => {
    if (val === PaymentStartPlan.Now) {
        return 'Now';
    } else {
        return 'On a given date'
    }
}

/*
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
*/
