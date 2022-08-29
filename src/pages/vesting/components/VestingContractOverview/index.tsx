import React, { useCallback, useContext, useEffect, useState } from 'react';
import { StreamTemplate, Treasury } from '@mean-dao/msp';
import { TokenInfo } from '@solana/spl-token-registry';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../../../contexts/appstate';
import { TimeData } from '../../../../models/common-types';
import { PaymentRateType } from '../../../../models/enums';
import {
    getLockPeriodOptionLabelByAmount,
    getPaymentIntervalFromSeconds,
    getReadableDate,
    getTimeEllapsed,
    getTimeRemaining,
    toTimestamp,
    getlllDate,
    relativeTimeFromDates,
    consoleOut,
    stringNumberFormat,
    percentageBn,
    percentualBn,
    friendlyDisplayDecimalPlaces,
} from '../../../../utils/ui';
import { makeDecimal, toUiAmount2 } from '../../../../utils/utils';
import BN from 'bn.js';
import { Alert, Progress } from 'antd';
import { TokenIcon } from '../../../../components/TokenIcon';
import { CheckCircleFilled, ClockCircleOutlined } from '@ant-design/icons';
import { IconInfoCircle } from '../../../../Icons';
import { VestingFlowRateInfo } from '../../../../models/vesting';
import BigNumber from 'bignumber.js';

