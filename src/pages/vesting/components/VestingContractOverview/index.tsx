import { Treasury, TreasuryType } from '@mean-dao/msp';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../../../contexts/appstate';
import { PaymentRateType } from '../../../../models/enums';
import { getLockPeriodOptionLabel, getReadableDate, getTimeRemaining } from '../../../../utils/ui';

export const VestingContractOverview = (props: {
    vestingContract: Treasury | undefined;
    lockPeriodFrequency: PaymentRateType;
    lockPeriodAmount: number;
    vestingCategory: string;
    streamsStartDate: string;
    cliffRelease: number;
}) => {
    const { vestingContract, lockPeriodAmount, lockPeriodFrequency, cliffRelease, vestingCategory, streamsStartDate } = props;
    const { t } = useTranslation('common');
    const { theme } = useContext(AppStateContext);
    const [today, setToday] = useState(new Date());
    const [startRemainingTime, setStartRemainingTime] = useState('');

    useEffect(() => {

        const timeout = setTimeout(() => {
            setToday(new Date());
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }

    });

    const isStartDatePast = useCallback((date: string): boolean => {
        const parsedDate = Date.parse(date);
        const fromParsedDate = new Date(parsedDate);
        return fromParsedDate.getDate() <= today.getDate() ? true : false;
    }, [today]);

    useEffect(() => {

        if (streamsStartDate) {
            if (isStartDatePast(streamsStartDate)) {
                setStartRemainingTime('Immediately after created');
                return;
            }
            const remainingTime: string[] = [];
            const timedata = getTimeRemaining(streamsStartDate);
            if (timedata.days > 0) {
                remainingTime.push(`${timedata.days} ${timedata.days === 1 ? t('general.day') : t('general.days')}`);
            }
            if (timedata.hours > 0) {
                remainingTime.push(`${timedata.hours} ${timedata.hours === 1 ? t('general.hour') : t('general.hours')}`);
            } else {
                remainingTime.push(`${timedata.days > 0 ? '0 ' + t('general.hours') : ''}`);
            }
            if (timedata.minutes > 0) {
                remainingTime.push(`${timedata.minutes} ${timedata.minutes === 1 ? t('general.minute') : t('general.minutes')}`);
            } else {
                remainingTime.push(`${timedata.hours > 0 ? '0 ' + t('general.minutes') : ''}`);
            }
            if (timedata.seconds > 0) {
                remainingTime.push(`${timedata.seconds} ${timedata.seconds === 1 ? t('general.second') : t('general.seconds')}`);
            }
            setStartRemainingTime(`in ${remainingTime.join(', ')}`);
        }

    }, [t, isStartDatePast, streamsStartDate]);

    return (
        <>
            {vestingContract && (
                <div>
                    <div className="font-size-110 font-bold">
                        <span className="align-middle">{lockPeriodAmount} {getLockPeriodOptionLabel(lockPeriodFrequency, t)} - {vestingContract.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'} Vesting Account</span>
                        <span className={`badge medium ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>{vestingCategory}</span>
                    </div>
                    <div className="font-size-100 font-extrabold text-uppercase mt-3 mb-2">Vesting Distribution</div>
                    <div className="font-size-100">Streams start on {getReadableDate(streamsStartDate)}</div>
                    <div className="font-size-70 text-italic">{startRemainingTime}</div>
                    <div className="font-size-100 mt-3">{cliffRelease}% unlocked on commencement date</div>
                    <div className="font-size-100">{100 - cliffRelease}% of allocated funds streamed equally across {lockPeriodAmount} {getLockPeriodOptionLabel(lockPeriodFrequency, t)}</div>
                </div>
            )}
        </>
    );
};
