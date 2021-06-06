import { TransactionStatusInfo } from "../contexts/appstate";
import { PaymentRateType, PaymentStartPlan, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
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
        case PaymentRateType.PerMinute:
            result = 'per minute';
            break;
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
        default:
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
        case PaymentRateType.PerMinute:
            return '1';
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

export const getRateIntervalInSeconds = (frequency: PaymentRateType): number => {
    let value = 60;
    switch (frequency) {
        case PaymentRateType.PerMinute:
            value = 60;
            break;
        case PaymentRateType.PerHour:
            value = 3600;
            break;
        case PaymentRateType.PerDay:
            value = 86400;
            break;
        case PaymentRateType.PerWeek:
            value = 604800;
            break;
        case PaymentRateType.PerMonth:
            value = 2629750;
            break;
        case PaymentRateType.PerYear:
            value = 31557000;
            break;
        default:
            break;
    }
    return value;
}

export const getTransactionOperationDescription = (status: TransactionStatusInfo): string => {
    switch (status.currentOperation) {
        case TransactionStatus.TransactionStart:
            return 'Init transaction';
        case TransactionStatus.CreateTransaction:
            return 'Create transaction';
        case TransactionStatus.SignTransaction:
            return 'Waiting for confirmation';
        case TransactionStatus.SendTransaction:
            return 'Sending transaction';
        case TransactionStatus.ConfirmTransaction:
            return 'Confirming transaction';
        case TransactionStatus.CreateTransactionFailure:
            return 'Could not create transaction';
        case TransactionStatus.SignTransactionFailure:
            return 'Transaction rejected';
        case TransactionStatus.SendTransactionFailure:
            return 'Failure submitting transaction';
        case TransactionStatus.ConfirmTransactionFailure:
            return 'The transaction could not be confirmed';
        case TransactionStatus.TransactionFinished:
            return 'Operation completed';
        default:
            return 'Idle';
    }
}

export const getIntervalFromSeconds = (seconds: number, slash = false): string => {
    switch (seconds) {
        case 60:
            return slash ? '/ minute' : 'per minute';
        case 3600:
            return slash ? '/ hour' : 'per hour';
        case 86400:
            return slash ? '/ day' : 'per day';
        case 604800:
            return slash ? '/ week' : 'per week';
        case 2629750:
            return slash ? '/ month' : 'per month';
        case 31557000:
            return slash ? '/ year' : 'per year';
        default:
            return '--';
    }
}

export function convertLocalDateToUTCIgnoringTimezone(date: Date) {
    const timestamp = Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds(),
    );

    return new Date(timestamp);
}
