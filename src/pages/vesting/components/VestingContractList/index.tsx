import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Empty, Progress } from 'antd';
import { MSP, StreamTemplate, Treasury, TreasuryType } from '@mean-dao/msp';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../../../components/Identicon';
import { FALLBACK_COIN_IMAGE } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { formatThousands, makeDecimal } from '../../../../utils/utils';
import { PublicKey } from '@solana/web3.js';
import { consoleOut, delay, getReadableDate, getTodayPercentualBetweenTwoDates, isProd, toTimestamp } from '../../../../utils/ui';
import { IconLoading } from '../../../../Icons';
import BN from 'bn.js';

export const VestingContractList = (props: {
    loadingVestingAccounts: boolean;
    msp: MSP | undefined;
    onAccountSelected: any;
    selectedAccount: Treasury | undefined;
    streamingAccounts: Treasury[] | undefined;
}) => {
    const {
        loadingVestingAccounts,
        msp,
        onAccountSelected,
        selectedAccount,
        streamingAccounts,
    } = props;
    const { t } = useTranslation('common');
    const {
        theme,
        getTokenByMintAddress,
    } = useContext(AppStateContext);
    const [today, setToday] = useState(new Date());
    const [vcTemplates, setVcTemplates] = useState<any>({});
    const [vcCompleteness, setVcCompleteness] = useState<any>({});
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [shouldOutputLogs, setShouldOutputLogs] = useState(true);

    const isStartDateFuture = useCallback((date: string): boolean => {
        const now = today.toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, [today]);

    // Set template data
    useEffect(() => {

        if (!msp || loadingVestingAccounts || !streamingAccounts || loadingTemplates) { return; }

        setLoadingTemplates(true);

        (async () => {
            if (streamingAccounts) {
                const compiledTemplates: any = {};
                // consoleOut('loading of streamTemplates: ', 'STARTS', 'darkred');
                for (const contract of streamingAccounts) {
                    if (loadingVestingAccounts) {
                        break;
                    }
                    // Delay before each call to avoid too many requests (devnet ONLY)
                    if (!isProd()) {
                        if (streamingAccounts.length < 20) {
                            await delay(150);
                        } else if (streamingAccounts.length < 40) {
                            await delay(200);
                        } else if (streamingAccounts.length < 60) {
                            await delay(250);
                        } else if (streamingAccounts.length < 80) {
                            await delay(300);
                        } else if (streamingAccounts.length < 100) {
                            await delay(350);
                        } else {
                            await delay(380);
                        }
                    }
                    try {
                        const pk = new PublicKey(contract.id as string);
                        const templateData = await msp.getStreamTemplate(pk);
                        compiledTemplates[contract.id as string] = templateData;
                    } catch (error) {
                        console.error('Error fetching template data:', error);
                    }
                }
                // consoleOut('compiledTemplates:', compiledTemplates, 'blue');
                // consoleOut('loading of streamTemplates: ', 'ENDS', 'darkred');
                setVcTemplates(compiledTemplates);
            }
            setLoadingTemplates(false);
        })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msp, streamingAccounts]);

    // Create a tick every second
    useEffect(() => {

        const timeout = setTimeout(() => {
            setToday(new Date());
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }

    });

    useEffect(() => {
        if (loadingVestingAccounts || loadingTemplates || !streamingAccounts || !vcTemplates) { return; }

        const completedPercentages: any = {};
        let doLogsOnce = true;
        for (const contract of streamingAccounts) {
            let streamTemplate: StreamTemplate | undefined = undefined;
            let startDate: string | undefined = undefined;

            if (vcTemplates && vcTemplates[contract.id as string] && vcTemplates[contract.id as string].startUtc) {
                streamTemplate = vcTemplates[contract.id as string];
                const localDate = new Date(vcTemplates[contract.id as string].startUtc);
                startDate = localDate.toUTCString();
            }

            let completedVestingPercentage = 0;
            if (contract && streamTemplate && startDate) {
                if (contract.totalStreams === 0) {
                    completedVestingPercentage = 0;
                } else if (isStartDateFuture(startDate)) {
                    completedVestingPercentage = 0;
                } else {
                    const lockPeriodAmount = streamTemplate.durationNumberOfUnits;
                    const lockPeriodUnits = streamTemplate.rateIntervalInSeconds;
                    const lockPeriod = lockPeriodAmount * lockPeriodUnits;
                    const cliffReleasePercentage = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
                    const sdTimestamp = toTimestamp(startDate);
                    const finishDate = new Date((sdTimestamp + lockPeriod) * 1000).toUTCString();
                    const finishDateTimestamp = toTimestamp(finishDate);
                    const nowTimestamp = toTimestamp(today.toUTCString());
                    const todayPct = getTodayPercentualBetweenTwoDates(startDate, finishDate);
                    completedVestingPercentage = todayPct > cliffReleasePercentage ? todayPct : cliffReleasePercentage;
                    if (doLogsOnce && shouldOutputLogs) {
                        consoleOut('lockPeriod(s):', lockPeriod, 'darkorange');
                        consoleOut('cliffReleasePercentage:', cliffReleasePercentage, 'darkorange');
                        consoleOut('sdTimestamp:', sdTimestamp, 'darkorange');
                        consoleOut('nowTimestamp:', nowTimestamp, 'darkorange');
                        consoleOut('finishDateTimestamp:', finishDateTimestamp, 'darkorange');
                        consoleOut('startDate:', startDate, 'darkorange');
                        consoleOut('finishDate:', finishDate, 'darkorange');
                        consoleOut('todayPct:', todayPct, 'darkorange');
                        setShouldOutputLogs(false);
                        doLogsOnce = false;
                    }
                }
            } else {
                completedVestingPercentage = 0;
            }
            completedPercentages[contract.id as string] = completedVestingPercentage;
        }
        setVcCompleteness(completedPercentages);

    }, [isStartDateFuture, loadingTemplates, loadingVestingAccounts, shouldOutputLogs, streamingAccounts, today, vcTemplates]);

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = "error";
    };

    return (
        <>
            {streamingAccounts && streamingAccounts.length > 0 ? (
                streamingAccounts.map((item, index) => {
                    const associatedToken = item.associatedToken;
                    const token = associatedToken
                        ? getTokenByMintAddress(associatedToken as string)
                        : undefined;
                    const vcType = item.treasuryType;
                    const onTreasuryClick = () => {
                        onAccountSelected(item);
                    };
                    return (
                        <div key={`${index + 50}`} onClick={onTreasuryClick}
                            className={`transaction-list-row ${selectedAccount && selectedAccount.id === item.id ? 'selected' : ''}`}>
                            <div className="icon-cell">
                                <div className="token-icon">
                                    <>
                                        {token ? (
                                            <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                                        ) : (
                                            <Identicon address={associatedToken} style={{ width: 30, height: 30, display: "inline-flex" }} />
                                        )}
                                    </>
                                </div>
                            </div>
                            <div className="description-cell">
                                <div className="title text-truncate">
                                    {item.name}
                                    <span className={`badge small ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                                        {vcType === TreasuryType.Open ? 'Open' : 'Locked'}
                                    </span>
                                </div>
                                <div className="subtitle text-truncate">
                                    {item && vcTemplates && vcTemplates[item.id as string] && vcTemplates[item.id as string].startUtc && !loadingTemplates ? (
                                        <span className="mr-1">
                                            {
                                                isStartDateFuture(vcTemplates[item.id as string].startUtc)
                                                    ? `Contract starts on ${getReadableDate(vcTemplates[item.id as string].startUtc, true)}`
                                                    : <Progress
                                                        percent={vcCompleteness[item.id as string] || 0}
                                                        showInfo={false}
                                                        status={
                                                            vcCompleteness[item.id as string] === 0
                                                                ? "normal"
                                                                : vcCompleteness[item.id as string] === 100
                                                                    ? "success"
                                                                    : "active"
                                                        }
                                                        size="small"
                                                        type="line"
                                                        className="vesting-list-progress-bar"
                                                        trailColor={theme === 'light' ? '#f5f5f5' : '#303030'}
                                                        style={{ width: 200 }}
                                                        />
                                            }
                                        </span>
                                    ) : (
                                        <span className="mr-1"><IconLoading className="mean-svg-icons" style={{ height: 14, width: 14, marginTop: -2, marginBottom: -2 }}/></span>
                                    )}
                                </div>
                            </div>
                            <div className="rate-cell">
                                <div className="rate-amount">
                                    {formatThousands(item.totalStreams)}
                                </div>
                                <div className="interval">{item.totalStreams === 1 ? 'stream' : 'streams'}</div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <div className="flex-center h-100">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
                        <p>{t('treasuries.treasury-list.no-treasuries')}</p>
                    }/>
                </div>
            )}
        </>
    );
};
