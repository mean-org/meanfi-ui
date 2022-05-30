import React, { useCallback, useContext, useEffect, useState } from 'react'
import { MoneyStreaming, TreasuryInfo } from '@mean-dao/money-streaming';
import { MSP, Treasury, TreasuryType } from '@mean-dao/msp';
import { Connection, PublicKey } from '@solana/web3.js';
import { consoleOut, kFormatter, toUsCurrency } from '../../utils/ui';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { THREE_MINUTES_REFRESH_TIMEOUT } from '../../constants';
import { INITIAL_TREASURIES_SUMMARY, UserTreasuriesSummary } from '../../models/treasuries';
import { makeDecimal } from '../../utils/utils';
import { AppStateContext } from '../../contexts/appstate';
import { TokenInfo } from '@solana/spl-token-registry';
import BN from 'bn.js';
import { SyncOutlined } from '@ant-design/icons';
import { useWallet } from '../../contexts/wallet';
import { Tooltip } from 'antd';
import { IconLoading } from '../../Icons';
import { STREAMING_ACCOUNTS_ROUTE_BASE_PATH } from '../../pages/treasuries';

export const TreasuriesSummary = (props: {
    address: string;
    connection: Connection;
    ms: MoneyStreaming | undefined;
    msp: MSP | undefined;
    selected: boolean;
    enabled: boolean;
    title: string;
    tooltipEnabled: string;
    tooltipDisabled: string;
    targetPath?: string;
    onSelect: any;
    onNewValue: any;
}) => {

    const { address, connection, ms, msp, selected, onSelect, onNewValue, enabled, title, tooltipEnabled, tooltipDisabled, targetPath } = props;
    const { connected, publicKey } = useWallet();
    const {
        previousWalletConnectState,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
    } = useContext(AppStateContext);
    const { pathname } = useLocation();
    const [searchParams] = useSearchParams();
    const [treasuryList, setTreasuryList] = useState<(Treasury | TreasuryInfo)[]>([]);
    const [loadingTreasuries, setLoadingTreasuries] = useState(false);
    const [treasuriesLoaded, setTreasuriesLoaded] = useState(false);
    const [treasuriesSummary, setTreasuriesSummary] = useState<UserTreasuriesSummary>(INITIAL_TREASURIES_SUMMARY);
    const [prevAddress, setPrevAddress] = useState('');

    ////////////////////////////
    //   Events and actions   //
    ////////////////////////////

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

        const treasuries = await msp.listTreasuries(new PublicKey(address));

        return treasuries.filter((t: any) => !t.autoClose);

    }, [address, connection, loadingTreasuries, msp]);

    const refreshTreasuries = useCallback(() => {

        if (!connection || !address || loadingTreasuries) { return; }

        if (msp && ms) {

            setTimeout(() => {
                setLoadingTreasuries(true);
            });

            const treasuryAccumulator: (Treasury | TreasuryInfo)[] = [];
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
                        const asset = getTokenByMintAddress(ata);
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

    }, [address, connection, getAllUserV2Treasuries, getTokenByMintAddress, getTreasuryUnallocatedBalance, loadingTreasuries, ms, msp]);

    const refreshTreasuriesSummary = useCallback(async () => {

        if (!treasuryList) { return; }

        const resume: UserTreasuriesSummary = {
            totalAmount: 0,
            openAmount: 0,
            lockedAmount: 0,
            totalNet: 0
        };

        consoleOut('=========== Block start ===========', '', 'orange');

        for (const treasury of treasuryList) {

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
            const asset = getTokenByMintAddress(associatedToken);

            if (asset) {
                pricePerToken = getTokenPriceBySymbol(asset.symbol);
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
        setTreasuriesSummary(resume);
        onNewValue(resume.totalNet);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        getTokenPriceBySymbol,
        getTokenByMintAddress,
        getTreasuryUnallocatedBalance,
        treasuryList
    ]);


    /////////////////////
    // Data management //
    /////////////////////

    // Load treasuries once
    useEffect(() => {

        if (!address || treasuriesLoaded) { return; }

        consoleOut('Calling refreshTreasuries...', '', 'blue');
        setPrevAddress(address);
        setTreasuriesLoaded(true);
        refreshTreasuries();

    }, [address, refreshTreasuries, treasuriesLoaded]);

    useEffect(() => {

        if (!address) { return; }

        if (address !== prevAddress) {
            refreshTreasuries();
        }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, prevAddress]);

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

    // Hook on the wallet connect/disconnect
    useEffect(() => {

        if (previousWalletConnectState !== connected) {
            // User is connecting
            if (!previousWalletConnectState && connected && publicKey) {
                consoleOut('User is connecting...', '', 'blue');
                onNewValue(0);
                setTreasuryList([]);
                setTreasuriesSummary(INITIAL_TREASURIES_SUMMARY);
                refreshTreasuries();
            } else if (previousWalletConnectState && !connected) {
                consoleOut('Cleaning TreasuriesSummary state...', '', 'blue');
                setTreasuriesSummary(INITIAL_TREASURIES_SUMMARY);
                setTreasuryList([]);
                setTreasuriesLoaded(false);
                onNewValue(0);
            }
        }

    }, [connected, onNewValue, previousWalletConnectState, publicKey, refreshTreasuries]);

    ///////////////
    // Rendering //
    ///////////////

    const renderContent = (
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
                <div className="title">{title}</div>
                {loadingTreasuries ? (
                    <div className="subtitle"><IconLoading className="mean-svg-icons" style={{ height: "12px", lineHeight: "12px" }}/></div>
                ) : treasuriesSummary.totalAmount === 0 ? (
                    <div className="subtitle">No accounts</div>
                ) : (
                    <div className="subtitle">{treasuriesSummary.totalAmount} {treasuriesSummary.totalAmount === 1 ? 'account' : 'accounts'}</div>
                )}
            </div>
            <div className="rate-cell">
                {loadingTreasuries ? (
                    <>
                        <div className="rate-amount">
                            <IconLoading className="mean-svg-icons" style={{ height: "15px", lineHeight: "15px" }}/>
                        </div>
                        <div className="interval">Balance TVL</div>
                    </>
                ) : treasuriesSummary.totalAmount === 0 ? (
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
    );

    return (
        <>
            {publicKey && enabled ? (
                <Link to={targetPath || STREAMING_ACCOUNTS_ROUTE_BASE_PATH} state={{ previousPath: searchParams ? `${pathname}?${searchParams.toString()}` : pathname }}>
                    <Tooltip title={tooltipEnabled}>
                        {renderContent}
                    </Tooltip>
                </Link>
            ) : (
                <Tooltip title={tooltipDisabled}>
                    {renderContent}
                </Tooltip>
            )}
        </>
    );

};
