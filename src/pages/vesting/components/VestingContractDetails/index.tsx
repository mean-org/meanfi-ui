import React, { useCallback, useContext, useEffect, useState } from 'react';
import { TokenInfo } from '@solana/spl-token-registry';
import { AppStateContext } from '../../../../contexts/appstate';
import { StreamTemplate, Treasury } from '@mean-dao/msp';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from '../../../../constants';
import { makeDecimal, shortenAddress, toUiAmount2 } from '../../../../utils/utils';
import { Identicon } from '../../../../components/Identicon';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { getCategoryLabelByValue, VestingFlowRateInfo } from '../../../../models/vesting';
import { useTranslation } from 'react-i18next';
import BN from 'bn.js';
import { IconLoading } from '../../../../Icons';
import {
    consoleOut,
    friendlyDisplayDecimalPlaces,
    getIntervalFromSeconds,
    getLockPeriodOptionLabelByAmount,
    getPaymentIntervalFromSeconds,
    getShortDate,
    getTimeEllapsed,
    percentageBn,
    percentualBn,
    stringNumberFormat,
} from '../../../../utils/ui';
import { PaymentRateType } from '../../../../models/enums';
import { Progress } from 'antd';
import BigNumber from 'bignumber.js';

export const VestingContractDetails = (props: {
    isXsDevice: boolean;
    loadingVestingContractFlowRate: boolean;
    selectedToken: TokenInfo | undefined;
    streamTemplate: StreamTemplate | undefined;
    vestingContract: Treasury | undefined;
    vestingContractFlowRate: VestingFlowRateInfo | undefined;
}) => {
    const {
        isXsDevice,
        loadingVestingContractFlowRate,
        selectedToken,
        streamTemplate,
        vestingContract,
        vestingContractFlowRate,
    } = props;
    const {
        theme,
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');
    const [today, setToday] = useState(new Date());
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodUnits, setLockPeriodUnits] = useState(0);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState(0);
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [completedVestingPercentage, setCompletedVestingPercentage] = useState(0);
    const [currentVestingAmount, setCurrentVestingAmount] = useState(new BN(0));

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
            // const sdTimestamp = toTimestamp(paymentStartDate);

            // Total length of vesting period in seconds
            const lockPeriod = parseFloat(lockPeriodAmount) * lockPeriodUnits;

            // consoleOut('lockPeriodAmount:', lockPeriodAmount, 'blue');
            // consoleOut('lockPeriodUnits:', lockPeriodUnits, 'blue');
            // consoleOut('lockPeriod:', lockPeriod, 'blue');

            // Final date = Start date + lockPeriod
            const ts = new Date(paymentStartDate).getTime();
            const finishDate = new Date((lockPeriod * 1000) + ts);
            return finishDate;
        }
        return null;
    }, [lockPeriodAmount, lockPeriodUnits, paymentStartDate]);

    const isContractFinished = useCallback((): boolean => {
        const now = new Date();
        const comparedDate = getContractFinishDate();
        // consoleOut('contractFinishDate:', comparedDate, 'blue');
        if (!comparedDate || now > comparedDate) {
            return true;
        }
        return false;
    }, [getContractFinishDate]);

    const getVestingDistributionStatus = useCallback(() => {

        if (!paymentStartDate || !vestingContract) {
            return null;
        }

        let bgClass = '';
        let content = '';

        if (isDateInTheFuture(paymentStartDate)) {
            bgClass = 'bg-purple';
            content = t('vesting.status.status-scheduled');
        } else if (isContractFinished()) {
            bgClass = 'bg-gray-dark';
            content = t('vesting.status.status-stopped');
        } else {
            bgClass = 'bg-green';
            content = t('vesting.status.status-running');
        }

        return (
            <span className={`badge medium font-bold text-uppercase fg-white ${bgClass}`}>{content}</span>
        );

    }, [isContractFinished, isDateInTheFuture, paymentStartDate, t, vestingContract]);

    const getCurrentVestedAmount = useCallback((log = false) => {
        if (!vestingContractFlowRate || !paymentStartDate) {
            return new BN(0);
        }

        if (isContractFinished()) {
            return vestingContractFlowRate.streamableAmountBn as BN;
        }

        let ratePerSecond = 0;
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

        ratePerSecond = new BigNumber(streamableBn.toString()).dividedToIntegerBy(lockPeriod).toNumber();

        if (cliffReleasePercentage > 0) {
            vestedBn = releasedBn.addn(elapsed * ratePerSecond);
        } else {
            vestedBn = new BN(elapsed * ratePerSecond);
        }

        if (log) {
            consoleOut('lockPeriodAmount:', lockPeriodAmount, 'purple');
            consoleOut('lockPeriodUnits:', lockPeriodUnits, 'purple');
            consoleOut('lockPeriod (s):', `${lockPeriod} (${lockPeriodAmount} ${getLockPeriodOptionLabelByAmount(lockPeriodFrequency, parseFloat(lockPeriodAmount), t)})`, 'purple');
            consoleOut('elapsed:', elapsed, 'purple');
            consoleOut('cliffReleasePercentage:', cliffReleasePercentage, 'purple');
            consoleOut('releasedBn:', releasedBn.toString(), 'purple');
            consoleOut('streamableAmountBn:', vestingContractFlowRate.streamableAmountBn.toString(), 'purple');
            consoleOut('ratePerSecond:', ratePerSecond, 'purple');
            consoleOut('vestedBn:', vestedBn.toString(), 'purple');
        }

        return vestedBn;
    }, [cliffReleasePercentage, isContractFinished, lockPeriodAmount, lockPeriodFrequency, lockPeriodUnits, paymentStartDate, t, vestingContractFlowRate]);

    // Display current vested amount in the console (once per load)
    useEffect(() => {
        if (vestingContract && !loadingVestingContractFlowRate && vestingContractFlowRate && selectedToken) {
            getCurrentVestedAmount(true);
        }
    }, [getCurrentVestedAmount, loadingVestingContractFlowRate, selectedToken, vestingContract, vestingContractFlowRate]);

    // Create a tick every second
    useEffect(() => {

        const timeout = setTimeout(() => {
            setToday(new Date());
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }

    });

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

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = "error";
    };

    const renderStreamingAccount = (item: Treasury) => {
        return (
            <div className="transaction-list-row h-auto no-pointer">
                <div className="icon-cell">
                    <div className="token-icon">
                        {selectedToken && selectedToken.logoURI ? (
                            <img alt={`${selectedToken.name}`} width={44} height={44} src={selectedToken.logoURI} onError={imageOnErrorHandler} />
                        ) : (
                            <Identicon address={item.associatedToken} style={{ width: "44", height: "44", display: "inline-flex" }} />
                        )}
                    </div>
                </div>
                <div className="description-cell">
                    {item.name ? (
                        <div className="title text-truncate">
                            {item.name}
                            {vestingContract && vestingContract.subCategory ? (
                                <span className={`badge medium ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>{getCategoryLabelByValue(vestingContract.subCategory)}</span>
                            ) : null}
                        </div>
                    ) : (
                        <div className="title text-truncate">{shortenAddress(item.id, 8)}</div>
                    )}
                    <div className="subtitle">
                        {loadingVestingContractFlowRate ? (
                            <span className="mr-1"><IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/></span>
                        ) : vestingContractFlowRate && vestingContract && selectedToken ? (
                            <>
                                {vestingContractFlowRate.amountBn.gtn(0) && (
                                    <span className="mr-1">Sending {
                                        stringNumberFormat(
                                            toUiAmount2(vestingContractFlowRate.amountBn, selectedToken.decimals),
                                            friendlyDisplayDecimalPlaces(vestingContractFlowRate.amountBn.toString()) || selectedToken.decimals
                                        )
                                    } {selectedToken.symbol} {getIntervalFromSeconds(vestingContractFlowRate.durationUnit)}</span>
                                )}
                            </>
                        ) : null}
                        <AddressDisplay
                            address={item.id as string}
                            prefix="("
                            suffix=")"
                            maxChars={5}
                            iconStyles={{ width: "15", height: "15" }}
                            newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <>
            {vestingContract && (
                <div className="details-panel-meta mb-2">
                    <div className="two-column-form-layout col60x40">

                        <div className="left mb-2">
                            {renderStreamingAccount(vestingContract)}
                        </div>
                        <div className={`right mb-2 pr-2 font-size-100 line-height-120 ${isXsDevice ? 'text-left' : 'text-right'}`}>
                            {getVestingDistributionStatus()}
                            {vestingContract.totalStreams === 0 && isDateInTheFuture(paymentStartDate) && (
                                <div className="vested-amount">
                                    {`starts on ${getShortDate(paymentStartDate, false)}`}
                                </div>
                            )}
                            {vestingContractFlowRate && selectedToken && vestingContract.totalStreams > 0 && (
                                <>
                                    {isDateInTheFuture(paymentStartDate) ? (
                                        <div className="vested-amount">
                                            {
                                                stringNumberFormat(
                                                    toUiAmount2(vestingContractFlowRate.streamableAmountBn, selectedToken.decimals),
                                                    friendlyDisplayDecimalPlaces(vestingContractFlowRate.streamableAmountBn.toString()) || selectedToken.decimals
                                                )
                                            } {selectedToken.symbol} to be vested
                                        </div>
                                    ) : (
                                        <div className="vested-amount">
                                            {
                                                stringNumberFormat(
                                                    toUiAmount2(currentVestingAmount, selectedToken.decimals),
                                                    friendlyDisplayDecimalPlaces(currentVestingAmount.toString()) || selectedToken.decimals
                                                )
                                            } {selectedToken.symbol} vested
                                        </div>
                                    )}
                                </>
                            )}
                            {!isDateInTheFuture(paymentStartDate) && vestingContract.totalStreams > 0 && (
                                <div className="vesting-progress">
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
                                        className="vesting-list-progress-bar medium"
                                        trailColor={theme === 'light' ? '#f5f5f5' : '#303030'}
                                        style={{ width: 85 }}
                                    />
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}
        </>
    );
};
