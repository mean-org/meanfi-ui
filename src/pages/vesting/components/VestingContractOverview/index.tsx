import { StreamTemplate, Treasury, TreasuryType } from '@mean-dao/msp';
import BN from 'bn.js';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../../../contexts/appstate';
import { TimeData } from '../../../../models/common-types';
import { PaymentRateType } from '../../../../models/enums';
import { getCategoryLabelByValue } from '../../../../models/vesting';
import { getLockPeriodOptionLabel, getPaymentIntervalFromSeconds, getReadableDate, getTimeEllapsed, getTimeRemaining } from '../../../../utils/ui';
import { makeDecimal } from '../../../../utils/utils';

export const VestingContractOverview = (props: {
    vestingContract: Treasury | undefined;
    streamTemplate: StreamTemplate | undefined;
}) => {
    const {
        vestingContract,
        streamTemplate
    } = props;
    const { t } = useTranslation('common');
    const { theme } = useContext(AppStateContext);
    const [today, setToday] = useState(new Date());
    const [startRemainingTime, setStartRemainingTime] = useState('');

    // Setting from the vesting contract
    const [treasuryOption, setTreasuryOption] = useState<TreasuryType | undefined>(undefined);
    const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState(0);

    // Set template data
    useEffect(() => {
        if (vestingContract && streamTemplate) {
            setTreasuryOption(vestingContract.treasuryType);
            const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
            setCliffReleasePercentage(cliffPercent);
            setIsFeePaidByTreasurer(streamTemplate.feePayedByTreasurer);
            setPaymentStartDate(streamTemplate.startUtc as string);
            updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
            const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
            setLockPeriodFrequency(periodFrequency);
        }
    }, [
        streamTemplate,
        vestingContract,
    ]);

    useEffect(() => {

        const timeout = setTimeout(() => {
            setToday(new Date());
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }

    });

    const isStartDateFuture = useCallback((date: string): boolean => {
        const now = today.toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, [today]);

    /**
     * Should I use this format?
     * console.log(moment().endOf('day').fromNow());                // in 9 hours
     * console.log(moment("2020-04-04 11:45:26.123").fromNow());    // 6 minutes ago
     * console.log(moment().startOf('hour').fromNow());             // an hour ago
     * console.log(moment().startOf('day').fromNow());              // 15 hours ago
     * console.log(moment("20111031", "YYYYMMDD").fromNow());       // 10 years ago
     */

    useEffect(() => {

        if (paymentStartDate) {

            let timedata: TimeData;
            const remainingTime: string[] = [];

            if (isStartDateFuture(paymentStartDate)) {
                timedata = getTimeRemaining(paymentStartDate);
            } else {
                timedata = getTimeEllapsed(paymentStartDate);
            }

            if (timedata.days > 0) {
                remainingTime.push(`${timedata.days} ${timedata.days === 1 ? t('general.day') : t('general.days')}`);
            }
            if (timedata.hours > 0) {
                remainingTime.push(`${timedata.hours} ${timedata.hours === 1 ? t('general.hour') : t('general.hours')}`);
            } else {
                if (timedata.days > 0) {
                    remainingTime.push(`0 ${t('general.hours')}`);
                }
            }
            if (timedata.minutes > 0) {
                remainingTime.push(`${timedata.minutes} ${timedata.minutes === 1 ? t('general.minute') : t('general.minutes')}`);
            } else {
                if (timedata.hours > 0) {
                    remainingTime.push(`0 ${t('general.minutes')}`);
                }
            }
            if (timedata.seconds > 0) {
                remainingTime.push(`${timedata.seconds} ${timedata.seconds === 1 ? t('general.second') : t('general.seconds')}`);
            }

            // if (isStartDateFuture(paymentStartDate)) {
            //     setStartRemainingTime(getTimeFromNow(paymentStartDate));
            // } else {
            //     setStartRemainingTime(`Streaming since ${getTimeFromNow(paymentStartDate)}`);
            // }

            if (isStartDateFuture(paymentStartDate)) {
                setStartRemainingTime(`in ${remainingTime.join(', ')}`);
            } else {
                setStartRemainingTime(`Streaming for ${remainingTime.join(', ')}`);
            }

        }

    }, [t, paymentStartDate, isStartDateFuture]);

    return (
        <div className="tab-inner-content-wrapper vertical-scroll">
            {vestingContract && (
                <div>
                    <div className="font-size-110 font-bold">
                        <span className="align-middle">{lockPeriodAmount} {getLockPeriodOptionLabel(lockPeriodFrequency, t)} - {vestingContract.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'} vesting contract</span>
                        {vestingContract.subCategory ? (
                            <span className={`badge medium ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>{getCategoryLabelByValue(vestingContract.subCategory)}</span>
                        ) : null}
                    </div>
                    <div className="font-size-100 font-extrabold text-uppercase mt-3 mb-2">Vesting Distribution</div>
                    <div className="font-size-100">{isStartDateFuture(paymentStartDate) ? 'Streams start on' : 'Streams started on'} {getReadableDate(paymentStartDate, true)}</div>
                    <div className="font-size-70 text-italic">{startRemainingTime}</div>
                    <div className="font-size-100 mt-3">{cliffReleasePercentage}% unlocked on commencement date</div>
                    <div className="font-size-100">{100 - cliffReleasePercentage}% of allocated funds streamed equally across {lockPeriodAmount} {getLockPeriodOptionLabel(lockPeriodFrequency, t)}</div>
                </div>
            )}
        </div>
    );
};
