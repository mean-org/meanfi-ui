import type { TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { BN } from '@project-serum/anchor';
import type { DatePicker, GetProps } from 'antd';
import BigNumber from 'bignumber.js';
import bs58 from 'bs58';
import dateFormat from 'dateformat';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime'
import type { TFunction } from 'i18next';
import getRuntimeEnv from 'src/environments/getRuntimeEnv';
import { customLogger } from 'src/main';
import {
  BIGNUMBER_FORMAT,
  SIMPLE_DATE_FORMAT,
  SIMPLE_DATE_TIME_FORMAT,
  VERBOSE_DATE_FORMAT,
  VERBOSE_DATE_TIME_FORMAT,
} from '../app-constants';
import type { TransactionStatusInfo } from '../contexts/appstate';
import type { TimeData } from '../models/common-types';
import { PaymentRateType, TimesheetRequirementOption, TransactionStatus } from '../models/enums';
import detectNetworkByAddress from './detectNetworkByAddress';

dayjs.extend(relativeTime);

type RangePickerProps = GetProps<typeof DatePicker.RangePicker>;

export const isDev = (): boolean => {
  const env = getRuntimeEnv().MODE;
  return env === 'development';
};

export const isProd = (): boolean => {
  const env = getRuntimeEnv().MODE;
  return env === 'production';
};

const isLocalhost = Boolean(
  window.location.hostname === 'localhost' ||
    // [::1] is the IPv6 localhost address.
    window.location.hostname === '[::1]' ||
    // 127.0.0.0/8 are considered localhost for IPv4.
    RegExp(/^127(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/).exec(window.location.hostname),
);

export const isLocal = (): boolean => {
  return isLocalhost;
};

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export function consoleOut(msg: any, value?: any, color = 'black') {
  if (msg) {
    customLogger.print(msg, value, color);
  }
}

export const friendlyDisplayDecimalPlaces = (amount: number | string, decimals?: number) => {
  if (!decimals) {
    return undefined;
  }

  if (typeof amount === 'string') {
    const baseConvert = new BigNumber(10 ** decimals);
    const bigNumberAmount = new BigNumber(amount);
    const value = bigNumberAmount.div(baseConvert);
    if (value.isLessThan(10)) {
      return decimals || undefined;
    }
    if (value.isGreaterThanOrEqualTo(10) && value.isLessThan(1000)) {
      return 4;
    }
    if (value.isGreaterThanOrEqualTo(1000) && value.isLessThan(100000)) {
      return 3;
    }

    return 2;
  }

  const value = Math.abs(amount);
  if (value < 10) {
    return decimals || undefined;
  }
  if (value >= 10 && value < 1000) {
    return 4;
  }
  if (value >= 1000 && value < 100000) {
    return 3;
  }

  return 2;
};

export const twoDigits = (num: number) => String(num).padStart(2, '0');

export const getNumberCharLength = (number: number) => {
  return Math.round(number).toString().length;
};

export function isValidAddress(value: unknown): boolean {
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

export function isEvmValidAddress(value: unknown): boolean {
  if (typeof value === 'string') {
    const network = detectNetworkByAddress(value);

    return network === 'ETH';
  }

  return false;
}

export function getTransactionModalTitle(status: TransactionStatusInfo, isBusy: boolean, trans: TFunction) {
  if (isBusy) {
    return trans('transactions.status.modal-title-executing-transaction');
  }
  if (status.lastOperation === TransactionStatus.Idle && status.currentOperation === TransactionStatus.Idle) {
    return null;
  }
  if (status.currentOperation === TransactionStatus.TransactionStartFailure) {
    return trans('transactions.status.modal-title-transaction-disabled');
  }
  if (status.lastOperation === TransactionStatus.TransactionFinished) {
    return trans('transactions.status.modal-title-transaction-completed');
  }

  return null;
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
    default:
      return ''; // 'Idle';
  }
}

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export const copyText = (val: any): boolean => {
  if (!val) {
    return false;
  }
  return !!copyToClipboard(val)
    .then(result => result)
    .catch(() => false);
};

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export const copyToClipboard = async (val: any) => {
  if (!val) {
    return false;
  }

  const copyValue = val.toString() as string;
  const text = copyValue.trim();

  if (!text) {
    console.log('Text to copy is empty!');
    return false;
  }

  try {
    if (!navigator.clipboard) {
      throw new Error("Browser don't have support for native clipboard.");
    }

    await navigator.clipboard.writeText(text);
    console.log(`${text} copied!!`);
    return true;
    // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  } catch (error: any) {
    console.error(error.toString());
    return false;
  }
};

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
  if (+seconds < 60) return seconds + ' Sec';
  if (+minutes < 60) return minutes + ' Min';
  if (+hours < 24) return hours + ' Hrs';
  return days + ' Days';
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
    seconds,
  };
}

