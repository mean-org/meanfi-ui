import { TokenInfo } from "@solana/spl-token-registry";
import bs58 from "bs58";
import moment from "moment";
import { TransactionFees } from "@mean-dao/money-streaming/lib/types";
import { TransactionStatusInfo } from "../contexts/appstate";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { formatAmount } from "./utils";

export function consoleOut(msg: any, value: any = 'NOT_SPECIFIED', color = 'black') {
    if (window.location.hostname !== 'localhost') { return; }
    if (msg) {
        if (value === 'NOT_SPECIFIED') {
            console.log(`%c${msg}`, `color: ${color}`);
        } else {
            console.log(`%c${msg}`, `color: ${color}`, value);
        }
    }
}

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

export function isValidAddress(value: any): boolean {
    if (typeof value === 'string') {
        try {
            // assume base 58 encoding by default
            const decoded = bs58.decode(value);
            if (decoded.length === 32) {
                return true;
            }
        } catch (error) {
            return false;
        }
    }
    return false;
}

export function getTransactionModalTitle(status: TransactionStatusInfo, isBusy: boolean, trans: any): string {
    let title: any;
    if (isBusy) {
        title = trans("transactions.status.modal-title-executing-transaction");
    } else {
        if (
            status.lastOperation === TransactionStatus.Iddle &&
            status.currentOperation === TransactionStatus.Iddle
        ) {
            title = null;
        } else if (
            status.currentOperation ===
            TransactionStatus.TransactionStartFailure
        ) {
            title = trans("transactions.status.modal-title-transaction-disabled");
        } else if (
            status.lastOperation ===
            TransactionStatus.TransactionFinished
        ) {
            title = trans("transactions.status.modal-title-transaction-completed");
        } else {
            title = null;
        }
    }
    return title;
};

