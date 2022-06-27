import React, { useCallback, useContext, useEffect, useState } from 'react';
import { Empty } from 'antd';
import { MSP, Treasury, TreasuryType } from '@mean-dao/msp';
import { useTranslation } from 'react-i18next';
import { Identicon } from '../../../../components/Identicon';
import { FALLBACK_COIN_IMAGE } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { formatThousands } from '../../../../utils/utils';
import { PublicKey } from '@solana/web3.js';
import { consoleOut, delay, getReadableDate, isProd } from '../../../../utils/ui';
import { IconLoading } from '../../../../Icons';

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
    const [today] = useState(new Date());
    const [vcStartDates, setVcStartDates] = useState<any>({});
    const [loadingTemplates, setLoadingTemplates] = useState(false);

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
                const compiledStartDates: any = {};
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
                        compiledStartDates[contract.id as string] = templateData.startUtc as string;
                    } catch (error) {
                        console.error('Error fetching template data:', error);
                    }
                }
                // consoleOut('compiledStartDates:', compiledStartDates, 'blue');
                // consoleOut('loading of streamTemplates: ', 'ENDS', 'darkred');
                setVcStartDates(compiledStartDates);
            }
            setLoadingTemplates(false);
        })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [msp, streamingAccounts]);

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
                                    {item && vcStartDates[item.id as string] && !loadingTemplates ? (
                                        <span className="mr-1">
                                            {
                                                isStartDateFuture(vcStartDates[item.id as string])
                                                    ? `Contract starts on ${getReadableDate(vcStartDates[item.id as string])}`
                                                    : `Contract started on ${getReadableDate(vcStartDates[item.id as string])}`
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
