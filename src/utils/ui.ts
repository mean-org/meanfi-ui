import { PaymentRateType, PaymentStartPlan, TimesheetRequirementOption } from "../models/enums";
import { TokenInfo } from "./tokens";
import { formatAmount } from "./utils";

export class PaymentRateTypeOption {
    key: number;
    value: PaymentRateType;
    text: string;

    constructor(
        public _key: number,
        public _value: PaymentRateType,
        public _text: string
    ) {
        this.key = _key;
        this.value = _value;
        this.text = _text;
    }
}

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

export function timeConvert(n: number, decimals = 0, abbr = false): string {
    const num = n;
    const hours = (num / 60);
    const rhours = Math.floor(hours);
    const minutes = (hours - rhours) * 60;
    const rminutes = Math.round(minutes);
    const rdays = Math.round(rhours / 24);
    let returnString = '';
    if (num === 1) {
        returnString = `${num} minute.`;
    } else if (num === 60) {
        returnString = '1 hour.';
    } else if (num > 60) {
        returnString = `${formatAmount(num, decimals, abbr)} minutes`;
        if (rdays > 1) {
            returnString += `. ~${rdays} days.`;
        } else {
            returnString = ` = ${formatAmount(rhours, decimals, abbr)} hour(s) and ${rminutes} minutes.`;
        }
    } else {
        returnString = `${rminutes} minutes.`;
    }
    return returnString;
}

export const getPaymentStartPlanOptionLabel = (val: PaymentStartPlan): string => {
    if (val === PaymentStartPlan.Now) {
        return 'Now';
    } else {
        return 'On a given date'
    }
}

export const getPaymentRateOptionLabel = (val: PaymentRateType): string => {
    let result = '';
    switch (val) {
        case PaymentRateType.PerHour:
            result = 'per hour';
            break;
        case PaymentRateType.PerDay:
            result = 'per day';
            break;
        case PaymentRateType.PerWeek:
            result = 'per week';
            break;
        case PaymentRateType.PerMonth:
            result = 'per month';
            break;
        case PaymentRateType.PerYear:
            result = 'per year';
            break;
        // case PaymentRateType.Other:
        default:
            // result = 'Other (defined in minutes)';
            break;
    }
    return result;
}

export function getOptionsFromEnum(value: any): PaymentRateTypeOption[] {
    let index = 0;
    const options: PaymentRateTypeOption[] = [];
    for (const enumMember in value) {
        const mappedValue = parseInt(enumMember, 10);
        if (!isNaN(mappedValue)) {
            const item = new PaymentRateTypeOption(
                index,
                mappedValue,
                getPaymentRateOptionLabel(mappedValue)
            );
            options.push(item);
        }
        index++;
    }
    return options;
}

// In minutes for UI kindness
export const getPaymentRateIntervalByRateType = (rateType: PaymentRateType): string => {
    switch (rateType) {
        case PaymentRateType.PerHour:
            return '60';
        case PaymentRateType.PerDay:
            return '1440';
        case PaymentRateType.PerWeek:
            return '10080';
        case PaymentRateType.PerMonth:
            return '43800';
        case PaymentRateType.PerYear:
            return '525600';
        // case PaymentRateType.Other:
        default:
            return '1';
    }
}

export const getAmountWithTokenSymbol = (
    amount: any,
    token: TokenInfo,
    decimals = 2
): string => {
    if (!amount || !token) { return '--'; }
    const converted = amount.toString();
    const parsed = parseFloat(converted);
    return `${formatAmount(parsed, decimals)} ${token.symbol}`;
}

export const getTimesheetRequirementOptionLabel = (val: TimesheetRequirementOption): string => {
    let result = '';
    switch (val) {
        case TimesheetRequirementOption.NotRequired:
            result = 'Not required (streams 24/7)';
            break;
        case TimesheetRequirementOption.SubmitTimesheets:
            result = 'Submit timesheets';
            break;
        case TimesheetRequirementOption.ClockinClockout:
            result = 'Clock-in / Clock-out';
            break;
        default:
            break;
    }
    return result;
}