export function getTimeEllapsed(initialTime: string): TimeData {
  const total = Date.now() - Date.parse(initialTime);
  const seconds = Math.floor((total / 1000) % 60);
  const minutes = Math.floor((total / 1000 / 60) % 60);
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));

  return {
    total,
    days,
    hours,
    minutes,
    seconds,
  };
}

export const getPaymentRateOptionLabel = (val: PaymentRateType, trans?: TFunction): string => {
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
};

export const getLockPeriodOptionLabel = (val: PaymentRateType, trans?: TFunction): string => {
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
};

export const getCoolOffPeriodOptionLabel = (val: PaymentRateType, trans?: TFunction): string => {
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
};

export const getLockPeriodOptionLabelByAmount = (
  val: PaymentRateType,
  periodAmount: number,
  trans?: TFunction,
): string => {
  let result = '';
  switch (val) {
    case PaymentRateType.PerMinute:
      if (trans) {
        result = periodAmount === 1 ? trans('general.minute') : trans('general.minutes');
      } else {
        result = periodAmount === 1 ? 'minute' : 'minutes';
      }
      break;
    case PaymentRateType.PerHour:
      if (trans) {
        result = periodAmount === 1 ? trans('general.hour') : trans('general.hours');
      } else {
        result = periodAmount === 1 ? 'hour' : 'hours';
      }
      break;
    case PaymentRateType.PerDay:
      if (trans) {
        result = periodAmount === 1 ? trans('general.day') : trans('general.days');
      } else {
        result = periodAmount === 1 ? 'day' : 'days';
      }
      break;
    case PaymentRateType.PerWeek:
      if (trans) {
        result = periodAmount === 1 ? trans('general.week') : trans('general.weeks');
      } else {
        result = periodAmount === 1 ? 'week' : 'weeks';
      }
      break;
    case PaymentRateType.PerMonth:
      if (trans) {
        result = periodAmount === 1 ? trans('general.month') : trans('general.months');
      } else {
        result = periodAmount === 1 ? 'month' : 'months';
      }
      break;
    case PaymentRateType.PerYear:
      if (trans) {
        result = periodAmount === 1 ? trans('general.year') : trans('general.years');
      } else {
        result = periodAmount === 1 ? 'year' : 'years';
      }
      break;
    default:
      break;
  }
  return result;
};

export const getTimesheetRequirementOptionLabel = (val: TimesheetRequirementOption, trans?: TFunction): string => {
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
};

export const getRateIntervalInSeconds = (frequency: PaymentRateType): number => {
  let value = 60;
  switch (frequency) {
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
};

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
      return PaymentRateType.PerMonth; // Default
  }
};

export const getDurationUnitFromSeconds = (value: number, trans?: TFunction): string => {
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
};

export const getTransactionOperationDescription = (
  status: TransactionStatus | undefined,
  trans?: TFunction,
): string => {
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
    case TransactionStatus.ConfirmTransactionFailure:
      return trans ? trans('transactions.status.tx-confirm-failure') : 'The transaction could not be confirmed';
    case TransactionStatus.TransactionFinished:
      return trans ? trans('transactions.status.tx-completed') : 'Operation completed';
    default:
      return '';
  }
};
export const getIntervalFromSeconds = (seconds: number, slash = false, trans?: TFunction): string => {
  switch (seconds) {
    case 60:
      if (trans) {
        return slash
          ? ` / ${trans('general.minute')}`
          : trans('transactions.rate-and-frequency.payment-rates.per-minute');
      }
      return slash ? ' / minute' : 'per minute';
    case 3600:
      if (trans) {
        return slash ? ` / ${trans('general.hour')}` : trans('transactions.rate-and-frequency.payment-rates.per-hour');
      }
      return slash ? ' / hour' : 'per hour';
    case 86400:
      if (trans) {
        return slash ? ` / ${trans('general.day')}` : trans('transactions.rate-and-frequency.payment-rates.per-day');
      }
      return slash ? ' / day' : 'per day';
    case 604800:
      if (trans) {
        return slash ? ` / ${trans('general.week')}` : trans('transactions.rate-and-frequency.payment-rates.per-week');
      }
      return slash ? ' / week' : 'per week';
    case 2629750:
      if (trans) {
        return slash
          ? ` / ${trans('general.month')}`
          : trans('transactions.rate-and-frequency.payment-rates.per-month');
      }
      return slash ? ' / month' : 'per month';
    case 31557000:
      if (trans) {
        return slash ? ` / ${trans('general.year')}` : trans('transactions.rate-and-frequency.payment-rates.per-year');
      }
      return slash ? ' / year' : 'per year';
    default:
      return '';
  }
};

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
};

