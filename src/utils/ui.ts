import bs58 from "bs58";
import moment from "moment";
import { TransactionFees } from "@mean-dao/money-streaming/lib/types";
import { TransactionStatusInfo } from "../contexts/appstate";
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from "../models/enums";
import { environment } from "../environments/environment";
import { SIMPLE_DATE_FORMAT, SIMPLE_DATE_TIME_FORMAT, VERBOSE_DATE_FORMAT, VERBOSE_DATE_TIME_FORMAT } from "../constants";
import dateFormat from "dateformat";
import { TimeData } from "../models/common-types";

export const isDev = (): boolean => {
    return environment === 'development';
}

export const isProd = (): boolean => {
    return environment === 'production';
}

const isLocalhost = Boolean(
    window.location.hostname === "localhost" ||
      // [::1] is the IPv6 localhost address.
      window.location.hostname === "[::1]" ||
      // 127.0.0.0/8 are considered localhost for IPv4.
      window.location.hostname.match(
        /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
      )
);

export const isLocal = (): boolean => {
    return isLocalhost;
}

export function consoleOut(msg: any, value: any = 'NOT_SPECIFIED', color = 'black') {
    if (!isProd() || isLocal()) {
        if (msg) {
            if (value === 'NOT_SPECIFIED') {
                console.log(`%c${msg}`, `color: ${color}`);
            } else {
                console.log(`%c${msg}`, `color: ${color}`, value);
            }
        }
    }
}