export const VestingContractOverview = (props: {
    availableStreamingBalance: number | BN;
    isXsDevice: boolean;
    selectedToken: TokenInfo | undefined;
    streamTemplate: StreamTemplate | undefined;
    vestingContract: Treasury | undefined;
    vestingContractFlowRate: VestingFlowRateInfo | undefined;
}) => {
    const {
        availableStreamingBalance,
        isXsDevice,
        selectedToken,
        streamTemplate,
        vestingContract,
        vestingContractFlowRate,
    } = props;
    const { t } = useTranslation('common');
    const {
        theme,
    } = useContext(AppStateContext);
    const [today, setToday] = useState(new Date());
    const [startRemainingTime, setStartRemainingTime] = useState('');
    // Setting from the vesting contract
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState(0);
    const [lockPeriodUnits, setLockPeriodUnits] = useState(0);
    const [isContractRunning, setIsContractRunning] = useState(false);
    const [completedVestingPercentage, setCompletedVestingPercentage] = useState(0);
    const [currentVestingAmount, setCurrentVestingAmount] = useState(new BN(0));

    /////////////////
    //  Callbacks  //
    /////////////////

    const isDateInTheFuture = useCallback((date: string): boolean => {
        const now = today.toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, [today]);

    const getContractFinishDate = useCallback(() => {
        if (paymentStartDate && lockPeriodAmount && lockPeriodUnits) {
            // Start date timestamp
            const sdTimestamp = toTimestamp(paymentStartDate);
            // Total length of vesting period in seconds
            const lockPeriod = parseFloat(lockPeriodAmount) * lockPeriodUnits;
            // Final date = Start date + lockPeriod
            const finishDate = new Date((sdTimestamp + lockPeriod) * 1000);
            return finishDate;
        }
        return null;
    }, [lockPeriodAmount, lockPeriodUnits, paymentStartDate]);

    const isContractFinished = useCallback((): boolean => {
        const now = new Date();
        const comparedDate = getContractFinishDate();
        if (!comparedDate || now > comparedDate) {
            return true;
        }
        return false;
    }, [getContractFinishDate]);

    const getCurrentVestedAmount = useCallback((log = false) => {
        if (!vestingContractFlowRate || !paymentStartDate) {
            return new BN(0);
        }

        if (isContractFinished()) {
            return vestingContractFlowRate.streamableAmountBn as BN;
        }

        let ratePerSecond = new BN(0);
        let vestedBn = new BN(0);
        let releasedBn = new BN(0);
        let streamableBn = new BN(0);
        const lockPeriod = parseFloat(lockPeriodAmount) * lockPeriodUnits;
        const elapsed = Math.round(Math.abs(getTimeEllapsed(paymentStartDate).total) / 1000);

        if (cliffReleasePercentage > 0) {
            releasedBn = percentageBn(cliffReleasePercentage, vestingContractFlowRate.streamableAmountBn) as BN;
            streamableBn = vestingContractFlowRate.streamableAmountBn.sub(releasedBn);
        } else {
            streamableBn = vestingContractFlowRate.streamableAmountBn;
        }

        ratePerSecond = streamableBn.divn(lockPeriod);

        if (log) {
            consoleOut('lockPeriodAmount:', lockPeriodAmount, 'purple');
            consoleOut('lockPeriodUnits:', lockPeriodUnits, 'purple');
            consoleOut('lockPeriod (s):', `${lockPeriod} (${lockPeriodAmount} ${getLockPeriodOptionLabelByAmount(lockPeriodFrequency, parseFloat(lockPeriodAmount), t)})`, 'purple');
            consoleOut('elapsed:', elapsed, 'purple');
            consoleOut('cliffReleasePercentage:', cliffReleasePercentage, 'purple');
            consoleOut('releasedBn:', releasedBn.toString(), 'purple');
            consoleOut('streamableAmountBn:', vestingContractFlowRate.streamableAmountBn.toString(), 'purple');
            consoleOut('ratePerSecond:', ratePerSecond.toString(), 'purple');
        }

        if (cliffReleasePercentage > 0 && releasedBn.gtn(0) && ratePerSecond.gtn(0)) {
            vestedBn = ratePerSecond.muln(elapsed).add(releasedBn);
        } else {
            vestedBn = ratePerSecond.muln(elapsed);
        }

        if (log) {
            consoleOut('vestedBn:', vestedBn.toString(), 'purple');
        }

        return vestedBn;
    }, [cliffReleasePercentage, isContractFinished, lockPeriodAmount, lockPeriodFrequency, lockPeriodUnits, paymentStartDate, t, vestingContractFlowRate]);


    /////////////////////
    // Data management //
    /////////////////////

    // Set template data
    useEffect(() => {
        if (vestingContract && streamTemplate) {
            const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
            setCliffReleasePercentage(cliffPercent);
            setPaymentStartDate(streamTemplate.startUtc.toString());
            updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
            const interval = new BN(streamTemplate.rateIntervalInSeconds).toNumber();
            setLockPeriodUnits(interval);
            const periodFrequency = getPaymentIntervalFromSeconds(interval);
            setLockPeriodFrequency(periodFrequency);
        }
    }, [
        streamTemplate,
        vestingContract,
    ]);

    // Create a tick every second
    useEffect(() => {

        const timeout = setTimeout(() => {
            setToday(new Date());
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }

    });

    // Set remaining time
    useEffect(() => {

        if (paymentStartDate) {

            let timedata: TimeData;
            const remainingTime: string[] = [];

            if (isDateInTheFuture(paymentStartDate)) {
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

            if (isDateInTheFuture(paymentStartDate)) {
                setStartRemainingTime(`in ${remainingTime.join(', ')}`);
            } else {
                setStartRemainingTime(`Streaming for ${remainingTime.join(', ')}`);
            }

        }

    }, [t, paymentStartDate, isDateInTheFuture]);

    // Set chart completed percentage
    useEffect(() => {

        let vestedAmountBn = new BN(0);
        if (vestingContract && paymentStartDate && vestingContractFlowRate) {

            if (isDateInTheFuture(paymentStartDate)) {
                setCurrentVestingAmount(vestedAmountBn);
                setCompletedVestingPercentage(0);
                return;
            } else if (isContractFinished()) {
                setCurrentVestingAmount(vestingContractFlowRate.streamableAmountBn);
                setCompletedVestingPercentage(100);
                return;
            }

            if (vestingContract.totalStreams === 0) {
                setCompletedVestingPercentage(0);
            } else if (isDateInTheFuture(paymentStartDate)) {
                setCompletedVestingPercentage(0);
            } else {
                vestedAmountBn = getCurrentVestedAmount();
                const pctVested = percentualBn(vestedAmountBn, vestingContractFlowRate.streamableAmountBn, true) as number;
                setCompletedVestingPercentage(pctVested > 100 ? 100 : pctVested);
            }
            setCurrentVestingAmount(vestedAmountBn);
        } else {
            setCurrentVestingAmount(vestedAmountBn);
            setCompletedVestingPercentage(0);
        }

    }, [
        today,
        vestingContract,
        paymentStartDate,
        vestingContractFlowRate,
        getCurrentVestedAmount,
        getContractFinishDate,
        isContractFinished,
        isDateInTheFuture,
    ]);

    // Set isContractRunning flag based on completed percentage
    useEffect(() => {
        if (paymentStartDate) {
            if (completedVestingPercentage > 0 && completedVestingPercentage < 100) {
                setIsContractRunning(true);
            } else {
                setIsContractRunning(false);
            }
        } else {
            setIsContractRunning(false);
        }
    }, [completedVestingPercentage, paymentStartDate]);

    ///////////////
    // Rendering //
    ///////////////

    const renderVestedAmountChart = useCallback(() => {
        if (!vestingContract || !vestingContractFlowRate || !selectedToken) { return null; }

        return (
            <>
                {vestingContract.totalStreams > 0 && (
                    <div className="mt-3 pr-2">
                        <div className="flex-row align-items-center">
                            <TokenIcon
                                mintAddress={selectedToken.address}
                                size={24}
                            />
                            <span className="font-size-100 font-bold fg-secondary-75 pl-2">
                                {
                                    stringNumberFormat(
                                        toUiAmount2(currentVestingAmount, selectedToken.decimals),
                                        friendlyDisplayDecimalPlaces(currentVestingAmount.toString()) || selectedToken.decimals
                                    )
                                } of {
                                    stringNumberFormat(
                                        toUiAmount2(vestingContractFlowRate.streamableAmountBn, selectedToken.decimals),
                                        friendlyDisplayDecimalPlaces(vestingContractFlowRate.streamableAmountBn.toString()) || selectedToken.decimals
                                    )
                                } {selectedToken.symbol} vested
                            </span>
                        </div>
                        <div className="flex-fixed-right">
                            <div className="left mr-1">
                                <Progress
                                    percent={completedVestingPercentage}
                                    showInfo={false}
                                    status={completedVestingPercentage === 0
                                            ? "normal"
                                            : completedVestingPercentage === 100
                                                ? "success"
                                                : "active"
                                    }
                                    type="line"
                                    className="vesting-list-progress-bar large"
                                    trailColor={theme === 'light' ? '#f5f5f5' : '#303030'}
                                    style={{ width: "100%" }}
                                />
                            </div>
                            <div className="right progress-status-icon">
                                {isContractFinished() ? (
                                    <span className="fg-green"><CheckCircleFilled /></span>
                                ) : (
                                    <span><ClockCircleOutlined /></span>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }, [completedVestingPercentage, currentVestingAmount, isContractFinished, selectedToken, theme, vestingContract, vestingContractFlowRate]);

    const getRelativeFinishDate = () => {
        const finishDate = getContractFinishDate();
        if (!finishDate) {
            return null;
        }
        return relativeTimeFromDates(finishDate);
    }

    const getContractFinishDateLabel = () => {
        const finishDate = getContractFinishDate();
        if (!finishDate) {
            return null;
        }
        if (isDateInTheFuture(finishDate.toUTCString())) {
            return 'Contract ends on';
        } else {
            return 'Contract ended on';
        }
    }

    return (
        <div className="tab-inner-content-wrapper vertical-scroll">
            {vestingContract && (
                <div className="details-panel-meta">
                    {vestingContract.totalStreams === 0 && !isDateInTheFuture(paymentStartDate) && (
                        <div className="alert-info-message mb-2">
                            <Alert message="This contract started without any streams and is unable to vest any tokens. Please claim any unallocated tokens and close it." type="info" showIcon closable />
                        </div>
                    )}
                    <div className="two-column-form-layout col70x30">
                        <div className="left mb-2">
                            <span className="font-bold font-size-100 fg-secondary-75">{lockPeriodAmount} {getLockPeriodOptionLabelByAmount(lockPeriodFrequency, parseFloat(lockPeriodAmount), t)} vesting contract</span>
                            <div className="font-size-100 fg-secondary-50">{cliffReleasePercentage}% unlocked on commencement date</div>
                            <div className="font-size-100 fg-secondary-50">{100 - cliffReleasePercentage}% of allocated funds streamed over {lockPeriodAmount} {getLockPeriodOptionLabelByAmount(lockPeriodFrequency, parseFloat(lockPeriodAmount), t)}</div>
                        </div>
                        <div className={`right mb-2 pr-2 ${isXsDevice ? 'text-left' : 'text-right'}`}>
                            <div className="font-bold font-size-100 fg-secondary-75">
                                Unallocated tokens
                            </div>
                            <div className="font-size-100 fg-secondary-50">
                                {selectedToken ? (
                                    <>
                                        {`${stringNumberFormat(
                                                toUiAmount2(availableStreamingBalance, selectedToken.decimals),
                                                4,
                                            )} ${selectedToken.symbol}`
                                        }
                                    </>
                                ) : '--'}
                            </div>
                        </div>
                    </div>

                    <div className="two-column-form-layout col70x30">
                        <div className="left mb-2">
                            <span className="font-bold font-size-100 fg-secondary-75">
                                {`${isDateInTheFuture(paymentStartDate) ? 'Contract starts on' : 'Contract started on'} ${getReadableDate(paymentStartDate, true)}`}
                            </span>
                            {isContractFinished() ? (
                                <div className="font-size-100 fg-secondary-50 text-italic">Vesting finished {getRelativeFinishDate()}</div>
                            ) : (
                                <div className="font-size-100 fg-secondary-50 text-italic">{startRemainingTime}</div>
                            )}
                        </div>
                        <div className={`right mb-2 pr-2 ${isXsDevice ? 'text-left' : 'text-right'}`}>
                            <div className="font-bold font-size-100 fg-secondary-75">
                                {getContractFinishDateLabel()}
                            </div>
                            <div className="font-size-100 fg-secondary-50">
                                {getlllDate(getContractFinishDate())}
                            </div>
                        </div>
                    </div>

                    {renderVestedAmountChart()}

                    {isContractRunning ? (
                        <div className="mt-3 pr-2">
                            <div className="flex-row align-items-center font-size-85 fg-secondary-50">
                                <IconInfoCircle className="mean-svg-icons" style={{ width: 18, height: 18, marginRight: 2 }} />
                                <span className="align-middle">As this contract has started vesting, no additional streams can be added.</span>
                            </div>
                        </div>
                    ) : isContractFinished() ? (
                        <div className="mt-3 pr-2">
                            <div className="flex-row align-items-center font-size-85 fg-secondary-50">
                                <IconInfoCircle className="mean-svg-icons" style={{ width: 18, height: 18, marginRight: 2 }} />
                                <span className="align-middle">As this contract has finished vesting, no additional streams can be added.</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
};
