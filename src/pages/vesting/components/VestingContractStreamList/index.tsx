import React, { useCallback, useContext, useState } from 'react';
import { calculateActionFees, MSP_ACTIONS, Stream, STREAM_STATUS, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { consoleOut, copyText, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTimeToNow } from '../../../../utils/ui';
import { AppStateContext } from '../../../../contexts/appstate';
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { Button, Dropdown, Menu, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { cutNumber, makeDecimal, shortenAddress } from '../../../../utils/utils';
import { TokenInfo } from '@solana/spl-token-registry';
import BN from 'bn.js';
import { openNotification } from '../../../../components/Notifications';
import { IconVerticalEllipsis } from '../../../../Icons';
import { getSolanaExplorerClusterParam, useConnection } from '../../../../contexts/connection';
import { TransactionStatus } from '../../../../models/enums';
import { MultisigTransactionFees } from '@mean-dao/mean-multisig-sdk';
import { TreasuryTopupParams } from '../../../../models/common-types';
import { VestingContractAddFundsModal } from '../TreasuryAddFundsModal';

export const VestingContractStreamList = (props: {
    accountAddress: string;
    vestingContract: Treasury | undefined;
    treasuryStreams: Stream[];
    loadingTreasuryStreams: boolean;
    userBalances: any;
    nativeBalance: number;
}) => {
    const {
        accountAddress,
        vestingContract,
        treasuryStreams,
        loadingTreasuryStreams,
        userBalances,
        nativeBalance,
    } = props;
    const {
        deletedStreams,
        setHighLightableStreamId,
        getTokenByMintAddress,
        setTransactionStatus,
    } = useContext(AppStateContext);
    const connection = useConnection();
    const { t } = useTranslation('common');
    const [highlightedStream, sethHighlightedStream] = useState<Stream | undefined>();
    const [isBusy, setIsBusy] = useState(false);
    const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
    const [multisigTxFees, setMultisigTxFees] = useState<MultisigTransactionFees>({
      multisigFee: 0,
      networkFee: 0,
      rentExempt: 0
    } as MultisigTransactionFees);
    const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
      blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
    });

    const resetTransactionStatus = useCallback(() => {

        setTransactionStatus({
            lastOperation: TransactionStatus.Iddle,
            currentOperation: TransactionStatus.Iddle
        });

    }, [
        setTransactionStatus
    ]);

    const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
        return await calculateActionFees(connection, action);
    }, [connection]);

    const isInboundStream = useCallback((item: Stream): boolean => {
        return item && accountAddress && item.beneficiary === accountAddress ? true : false;
    }, [accountAddress]);

    const isDeletedStream = useCallback((id: string) => {
        if (!deletedStreams) {
            return false;
        }
        return deletedStreams.some(i => i === id);
    }, [deletedStreams]);

    const getRateAmountDisplay = useCallback((item: Stream): string => {
        let value = '';

        if (item) {
            let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

            if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
                token = Object.assign({}, token, {
                    symbol: 'SOL'
                }) as TokenInfo;
            }

            value += getFormattedNumberToLocale(cutNumber(makeDecimal(new BN(item.rateAmount), token?.decimals || 6), 2));
            value += ' ';
            value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
        }
        return value;
    }, [getTokenByMintAddress]);

    const getDepositAmountDisplay = useCallback((item: Stream): string => {
        let value = '';

        if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
            let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

            if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
                token = Object.assign({}, token, {
                    symbol: 'SOL'
                }) as TokenInfo;
            }

            value += getFormattedNumberToLocale(cutNumber(makeDecimal(new BN(item.allocationAssigned), token?.decimals || 6), 2));
            value += ' ';
            value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
        }
        return value;
    }, [getTokenByMintAddress]);

    // const getStreamTypeIcon = useCallback((item: Stream) => {
    //     if (isInboundStream(item)) {
    //         return (
    //             <span className="stream-type incoming">
    //                 <ArrowDownOutlined />
    //             </span>
    //         );
    //     } else {
    //         return (
    //             <span className="stream-type outgoing">
    //                 <ArrowUpOutlined />
    //             </span>
    //         );
    //     }
    // }, [isInboundStream]);

    const getStreamDescription = (item: Stream): string => {
        let title = '';
        if (item) {
            const isInbound = isInboundStream(item);
            if (item.name) {
                return `${item.name}`;
            }
            if (isInbound) {
                if (item.status === STREAM_STATUS.Schedule) {
                    title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurer}`)})`;
                } else if (item.status === STREAM_STATUS.Paused) {
                    title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurer}`)})`;
                } else {
                    title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurer}`)})`;
                }
            } else {
                if (item.status === STREAM_STATUS.Schedule) {
                    title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${item.beneficiary}`)})`;
                } else if (item.status === STREAM_STATUS.Paused) {
                    title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiary}`)})`;
                } else {
                    title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiary}`)})`;
                }
            }
        }

        return title;
    }

    const copyAddressToClipboard = useCallback((address: any) => {

        if (!address) { return; }

        if (copyText(address.toString())) {
            openNotification({
                description: t('notifications.account-address-copied-message'),
                type: "info"
            });
        } else {
            openNotification({
                description: t('notifications.account-address-not-copied-message'),
                type: "error"
            });
        }

    }, [t])

    const getTransactionSubTitle = useCallback((item: Stream) => {
        let title = '';

        if (item) {
            const isInbound = isInboundStream(item);
            let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
            if (item.rateAmount > 0) {
                rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
            }

            if (isInbound) {
                if (item.status === STREAM_STATUS.Schedule) {
                    title = t('streams.stream-list.subtitle-scheduled-inbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string)}`;
                } else {
                    title = t('streams.stream-list.subtitle-running-inbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string)}`;
                }
            } else {
                if (item.status === STREAM_STATUS.Schedule) {
                    title = t('streams.stream-list.subtitle-scheduled-outbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string)}`;
                } else {
                    title = t('streams.stream-list.subtitle-running-outbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string)}`;
                }
            }
        }

        return title;

    }, [isInboundStream, getRateAmountDisplay, getDepositAmountDisplay, t]);

    const getStreamStatus = useCallback((item: Stream) => {

        let bgClass = '';
        let content = '';

        if (item) {
            switch (item.status) {
                case STREAM_STATUS.Schedule:
                    bgClass = 'bg-purple';
                    content = t('streams.status.status-scheduled');
                    break;
                case STREAM_STATUS.Paused:
                    if (item.isManuallyPaused) {
                        bgClass = 'error';
                        content = t('streams.status.status-stopped');
                    } else {
                        bgClass = 'error';
                        content = t('streams.status.status-stopped');
                    }
                    break;
                default:
                    bgClass = 'bg-green';
                    content = t('streams.status.status-running');
                    break;
            }
        }

        return (
            <span className={`badge small font-bold text-uppercase fg-white ${bgClass}`}>{content}</span>
        );

    }, [t]);

    const getStreamStatusSubtitle = useCallback((item: Stream) => {
        if (item) {
            switch (item.status) {
                case STREAM_STATUS.Schedule:
                    return t('streams.status.scheduled', { date: getShortDate(item.startUtc as string) });
                case STREAM_STATUS.Paused:
                    if (item.isManuallyPaused) {
                        return t('streams.status.stopped-manually');
                    }
                    return t('vesting.vesting-account-streams.stream-status-complete');
                default:
                    return t('vesting.vesting-account-streams.stream-status-streaming', { timeLeft: getTimeToNow(item.estimatedDepletionDate as string) });
            }
        }
    }, [t]);

    //////////////
    //  Modals  //
    //////////////

    // Add funds modal
    const [isAddFundsModalVisible, setIsAddFundsModalVisibility] = useState(false);
    const showAddFundsModal = useCallback(() => {
        resetTransactionStatus();
        if (vestingContract) {
            getTransactionFees(MSP_ACTIONS.addFunds).then(value => {
                setTransactionFees(value);
                consoleOut('transactionFees:', value, 'orange');
            });
            getTransactionFees(MSP_ACTIONS.withdraw).then(value => {
                setWithdrawTransactionFees(value);
                consoleOut('withdrawTransactionFees:', value, 'orange');
            });
            setIsAddFundsModalVisibility(true);
        }
    }, [getTransactionFees, resetTransactionStatus, vestingContract]);

    const onAcceptAddFunds = (params: TreasuryTopupParams) => {
        consoleOut('AddFunds params:', params, 'blue');
        // onExecuteAddFundsTransaction(params);
    };

    const closeAddFundsModal = useCallback(() => {
        setIsAddFundsModalVisibility(false);
        setHighLightableStreamId(undefined);
        sethHighlightedStream(undefined);
    }, [setHighLightableStreamId]);

    ///////////////
    // Rendering //
    ///////////////

    const renderStreamOptions = (item: Stream) => {
        if (!vestingContract) { return null; }

        const isNewTreasury = item.version && item.version >= 2 ? true : false;

        const menu = (
            <Menu>
                {(isNewTreasury && vestingContract.treasuryType === TreasuryType.Open) && (
                    <>
                        {item.status === STREAM_STATUS.Paused
                            ? (
                                <>
                                    {item.fundsLeftInStream > 0 && (
                                        <Menu.Item key="1" onClick={() => {}}> {/* showResumeStreamModal */}
                                            <span className="menu-item-text">{t('treasuries.treasury-streams.option-resume-stream')}</span>
                                        </Menu.Item>
                                    )}
                                </>
                            ) : item.status === STREAM_STATUS.Running ? (
                                <Menu.Item key="2" onClick={() => {}}> {/* showPauseStreamModal */}
                                    <span className="menu-item-text">{t('treasuries.treasury-streams.option-pause-stream')}</span>
                                </Menu.Item>
                            ) : null
                        }
                        <Menu.Item key="3" onClick={showAddFundsModal}>
                            <span className="menu-item-text">{t('streams.stream-detail.add-funds-cta')}</span>
                        </Menu.Item>
                    </>
                )}
                {(!isNewTreasury ||
                    (isNewTreasury && vestingContract.treasuryType === TreasuryType.Open) ||
                    (isNewTreasury && vestingContract.treasuryType === TreasuryType.Lock && item.status === STREAM_STATUS.Paused)) && (
                    <Menu.Item key="4" onClick={() => {}}> {/* showCloseStreamModal */}
                        <span className="menu-item-text">{t('treasuries.treasury-streams.option-close-stream')}</span>
                    </Menu.Item>
                )}
                <Menu.Item key="5" onClick={() => copyAddressToClipboard(item.id)}>
                    <span className="menu-item-text">Copy Stream ID</span>
                </Menu.Item>
                <Menu.Item key="6" onClick={() => {
                    // setHighLightableStreamId(item.id as string);
                    // if (isMultisigTreasury(treasuryDetails)) {
                    //     const url = `${STREAMING_ACCOUNTS_ROUTE_BASE_PATH}/${(treasuryDetails as Treasury).id}/streams`;
                    //     consoleOut('With treasurer:', (treasuryDetails as Treasury).treasurer, 'blue');
                    //     // Populate the list of streams in the state before going there.
                    //     setStreamList(treasuryStreams || []);
                    //     consoleOut('Heading to:', url, 'blue');
                    //     // Set this so we can know how to return
                    //     if (selectedMultisig) {
                    //         setHighLightableMultisigId(selectedMultisig.authority.toBase58());
                    //     }
                    //     navigate(url);
                    // } else {
                    //     refreshStreamList();
                    //     navigate(STREAMS_ROUTE_BASE_PATH);
                    // }
                }}>
                    <span className="menu-item-text">Show stream</span>
                </Menu.Item>
                <Menu.Item key="7" onClick={() => { }}>
                    <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
                        target="_blank" rel="noopener noreferrer">
                        <span className="menu-item-text">{t('treasuries.treasury-streams.option-explorer-link')}</span>
                    </a>
                </Menu.Item>
            </Menu>
        );

        return (
            <Dropdown
                overlay={menu}
                trigger={["click"]}
                onVisibleChange={(visibleChange: any) => {
                    if (visibleChange) {
                        sethHighlightedStream(item);
                        setHighLightableStreamId(item.id as string);
                    } else {
                        sethHighlightedStream(undefined);
                    }
                }}>
                <span className="icon-button-container">
                    <Button
                        type="default"
                        shape="circle"
                        size="middle"
                        icon={<IconVerticalEllipsis className="mean-svg-icons" />}
                        onClick={(e) => e.preventDefault()}
                    />
                </span>
            </Dropdown>
        );
    }

    // const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    //     event.currentTarget.src = FALLBACK_COIN_IMAGE;
    //     event.currentTarget.className = "error";
    // };

    return (
        <>
            <div className="tab-inner-content-wrapper vesting-contract-streams vertical-scroll">
                <Spin spinning={loadingTreasuryStreams}>
                    {(treasuryStreams && treasuryStreams.length > 0) ? (
                        treasuryStreams.map((item, index) => {
                            // const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
                            // const onStreamClick = () => {
                            //     setSelectedStream(item);
                            //     setDtailsPanelOpen(true);
                            //     consoleOut('list item selected:', item, 'blue');
                            // };

                            return (
                                <div key={`${index + 50}`} id={`${item.id}`}
                                    className={
                                        `transaction-list-row stripped-rows ${isDeletedStream(item.id as string)
                                            ? 'disabled blurry-1x'
                                            : highlightedStream && highlightedStream.id === item.id
                                                ? 'selected'
                                                : ''}`
                                    }>
                                    {/* <div className="icon-cell">
                                        {getStreamTypeIcon(item)}
                                        <div className="token-icon">
                                            {item.associatedToken ? (
                                                <>
                                                    {token ? (
                                                        <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} />
                                                    ) : (
                                                        <Identicon address={item.associatedToken} style={{ width: "30", display: "inline-flex" }} />
                                                    )}
                                                </>
                                            ) : (
                                                <Identicon address={item.id} style={{ width: "30", display: "inline-flex" }} />
                                            )}
                                        </div>
                                    </div> */}
                                    <div className="description-cell no-padding">
                                        <div className="title text-truncate">{getStreamDescription(item)}</div>
                                        <div className="subtitle text-truncate">{getTransactionSubTitle(item)}</div>
                                    </div>
                                    <div className="rate-cell">
                                        <div className="rate-amount">{getStreamStatus(item)}</div>
                                        <div className="interval">{getStreamStatusSubtitle(item)}</div>
                                    </div>
                                    <div className="actions-cell">
                                        {renderStreamOptions(item)}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <>
                            {loadingTreasuryStreams ? (
                                <p>{t('treasuries.treasury-streams.loading-streams')}</p>
                            ) : (
                                <>
                                    <p>{t('vesting.vesting-account-streams.no-streams')}</p>
                                </>
                            )}
                        </>
                    )}
                </Spin>
            </div>

            {isAddFundsModalVisible && (
                <VestingContractAddFundsModal
                    handleOk={onAcceptAddFunds}
                    handleClose={closeAddFundsModal}
                    nativeBalance={nativeBalance}
                    transactionFees={transactionFees}
                    withdrawTransactionFees={withdrawTransactionFees}
                    vestingContract={vestingContract}
                    isVisible={isAddFundsModalVisible}
                    userBalances={userBalances}
                    treasuryStreams={treasuryStreams}
                    associatedToken={vestingContract ? vestingContract.associatedToken as string : ''}
                    isBusy={isBusy}
                />
            )}
        </>
    );
};