export class CoolOffPeriodTypeOption {
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

export class LockPeriodTypeOption {
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

export const friendlyDisplayDecimalPlaces = (amount: number, decimals?: number) => {
    const value = Math.abs(amount);
    if (value < 1) {
        return decimals || undefined;
    } else if (value < 1000) {
        return 4;
    } else if (value >= 1000 && value < 100000) {
        return 3;
    } else {
        return 2;
    }
};

export const twoDigits = (num: number) => String(num).padStart(2, '0')

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
}

export function getTransactionStatusForLogs(status: TransactionStatus): string {
    switch (status) {
        case TransactionStatus.WalletNotFound:
            return 'Wallet not found';
        case TransactionStatus.TransactionStart:
            return 'Collecting transaction data';
        case TransactionStatus.TransactionStarted:
            return 'Transaction started';
        case TransactionStatus.TransactionStartFailure:
            return 'Cannot start transaction';
        case TransactionStatus.InitTransaction:
            return 'Init transaction';
        case TransactionStatus.InitTransactionSuccess:
            return 'Transaction successfully initialized';
        case TransactionStatus.InitTransactionFailure:
            return 'Could not init transaction';
        case TransactionStatus.SignTransaction:
            return 'Waiting for wallet approval';
        case TransactionStatus.SignTransactionSuccess:
            return 'Transaction signed by the wallet';
        case TransactionStatus.SignTransactionFailure:
            return 'Transaction rejected';
        case TransactionStatus.SendTransaction:
            return 'Sending transaction';
        case TransactionStatus.SendTransactionSuccess:
            return 'Transaction sent successfully';
        case TransactionStatus.SendTransactionFailure:
            return 'Failure submitting transaction';
        case TransactionStatus.ConfirmTransaction:
            return 'Confirming transaction';
        case TransactionStatus.ConfirmTransactionSuccess:
            return 'Confirm transaction succeeded';
        case TransactionStatus.ConfirmTransactionFailure:
            return 'Confirm transaction failed';
        case TransactionStatus.TransactionFinished:
            return 'Transaction finished';
        case TransactionStatus.SendTransactionFailureByMinimumAmount:
            return 'Send transaction failure. Minimum amount required';
        case TransactionStatus.CreateRecurringBuySchedule:
            return 'Create recurring exchange schedule';
        case TransactionStatus.CreateRecurringBuyScheduleSuccess:
            return 'Recurring exchange created successfully';
        case TransactionStatus.CreateRecurringBuyScheduleFailure:
            return 'Could not create the recurring exchange';
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

export function getRemainingDays(targetDate?: string): number {
    const date = new Date();
    const time = new Date(date.getTime());
    const toDate = targetDate ? new Date(targetDate) : null;
    if (toDate) {
        time.setMonth(toDate.getMonth());
    } else {
        time.setMonth(date.getMonth() + 1);
    }
    time.setDate(0);
    return time.getDate() > date.getDate() ? time.getDate() - date.getDate() : 0;
}

export function msToTime(ms: number) {
    const seconds = (ms / 1000).toFixed(1);
    const minutes = (ms / (1000 * 60)).toFixed(1);
    const hours = (ms / (1000 * 60 * 60)).toFixed(1);
    const days = (ms / (1000 * 60 * 60 * 24)).toFixed(1);
    if (+seconds < 60) return seconds + " Sec";
    else if (+minutes < 60) return minutes + " Min";
    else if (+hours < 24) return hours + " Hrs";
    else return days + " Days"
}

export function getTimeRemaining(endtime: string): TimeData {
    const total = Date.parse(endtime) - Date.now();
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return {
        total,
        days,
        hours,
        minutes,
        seconds
    };
}

export function getTimeEllapsed(endtime: string): TimeData {
    const total = Date.now() - Date.parse(endtime);
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return {
        total,
        days,
        hours,
        minutes,
        seconds
    };
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

export const getLockPeriodOptionLabel = (val: PaymentRateType, trans?: any): string => {
    let result = '';
    switch (val) {
        case PaymentRateType.PerMinute:
            result = trans ? trans('treasuries.create-treasury.lock-period.minutes') : 'minutes';
            break;
        case PaymentRateType.PerHour:
            result = trans ? trans('treasuries.create-treasury.lock-period.hours') : 'hours';
            break;
        case PaymentRateType.PerDay:
            result = trans ? trans('treasuries.create-treasury.lock-period.days') : 'days';
            break;
        case PaymentRateType.PerWeek:
            result = trans ? trans('treasuries.create-treasury.lock-period.weeks') : 'weeks';
            break;
        case PaymentRateType.PerMonth:
            result = trans ? trans('treasuries.create-treasury.lock-period.months') : 'months';
            break;
        case PaymentRateType.PerYear:
            result = trans ? trans('treasuries.create-treasury.lock-period.years') : 'years';
            break;
        default:
            break;
    }
    return result;
}

export const getCoolOffPeriodOptionLabel = (val: PaymentRateType, trans?: any): string => {
    let result = '';
    switch (val) {
        case PaymentRateType.PerMinute:
            result = trans ? trans('treasuries.create-treasury.lock-period.minutes') : 'minutes';
            break;
        case PaymentRateType.PerHour:
            result = trans ? trans('treasuries.create-treasury.lock-period.hours') : 'hours';
            break;
        case PaymentRateType.PerDay:
            result = trans ? trans('treasuries.create-treasury.lock-period.days') : 'days';
            break;
        case PaymentRateType.PerWeek:
            result = trans ? trans('treasuries.create-treasury.lock-period.weeks') : 'weeks';
            break;
        default:
            break;
    }
    return result;
}

export const getLockPeriodOptionLabelByAmount = (val: PaymentRateType, periodAmount: number, trans?: any): string => {
    let result = '';
    switch (val) {
        case PaymentRateType.PerMinute:
            result = trans
                ? periodAmount === 1
                    ? trans('general.minute')
                    : trans('general.minutes')
                : periodAmount === 1
                    ? 'minute'
                    : 'minutes';
            break;
        case PaymentRateType.PerHour:
            result = trans
                ? periodAmount === 1
                    ? trans('general.hour')
                    : trans('general.hours')
                : periodAmount === 1
                    ? 'hour'
                    : 'hours';
            break;
        case PaymentRateType.PerDay:
            result = trans
                ? periodAmount === 1
                    ? trans('general.day')
                    : trans('general.days')
                : periodAmount === 1
                    ? 'day'
                    : 'days';

            break;
        case PaymentRateType.PerWeek:
            result = trans
                ? periodAmount === 1
                    ? trans('general.week')
                    : trans('general.weeks')
                : periodAmount === 1
                    ? 'week'
                    : 'weeks';

            break;
        case PaymentRateType.PerMonth:
            result = trans
                ? periodAmount === 1
                    ? trans('general.month')
                    : trans('general.months')
                : periodAmount === 1
                    ? 'month'
                    : 'months';
            break;
        case PaymentRateType.PerYear:
            result = trans
                ? periodAmount === 1
                    ? trans('general.year')
                    : trans('general.years')
                : periodAmount === 1
                    ? 'year'
                    : 'years';

            break;
        default:
            break;
    }
    return result;
}

export const getTimesheetRequirementOptionLabel = (val: TimesheetRequirementOption, trans?: any): string => {
    let result = '';
    switch (val) {
        case TimesheetRequirementOption.NotRequired:
            result = trans ? trans('transactions.timesheet-requirement.not-required') : 'Not required (streams 24/7)';
            break;
        case TimesheetRequirementOption.SubmitTimesheets:
            result = trans ? trans('transactions.timesheet-requirement.submit-timesheets') : 'Submit timesheets';
            break;
        case TimesheetRequirementOption.ClockinClockout:
            result = trans ? trans('transactions.timesheet-requirement.clock-in-out') : 'Clock-in / Clock-out';
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

export const getPaymentIntervalFromSeconds = (value: number): PaymentRateType => {
    switch (value) {
        case 60:
            return PaymentRateType.PerMinute;
        case 3600:
            return PaymentRateType.PerHour;
        case 86400:
            return PaymentRateType.PerDay;
        case 604800:
            return PaymentRateType.PerWeek;
        case 2629750:
            return PaymentRateType.PerMonth;
        case 31557000:
            return PaymentRateType.PerYear;
        default:
            return PaymentRateType.PerMonth;    // Default
    }
}

export const getDurationUnitFromSeconds = (value: number, trans?: any): string => {
    switch (value) {
        case 60:
            return trans ? trans('general.minute') : 'minute';
        case 3600:
            return trans ? trans('general.hour') : 'hour';
        case 86400:
            return trans ? trans('general.day') : 'day';
        case 604800:
            return trans ? trans('general.week') : 'week';
        case 2629750:
            return trans ? trans('general.month') : 'month';
        case 31557000:
            return trans ? trans('general.year') : 'year';
        default:
            return trans ? trans('general.month') : 'month';
    }
}

export const getTransactionOperationDescription = (status: TransactionStatus | undefined, trans?: any): string => {
    switch (status) {
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
        case TransactionStatus.SendTransactionFailure:
            return trans ? trans('transactions.status.tx-send-failure') : 'Failure submitting transaction';
        case TransactionStatus.CreateRecurringBuySchedule:
            return trans ? trans('transactions.status.ddca-create-tx') : 'Create scheduled recurring exchange';
        case TransactionStatus.CreateRecurringBuyScheduleSuccess:
            return trans ? trans('transactions.status.ddca-create-tx-success') : 'Recurring exchange created successfully';
        case TransactionStatus.CreateRecurringBuyScheduleFailure:
            return trans ? trans('transactions.status.ddca-create-tx-failure') : 'Could not create the recurring exchange';
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

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Get a percentual value that partialValue represents in total
export const percentual = (partialValue: number, total: number): number => {
    return (100 * partialValue) / total;
}

/**
 * Get the given percent of total
 * @param {number} percent - The percentual value to obtain from the total amount
 * @param {number} total - The total amount to calculate a given percent of
 * @returns {number} - The resulting fraction of the total
 */
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

export const getFormattedNumberToLocale = (value: any, digits = 0) => {
    const converted = parseFloat(value.toString());
    const formatted = new Intl.NumberFormat('en-US', {
        minimumSignificantDigits: 1,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(converted);
    return formatted || '';
}

export const toUsCurrency = (value: any) => {
    if (!value) { return ''; }
    const converted = parseFloat(value.toString());
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(converted);
    return formatted || '';
}

export const getShortDate = (date: string, includeTime = false, isUtc = false): string => {
    if (!date) { return ''; }

    const localDate = new Date(date);
    if (isUtc) {
        const dateWithoutOffset = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000));
        const displayDate = dateWithoutOffset.toUTCString();
        return dateFormat(
            displayDate,
            includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
        );
    } else {
        return dateFormat(
            localDate,
            includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT
        );
    }
}

export const getReadableDate = (date: string, includeTime = false, isUtc = false): string => {
    if (!date) { return ''; }

    const localDate = new Date(date);
    if (isUtc) {
        const dateWithoutOffset = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000));
        const displayDate = dateWithoutOffset.toUTCString();
        return dateFormat(
            displayDate,
            includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT
        );
    } else {
        return dateFormat(
            localDate,
            includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT
        );
    }
}

export const getlllDate = (date: any): string => {
    // Month name, day of month, year, time
    return moment(date).format("MMM D YYYY HH:mm");
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

export function disabledBeforeTomorrowDate(current: any) {
    // Can not select days before tomorrow
    return current && current < moment().add(0, 'days').endOf('day');
}

export function disabledTime(current: any) {
    // Can not select time before now
    return current && current < moment().fromNow(true);
}

export const isToday = (someDate: string): boolean => {
    if (!someDate) { return false; }
    const inputDate = new Date(someDate);
    const today = new Date();
    return inputDate.getDate() === today.getDate() &&
        inputDate.getMonth() === today.getMonth() &&
        inputDate.getFullYear() === today.getFullYear()
}

/**
 * Get timestamp in seconds from a date string
 * @param {string} date  - A parseable date string using Date.parse()
 * @returns {number} - The number of seconds for a timestamp
 */
export const toTimestamp = (date?: string): number => {
    const dt = date
        ? Date.parse(date)
        : Date.now();
    return Math.floor(dt / 1000);
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

/**
 * Should I use this format?
 * console.log(moment().endOf('day').fromNow());                // in 9 hours
 * console.log(moment("2020-04-04 11:45:26.123").fromNow());    // 6 minutes ago
 * console.log(moment().startOf('hour').fromNow());             // an hour ago
 * console.log(moment().startOf('day').fromNow());              // 15 hours ago
 * console.log(moment("20111031", "YYYYMMDD").fromNow());       // 10 years ago
 */

export const getTimeFromNow = (date: string, withoutSuffix = false): string => {
    const parsedDate = Date.parse(date);
    return moment(parsedDate).fromNow(withoutSuffix);
}

export const getTimeToNow = (date: string): string => {
    const parsedDate = Date.parse(date);
    return moment(parsedDate).toNow(true);
}

export function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60000);
}

export function addHours(date: Date, hours: number) {
    return new Date(date.setUTCHours(date.getUTCHours() + hours));
}

export const getTodayPercentualBetweenTwoDates = (starDate: string, endDate: string) => {
    const start = toTimestamp(starDate);
    const end = toTimestamp(endDate);
    const delta = Math.abs(end - start);
    const today = toTimestamp();
    const todayPartial = Math.abs(today - start);
    return percentual(todayPartial, delta);
}

export const getPercentualTsBetweenTwoDates = (starDate: string, endDate: string, percent: number) => {
    const start = toTimestamp(starDate);
    const end = toTimestamp(endDate);
    const delta = Math.abs(end - start);
    const pctTs = percentage(percent, delta);
    return start + pctTs;
}

export const getTxPercentFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (fees && fees.mspPercentFee) {
        fee = percentage(fees.mspPercentFee, inputAmount);
    }
    return fee;
}

export const getTxFeeAmount = (fees: TransactionFees, amount?: any): number => {
    let fee = 0;
    const inputAmount = amount ? parseFloat(amount) : 0;
    if (fees) {
        if (fees.mspPercentFee) {
            fee = percentage(fees.mspPercentFee, inputAmount);
        } else if (fees.mspFlatFee) {
            fee = fees.mspFlatFee ? fees.blockchainFee + fees.mspFlatFee : fees.blockchainFee;
        }
    }
    return fee;
};

export function scrollToBottom(id: string) {
    const div = document.getElementById(id);
    if (div) {
        div.scrollTop = div.scrollHeight - div.clientHeight;
    }
}


const units: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
    { unit: "year", ms: 31536000000 },
    { unit: "month", ms: 2628000000 },
    { unit: "day", ms: 86400000 },
    { unit: "hour", ms: 3600000 },
    { unit: "minute", ms: 60000 },
    { unit: "second", ms: 1000 },
];

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Get language-sensitive relative time message from Dates.
 * @param relative  - the relative dateTime, generally is in the past or future
 * @param pivot     - the dateTime of reference, generally is the current time
 */
export function relativeTimeFromDates(relative: Date | null, pivot: Date = new Date()): string {
    if (!relative) return "";
    const elapsed = relative.getTime() - pivot.getTime();
    return relativeTimeFromElapsed(elapsed);
}

/**
 * Get language-sensitive relative time message from elapsed time.
 * @param elapsed   - the elapsed time in milliseconds
 */
export function relativeTimeFromElapsed(elapsed: number): string {
    for (const { unit, ms } of units) {
        if (Math.abs(elapsed) >= ms || unit === "second") {
            const difference = elapsed / ms;
            return rtf.format(difference ? Math.round(difference) : 0, unit);
        }
    }
    return "";
}

export const getRelativeDate = (timestamp: number) => {
    const reference = new Date(timestamp);
    return relativeTimeFromDates(reference);
}


function numberFormat(value: any, dec = 0, decimalsSeparator = '.', thowsendsSeparator = ',', hideDecimalsIfZero = true) {
    if (!value) {
        return '0';
    }
    value = parseFloat(value).toFixed(~~dec);
    const parts = value.split('.');
    const fnums = parts[0];
    let decimals = '';
    if (parts[1] && (+parts[1] !== 0 || !hideDecimalsIfZero)) {
        decimals = decimalsSeparator + parts[1];
    }
    return fnums.replace(/(\d)(?=(?:\d{3})+$)/g, '$1' + thowsendsSeparator) + decimals;
}

export function kFormatter(num: number) {
    let tempNum: number;
    if (num > 999 && num < 1000000) {
        tempNum = num / 1000;
        return numberFormat(tempNum, 1) + 'k';
    }

    if (num >= 1000000) {
        tempNum = num / 1000000;
        return numberFormat(tempNum, 1) + 'M';
    }
    return numberFormat(num);
}

export function intToString(value: number, decimals: number) {
    const num = value.toString().replace(/[^0-9.]/g, '');
    if (value < 1000) {
        return num;
    }
    const si = [
      {v: 1E3, s: "k"},
      {v: 1E6, s: "M"},
      {v: 1E9, s: "B"},
      {v: 1E12, s: "T"},
      {v: 1E15, s: "P"},
      {v: 1E18, s: "E"}
      ];
    let index;
    for (index = si.length - 1; index > 0; index--) {
        if (value >= si[index].v) {
            break;
        }
    }
    return (value / si[index].v).toFixed(decimals).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, "$1") + si[index].s;
}