export function getTransactionStatusForLogs (status: TransactionStatus): string {
    switch (status) {
        case TransactionStatus.TransactionStart:
            return 'Collecting transaction data';
        case TransactionStatus.InitTransaction:
            return 'Init transaction';
        case TransactionStatus.TransactionStartFailure:
            return 'Cannot start transaction';
        case TransactionStatus.InitTransactionSuccess:
            return 'Transaction successfully initialized';
        case TransactionStatus.SignTransaction:
            return 'Waiting for confirmation';
        case TransactionStatus.SendTransaction:
            return 'Sending transaction';
        case TransactionStatus.ConfirmTransaction:
            return 'Confirming transaction';
        case TransactionStatus.InitTransactionFailure:
            return 'Could not init transaction';
        case TransactionStatus.SignTransactionFailure:
            return 'Transaction rejected';
        case TransactionStatus.SignTransactionSuccess:
            return 'Transaction signed by the wallet';
        case TransactionStatus.SendTransactionFailure:
            return 'Failure submitting transaction';
        case TransactionStatus.SendTransactionSuccess:
            return 'Transaction sent successfully';
        case TransactionStatus.ConfirmTransactionFailure:
            return 'The transaction could not be confirmed';
        case TransactionStatus.TransactionFinished:
            return 'Operation completed. Transaction sent and confirmed!';
        default:
            return ''; // 'Idle';
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
        consoleOut('copyContainerInputElement could not be ', 'created/found', 'blue');
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

export const getPaymentRateOptionLabel = (val: PaymentRateType, trans?: any): string => {
    let result = '';
    switch (val) {
        case PaymentRateType.PerMinute:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-minute') : 'per minute';
            break;
        case PaymentRateType.PerHour:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-hour') : 'per hour';
            break;
        case PaymentRateType.PerDay:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-day') : 'per day';
            break;
        case PaymentRateType.PerWeek:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-week') : 'per week';
            break;
        case PaymentRateType.PerMonth:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-month') : 'per month';
            break;
        case PaymentRateType.PerYear:
            result = trans ? trans('transactions.rate-and-frequency.payment-rates.per-year') : 'per year';
            break;
        default:
            break;
    }
    return result;
}

export const getAmountWithTokenSymbol = (
    amount: any,
    token: TokenInfo,
    decimals = 2
): string => {
    if (!token) { return '--'; }
    const converted = amount ? amount.toString() : '0';
    const parsed = parseFloat(converted);
    return `${formatAmount(parsed, decimals)} ${token.symbol}`;
}

export const getTimesheetRequirementOptionLabel = (val: TimesheetRequirementOption, trans?: any): string => {
    let result = '';
    switch (val) {
        case TimesheetRequirementOption.NotRequired:
            result = trans ? trans('transactions.timeshift-requirement.not-required') : 'Not required (streams 24/7)';
            break;
        case TimesheetRequirementOption.SubmitTimesheets:
            result = trans ? trans('transactions.timeshift-requirement.submit-timesheets') : 'Submit timesheets';
            break;
        case TimesheetRequirementOption.ClockinClockout:
            result = trans ? trans('transactions.timeshift-requirement.clock-in-out') : 'Clock-in / Clock-out';
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

export const getTransactionOperationDescription = (status: TransactionStatusInfo, trans?: any): string => {
    switch (status.currentOperation) {
        case TransactionStatus.TransactionStart:
            return trans ? trans('transactions.status.tx-start') : 'Collecting data';
        case TransactionStatus.InitTransaction:
            return trans ? trans('transactions.status.tx-init') : 'Init transaction';
        case TransactionStatus.SignTransaction:
            return trans ? trans('transactions.status.tx-sign') : 'Waiting for confirmation';
        case TransactionStatus.SendTransaction:
            return trans ? trans('transactions.status.tx-send') : 'Sending transaction';
        case TransactionStatus.ConfirmTransaction:
            return trans ? trans('transactions.status.tx-confirm') : 'Confirming transaction';
        case TransactionStatus.InitTransactionFailure:
            return trans ? trans('transactions.status.tx-init-failure') : 'Could not init transaction';
        case TransactionStatus.SignTransactionFailure:
            return trans ? trans('transactions.status.tx-rejected') : 'Transaction rejected';
        case TransactionStatus.SendTransactionFailure :
            return trans ? trans('transactions.status.tx-send-failure') : 'Failure submitting transaction';
        case TransactionStatus.ConfirmTransactionFailure:
            return trans ? trans('transactions.status.tx-confirm-failure') : 'The transaction could not be confirmed';
        case TransactionStatus.TransactionFinished:
            return trans ? trans('transactions.status.tx-completed') : 'Operation completed';
        default:
            return ''; // trans ? trans('transactions.status.tx-idle') : 'Idle';
    }
}

export const getIntervalFromSeconds = (seconds: number, slash = false, trans?: any): string => {
    switch (seconds) {
        case 60:
            return trans
                    ? slash ? ` / ${trans('general.minute')}` : trans('transactions.rate-and-frequency.payment-rates.per-minute')
                    : slash ? ' / minute' : 'per minute';
        case 3600:
            return trans
                    ? slash ? ` / ${trans('general.hour')}` : trans('transactions.rate-and-frequency.payment-rates.per-hour')
                    : slash ? ' / hour' : 'per hour';
        case 86400:
            return trans
                    ? slash ? ` / ${trans('general.day')}` : trans('transactions.rate-and-frequency.payment-rates.per-day')
                    : slash ? ' / day' : 'per day';
        case 604800:
            return trans
                    ? slash ? ` / ${trans('general.week')}` : trans('transactions.rate-and-frequency.payment-rates.per-week')
                    : slash ? ' / week' : 'per week';
        case 2629750:
            return trans
                    ? slash ? ` / ${trans('general.month')}` : trans('transactions.rate-and-frequency.payment-rates.per-month')
                    : slash ? ' / month' : 'per month';
        case 31557000:
            return trans
                    ? slash ? ` / ${trans('general.year')}` : trans('transactions.rate-and-frequency.payment-rates.per-year')
                    : slash ? ' / year' : 'per year';
        default:
            return '';
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

export const getFairPercentForInterval = (frequency: PaymentRateType): number => {
    let value = 10;
    switch (frequency) {
        case PaymentRateType.PerMinute:
            value = 500;
            break;
        case PaymentRateType.PerHour:
            value = 100;
            break;
        case PaymentRateType.PerDay:
            value = 50;
            break;
        default:
            break;
    }
    return value / 100;
}

export const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Get a percentual value that partialValue represents in total
export const percentual = (partialValue: number, total: number): number => {
    return (100 * partialValue) / total;
}

// Get the given percent of total
export const percentage = (percent: number, total: number): number => {
    return percent * total / 100;
}

export const maxTrailingZeroes = (original: any, zeroes = 2): string => {
    let result = '';
    let trailingZeroes = 0;
    const trailingChar = '0';
    const numericString = original.toString();
    const splitted = numericString.split('.');
    const dec = splitted[1];
    if (splitted.length === 1) {
        result = original;
    } else {
        // Count zeroes from the end
        if (dec && dec.length > zeroes) {
            for (let i = numericString.length - 1; i >= 0; i--) {
                if (numericString[i] !== '0') {
                    break;
                }
                trailingZeroes++;
            }
        }
        // If more zeroes than the wanted amount
        if (trailingZeroes > zeroes) {
            const plainNumber = parseFloat(numericString);
            result = plainNumber.toString();
            // Add the needed amount of zeroes after parsing
            if (result.indexOf('.') === -1) {
                result += '.' + trailingChar.repeat(zeroes);
            }
        } else {
            result = original; // Otherwise return the numeric string intact
        }
    }

    return result;
}

export const getFormattedNumberToLocale = (value: any) => {
    const converted = parseFloat(value.toString());
    const formatted = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(converted);
    return formatted || '';
}

export const getOrdinalDay = (date: Date): string => {
    const dayOfMonth = date.getDate();
    return moment.localeData().ordinal(dayOfMonth);
}

export const getDayOfWeek = (date: Date, locale = 'en-US'): string => {
    return date.toLocaleDateString(locale, { weekday: 'long' });
}

export function disabledDate(current: any) {
    // Can not select days before today and today
    return current && current < moment().subtract(1, 'days').endOf('day');
}

export const isToday = (someDate: string): boolean => {
    if (!someDate) { return false; }
    const inputDate = new Date(someDate);
    const today = new Date();
    return inputDate.getDate() === today.getDate() &&
      inputDate.getMonth() === today.getMonth() &&
      inputDate.getFullYear() === today.getFullYear()
}

export function displayTimestamp(
    unixTimestamp: number,
    shortTimeZoneName = false
): string {
    const expireDate = new Date(unixTimestamp);
    const dateString = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(expireDate);
    const timeString = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
      timeZoneName: shortTimeZoneName ? "short" : "long",
    }).format(expireDate);

    return `${dateString} at ${timeString}`;
}

export const getTxPercentFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    let inputAmount = amount ? parseFloat(amount) : 0;
    if (fees && fees.mspPercentFee) {
        fee = percentage(fees.mspPercentFee, inputAmount);
    }
    return fee;
}

export const getTxFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    let inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
      if (fees.mspPercentFee) {
        fee = percentage(fees.mspPercentFee, inputAmount);
      } else if (fees.mspFlatFee) {
        fee = fees.mspFlatFee ? fees.blockchainFee + fees.mspFlatFee : fees.blockchainFee;
      }
    }
    return fee;
};
