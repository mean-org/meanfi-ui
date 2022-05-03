import React, { useCallback, useContext, useEffect, useState } from 'react'
import { MoneyStreaming, TreasuryInfo } from '@mean-dao/money-streaming';
import { MSP, Treasury, TreasuryType } from '@mean-dao/msp';
import { Connection, PublicKey } from '@solana/web3.js';
import { consoleOut, isProd, kFormatter, toUsCurrency } from '../../utils/ui';
import { Link } from 'react-router-dom';
import { THREE_MINUTES_REFRESH_TIMEOUT } from '../../constants';
import { INITIAL_TREASURIES_SUMMARY, UserTreasuriesSummary } from '../../models/treasuries';
import { getTokenByMintAddress, makeDecimal } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TokenInfo } from '@solana/spl-token-registry';
import BN from 'bn.js';
import { SyncOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

export const TreasuriesSummary = (props: {
    address: string;
    connection: Connection;
    ms: MoneyStreaming | undefined;
    msp: MSP | undefined;
    selected: boolean;
    onSelect: any;
    onNewValue: any;
}) => {

    const { address, connection, ms, msp, selected, onSelect, onNewValue } = props;
    const {
        coinPrices,
        userTokens,
        splTokenList
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');
    const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
    const [loadingTreasuries, setLoadingTreasuries] = useState(false);
    const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
    const [lastSummary, setLastSummary] = useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);
    const [treasuriesSummary, setTreasuriesSummary] = useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);

    ////////////////////////////
    //   Events and actions   //
    ////////////////////////////

    const getPricePerToken = useCallback((token: TokenInfo): number => {
        if (!token || !coinPrices) { return 0; }

        return coinPrices && coinPrices[token.address]
            ? coinPrices[token.address]
            : 0;
    }, [coinPrices])

    const getTreasuryUnallocatedBalance = useCallback((tsry: Treasury | TreasuryInfo, assToken: TokenInfo | undefined) => {
        if (tsry) {
            const decimals = assToken ? assToken.decimals : 9;
            const unallocated = tsry.balance - tsry.allocationAssigned;
            const isNewTreasury = (tsry as Treasury).version && (tsry as Treasury).version >= 2 ? true : false;
            const ub = isNewTreasury
                ? makeDecimal(new BN(unallocated), decimals)
                : unallocated;
            return ub;
        }
        return 0;
    }, []);

    const getAllUserV2Treasuries = useCallback(async () => {

        if (!connection || !address || loadingTreasuries || !msp) { return []; }

        let treasuries = await msp.listTreasuries(new PublicKey(address));

        return treasuries.filter((t: any) => !t.autoClose);

    }, [address, connection, loadingTreasuries, msp]);

    const refreshTreasuries = useCallback(() => {

        if (!connection || !address || loadingTreasuries) { return; }

        if (msp && ms) {

            setTimeout(() => {
                setLoadingTreasuries(true);
            });

            let treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
            let treasuriesv1: TreasuryInfo[] = [];

            getAllUserV2Treasuries()
                .then(async (treasuriesv2) => {
                    treasuryAccumulator.push(...treasuriesv2);
                    consoleOut('v2 treasuries:', treasuriesv2, 'blue');

                    try {
                        treasuriesv1 = await ms.listTreasuries(new PublicKey(address));
                    } catch (error) {
                        console.error(error);
                    }
                    consoleOut('v1 treasuries:', treasuriesv1, 'blue');
                    treasuryAccumulator.push(...treasuriesv1);

                    setTreasuryList(treasuryAccumulator);
                    consoleOut('Combined treasury list:', treasuryAccumulator.map(i => {
                        const isNew = (i as Treasury).version && (i as Treasury).version >= 2 ? true : false;
                        const v1 = i as TreasuryInfo;
                        const v2 = i as Treasury;
                        const ata = isNew ? v2.associatedToken as string : v1.associatedTokenAddress as string;
                        const asset = getTokenByMintAddress(ata, isProd() ? splTokenList : userTokens);
                        return {
                            version: isNew ? v2.version : 1,
                            token: asset ? asset.symbol : '-',
                            name: isNew ? v2.name : v1.label,
                            balance: getTreasuryUnallocatedBalance(i, asset),
                        };
                    }), 'blue');

                })
                .catch(error => {
                    console.error(error);
                })
                .finally(() => setLoadingTreasuries(false));
        }

    }, [address, connection, getAllUserV2Treasuries, getTreasuryUnallocatedBalance, loadingTreasuries, ms, msp, splTokenList, userTokens]);

    const refreshTreasuriesSummary = useCallback(async () => {

        if (!treasuryList) { return; }

        let resume: UserTreasuriesSummary = {
            totalAmount: 0,
            openAmount: 0,
            lockedAmount: 0,
            totalNet: 0
        };

        consoleOut('=========== Block strat ===========', '', 'orange');

        for (let treasury of treasuryList) {

            const isNew = (treasury as Treasury).version && (treasury as Treasury).version >= 2
                ? true
                : false;

            const treasuryType = isNew
                ? (treasury as Treasury).treasuryType
                : (treasury as TreasuryInfo).type as TreasuryType;

            const associatedToken = isNew
                ? (treasury as Treasury).associatedToken as string
                : (treasury as TreasuryInfo).associatedTokenAddress as string;

            if (treasuryType === TreasuryType.Open) {
                resume['openAmount'] += 1;
            } else {
                resume['lockedAmount'] += 1;
            }

            let pricePerToken = 0;
            let amountChange = 0;
            const asset = getTokenByMintAddress(associatedToken, isProd() ? splTokenList : userTokens);

            if (asset) {
                pricePerToken = getPricePerToken(asset);
                const rate = asset ? (pricePerToken ? pricePerToken : 1) : 1;
                const amount = getTreasuryUnallocatedBalance(treasury, asset);
                amountChange = amount * rate;
                consoleOut(`${asset.symbol} price (${pricePerToken}) * ${amount} =`, amountChange, 'blue');
            }

            resume['totalNet'] += amountChange;
        }

        resume['totalAmount'] += treasuryList.length;

        consoleOut('openAmount:', resume['openAmount'], 'blue');
        consoleOut('lockedAmount:', resume['lockedAmount'], 'blue');
        consoleOut('totalAmount:', resume['totalAmount'], 'blue');
        consoleOut('totalNet:', resume['totalNet'], 'blue');
        consoleOut('=========== Block ends ===========', '', 'orange');

        // Update state
        setLastSummary(treasuriesSummary)
        setTreasuriesSummary(resume);

        if (resume.totalNet !== treasuriesSummary.totalNet) {
            onNewValue(resume.totalNet);
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        treasuryList,
    ]);


    /////////////////////
    // Data management //
    /////////////////////

    // Load treasuries once
    useEffect(() => {

        if (!address || treasuriesLoaded) { return; }

        consoleOut('Calling refreshTreasuries...', '', 'blue');
        setTreasuriesLoaded(true);
        refreshTreasuries();

    }, [address, refreshTreasuries, treasuriesLoaded]);

    // Treasury list refresh timeout
    useEffect(() => {
        let timer: any;

        if (address && treasuriesLoaded) {
            timer = setInterval(() => {
                consoleOut(`Refreshing treasuries past ${THREE_MINUTES_REFRESH_TIMEOUT / 60 / 1000}min...`);
                refreshTreasuries();
            }, THREE_MINUTES_REFRESH_TIMEOUT);
        }

        return () => clearInterval(timer);
    }, [address, refreshTreasuries, treasuriesLoaded]);

    // Update Treasuries Summary
    useEffect(() => {
        if (treasuryList && treasuryList.length > 0) {
            refreshTreasuriesSummary();
        }
    }, [refreshTreasuriesSummary, treasuryList]);

    ///////////////
    // Rendering //
    ///////////////

    return (
        <>
            <Link to="/treasuries">
                <div key="streams" onClick={onSelect} className={`transaction-list-row ${selected ? 'selected' : ''}`}>
                    <div className="icon-cell">
                        {loadingTreasuries ? (
                            <div className="token-icon animate-border-loading">
                                <div className="streams-count simplelink" onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                }}>
                                    <span className="font-bold text-shadow"><SyncOutlined spin /></span>
                                </div>
                            </div>
                        ) : (
                            <div className="token-icon">
                                <div className="streams-count simplelink" onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    refreshTreasuries();
                                }}>
                                    <span className="font-size-75 font-bold text-shadow">{kFormatter(treasuriesSummary.totalAmount) || 0}</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="description-cell">
                        <div className="title">{t('treasuries.screen-title')}</div>
                        {treasuriesSummary.totalAmount === 0 ? (
                            <div className="subtitle">{t('treasuries.treasury-list.no-treasuries')}</div>
                        ) : (
                            <div className="subtitle">{treasuriesSummary.openAmount} Open, {treasuriesSummary.lockedAmount} Locked</div>
                        )}
                    </div>
                    <div className="rate-cell">
                        {treasuriesSummary.totalAmount === 0 ? (
                            <span className="rate-amount">--</span>
                        ) : (
                            <>
                                <div className="rate-amount">
                                    {toUsCurrency(Math.abs(treasuriesSummary.totalNet))}
                                </div>
                                <div className="interval">Balance TVL</div>
                            </>
                        )}
                    </div>
                </div>
            </Link>
        </>
    );

};