export const percentualBn = (partialValue: string | BN, total: string | BN, asNumber = false): number | BN => {
  let partialBn: BigNumber;
  let totalBn: BigNumber;
  if (!partialValue) {
    return asNumber ? new BN(partialValue).toNumber() : new BN(partialValue);
  }
  if (typeof partialValue === 'string') {
    partialBn = new BigNumber(partialValue);
  } else {
    partialBn = new BigNumber(partialValue.toString());
  }
  if (typeof total === 'string') {
    totalBn = new BigNumber(total);
  } else {
    totalBn = new BigNumber(total.toString());
  }
  if (asNumber) {
    return partialBn.multipliedBy(100).dividedBy(totalBn).toNumber();
  }
  return new BN(partialBn.multipliedBy(100).dividedBy(totalBn).toString());
};

/**
 * Get the given percent of total
 * @param {number} percent - The percentual value to obtain from the total amount
 * @param {number} total - The total amount to calculate a given percent of
 * @returns {number} - The resulting fraction of the total
 */
export const percentage = (percent: number, total: number): number => {
  return (percent * total) / 100;
};

export const percentageBn = (percent: number, total: string | BN, asNumber = false): number | BN => {
  if (!percent) {
    return asNumber ? 0 : new BN(0);
  }
  let totalBn: BigNumber;
  if (typeof total === 'string') {
    totalBn = new BigNumber(total);
  } else {
    totalBn = new BigNumber(total.toString());
  }
  if (asNumber) {
    return totalBn.multipliedBy(percent).dividedBy(100).toNumber();
  }
  return new BN(totalBn.multipliedBy(percent).dividedToIntegerBy(100).toString());
};

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export const toUsCurrency = (value: any) => {
  if (!value) {
    return '$0.00';
  }
  const converted = Number.parseFloat(value.toString());
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(converted);
  return formatted || '';
};

export const getShortDate = (date: string, includeTime = false, isUtc = false): string => {
  if (!date) {
    return '';
  }

  const localDate = new Date(date);
  if (isUtc) {
    const dateWithoutOffset = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
    const displayDate = dateWithoutOffset.toUTCString();
    return dateFormat(displayDate, includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT);
  }

  return dateFormat(localDate, includeTime ? SIMPLE_DATE_TIME_FORMAT : SIMPLE_DATE_FORMAT);
};

export const getReadableDate = (date: string, includeTime = false, isUtc = false): string => {
  if (!date) {
    return '';
  }

  if (isUtc) {
    return dateFormat(date, includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT, true);
  }

  return dateFormat(new Date(date), includeTime ? VERBOSE_DATE_TIME_FORMAT : VERBOSE_DATE_FORMAT);
};

export const getlllDate = (date: Date | null | undefined): string => {
  if (!date) {
    return '-';
  }

  // 'lll' => Aug 16, 2018 8:02 PM
  return dayjs(date).format('lll');
};

export const getDayOfWeek = (date: Date, locale = 'en-US'): string => {
  return date.toLocaleDateString(locale, { weekday: 'long' });
};

export const todayAndPriorDatesDisabled: RangePickerProps['disabledDate'] = (current) => {
  // Can not select days before today and today
  return current && current < dayjs().endOf('day');
};

export const isToday = (someDate: string): boolean => {
  if (!someDate) {
    return false;
  }
  const inputDate = new Date(someDate);
  const today = new Date();
  return (
    inputDate.getDate() === today.getDate() &&
    inputDate.getMonth() === today.getMonth() &&
    inputDate.getFullYear() === today.getFullYear()
  );
};

/**
 * Get timestamp in seconds from a date string
 * @param {string} date  - A parseable date string using Date.parse()
 * @returns {number} - The number of seconds for a timestamp
 */
export const toTimestamp = (date?: string): number => {
  const dt = date ? Date.parse(date) : Date.now();
  return Math.floor(dt / 1000);
};

