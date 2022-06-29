import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
    Divider,
    Row,
    Col,
    Button,
    Spin,
    Tooltip,
    Empty,
} from "antd";
import {
    ArrowDownOutlined,
    ArrowLeftOutlined,
    ArrowUpOutlined,
    LoadingOutlined,
    ReloadOutlined,
    SyncOutlined,
} from "@ant-design/icons";
import {
    IconBank,
    IconBox,
    IconClock,
    IconDownload,
    IconExternalLink,
    IconShare,
    IconUpload,
} from "../../Icons";
import { AppStateContext } from "../../contexts/appstate";
import { useWallet } from "../../contexts/wallet";
import {
    formatAmount,
    formatThousands,
    getAmountWithSymbol,
    getTokenAmountAndSymbolByTokenAddress,
    getTokenSymbol,
    shortenAddress,
    toUiAmount,
} from "../../utils/utils";
import {
    consoleOut,
    copyText,
    friendlyDisplayDecimalPlaces,
    getFormattedNumberToLocale,
    getIntervalFromSeconds,
    getReadableDate,
    getShortDate,
    isValidAddress,
} from "../../utils/ui";
import {
    FALLBACK_COIN_IMAGE,
    SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
    SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
    FIVE_MINUTES_REFRESH_TIMEOUT,
    CUSTOM_TOKEN_NAME,
} from "../../constants";
import {
    getSolanaExplorerClusterParam,
    useConnection,
    useConnectionConfig,
} from "../../contexts/connection";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { OperationType } from "../../models/enums";
import { TokenInfo } from "@solana/spl-token-registry";
import { useNativeAccount } from "../../contexts/accounts";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { TxConfirmationContext } from "../../contexts/transaction-status";
import { Identicon } from "../../components/Identicon";
import { MoneyStreaming } from "@mean-dao/money-streaming/lib/money-streaming";
import BN from "bn.js";
import {
    StreamActivity,
    StreamInfo,
    STREAM_STATE,
    TreasuryInfo,
} from "@mean-dao/money-streaming/lib/types";
import {
    MSP,
    Stream,
    STREAM_STATUS,
    Treasury,
    TreasuryType,
} from "@mean-dao/msp";
import { StreamsSummary } from "../../models/streams";
import { StreamTreasuryType } from "../../models/treasuries";
import { PreFooter } from "../../components/PreFooter";
import { openNotification } from "../../components/Notifications";
import { STREAMING_ACCOUNTS_ROUTE_BASE_PATH } from "../treasuries";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const MultisigTreasuryStreams = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const connection = useConnection();
    const { endpoint } = useConnectionConfig();
    const { connected, wallet, publicKey } = useWallet();
    const {
        theme,
        streamList,
        streamDetail,
        selectedStream,
        selectedToken,
        streamsSummary,
        detailsPanelOpen,
        streamProgramAddress,
        hasMoreStreamActivity,
        highLightableStreamId,
        streamV2ProgramAddress,
        highLightableMultisigId,
        setHighLightableStreamId,
        getTokenPriceBySymbol,
        setLastStreamsSummary,
        getTokenByMintAddress,
        refreshTokenBalance,
        setDtailsPanelOpen,
        getStreamActivity,
        setSelectedStream,
        setStreamsSummary,
        setSelectedToken,
        setEffectiveRate,
        setStreamDetail,
        setStreamList,
    } = useContext(AppStateContext);
    const {
        fetchTxInfoStatus,
        lastSentTxOperationType,
    } = useContext(TxConfirmationContext);

    const { t } = useTranslation("common");
    const { account } = useNativeAccount();
    const { id } = useParams(); // Unpacking and retrieve id
    const [previousBalance, setPreviousBalance] = useState(account?.lamports);
    const [nativeBalance, setNativeBalance] = useState(0);
    const [loadingTreasuryStreams, setLoadingTreasuryStreams] = useState(false);
    const [signalRefreshTreasuryStreams, setSignalRefreshTreasuryStreams] = useState(false);
    const [loadingStreamActivity, setLoadingStreamActivity] = useState(false);
    const [streamActivity, setStreamActivity] = useState<StreamActivity[]>([]);

    // Treasury related
    const [loadingTreasuryDetails, setLoadingTreasuryDetails] = useState(true);
    const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);

    // Create and cache Money Streaming Program instance
    const ms = useMemo(
        () => new MoneyStreaming(endpoint, streamProgramAddress, "confirmed"),
        [endpoint, streamProgramAddress]
    );

    const msp = useMemo(() => {
        if (publicKey) {
            console.log("New MSP from streams");
            return new MSP(endpoint, streamV2ProgramAddress, "confirmed");
        }
    }, [publicKey, endpoint, streamV2ProgramAddress]);

    /////////////////
    //  CALLBACKS  //
    /////////////////

    const getTreasuryStreams = useCallback((treasuryPk: PublicKey) => {
        if (!publicKey || !ms || loadingTreasuryStreams) { return; }

        setTimeout(() => {
            setLoadingTreasuryStreams(true);
        });

        consoleOut('Executing getTreasuryStreams...', '', 'blue');

        if (msp) {
            msp.listStreams({ treasury: treasuryPk })
                .then((streams) => {
                    consoleOut('streamList:', streams, 'blue');
                    setStreamList(streams);
                    if (streams && streams.length > 0) {
                        let item: Stream | undefined;
                        if (highLightableStreamId) {
                            const highLightableItem = streams.find(i => i.id === highLightableStreamId);
                            item = highLightableItem || streams[0];
                        } else if (selectedStream) {
                            const itemFromServer = streams.find(i => i.id === selectedStream.id);
                            item = itemFromServer || streams[0];
                        } else {
                            item = streams[0];
                        }
                        if (!item) {
                            item = Object.assign({}, streams[0]);
                        }
                        consoleOut('selectedStream:', item, 'blue');
                        if (item && selectedStream && item.id !== selectedStream.id) {
                            setStreamDetail(item);
                            msp.getStream(new PublicKey(item.id as string))
                                .then((detail: Stream | StreamInfo) => {
                                    if (detail) {
                                        setStreamDetail(detail);
                                        const token = getTokenByMintAddress(detail.associatedToken as string);
                                        setSelectedToken(token);
                                        if (!loadingStreamActivity) {
                                            setLoadingStreamActivity(true);
                                            getStreamActivity(detail.id as string, detail.version);
                                        }
                                    }
                                })
                        } else {
                            if (item) {
                                setStreamDetail(item);
                                getStreamActivity(item.id as string, item.version);
                            }
                        }
                    } else {
                        setStreamDetail(undefined);
                        setStreamActivity([]);
                    }
                })
                .catch(err => {
                    console.error(err);
                    setStreamList([]);
                })
                .finally(() => {
                    setLoadingTreasuryStreams(false);
                });
        }

    }, [
        ms,
        msp,
        publicKey,
        selectedStream,
        loadingStreamActivity,
        highLightableStreamId,
        loadingTreasuryStreams,
        getTokenByMintAddress,
        getStreamActivity,
        setSelectedToken,
        setStreamDetail,
        setStreamList,
    ]);

    const getTreasuryName = useCallback(() => {
        if (treasuryDetails) {
            const v1 = treasuryDetails as TreasuryInfo;
            const v2 = treasuryDetails as Treasury;
            const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
            return isNewTreasury ? v2.name : v1.label;
        }
        return "-";
    }, [treasuryDetails]);

    const getTreasuryType = useCallback((): StreamTreasuryType | undefined => {
        if (treasuryDetails) {
            const v1 = treasuryDetails as TreasuryInfo;
            const v2 = treasuryDetails as Treasury;
            const isNewTreasury = v2.version && v2.version >= 2 ? true : false;
            const type = isNewTreasury ? v2.treasuryType : v1.type;
            if (type === TreasuryType.Lock) {
                return "locked";
            } else {
                return "open";
            }
        }

        return "unknown";
    }, [treasuryDetails]);

    const getTreasuryByTreasuryId = useCallback(
        async (
            treasuryId: string,
            version: number
        ): Promise<StreamTreasuryType | undefined> => {
            if (!connection || !publicKey || !ms || !msp) {
                return undefined;
            }

            const mspInstance = version < 2 ? ms : msp;
            const treasueyPk = new PublicKey(treasuryId);

            setTimeout(() => {
                setLoadingTreasuryDetails(true);
            });

            try {
                const details = await mspInstance.getTreasury(treasueyPk);
                if (details) {
                    setTreasuryDetails(details);
                    consoleOut("treasuryDetails:", details, "blue");
                } else {
                    setTreasuryDetails(undefined);
                }
            } catch (error) {
                console.error(error);
            } finally {
                setLoadingTreasuryDetails(false);
            }
        },
        [ms, msp, publicKey, connection]
    );

    const setCustomToken = useCallback(
        (address: string) => {
            if (address && isValidAddress(address)) {
                const unkToken: TokenInfo = {
                    address: address,
                    name: CUSTOM_TOKEN_NAME,
                    chainId: 101,
                    decimals: 6,
                    symbol: shortenAddress(address),
                };
                setSelectedToken(unkToken);
                consoleOut("stream token:", unkToken, "blue");
                setEffectiveRate(0);
            } else {
                openNotification({
                    title: t("notifications.error-title"),
                    description: t("transactions.validation.invalid-solana-address"),
                    type: "error",
                });
            }
        },
        [setEffectiveRate, setSelectedToken, t]
    );

    const isInboundStream = useCallback(
        (item: Stream | StreamInfo): boolean => {
            if (item && publicKey) {
                const v1 = item as StreamInfo;
                const v2 = item as Stream;
                if (v1.version < 2) {
                    return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
                } else {
                    return v2.beneficiary === publicKey.toBase58() ? true : false;
                }
            }
            return false;
        },
        [publicKey]
    );

    /////////////////
    //   EFFECTS   //
    /////////////////

    // Keep account balance updated
    useEffect(() => {
        const getAccountBalance = (): number => {
            return (account?.lamports || 0) / LAMPORTS_PER_SOL;
        };

        if (account?.lamports !== previousBalance || !nativeBalance) {
            // Refresh token balance
            refreshTokenBalance();
            setNativeBalance(getAccountBalance());
            // Update previous balance
            setPreviousBalance(account?.lamports);
        }
    }, [account, nativeBalance, previousBalance, refreshTokenBalance]);

    // Get treasury details from path param
    useEffect(() => {
        if (!publicKey || !ms || !msp || !id) { return; }

        consoleOut("Reading treasury data...", "", "blue");
        getTreasuryByTreasuryId(id, 2)
            .then((value) => {
                setSignalRefreshTreasuryStreams(true);
            });

    }, [
        id,
        ms,
        msp,
        publicKey,
        getTreasuryByTreasuryId
    ]);

    // Reload Treasury streams whenever the selected treasury changes
    useEffect(() => {
        if (!publicKey) { return; }

        if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
            setSignalRefreshTreasuryStreams(false);
            consoleOut('calling getTreasuryStreams...', '', 'blue');
            const treasuryPk = new PublicKey(treasuryDetails.id as string);
            getTreasuryStreams(treasuryPk);
        }
    }, [
        ms,
        publicKey,
        treasuryDetails,
        loadingTreasuryStreams,
        signalRefreshTreasuryStreams,
        getTreasuryStreams,
    ]);

    // Streams refresh timeout
    useEffect(() => {
        let timer: any;

        if (location.pathname.startsWith('/treasuries') && location.pathname.endsWith('/streams')) {
            timer = setInterval(() => {
                consoleOut(`Refreshing treasury streams past ${FIVE_MINUTES_REFRESH_TIMEOUT / 60 / 1000}min...`);
                if (treasuryDetails && !loadingTreasuryStreams && signalRefreshTreasuryStreams) {
                    setSignalRefreshTreasuryStreams(false);
                    consoleOut('calling getTreasuryStreams...', '', 'blue');
                    const treasuryPk = new PublicKey(treasuryDetails.id as string);
                    getTreasuryStreams(treasuryPk);
                }
            }, FIVE_MINUTES_REFRESH_TIMEOUT);
        }

        return () => clearInterval(timer);
    }, [
        location,
        streamList,
        treasuryDetails,
        loadingTreasuryStreams,
        signalRefreshTreasuryStreams,
        getTreasuryStreams,
    ]);

    // Live data calculation - Streams list
    useEffect(() => {
        const refreshStreams = async () => {
            if (!msp || !streamList || !publicKey || loadingTreasuryStreams) {
                return;
            }

            const updatedStreamsv2 = await msp.refreshStreams(
                (streamList as Stream[]) || [],
                publicKey
            );

            const newList: Array<Stream | StreamInfo> = [];
            // Get an updated version for each v2 stream in the list
            if (updatedStreamsv2 && updatedStreamsv2.length) {
                let freshStream: Stream;
                for (const stream of updatedStreamsv2) {
                    freshStream = await msp.refreshStream(stream);
                    if (freshStream) {
                        newList.push(freshStream);
                        if (streamDetail && streamDetail.id === stream.id) {
                            setStreamDetail(freshStream);
                        }
                    }
                }
            }

            // Finally update the combined list
            if (newList.length) {
                setStreamList(
                    newList.sort((a, b) =>
                        a.createdBlockTime < b.createdBlockTime ? 1 : -1
                    )
                );
            }
        };

        const timeout = setTimeout(() => {
            refreshStreams();
        }, 1000);

        return () => {
            clearTimeout(timeout);
        };
    }, [
        msp,
        publicKey,
        streamList,
        streamDetail,
        loadingTreasuryStreams,
        setStreamDetail,
        setStreamList,
    ]);

    // Live data calculation - Stream summary
    useEffect(() => {
        const refreshStreamSummary = async () => {
            if (
                !msp ||
                !publicKey ||
                !streamList
            ) {
                return;
            }

            const resume: StreamsSummary = {
                totalNet: 0,
                incomingAmount: 0,
                outgoingAmount: 0,
                totalAmount: 0,
            };

            const updatedStreamsv2 = await msp.refreshStreams(
                streamList as Stream[] || [],
                publicKey
            );

            // consoleOut('=========== Block start ===========', '', 'orange');

            let streamsUsdNetChange = 0;

            for (const stream of updatedStreamsv2) {
                const isIncoming =
                    stream.beneficiary && stream.beneficiary === publicKey.toBase58()
                        ? true
                        : false;

                if (isIncoming) {
                    resume["incomingAmount"] = resume["incomingAmount"] + 1;
                } else {
                    resume["outgoingAmount"] = resume["outgoingAmount"] + 1;
                }

                // Get refreshed data
                const freshStream = (await msp.refreshStream(stream)) as Stream;
                if (!freshStream || freshStream.status !== STREAM_STATUS.Running) {
                    continue;
                }

                const asset = getTokenByMintAddress(
                    freshStream.associatedToken as string
                );
                const rate = asset ? getTokenPriceBySymbol(asset.symbol) : 0;
                const streamUnitsUsdPerSecond =
                    parseFloat(
                        freshStream.streamUnitsPerSecond.toFixed(asset?.decimals || 9)
                    ) * rate;
                // consoleOut(`rate for 1 ${asset ? asset.symbol : '[' + shortenAddress(freshStream.associatedToken as string, 6) + ']'}`, rate, 'blue');
                // consoleOut(`streamUnitsPerSecond: ${isIncoming ? '↑' : '↓'}`, freshStream.streamUnitsPerSecond.toFixed(asset?.decimals || 9), 'blue');
                // consoleOut(`streamUnitsUsdPerSecond: ${isIncoming ? '↑' : '↓'}`, streamUnitsUsdPerSecond, 'blue');
                if (isIncoming) {
                    streamsUsdNetChange += streamUnitsUsdPerSecond;
                } else {
                    streamsUsdNetChange -= streamUnitsUsdPerSecond;
                }
            }

            resume["totalAmount"] += updatedStreamsv2.length;
            resume["totalNet"] += streamsUsdNetChange;

            // consoleOut('totalNet:', resume['totalNet'], 'blue');
            // consoleOut('=========== Block ends ===========', '', 'orange');

            // Update state
            setLastStreamsSummary(streamsSummary);
            setStreamsSummary(resume);
        };

        const timeout = setTimeout(() => {
            if (publicKey && streamList) {
                refreshStreamSummary();
            }
        }, 3000);

        return () => {
            clearTimeout(timeout);
        };
    }, [
        ms,
        msp,
        publicKey,
        streamList,
        streamsSummary,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
        setLastStreamsSummary,
        setStreamsSummary,
    ]);

    // Scroll to a given stream is specified as highLightableStreamId
    useEffect(() => {
        if (
            loadingTreasuryStreams ||
            !streamList ||
            streamList.length === 0 ||
            !highLightableStreamId
        ) {
            return;
        }

        const timeout = setTimeout(() => {
            if (streamDetail && streamDetail.id !== highLightableStreamId) {
                const item = streamList.find((s) => s.id === highLightableStreamId);
                if (item) {
                    setSelectedStream(item);
                }
            }
            const highlightTarget = document.getElementById(highLightableStreamId);
            if (highlightTarget) {
                consoleOut("Scrolling stream into view...", "", "green");
                highlightTarget.scrollIntoView({ behavior: "smooth" });
            }
            setHighLightableStreamId(undefined);
        });

        return () => {
            clearTimeout(timeout);
        };
    }, [
        streamList,
        streamDetail,
        highLightableStreamId,
        loadingTreasuryStreams,
        setHighLightableStreamId,
        setSelectedStream,
    ]);

    // Watch for stream's associated token changes then load the token to the state as selectedToken
    useEffect(() => {
        if (
            streamDetail &&
            selectedToken?.address !== streamDetail.associatedToken
        ) {
            const token = getTokenByMintAddress(
                streamDetail.associatedToken as string
            );
            if (token) {
                consoleOut("stream token:", token, "blue");
                if (!selectedToken || selectedToken.address !== token.address) {
                    setSelectedToken(token);
                }
            } else if (
                !token &&
                (!selectedToken ||
                    selectedToken.address !== streamDetail.associatedToken)
            ) {
                setCustomToken(streamDetail.associatedToken as string);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        selectedToken,
        setCustomToken,
        setSelectedToken,
        streamDetail?.associatedToken,
    ]);

    ///////////////////////
    //  EVENTS & MODALS  //
    ///////////////////////

    const getStreamTypeIcon = useCallback(
        (item: Stream | StreamInfo) => {
            if (isInboundStream(item)) {
                return (
                    <span className="stream-type incoming">
                        <ArrowDownOutlined />
                    </span>
                );
            } else {
                return (
                    <span className="stream-type outgoing">
                        <ArrowUpOutlined />
                    </span>
                );
            }
        },
        [isInboundStream]
    );

    const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
        let value = '';

        if (item) {
            const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
            if (item.version < 2) {
                value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
            } else {
                value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
            }
            value += ' ';
            value += getTokenSymbol(item.associatedToken as string);
        }
        return value;
    }, [getTokenByMintAddress]);

    const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
        let value = '';

        if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
            const token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;
            if (item.version < 2) {
                value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
            } else {
                value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
            }
            value += ' ';
            value += getTokenSymbol(item.associatedToken as string);
        }
        return value;
    }, [getTokenByMintAddress]);

    const getStreamDescription = (item: Stream | StreamInfo): string => {
        let title = "";
        if (item) {
            const v1 = item as StreamInfo;
            const v2 = item as Stream;
            const isInbound = isInboundStream(item);
            if (v1.version < 2) {
                if (v1.streamName) {
                    return `${v1.streamName}`;
                }
                if (isInbound) {
                    if (v1.isUpdatePending) {
                        title = `${t(
                            "streams.stream-list.title-pending-from"
                        )} (${shortenAddress(`${v1.treasurerAddress}`)})`;
                    } else if (v1.state === STREAM_STATE.Schedule) {
                        title = `${t(
                            "streams.stream-list.title-scheduled-from"
                        )} (${shortenAddress(`${v1.treasurerAddress}`)})`;
                    } else if (v1.state === STREAM_STATE.Paused) {
                        title = `${t(
                            "streams.stream-list.title-paused-from"
                        )} (${shortenAddress(`${v1.treasurerAddress}`)})`;
                    } else {
                        title = `${t(
                            "streams.stream-list.title-receiving-from"
                        )} (${shortenAddress(`${v1.treasurerAddress}`)})`;
                    }
                } else {
                    if (v1.isUpdatePending) {
                        title = `${t(
                            "streams.stream-list.title-pending-to"
                        )} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
                    } else if (v1.state === STREAM_STATE.Schedule) {
                        title = `${t(
                            "streams.stream-list.title-scheduled-to"
                        )} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
                    } else if (v1.state === STREAM_STATE.Paused) {
                        title = `${t(
                            "streams.stream-list.title-paused-to"
                        )} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
                    } else {
                        title = `${t(
                            "streams.stream-list.title-sending-to"
                        )} (${shortenAddress(`${v1.beneficiaryAddress}`)})`;
                    }
                }
            } else {
                if (v2.name) {
                    return `${v2.name}`;
                }
                if (isInbound) {
                    if (v2.status === STREAM_STATUS.Schedule) {
                        title = `${t(
                            "streams.stream-list.title-scheduled-from"
                        )} (${shortenAddress(`${v2.treasurer}`)})`;
                    } else if (v2.status === STREAM_STATUS.Paused) {
                        title = `${t(
                            "streams.stream-list.title-paused-from"
                        )} (${shortenAddress(`${v2.treasurer}`)})`;
                    } else {
                        title = `${t(
                            "streams.stream-list.title-receiving-from"
                        )} (${shortenAddress(`${v2.treasurer}`)})`;
                    }
                } else {
                    if (v2.status === STREAM_STATUS.Schedule) {
                        title = `${t(
                            "streams.stream-list.title-scheduled-to"
                        )} (${shortenAddress(`${v2.beneficiary}`)})`;
                    } else if (v2.status === STREAM_STATUS.Paused) {
                        title = `${t(
                            "streams.stream-list.title-paused-to"
                        )} (${shortenAddress(`${v2.beneficiary}`)})`;
                    } else {
                        title = `${t(
                            "streams.stream-list.title-sending-to"
                        )} (${shortenAddress(`${v2.beneficiary}`)})`;
                    }
                }
            }
        }

        return title;
    };

    const getTransactionSubTitle = useCallback(
        (item: Stream | StreamInfo) => {
            let title = "";

            if (item) {
                const v1 = item as StreamInfo;
                const v2 = item as Stream;
                const isInbound = isInboundStream(item);
                let rateAmount =
                    item.rateAmount > 0
                        ? getRateAmountDisplay(item)
                        : getDepositAmountDisplay(item);
                if (item.rateAmount > 0) {
                    rateAmount +=
                        " " + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
                }

                if (v1.version < 2) {
                    if (isInbound) {
                        if (v1.state === STREAM_STATE.Schedule) {
                            title = t("streams.stream-list.subtitle-scheduled-inbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v1.startUtc as string)}`;
                        } else {
                            title = t("streams.stream-list.subtitle-running-inbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v1.startUtc as string)}`;
                        }
                    } else {
                        if (v1.state === STREAM_STATE.Schedule) {
                            title = t("streams.stream-list.subtitle-scheduled-outbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v1.startUtc as string)}`;
                        } else {
                            title = t("streams.stream-list.subtitle-running-outbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v1.startUtc as string)}`;
                        }
                    }
                } else {
                    if (isInbound) {
                        if (v2.status === STREAM_STATUS.Schedule) {
                            title = t("streams.stream-list.subtitle-scheduled-inbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v2.startUtc as string)}`;
                        } else {
                            title = t("streams.stream-list.subtitle-running-inbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v2.startUtc as string)}`;
                        }
                    } else {
                        if (v2.status === STREAM_STATUS.Schedule) {
                            title = t("streams.stream-list.subtitle-scheduled-outbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v2.startUtc as string)}`;
                        } else {
                            title = t("streams.stream-list.subtitle-running-outbound", {
                                rate: rateAmount,
                            });
                            title += ` ${getShortDate(v2.startUtc as string)}`;
                        }
                    }
                }
            }

            return title;
        },
        [isInboundStream, getRateAmountDisplay, getDepositAmountDisplay, t]
    );

    const getStreamStatus = useCallback(
        (item: Stream | StreamInfo) => {
            if (item) {
                const v1 = item as StreamInfo;
                const v2 = item as Stream;
                if (v1.version < 2) {
                    switch (v1.state) {
                        case STREAM_STATE.Schedule:
                            return t("streams.status.status-scheduled");
                        case STREAM_STATE.Paused:
                            return t("streams.status.status-stopped");
                        default:
                            return t("streams.status.status-running");
                    }
                } else {
                    switch (v2.status) {
                        case STREAM_STATUS.Schedule:
                            return t("streams.status.status-scheduled");
                        case STREAM_STATUS.Paused:
                            return t("streams.status.status-stopped");
                        default:
                            return t("streams.status.status-running");
                    }
                }
            }
        },
        [t]
    );

    const getStreamStatusSubtitle = useCallback(
        (item: Stream | StreamInfo) => {
            if (item) {
                const v1 = item as StreamInfo;
                const v2 = item as Stream;
                if (v1.version < 2) {
                    switch (v1.state) {
                        case STREAM_STATE.Schedule:
                            return t("streams.status.scheduled", {
                                date: getShortDate(v1.startUtc as string),
                            });
                        case STREAM_STATE.Paused:
                            return t("streams.status.stopped");
                        default:
                            return t("streams.status.streaming");
                    }
                } else {
                    switch (v2.status) {
                        case STREAM_STATUS.Schedule:
                            return t("streams.status.scheduled", {
                                date: getShortDate(v2.startUtc as string),
                            });
                        case STREAM_STATUS.Paused:
                            if (v2.isManuallyPaused) {
                                return t("streams.status.stopped-manually");
                            }
                            return t("streams.status.stopped");
                        default:
                            return t("streams.status.streaming");
                    }
                }
            }
        },
        [t]
    );

    const isStreamScheduled = (startUtc: string): boolean => {
        const now = new Date().toUTCString();
        const nowUtc = new Date(now);
        const streamStartDate = new Date(startUtc);
        return streamStartDate > nowUtc ? true : false;
    };

    const getStartDateLabel = (): string => {
        let label = t("streams.stream-detail.label-start-date-default");
        if (streamDetail) {
            if (isStreamScheduled(streamDetail.startUtc as string)) {
                if (isOtp()) {
                    label = t("streams.stream-detail.label-start-date-scheduled-otp");
                } else {
                    label = t("streams.stream-detail.label-start-date-scheduled");
                }
            } else {
                label = t("streams.stream-detail.label-start-date-started");
            }
        }
        return label;
    };

    const onCopyStreamAddress = (data: any) => {
        if (copyText(data.toString())) {
            openNotification({
                description: t("notifications.account-address-copied-message"),
                type: "info",
            });
        } else {
            openNotification({
                description: t("notifications.account-address-not-copied-message"),
                type: "error",
            });
        }
    };

    const onRefreshStreamsClick = () => {
        if (treasuryDetails) {
            consoleOut('Refreshing treasury streams...', '', 'blue');
            const treasuryPk = new PublicKey(treasuryDetails.id as string);
            getTreasuryStreams(treasuryPk);
        }
    };

    const isOtp = (): boolean => {
        return streamDetail?.rateAmount === 0 ? true : false;
    };

    const getActivityIcon = (item: StreamActivity) => {
        if (isInboundStream(streamDetail as StreamInfo)) {
            if (item.action === "withdrew") {
                return <ArrowUpOutlined className="mean-svg-icons outgoing" />;
            } else {
                return <ArrowDownOutlined className="mean-svg-icons incoming" />;
            }
        } else {
            if (item.action === "withdrew") {
                return <ArrowDownOutlined className="mean-svg-icons incoming" />;
            } else {
                return <ArrowUpOutlined className="mean-svg-icons outgoing" />;
            }
        }
    };

    const isAddressMyAccount = (addr: string): boolean => {
        return wallet &&
            addr &&
            wallet.publicKey &&
            addr === wallet.publicKey.toBase58()
            ? true
            : false;
    };

    const getActivityActor = (item: StreamActivity): string => {
        return isAddressMyAccount(item.initializer)
            ? t("general.you")
            : shortenAddress(item.initializer);
    };

    const getActivityAction = (item: StreamActivity): string => {
        const actionText =
            item.action === "deposited"
                ? t("streams.stream-activity.action-deposit")
                : t("streams.stream-activity.action-withdraw");
        return actionText;
    };

    const getActivityAmountDisplay = (
        item: StreamActivity,
        streamVersion: number
    ): number => {
        let value = "";

        const token = getTokenByMintAddress(item.mint as string);
        if (streamVersion < 2) {
            value += formatAmount(item.amount, token?.decimals || 6);
        } else {
            value += formatAmount(
                toUiAmount(new BN(item.amount), token?.decimals || 6),
                token?.decimals || 6
            );
        }

        return parseFloat(value);
    };

    const isScheduledOtp = (): boolean => {
        if (streamDetail && streamDetail.rateAmount === 0) {
            const now = new Date().toUTCString();
            const nowUtc = new Date(now);
            const streamStartDate = new Date(streamDetail.startUtc as string);
            if (streamStartDate > nowUtc) {
                return true;
            }
        }
        return false;
    };

    const isCreating = (): boolean => {
        return fetchTxInfoStatus === "fetching" &&
            lastSentTxOperationType === OperationType.StreamCreate
            ? true
            : false;
    };

    const hasAllocation = (): boolean => {
        if (streamDetail) {
            const v1 = streamDetail as StreamInfo;
            const v2 = streamDetail as Stream;
            if (v1.version < 2) {
                return v1.allocationAssigned || v1.allocationLeft ? true : false;
            } else {
                return v2.remainingAllocationAmount ? true : false;
            }
        }

        return false;
    };

    ///////////////////
    //   Rendering   //
    ///////////////////

    const renderMoneyStreamsSummary = (
        <>
            {/* Render Money Streams item if they exist and wallet is connected */}
            {publicKey && (
                <>
                    <div
                        key="streams"
                        className="transaction-list-row money-streams-summary no-pointer"
                    >
                        <div className="icon-cell">
                            {loadingTreasuryStreams ? (
                                <div className="token-icon animate-border-loading">
                                    <div
                                        className="streams-count simplelink"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                    >
                                        <span className="font-bold text-shadow">
                                            <SyncOutlined spin />
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className={
                                        streamsSummary.totalNet !== 0
                                            ? "token-icon animate-border"
                                            : "token-icon"
                                    }
                                >
                                    <div
                                        className="streams-count simplelink"
                                        onClick={onRefreshStreamsClick}
                                    >
                                        <span className="font-bold text-shadow">
                                            {streamsSummary.totalAmount || 0}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="description-cell">
                            <div className="title">{t("account-area.money-streams")}</div>
                            {streamsSummary.totalAmount === 0 ? (
                                <div className="subtitle">
                                    {t("account-area.no-money-streams")}
                                </div>
                            ) : (
                                <div className="subtitle">
                                    {streamsSummary.incomingAmount}{" "}
                                    {t("streams.stream-stats-incoming")},{" "}
                                    {streamsSummary.outgoingAmount}{" "}
                                    {t("streams.stream-stats-outgoing")}
                                </div>
                            )}
                        </div>
                        <div className="rate-cell">
                            {streamsSummary.totalAmount === 0 ? (
                                <span className="rate-amount">--</span>
                            ) : (
                                <>
                                    <div className="rate-amount">$
                                        {
                                            formatThousands(
                                            Math.abs(streamsSummary.totalNet),
                                            friendlyDisplayDecimalPlaces(streamsSummary.totalNet),
                                            friendlyDisplayDecimalPlaces(streamsSummary.totalNet)
                                            )
                                        }
                                    </div>
                                    <div className="interval">{t('streams.streaming-balance')}</div>
                                </>
                            )}
                        </div>
                        <div className="operation-vector">
                            {streamsSummary.totalNet > 0 ? (
                                <ArrowUpOutlined className="mean-svg-icons success bounce" />
                            ) : streamsSummary.totalNet < 0 ? (
                                <ArrowDownOutlined className="mean-svg-icons outgoing bounce" />
                            ) : (
                                <span className="online-status neutral"></span>
                            )}
                        </div>
                    </div>
                    <div key="separator1" className="pinned-token-separator"></div>
                </>
            )}
        </>
    );

    const renderActivities = (streamVersion: number) => {
        return (
            <div className="activity-list">
                <Spin spinning={loadingStreamActivity}>
                    {streamActivity && streamActivity.length > 0 && (
                        <>
                            {streamActivity && streamActivity.length > 0 && (
                                <div className="item-list-header compact">
                                    <div className="header-row">
                                        <div className="std-table-cell first-cell">&nbsp;</div>
                                        <div className="std-table-cell fixed-width-80">{t('streams.stream-activity.heading')}</div>
                                        <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-action')}</div>
                                        <div className="std-table-cell fixed-width-60">{t('streams.stream-activity.label-amount')}</div>
                                        <div className="std-table-cell fixed-width-120">{t('streams.stream-activity.label-date')}</div>
                                    </div>
                                </div>
                            )}
                            <div className="activity-list-data-wrapper vertical-scroll">
                                <div className="activity-list h-100">
                                    <Spin spinning={loadingStreamActivity}>
                                        {streamActivity && streamActivity.length > 0 && (
                                            <>
                                                <div className="item-list-body compact">
                                                    {streamActivity.map((item, index) => {
                                                        return (
                                                            <a key={`${index}`} className="item-list-row" target="_blank" rel="noopener noreferrer"
                                                                href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                                                                <div className="std-table-cell first-cell">{getActivityIcon(item)}</div>
                                                                <div className="std-table-cell fixed-width-80">
                                                                    <span className={isAddressMyAccount(item.initializer) ? 'text-capitalize align-middle' : 'align-middle'}>{getActivityActor(item)}</span>
                                                                </div>
                                                                <div className="std-table-cell fixed-width-60">
                                                                    <span className="align-middle">{getActivityAction(item)}</span>
                                                                </div>
                                                                <div className="std-table-cell fixed-width-60">
                                                                    <span className="align-middle">{
                                                                        getAmountWithSymbol(
                                                                            getActivityAmountDisplay(item, streamVersion), item.mint
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <div className="std-table-cell fixed-width-120" >
                                                                    <span className="align-middle">{getShortDate(item.utcDate as string, true)}</span>
                                                                </div>
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </Spin>
                                    {hasMoreStreamActivity && (
                                        <div className="mt-1 text-center">
                                            <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                                                role="link"
                                                onClick={() => {
                                                    if (streamDetail) {
                                                        getStreamActivity(streamDetail.id as string, streamDetail.version);
                                                    }
                                                }}>
                                            {t('general.cta-load-more')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </Spin>
            </div>
        );
    };

    const renderInboundStreamV1 = (stream: StreamInfo) => {
        const token = stream.associatedToken
            ? getTokenByMintAddress(stream.associatedToken as string)
            : undefined;
        return (
            <>
                {stream && (
                    <>
                        <div className="stream-details-data-wrapper vertical-scroll">
                            <Spin spinning={loadingTreasuryStreams || loadingTreasuryDetails}>
                                <div className="stream-fields-container">
                                    {/* Background animation */}
                                    {stream.state === STREAM_STATE.Running ? (
                                        <div className="stream-background">
                                            <img
                                                className="inbound"
                                                src="/assets/incoming-crypto.svg"
                                                alt=""
                                            />
                                        </div>
                                    ) : null}

                                    {/* Sender */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">
                                                {stream.state === STREAM_STATE.Paused
                                                    ? t("streams.stream-detail.label-received-from")
                                                    : t("streams.stream-detail.label-receiving-from")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconShare className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    <a
                                                        className="secondary-link"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.treasurerAddress
                                                            }${getSolanaExplorerClusterParam()}`}
                                                    >
                                                        {shortenAddress(`${stream.treasurerAddress}`)}
                                                    </a>
                                                </span>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            {isOtp() ? null : (
                                                <>
                                                    <div className="info-label">
                                                        {t("streams.stream-detail.label-payment-rate")}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-data">
                                                            {getAmountWithSymbol(
                                                                stream.rateAmount,
                                                                stream.associatedToken as string
                                                            )}
                                                            {getIntervalFromSeconds(
                                                                stream?.rateIntervalInSeconds as number,
                                                                true,
                                                                t
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </Col>
                                    </Row>

                                    {/* Amount for OTPs */}
                                    {isOtp() ? (
                                        <div className="mb-3">
                                            <div className="info-label">
                                                {t("streams.stream-detail.label-amount")}&nbsp;(
                                                {t("streams.stream-detail.amount-funded-date")}{" "}
                                                {getReadableDate(stream?.fundedOnUtc as string)})
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconDownload className="mean-svg-icons" />
                                                </span>
                                                {stream ? (
                                                    <span className="info-data">
                                                        {stream
                                                            ? getAmountWithSymbol(
                                                                stream.allocationAssigned,
                                                                stream.associatedToken as string
                                                            )
                                                            : "--"}
                                                    </span>
                                                ) : (
                                                    <span className="info-data">&nbsp;</span>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Started date */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">{getStartDateLabel()}</div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconClock className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getReadableDate(stream?.startUtc as string)}
                                                </span>
                                            </div>
                                        </Col>
                                        {isOtp() && (
                                            <Col span={12}>
                                                <div className="info-label">Amount</div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon token-icon">
                                                        {token?.logoURI ? (
                                                            <img
                                                                alt={`${token.name}`}
                                                                width={30}
                                                                height={30}
                                                                src={token.logoURI}
                                                            />
                                                        ) : (
                                                            <Identicon
                                                                address={stream.associatedToken}
                                                                style={{ width: "30", display: "inline-flex" }}
                                                            />
                                                        )}
                                                    </span>
                                                    <span className="info-data ml-1">
                                                        {getTokenAmountAndSymbolByTokenAddress(
                                                            toUiAmount(
                                                                new BN(
                                                                    stream.state === STREAM_STATE.Schedule
                                                                        ? stream.allocationAssigned
                                                                        : stream.escrowVestedAmount
                                                                ),
                                                                token?.decimals || 6
                                                            ),
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        )}
                                    </Row>

                                    {/* Funds left (Total Unvested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label text-truncate">
                                                {t(
                                                    "streams.stream-detail.label-funds-left-in-account"
                                                )}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconBank className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {stream
                                                        ? getAmountWithSymbol(
                                                            stream.escrowUnvestedAmount,
                                                            stream.associatedToken as string
                                                        )
                                                        : "--"}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Allocation info */}
                                    {!isScheduledOtp() && hasAllocation() && (
                                        <Row className="mb-3">
                                            <Col span={24}>
                                                <div className="info-label">
                                                    {stream.allocationAssigned
                                                        ? t(
                                                            "streams.stream-detail.label-reserved-allocation"
                                                        )
                                                        : t("streams.stream-detail.label-your-allocation")}
                                                </div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon">
                                                        <IconBox className="mean-svg-icons" />
                                                    </span>
                                                    <span className="info-data">
                                                        {getAmountWithSymbol(
                                                            stream.allocationAssigned ||
                                                            stream.allocationLeft,
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        </Row>
                                    )}

                                    {!isScheduledOtp() && (
                                        <>
                                            {/* Funds available to withdraw now (Total Vested) */}
                                            <Row className="mb-3">
                                                <Col span={24}>
                                                    <div className="info-label">
                                                        {t(
                                                            "streams.stream-detail.label-funds-available-to-withdraw"
                                                        )}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-icon">
                                                            {stream &&
                                                                stream.state === STREAM_STATE.Running ? (
                                                                <ArrowDownOutlined className="mean-svg-icons success bounce" />
                                                            ) : (
                                                                <ArrowDownOutlined className="mean-svg-icons success" />
                                                            )}
                                                        </span>
                                                        {stream ? (
                                                            <span className="info-data large">
                                                                {stream
                                                                    ? getAmountWithSymbol(
                                                                        stream.escrowVestedAmount,
                                                                        stream.associatedToken as string
                                                                    )
                                                                    : "--"}
                                                            </span>
                                                        ) : (
                                                            <span className="info-data large">&nbsp;</span>
                                                        )}
                                                    </div>
                                                </Col>
                                            </Row>
                                        </>
                                    )}

                                </div>
                            </Spin>

                            <Divider className="activity-divider" plain></Divider>
                            {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.loading-activity')}</p>
                            ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.no-activity')}</p>
                            ) : renderActivities(stream.version)}
                        </div>
                        <div className="stream-share-ctas">
                            <span
                                className="copy-cta"
                                onClick={() => onCopyStreamAddress(stream.id)}
                            >
                                STREAM ID: {stream.id}
                            </span>
                            <a
                                className="explorer-cta"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id
                                    }${getSolanaExplorerClusterParam()}`}
                            >
                                <IconExternalLink className="mean-svg-icons" />
                            </a>
                        </div>
                    </>
                )}
            </>
        );
    };

    const renderInboundStreamV2 = (stream: Stream) => {
        const token = stream.associatedToken
            ? getTokenByMintAddress(stream.associatedToken as string)
            : undefined;
        return (
            <>
                {stream && (
                    <>
                        <div className="stream-details-data-wrapper vertical-scroll">
                            <Spin spinning={loadingTreasuryStreams || loadingTreasuryDetails}>
                                <div className="stream-fields-container">
                                    {/* Background animation */}
                                    {stream.status === STREAM_STATUS.Running ? (
                                        <div className="stream-background">
                                            <img
                                                className="inbound"
                                                src="/assets/incoming-crypto.svg"
                                                alt=""
                                            />
                                        </div>
                                    ) : null}

                                    {/* Sender */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">
                                                {stream.status === STREAM_STATUS.Paused
                                                    ? t("streams.stream-detail.label-received-from")
                                                    : t("streams.stream-detail.label-receiving-from")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconShare className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    <a
                                                        className="secondary-link"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.treasurer
                                                            }${getSolanaExplorerClusterParam()}`}
                                                    >
                                                        {shortenAddress(`${stream.treasurer}`)}
                                                    </a>
                                                </span>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            {isOtp() ? null : (
                                                <>
                                                    <div className="info-label">
                                                        {t("streams.stream-detail.label-payment-rate")}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-data">
                                                            {getAmountWithSymbol(
                                                                toUiAmount(
                                                                    new BN(stream.rateAmount),
                                                                    selectedToken?.decimals || 6
                                                                ),
                                                                stream.associatedToken as string
                                                            )}
                                                            {getIntervalFromSeconds(
                                                                stream.rateIntervalInSeconds as number,
                                                                true,
                                                                t
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </Col>
                                    </Row>

                                    {/* Started date */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">{getStartDateLabel()}</div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconClock className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getReadableDate(stream?.startUtc as string)}
                                                </span>
                                            </div>
                                        </Col>
                                        {isOtp() && (
                                            <Col span={12}>
                                                <div className="info-label">Amount</div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon token-icon">
                                                        {token?.logoURI ? (
                                                            <img
                                                                alt={`${token.name}`}
                                                                width={30}
                                                                height={30}
                                                                src={token.logoURI}
                                                            />
                                                        ) : (
                                                            <Identicon
                                                                address={stream.associatedToken}
                                                                style={{ width: "30", display: "inline-flex" }}
                                                            />
                                                        )}
                                                    </span>
                                                    <span className="info-data ml-1">
                                                        {getTokenAmountAndSymbolByTokenAddress(
                                                            toUiAmount(
                                                                new BN(
                                                                    stream.status === STREAM_STATUS.Schedule
                                                                        ? stream.allocationAssigned
                                                                        : stream.withdrawableAmount
                                                                ),
                                                                token?.decimals || 6
                                                            ),
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        )}
                                    </Row>

                                    {/* Funds left (Total Unvested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label text-truncate">
                                                {t(
                                                    "streams.stream-detail.label-funds-left-in-account"
                                                )}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconBank className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getAmountWithSymbol(
                                                        toUiAmount(
                                                            new BN(stream.fundsLeftInStream),
                                                            selectedToken?.decimals || 6
                                                        ),
                                                        stream.associatedToken as string
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Allocation info */}
                                    {stream && !isScheduledOtp() && hasAllocation() && (
                                        <Row className="mb-3">
                                            <Col span={24}>
                                                <div className="info-label">
                                                    {stream.allocationAssigned
                                                        ? t("streams.stream-detail.label-reserved-allocation")
                                                        : t("streams.stream-detail.label-your-allocation")}
                                                </div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon">
                                                        <IconBox className="mean-svg-icons" />
                                                    </span>
                                                    <span className="info-data">
                                                        {getAmountWithSymbol(
                                                            toUiAmount(
                                                                new BN(stream.remainingAllocationAmount),
                                                                selectedToken?.decimals || 6
                                                            ),
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        </Row>
                                    )}

                                    {!isScheduledOtp() && (
                                        <>
                                            {/* Funds available to withdraw now (Total Vested) */}
                                            <Row className="mb-3">
                                                <Col span={24}>
                                                    <div className="info-label">
                                                        {t(
                                                            "streams.stream-detail.label-funds-available-to-withdraw"
                                                        )}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-icon">
                                                            {stream.status === STREAM_STATUS.Running ? (
                                                                <ArrowDownOutlined className="mean-svg-icons success bounce" />
                                                            ) : (
                                                                <ArrowDownOutlined className="mean-svg-icons success" />
                                                            )}
                                                        </span>
                                                        {stream ? (
                                                            <span className="info-data large">
                                                                {getAmountWithSymbol(
                                                                    toUiAmount(
                                                                        new BN(stream.withdrawableAmount),
                                                                        selectedToken?.decimals || 6
                                                                    ),
                                                                    stream.associatedToken as string
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className="info-data large">&nbsp;</span>
                                                        )}
                                                    </div>
                                                </Col>
                                            </Row>
                                        </>
                                    )}

                                </div>
                            </Spin>

                            <Divider className="activity-divider" plain></Divider>
                            {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.loading-activity')}</p>
                            ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.no-activity')}</p>
                            ) : renderActivities(stream.version)}
                        </div>
                        <div className="stream-share-ctas">
                            <span
                                className="copy-cta"
                                onClick={() => onCopyStreamAddress(stream.id)}
                            >
                                STREAM ID: {stream.id}
                            </span>
                            <a
                                className="explorer-cta"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id
                                    }${getSolanaExplorerClusterParam()}`}
                            >
                                <IconExternalLink className="mean-svg-icons" />
                            </a>
                        </div>
                    </>
                )}
            </>
        );
    };

    const renderOutboundStreamV1 = (stream: StreamInfo) => {
        const token = stream.associatedToken
            ? getTokenByMintAddress(stream.associatedToken as string)
            : undefined;
        return (
            <>
                {stream && (
                    <>
                        <div className="stream-details-data-wrapper vertical-scroll">
                            <Spin spinning={loadingTreasuryStreams || loadingTreasuryDetails}>
                                <div className="stream-fields-container">
                                    {/* Background animation */}
                                    {stream && stream.state === STREAM_STATE.Running ? (
                                        <div className="stream-background">
                                            <img
                                                className="inbound"
                                                src="/assets/outgoing-crypto.svg"
                                                alt=""
                                            />
                                        </div>
                                    ) : null}

                                    {treasuryDetails &&
                                        !(treasuryDetails as any).autoClose &&
                                        treasuryDetails.id === stream.treasuryAddress && (
                                            <div className="mb-3">
                                                <div className="flex-row align-items-center">
                                                    <span className="font-bold">
                                                        Treasury - {getTreasuryName()}
                                                    </span>
                                                    <span
                                                        className={`badge small ml-1 ${theme === "light" ? "golden fg-dark" : "darken"
                                                            }`}
                                                    >
                                                        {getTreasuryType() === "locked" ? "Locked" : "Open"}
                                                    </span>
                                                </div>
                                                <div>Stream - {getStreamDescription(stream)}</div>
                                            </div>
                                        )}

                                    {/* Beneficiary */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">
                                                {stream && (
                                                    <>
                                                        {stream.state === STREAM_STATE.Paused
                                                            ? t("streams.stream-detail.label-sent-to")
                                                            : t("streams.stream-detail.label-sending-to")}
                                                    </>
                                                )}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconShare className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    <a
                                                        className="secondary-link"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream?.beneficiaryAddress
                                                            }${getSolanaExplorerClusterParam()}`}
                                                    >
                                                        {shortenAddress(`${stream?.beneficiaryAddress}`)}
                                                    </a>
                                                </span>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            {isOtp() ? null : (
                                                <>
                                                    <div className="info-label">
                                                        {t("streams.stream-detail.label-payment-rate")}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-data">
                                                            {stream
                                                                ? getAmountWithSymbol(
                                                                    stream.rateAmount,
                                                                    stream.associatedToken as string
                                                                )
                                                                : "--"}
                                                            {getIntervalFromSeconds(
                                                                stream?.rateIntervalInSeconds as number,
                                                                true,
                                                                t
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </Col>
                                    </Row>

                                    {/* Amount for OTPs */}
                                    {isOtp() ? (
                                        <div className="mb-3">
                                            <div className="info-label">
                                                {t("streams.stream-detail.label-amount")}&nbsp;(
                                                {t("streams.stream-detail.amount-funded-date")}{" "}
                                                {getReadableDate(stream?.fundedOnUtc as string)})
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconUpload className="mean-svg-icons" />
                                                </span>
                                                {stream ? (
                                                    <span className="info-data">
                                                        {stream
                                                            ? getAmountWithSymbol(
                                                                stream.allocationAssigned,
                                                                stream.associatedToken as string
                                                            )
                                                            : "--"}
                                                    </span>
                                                ) : (
                                                    <span className="info-data">&nbsp;</span>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Started date */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">{getStartDateLabel()}</div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconClock className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getReadableDate(stream?.startUtc as string)}
                                                </span>
                                            </div>
                                        </Col>
                                        {isOtp() && (
                                            <Col span={12}>
                                                <div className="info-label">Amount</div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon token-icon">
                                                        {token?.logoURI ? (
                                                            <img
                                                                alt={`${token.name}`}
                                                                width={30}
                                                                height={30}
                                                                src={token.logoURI}
                                                            />
                                                        ) : (
                                                            <Identicon
                                                                address={stream.associatedToken}
                                                                style={{ width: "30", display: "inline-flex" }}
                                                            />
                                                        )}
                                                    </span>
                                                    <span className="info-data ml-1">
                                                        {getTokenAmountAndSymbolByTokenAddress(
                                                            toUiAmount(
                                                                new BN(
                                                                    stream.state === STREAM_STATE.Schedule
                                                                        ? stream.allocationAssigned
                                                                        : stream.escrowVestedAmount
                                                                ),
                                                                token?.decimals || 6
                                                            ),
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        )}
                                    </Row>

                                    {/* Allocation info */}
                                    {isOtp()
                                        ? null
                                        : hasAllocation() &&
                                        stream && (
                                            <>
                                                <Row className="mb-3">
                                                    <Col span={24}>
                                                        <div className="info-label">
                                                            {stream.allocationAssigned
                                                                ? t(
                                                                    "streams.stream-detail.label-reserved-allocation"
                                                                )
                                                                : t(
                                                                    "streams.stream-detail.label-their-allocation"
                                                                )}
                                                        </div>
                                                        <div className="transaction-detail-row">
                                                            <span className="info-icon">
                                                                <IconBox className="mean-svg-icons" />
                                                            </span>
                                                            <span className="info-data">
                                                                {getAmountWithSymbol(
                                                                    stream.allocationAssigned ||
                                                                    stream.allocationLeft,
                                                                    stream.associatedToken as string
                                                                )}
                                                            </span>
                                                        </div>
                                                    </Col>
                                                </Row>
                                            </>
                                        )}

                                    {/* Funds sent (Total Vested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label">
                                                {t("streams.stream-detail.label-funds-sent")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconUpload className="mean-svg-icons" />
                                                </span>
                                                {stream ? (
                                                    <span className="info-data">
                                                        {stream
                                                            ? getAmountWithSymbol(
                                                                stream.allocationAssigned -
                                                                stream.allocationLeft +
                                                                stream.escrowVestedAmount,
                                                                stream.associatedToken as string
                                                            )
                                                            : "--"}
                                                    </span>
                                                ) : (
                                                    <span className="info-data">&nbsp;</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Funds left (Total Unvested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label text-truncate">
                                                {t("streams.stream-detail.label-funds-left-in-account")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    {stream && stream.state === STREAM_STATE.Running ? (
                                                        <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                                                    ) : (
                                                        <ArrowUpOutlined className="mean-svg-icons outgoing" />
                                                    )}
                                                </span>
                                                {stream ? (
                                                    <span className="info-data large">
                                                        {stream
                                                            ? getAmountWithSymbol(
                                                                stream.escrowUnvestedAmount,
                                                                stream.associatedToken as string
                                                            )
                                                            : "--"}
                                                    </span>
                                                ) : (
                                                    <span className="info-data large">&nbsp;</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </Spin>

                            <Divider className="activity-divider" plain></Divider>
                            {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.loading-activity')}</p>
                            ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.no-activity')}</p>
                            ) : renderActivities(stream.version)}
                        </div>
                        <div className="stream-share-ctas">
                            <span
                                className="copy-cta"
                                onClick={() => onCopyStreamAddress(stream.id)}
                            >
                                STREAM ID: {stream.id}
                            </span>
                            <a
                                className="explorer-cta"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id
                                    }${getSolanaExplorerClusterParam()}`}
                            >
                                <IconExternalLink className="mean-svg-icons" />
                            </a>
                        </div>
                    </>
                )}
            </>
        );
    };

    const renderOutboundStreamV2 = (stream: Stream) => {
        const token = stream.associatedToken
            ? getTokenByMintAddress(stream.associatedToken as string)
            : undefined;
        return (
            <>
                {stream && (
                    <>
                        <div className="stream-details-data-wrapper vertical-scroll">
                            <Spin spinning={loadingTreasuryStreams || loadingTreasuryDetails}>
                                <div className="stream-fields-container">
                                    {/* Background animation */}
                                    {stream && stream.status === STREAM_STATUS.Running ? (
                                        <div className="stream-background">
                                            <img
                                                className="inbound"
                                                src="/assets/outgoing-crypto.svg"
                                                alt=""
                                            />
                                        </div>
                                    ) : null}

                                    {treasuryDetails &&
                                        !(treasuryDetails as any).autoClose &&
                                        treasuryDetails.id === stream.treasury && (
                                            <div className="mb-3">
                                                <div className="flex-row align-items-center">
                                                    <span className="font-bold">
                                                        Treasury - {getTreasuryName()}
                                                    </span>
                                                    <span
                                                        className={`badge small ml-1 ${theme === "light" ? "golden fg-dark" : "darken"
                                                            }`}
                                                    >
                                                        {getTreasuryType() === "locked" ? "Locked" : "Open"}
                                                    </span>
                                                </div>
                                                <div>Stream - {getStreamDescription(stream)}</div>
                                            </div>
                                        )}

                                    {/* Beneficiary */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">
                                                {stream && (
                                                    <>
                                                        {stream.status === STREAM_STATUS.Paused
                                                            ? t("streams.stream-detail.label-sent-to")
                                                            : t("streams.stream-detail.label-sending-to")}
                                                    </>
                                                )}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconShare className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    <a
                                                        className="secondary-link"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream?.beneficiary
                                                            }${getSolanaExplorerClusterParam()}`}
                                                    >
                                                        {shortenAddress(`${stream?.beneficiary}`)}
                                                    </a>
                                                </span>
                                            </div>
                                        </Col>
                                        <Col span={12}>
                                            {isOtp() ? null : (
                                                <>
                                                    <div className="info-label">
                                                        {t("streams.stream-detail.label-payment-rate")}
                                                    </div>
                                                    <div className="transaction-detail-row">
                                                        <span className="info-data">
                                                            {getAmountWithSymbol(
                                                                toUiAmount(
                                                                    new BN(stream.rateAmount),
                                                                    selectedToken?.decimals || 6
                                                                ),
                                                                stream.associatedToken as string
                                                            )}
                                                            {getIntervalFromSeconds(
                                                                stream?.rateIntervalInSeconds as number,
                                                                true,
                                                                t
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </Col>
                                    </Row>

                                    {/* Started date */}
                                    <Row className="mb-3">
                                        <Col span={12}>
                                            <div className="info-label">{getStartDateLabel()}</div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconClock className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getReadableDate(stream?.startUtc as string)}
                                                </span>
                                            </div>
                                        </Col>
                                        {isOtp() && (
                                            <Col span={12}>
                                                <div className="info-label">Amount</div>
                                                <div className="transaction-detail-row">
                                                    <span className="info-icon token-icon">
                                                        {token?.logoURI ? (
                                                            <img
                                                                alt={`${token.name}`}
                                                                width={30}
                                                                height={30}
                                                                src={token.logoURI}
                                                            />
                                                        ) : (
                                                            <Identicon
                                                                address={stream.associatedToken}
                                                                style={{ width: "30", display: "inline-flex" }}
                                                            />
                                                        )}
                                                    </span>
                                                    <span className="info-data ml-1">
                                                        {getTokenAmountAndSymbolByTokenAddress(
                                                            toUiAmount(
                                                                new BN(
                                                                    stream.status === STREAM_STATUS.Schedule
                                                                        ? stream.allocationAssigned
                                                                        : stream.withdrawableAmount
                                                                ),
                                                                token?.decimals || 6
                                                            ),
                                                            stream.associatedToken as string
                                                        )}
                                                    </span>
                                                </div>
                                            </Col>
                                        )}
                                    </Row>

                                    {/* Allocation info */}
                                    {isOtp()
                                        ? null
                                        : hasAllocation() && (
                                            <>
                                                <Row className="mb-3">
                                                    <Col span={24}>
                                                        <div className="info-label">
                                                            {stream.allocationAssigned
                                                                ? t(
                                                                    "streams.stream-detail.label-reserved-allocation"
                                                                )
                                                                : t(
                                                                    "streams.stream-detail.label-their-allocation"
                                                                )}
                                                        </div>
                                                        <div className="transaction-detail-row">
                                                            <span className="info-icon">
                                                                <IconBox className="mean-svg-icons" />
                                                            </span>
                                                            <span className="info-data">
                                                                {getAmountWithSymbol(
                                                                    toUiAmount(
                                                                        new BN(stream.remainingAllocationAmount),
                                                                        selectedToken?.decimals || 6
                                                                    ),
                                                                    stream.associatedToken as string
                                                                )}
                                                            </span>
                                                        </div>
                                                    </Col>
                                                </Row>
                                            </>
                                        )}

                                    {/* Funds sent (Total Vested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label">
                                                {t("streams.stream-detail.label-funds-sent")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    <IconUpload className="mean-svg-icons" />
                                                </span>
                                                <span className="info-data">
                                                    {getAmountWithSymbol(
                                                        toUiAmount(
                                                            new BN(stream.fundsSentToBeneficiary),
                                                            selectedToken?.decimals || 6
                                                        ),
                                                        stream.associatedToken as string
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Funds left (Total Unvested) */}
                                    {isOtp() ? null : (
                                        <div className="mb-3">
                                            <div className="info-label text-truncate">
                                                {t("streams.stream-detail.label-funds-left-in-account")}
                                            </div>
                                            <div className="transaction-detail-row">
                                                <span className="info-icon">
                                                    {stream.status === STREAM_STATUS.Running ? (
                                                        <ArrowUpOutlined className="mean-svg-icons outgoing bounce" />
                                                    ) : (
                                                        <ArrowUpOutlined className="mean-svg-icons outgoing" />
                                                    )}
                                                </span>
                                                <span className="info-data large">
                                                    {getAmountWithSymbol(
                                                        toUiAmount(
                                                            new BN(stream.fundsLeftInStream),
                                                            selectedToken?.decimals || 6
                                                        ),
                                                        stream.associatedToken as string
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </Spin>

                            <Divider className="activity-divider" plain></Divider>
                            {loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.loading-activity')}</p>
                            ) : !loadingStreamActivity && (!streamActivity || streamActivity.length === 0) ? (
                                <p>{t('streams.stream-activity.no-activity')}</p>
                            ) : renderActivities(stream.version)}
                        </div>
                        <div className="stream-share-ctas">
                            <span
                                className="copy-cta"
                                onClick={() => onCopyStreamAddress(stream.id)}
                            >
                                STREAM ID: {stream.id}
                            </span>
                            <a
                                className="explorer-cta"
                                target="_blank"
                                rel="noopener noreferrer"
                                href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id
                                    }${getSolanaExplorerClusterParam()}`}
                            >
                                <IconExternalLink className="mean-svg-icons" />
                            </a>
                        </div>
                    </>
                )}
            </>
        );
    };

    const renderStreamList = (
        <>
            {streamList && streamList.length > 0 ? (
                streamList.map((item, index) => {
                    const token = item.associatedToken
                        ? getTokenByMintAddress(item.associatedToken as string)
                        : undefined;
                    const onStreamClick = () => {
                        setSelectedStream(item);
                        setDtailsPanelOpen(true);
                        consoleOut("list item selected:", item, "blue");
                    };
                    const imageOnErrorHandler = (
                        event: React.SyntheticEvent<HTMLImageElement, Event>
                    ) => {
                        event.currentTarget.src = FALLBACK_COIN_IMAGE;
                        event.currentTarget.className = "error";
                    };
                    return (
                        <div
                            key={`${index + 50}`}
                            onClick={onStreamClick}
                            id={`${item.id}`}
                            className={`transaction-list-row ${streamDetail && streamDetail.id === item.id ? "selected" : ""}`}>
                            <div className="icon-cell">
                                {getStreamTypeIcon(item)}
                                <div className="token-icon">
                                    {item.associatedToken ? (
                                        <>
                                            {token ? (
                                                <img
                                                    alt={`${token.name}`}
                                                    width={30}
                                                    height={30}
                                                    src={token.logoURI}
                                                    onError={imageOnErrorHandler}
                                                />
                                            ) : (
                                                <Identicon
                                                    address={item.associatedToken}
                                                    style={{ width: "30", display: "inline-flex" }}
                                                />
                                            )}
                                        </>
                                    ) : (
                                        <Identicon
                                            address={item.id}
                                            style={{ width: "30", display: "inline-flex" }}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="description-cell">
                                <div className="title text-truncate">
                                    {getStreamDescription(item)}
                                </div>
                                <div className="subtitle text-truncate">
                                    {getTransactionSubTitle(item)}
                                </div>
                            </div>
                            <div className="rate-cell">
                                <div className="rate-amount text-uppercase">
                                    {getStreamStatus(item)}
                                </div>
                                <div className="interval">{getStreamStatusSubtitle(item)}</div>
                            </div>
                        </div>
                    );
                })
            ) : (
                <>
                    {isCreating() ? (
                        <div className="h-100 flex-center">
                            <Spin indicator={bigLoadingIcon} />
                        </div>
                    ) : (
                        <div className="h-100 flex-center">
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    <p>
                                        {connected
                                            ? t("streams.stream-list.no-streams")
                                            : t("streams.stream-list.not-connected")}
                                    </p>
                                }
                            />
                        </div>
                    )}
                </>
            )}
        </>
    );

    return (
        <>
            <div className="container main-container">
                {/* {isLocal() && (
                    <div className="debug-bar">
                        <span className="ml-1">proggress:</span><span className="ml-1 font-bold fg-dark-active">{fetchTxInfoStatus || '-'}</span>
                        <span className="ml-1">status:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxStatus || '-'}</span>
                        <span className="ml-1">lastSentTxSignature:</span><span className="ml-1 font-bold fg-dark-active">{lastSentTxSignature ? shortenAddress(lastSentTxSignature, 8) : '-'}</span>
                    </div>
                    )} */}

                <div className="interaction-area">
                    <div
                        className={`meanfi-two-panel-layout ${detailsPanelOpen ? "details-open" : ""}`}>
                        {/* Left / top panel*/}
                        <div className="meanfi-two-panel-left">
                            <div className="meanfi-panel-heading">
                                <div className="back-button">
                                    <span className="icon-button-container">
                                        <Tooltip
                                            placement="bottom"
                                            title={t("multisig.multisig-treasuries.back-to-treasuries")}>
                                            <Button
                                                type="default"
                                                shape="circle"
                                                size="middle"
                                                icon={<ArrowLeftOutlined />}
                                                onClick={() => {
                                                    const url = highLightableMultisigId
                                                        ? `${STREAMING_ACCOUNTS_ROUTE_BASE_PATH}?multisig=${highLightableMultisigId}`
                                                        : STREAMING_ACCOUNTS_ROUTE_BASE_PATH;
                                                    navigate(url);
                                                }}
                                            />
                                        </Tooltip>
                                    </span>
                                </div>
                                <span className="title">{t("treasuries.treasury-streams.screen-title")}</span>
                                <Tooltip
                                    placement="bottom"
                                    title={t("streams.refresh-tooltip")}>
                                    <div
                                        className={`transaction-stats ${loadingTreasuryStreams ? "click-disabled" : "simplelink"}`}
                                        onClick={onRefreshStreamsClick}>
                                        <Spin size="small" />
                                        <span className="transaction-legend">
                                            <span className="icon-button-container">
                                                <Button
                                                    type="default"
                                                    shape="circle"
                                                    size="small"
                                                    icon={<ReloadOutlined />}
                                                    onClick={() => { }}
                                                />
                                            </span>
                                        </span>
                                    </div>
                                </Tooltip>
                            </div>
                            <div className="inner-container">
                                {/* item block */}
                                <div className="item-block vertical-scroll">
                                    <Spin spinning={loadingTreasuryStreams || loadingTreasuryDetails}>
                                        {streamsSummary && streamsSummary.totalAmount > 0 &&
                                            renderMoneyStreamsSummary}
                                        {renderStreamList}
                                    </Spin>
                                </div>
                                {/* Bottom CTA */}
                                {/* <div className="bottom-ctas">
                                </div> */}
                            </div>
                        </div>

                        {/* Right / down panel */}
                        <div className="meanfi-two-panel-right">
                            <div className="meanfi-panel-heading">
                                <span className="title">
                                    {t("streams.stream-detail.heading")}
                                </span>
                            </div>
                            <div className="inner-container">
                                {connected && streamDetail ? (
                                    <>
                                        {isInboundStream(streamDetail)
                                            ? streamDetail.version < 2
                                                ? renderInboundStreamV1(streamDetail as StreamInfo)
                                                : renderInboundStreamV2(streamDetail as Stream)
                                            : streamDetail.version < 2
                                                ? renderOutboundStreamV1(streamDetail as StreamInfo)
                                                : renderOutboundStreamV2(streamDetail as Stream)}
                                    </>
                                ) : (
                                    <>
                                        {isCreating() ? (
                                            <div className="h-100 flex-center">
                                                <Spin indicator={bigLoadingIcon} />
                                            </div>
                                        ) : (
                                            <div className="h-100 flex-center">
                                                <Empty
                                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                    description={
                                                        <p>
                                                            {connected
                                                                ? t("streams.stream-detail.no-stream")
                                                                : t("streams.stream-list.not-connected")}
                                                        </p>
                                                    }
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <PreFooter />
        </>
    );
};
