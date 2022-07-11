import React, { useCallback, useContext, useEffect, useState } from 'react';
import { TokenInfo } from '@solana/spl-token-registry';
import { AppStateContext } from '../../../../contexts/appstate';
import { StreamTemplate, Treasury } from '@mean-dao/msp';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { formatThousands, getAmountWithSymbol, makeDecimal, shortenAddress } from '../../../../utils/utils';
import { Identicon } from '../../../../components/Identicon';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { getCategoryLabelByValue, VestingFlowRateInfo } from '../../../../models/vesting';
import { useTranslation } from 'react-i18next';
import BN from 'bn.js';
import { IconLoading } from '../../../../Icons';
import { friendlyDisplayDecimalPlaces, getIntervalFromSeconds, getPaymentIntervalFromSeconds, getTodayPercentualBetweenTwoDates, percentage, toTimestamp } from '../../../../utils/ui';
import { PaymentRateType } from '../../../../models/enums';
import { Progress } from 'antd';

export const VestingContractDetails = (props: {
    isXsDevice: boolean;
    loadingVestingContractFlowRate: boolean;
    streamTemplate: StreamTemplate | undefined;
    vestingContract: Treasury | undefined;
    vestingContractFlowRate: VestingFlowRateInfo | undefined;
}) => {
    const {
        isXsDevice,
        loadingVestingContractFlowRate,
        streamTemplate,
        vestingContract,
        vestingContractFlowRate,
    } = props;
    const {
        theme,
        splTokenList,
        getTokenByMintAddress,
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');
    const [today, setToday] = useState(new Date());
    const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodUnits, setLockPeriodUnits] = useState(0);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState(0);
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [completedVestingPercentage, setCompletedVestingPercentage] = useState(0);

    const getAvailableStreamingBalance = useCallback((item: Treasury, token: TokenInfo | undefined) => {
        if (item) {
            const decimals = token ? token.decimals : 6;
            const unallocated = item.balance - item.allocationAssigned;
            const ub = makeDecimal(new BN(unallocated), decimals);
            return ub;
        }
        return 0;
    }, []);

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

    // Set a working token based on the Vesting Contract's Associated Token
    useEffect(() => {
        if (vestingContract) {
            let token = getTokenByMintAddress(vestingContract.associatedToken as string);
            if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
                token = Object.assign({}, token, {
                    symbol: 'SOL'
                }) as TokenInfo;
            }
            setSelectedToken(token);
        }

        return () => { }
    }, [getTokenByMintAddress, vestingContract])

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
            setPaymentStartDate(streamTemplate.startUtc as string);
            updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
            setLockPeriodUnits(streamTemplate.rateIntervalInSeconds);
            const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
            setLockPeriodFrequency(periodFrequency);
        }
    }, [
        streamTemplate,
        vestingContract,
    ]);

    // Set chart completed percentage
    useEffect(() => {
        if (vestingContract && paymentStartDate) {
            if (vestingContract.totalStreams === 0) {
                setCompletedVestingPercentage(0);
            } else if (isDateInTheFuture(paymentStartDate)) {
                setCompletedVestingPercentage(0);
            } else {
                // Final date
                const finishDate = (getContractFinishDate() || today).toUTCString();
                // consoleOut('finishDate:', finishDate, 'indianred');
                // Find today's percentage between Start date and Finish date
                const todayPct = getTodayPercentualBetweenTwoDates(paymentStartDate, finishDate);
                // consoleOut('todayPct:', todayPct, 'indianred');
                setCompletedVestingPercentage(todayPct <= cliffReleasePercentage ? cliffReleasePercentage : todayPct > 100 ? 100 : todayPct);
            }
        } else {
            setCompletedVestingPercentage(0);
        }
    }, [cliffReleasePercentage, getContractFinishDate, isDateInTheFuture, lockPeriodAmount, lockPeriodUnits, paymentStartDate, today, vestingContract]);

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
                        <div className="title text-truncate">{shortenAddress(item.id as string, 8)}</div>
                    )}
                    <div className="subtitle">
                        {loadingVestingContractFlowRate ? (
                            <span className="mr-1"><IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/></span>
                        ) : vestingContractFlowRate && vestingContract && selectedToken ? (
                            <>
                                {vestingContractFlowRate.amount > 0 && (
                                    <span className="mr-1">Sending {getAmountWithSymbol(
                                        vestingContractFlowRate.amount,
                                        vestingContract.associatedToken as string,
                                        false, splTokenList
                                    )} {getIntervalFromSeconds(vestingContractFlowRate.durationUnit)}</span>
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
                            {vestingContractFlowRate && vestingContract && selectedToken && vestingContract.totalStreams > 0 && (
                                <>
                                    {isDateInTheFuture(paymentStartDate) ? (
                                        <div className="vested-amount">
                                            {
                                                formatThousands(
                                                    vestingContractFlowRate.streamableAmount,
                                                    friendlyDisplayDecimalPlaces(vestingContractFlowRate.streamableAmount) || selectedToken.decimals
                                                )
                                            } {selectedToken.symbol} to be vested
                                        </div>
                                    ) : (
                                        <div className="vested-amount">
                                            {
                                                formatThousands(
                                                    percentage(completedVestingPercentage, vestingContractFlowRate.streamableAmount),
                                                    friendlyDisplayDecimalPlaces(percentage(completedVestingPercentage, vestingContractFlowRate.streamableAmount)) || selectedToken.decimals
                                                )
                                            } {selectedToken.symbol} vested
                                        </div>
                                    )}
                                </>
                            )}
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
                        </div>

                    </div>
                </div>
            )}
        </>
    );
};