export function displayTimestamp(unixTimestamp: number, shortTimeZoneName = false): string {
  const expireDate = new Date(unixTimestamp);
  const dateString = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(expireDate);
  const timeString = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
    timeZoneName: shortTimeZoneName ? 'short' : 'long',
  }).format(expireDate);

  return `${dateString} at ${timeString}`;
}

export const getTimeToNow = (date: string): string => {
  return dayjs(date).toNow();
};

export function addMinutes(date: Date, minutes: number) {
  const addedMinutesInTs = minutes * 60000;
  return new Date(date.getTime() + addedMinutesInTs);
}

export function addHours(date: Date, hours: number) {
  return new Date(date.setUTCHours(date.getUTCHours() + hours));
}

export const getTodayPercentualBetweenTwoDates = (starDate: string, endDate: string) => {
  const start = toTimestamp(starDate);
  const end = toTimestamp(endDate);
  const delta = Math.abs(end - start);
  const today = toTimestamp();
  const todayPartial = today - start < 0 ? 0 : today - start;
  return todayPartial ? percentual(todayPartial, delta) : todayPartial;
};

export const getPercentualTsBetweenTwoDates = (
  starDate: string,
  endDate: string,
  percent: number,
  relative = false,
) => {
  const start = toTimestamp(starDate);
  const end = toTimestamp(endDate);
  const delta = Math.abs(end - start);
  const pctTs = percentage(percent, delta);
  return relative ? pctTs : start + pctTs;
};

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export const getTxPercentFeeAmount = (fees: TransactionFees, amount?: any): number => {
  let fee = 0;
  const inputAmount = amount ? Number.parseFloat(amount) : 0;
  if (fees?.mspPercentFee) {
    fee = percentage(fees.mspPercentFee, inputAmount);
  }
  return fee;
};

// biome-ignore lint/suspicious/noExplicitAny: Anything can go here
export const getTxFeeAmount = (fees: TransactionFees, amount?: any): number => {
  let fee = 0;
  const inputAmount = amount ? Number.parseFloat(amount) : 0;
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
  { unit: 'year', ms: 31536000000 },
  { unit: 'month', ms: 2628000000 },
  { unit: 'day', ms: 86400000 },
  { unit: 'hour', ms: 3600000 },
  { unit: 'minute', ms: 60000 },
  { unit: 'second', ms: 1000 },
];

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Get language-sensitive relative time message from Dates.
 * @param relative  - the relative dateTime, generally is in the past or future
 * @param pivot     - the dateTime of reference, generally is the current time
 */
export function relativeTimeFromDates(relative: Date | null, pivot: Date = new Date()): string {
  if (!relative) return '';
  const elapsed = relative.getTime() - pivot.getTime();
  return relativeTimeFromElapsed(elapsed);
}

/**
 * Get language-sensitive relative time message from elapsed time.
 * @param elapsed   - the elapsed time in milliseconds
 */
export function relativeTimeFromElapsed(elapsed: number): string {
  for (const { unit, ms } of units) {
    if (Math.abs(elapsed) >= ms || unit === 'second') {
      const difference = elapsed / ms;
      return rtf.format(difference ? Math.round(difference) : 0, unit);
    }
  }
  return '';
}

export const getRelativeDate = (timestamp: number) => {
  const reference = new Date(timestamp);
  return relativeTimeFromDates(reference);
};

export function stringNumberFormat(value: string, dec = 0) {
  if (!value) {
    return '0';
  }
  let fixed = '';
  const valueBn = new BigNumber(value);
  if (dec > 0) {
    BigNumber.config({
      CRYPTO: true,
      FORMAT: BIGNUMBER_FORMAT,
      DECIMAL_PLACES: dec,
    });
    fixed = valueBn.toFormat(dec);
  } else {
    BigNumber.config({
      CRYPTO: true,
      FORMAT: BIGNUMBER_FORMAT,
      DECIMAL_PLACES: 0,
    });
    fixed = valueBn.toFormat(0);
  }
  return fixed;
}

export function kFormatter(value: number, decimals = 0) {
  const num = value.toString().replace(/[^0-9.]/g, '');
  if (value < 1000) {
    return num;
  }
  const si = [
    { v: 1e3, s: 'k' },
    { v: 1e6, s: 'M' },
    { v: 1e9, s: 'B' },
    { v: 1e12, s: 'T' },
    { v: 1e15, s: 'P' },
    { v: 1e18, s: 'E' },
  ];
  let index: number;
  for (index = si.length - 1; index > 0; index--) {
    if (value >= si[index].v) {
      break;
    }
  }
  return (value / si[index].v).toFixed(decimals).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + si[index].s;
}
