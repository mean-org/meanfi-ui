import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import {
    calculateActionFees,
    MSP,
    MSP_ACTIONS,
    Stream, StreamTemplate, STREAM_STATUS,
    TransactionFees,
    Treasury,
    TreasuryType
} from '@mean-dao/msp';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Button, Dropdown, Menu, Modal, Spin } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import BN from 'bn.js';
import { openNotification } from 'components/Notifications';
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'contexts/connection';
import { TxConfirmationContext } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import { IconVerticalEllipsis } from 'Icons';
import { appConfig, customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { AppUsageEvent, SegmentStreamCloseData } from 'middleware/segment-service';
import { isError, isSuccess } from 'middleware/transactions';
import {
    consoleOut,
    copyText,
    getIntervalFromSeconds,
    getShortDate,
    getTimeToNow,
    getTransactionModalTitle,
    getTransactionOperationDescription,
    getTransactionStatusForLogs,
    toTimestamp
} from 'middleware/ui';
import { displayAmountWithSymbol, getAmountWithSymbol, getTxIxResume, shortenAddress } from 'middleware/utils';
import { OperationType, TransactionStatus } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { VestingContractCloseStreamOptions } from 'models/vesting';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StreamCloseModal } from '../StreamCloseModal';
import { VestingContractStreamDetailModal } from '../VestingContractStreamDetailModal';

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const VestingContractStreamList = (props: {
    accountAddress: string;
    isMultisigTreasury: boolean;
    loadingTreasuryStreams: boolean;
    minRequiredBalance: number;
    msp: MSP | undefined;
    multisigAccounts: MultisigInfo[] | undefined;
    multisigClient: MeanMultisig | null;
    nativeBalance: number;
    onReloadTokenBalances: any;
    selectedMultisig: MultisigInfo | undefined;
    selectedToken: TokenInfo | undefined;
    streamTemplate: StreamTemplate | undefined;
    treasuryStreams: Stream[];
    userBalances: any;
    vestingContract: Treasury | undefined;
}) => {
    const {
        accountAddress,
        isMultisigTreasury,
        loadingTreasuryStreams,
        minRequiredBalance,
        msp,
        multisigAccounts,
        multisigClient,
        nativeBalance,
        selectedToken,
        streamTemplate,
        treasuryStreams,
        vestingContract,
    } = props;
    const {
        splTokenList,
        deletedStreams,
        transactionStatus,
        setHighLightableStreamId,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        setTransactionStatus,
        refreshTokenBalance,
    } = useContext(AppStateContext);
    const { enqueueTransactionConfirmation } = useContext(TxConfirmationContext);
    const connection = useConnection();
    const { t } = useTranslation('common');
    const { publicKey, wallet } = useWallet();
    const [isBusy, setIsBusy] = useState(false);
    const [highlightedStream, sethHighlightedStream] = useState<Stream | undefined>();
    const [transactionFees, setTransactionFees] = useState<TransactionFees>(NO_FEES);
    const [transactionCancelled, setTransactionCancelled] = useState(false);
    const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
    const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodUnits, setLockPeriodUnits] = useState(0);
    const [streamList, setStreamList] = useState<Stream[]>([]);

    const mspV2AddressPK = new PublicKey(appConfig.getConfig().streamV2ProgramAddress);

    const isDateInTheFuture = useCallback((date: string): boolean => {
        const now = new Date().toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, []);

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

    const resetTransactionStatus = useCallback(() => {

        setTransactionStatus({
            lastOperation: TransactionStatus.Iddle,
            currentOperation: TransactionStatus.Iddle
        });

    }, [
        setTransactionStatus
    ]);

    const getTransactionFees = useCallback(async (action: MSP_ACTIONS): Promise<TransactionFees> => {
        return calculateActionFees(connection, action);
    }, [connection]);

    const isInboundStream = useCallback((item: Stream): boolean => {
        return item && accountAddress && (item.beneficiary).toBase58() === accountAddress ? true : false;
    }, [accountAddress]);

    const isDeletedStream = useCallback((id: string) => {
        if (!deletedStreams) {
            return false;
        }
        return deletedStreams.some(i => i === id);
    }, [deletedStreams]);

    const getRateAmountDisplay = useCallback((item: Stream): string => {
        if (!selectedToken) {
            return '';
        }

        const rateAmount = new BN(item.rateAmount);

        const value = displayAmountWithSymbol(
            rateAmount,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
            true,
            true
        );

        return value;
    }, [selectedToken, splTokenList]);

    const getDepositAmountDisplay = useCallback((item: Stream): string => {
        if (!selectedToken) {
            return '';
        }

        const allocationAssigned = new BN(item.allocationAssigned);

        const value = displayAmountWithSymbol(
            allocationAssigned,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
            true,
            true
        );

        return value;
    }, [selectedToken, splTokenList]);

    const getNoStreamsMessage = useCallback(() => {
        if (vestingContract && streamTemplate) {
            const paymentStartDate = (streamTemplate.startUtc as Date).toString();
            // When a contract has started with 0 streams, say it
            if (!isDateInTheFuture(paymentStartDate) && vestingContract.totalStreams === 0) {
                return 'As this contract has started, no streams are able to be added to it.';
            }
        }

        return t('vesting.vesting-account-streams.no-streams');
    }, [isDateInTheFuture, streamTemplate, t, vestingContract]);

    const getStreamTitle = (item: Stream): string => {
        let title = '';
        if (item) {
            const isInbound = isInboundStream(item);
            if (item.name) {
                return `${item.name}`;
            }
            if (isInbound) {
                if (item.status === STREAM_STATUS.Scheduled) {
                    title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(item.treasurer)})`;
                } else if (item.status === STREAM_STATUS.Paused) {
                    title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(item.treasurer)})`;
                } else {
                    title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(item.treasurer)})`;
                }
            } else {
                if (item.status === STREAM_STATUS.Scheduled) {
                    title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(item.beneficiary)})`;
                } else if (item.status === STREAM_STATUS.Paused) {
                    title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(item.beneficiary)})`;
                } else {
                    title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(item.beneficiary)})`;
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

    const getStreamSubtitle = useCallback((item: Stream) => {
        let title = '';

        if (item) {
            const isInbound = isInboundStream(item);

            let rateAmount = item.rateAmount.gtn(0) ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
            if (item.rateAmount.gtn(0)) {
              rateAmount += ' ' + getIntervalFromSeconds(new BN(item.rateIntervalInSeconds).toNumber(), false, t);
            }

            if (isInbound) {
                if (item.status === STREAM_STATUS.Scheduled) {
                    title = t('streams.stream-list.subtitle-scheduled-inbound', {
                        rate: rateAmount
                    });
                } else {
                    title = t('streams.stream-list.subtitle-running-inbound', {
                        rate: rateAmount
                    });
                }
            } else {
                if (item.status === STREAM_STATUS.Scheduled) {
                    title = t('streams.stream-list.subtitle-scheduled-outbound', {
                        rate: rateAmount
                    });
                } else {
                    title = t('streams.stream-list.subtitle-running-outbound', {
                        rate: rateAmount
                    });
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
                case STREAM_STATUS.Scheduled:
                    bgClass = 'bg-purple';
                    content = t('streams.status.status-scheduled');
                    break;
                case STREAM_STATUS.Paused:
                    if (item.isManuallyPaused) {
                        bgClass = 'error';
                        content = t('streams.status.status-stopped');
                    } else {
                        bgClass = 'error';
                        content = t('vesting.status.status-stopped');
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
                case STREAM_STATUS.Scheduled:
                    return t('streams.status.scheduled', { date: getShortDate(item.startUtc) });
                case STREAM_STATUS.Paused:
                    if (item.isManuallyPaused) {
                        return t('streams.status.stopped-manually');
                    }
                    return t('vesting.vesting-account-streams.stream-status-complete');
                default:
                    return t('vesting.vesting-account-streams.stream-status-streaming', { timeLeft: getTimeToNow(item.estimatedDepletionDate) });
            }
        }
    }, [t]);

    // Set template data
    useEffect(() => {
        if (vestingContract && streamTemplate) {
            setPaymentStartDate((streamTemplate.startUtc as Date).toString());
            updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
            setLockPeriodUnits(streamTemplate.rateIntervalInSeconds);
        }
    }, [
        streamTemplate,
        vestingContract,
    ]);


    //////////////
    //  Modals  //
    //////////////

    // Stream detail modal
    const [isVestingContractStreamDetailModalVisible, setIsVestingContractStreamDetailModalVisibility] = useState(false);
    const showVestingContractStreamDetailModal = useCallback(() => setIsVestingContractStreamDetailModalVisibility(true), []);
    const closeVestingContractStreamDetailModal = useCallback(() => {
        setIsVestingContractStreamDetailModalVisibility(false);
        setHighLightableStreamId(undefined);
        sethHighlightedStream(undefined);
    }, [setHighLightableStreamId]);

    // Close stream modal
    const [isCloseStreamModalVisible, setIsCloseStreamModalVisibility] = useState(false);
    const showCloseStreamModal = useCallback(() => {
        resetTransactionStatus();

        if (vestingContract) {
            getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
                setTransactionFees(value);
                consoleOut('transactionFees:', value, 'orange');
            });
            setIsCloseStreamModalVisibility(true);
        }
    }, [getTransactionFees, resetTransactionStatus, vestingContract]);

    const hideCloseStreamModal = useCallback(() => setIsCloseStreamModalVisibility(false), []);
    const onAcceptCloseStream = (options: VestingContractCloseStreamOptions) => {
        hideCloseStreamModal();
        onExecuteCloseStreamTransaction(options);
    };

    // Common reusable transaction execution modal
    const [isTransactionExecutionModalVisible, setTransactionExecutionModalVisibility] = useState(false);
    const showTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(true), []);
    const hideTransactionExecutionModal = useCallback(() => setTransactionExecutionModalVisibility(false), []);

    const onCloseStreamTransactionFinished = () => {
        resetTransactionStatus();
        hideTransactionExecutionModal();
        refreshTokenBalance();
        setOngoingOperation(undefined);
    };

    const onExecuteCloseStreamTransaction = async (closeStreamOptions: VestingContractCloseStreamOptions) => {
        let transaction: Transaction;
        let signature: any;
        let encodedTx: string;
        let multisigId = '';
        const transactionLog: any[] = [];

        setTransactionCancelled(false);
        setOngoingOperation(OperationType.StreamClose);
        setRetryOperationPayload(closeStreamOptions);
        setIsBusy(true);

        const closeStream = async (data: any) => {

            if (!msp) { return null; }

            if (!isMultisigTreasury) {
                return msp.closeStream(
                    new PublicKey(data.payer),              // payer
                    new PublicKey(data.payer),              // destination
                    new PublicKey(data.stream),             // stream,
                    data.closeTreasury,                     // closeTreasury
                    true                                    // autoWSol
                );
            }

            if (!vestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

            const treasury = vestingContract;
            const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

            multisigId = multisig.authority.toBase58();

            if (!multisig) { return null; }

            const closeStream = await msp.closeStream(
                new PublicKey(data.payer),              // payer
                new PublicKey(data.payer),              // destination 
                new PublicKey(data.stream),             // stream,
                data.closeTreasury,                     // closeTreasury
                false
            );

            const ixData = Buffer.from(closeStream.instructions[0].data);
            const ixAccounts = closeStream.instructions[0].keys;
            const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

            const tx = await multisigClient.createTransaction(
                publicKey,
                "Close Stream",
                "", // description
                new Date(expirationTime * 1_000),
                OperationType.StreamClose,
                multisig.id,
                mspV2AddressPK,
                ixAccounts,
                ixData
            );

            return tx;
        }

        const createTx = async (): Promise<boolean> => {
            if (!publicKey || !highlightedStream || !msp || !selectedToken) {
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot start transaction! Wallet not found!'
                });
                customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                return false;
            }

            setTransactionStatus({
                lastOperation: TransactionStatus.TransactionStart,
                currentOperation: TransactionStatus.InitTransaction
            });
            const streamPublicKey = highlightedStream.id;

            const data = {
                stream: streamPublicKey.toBase58(),                             // stream
                payer: accountAddress,                                          // initializer
                closeTreasury: closeStreamOptions.closeTreasuryOption           // closeTreasury
            }
            consoleOut('data:', data);
            const price = selectedToken
                ? getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol)
                : 0;
            const usdValue = (parseFloat(closeStreamOptions.vestedReturns as string) + parseFloat(closeStreamOptions.unvestedReturns as string)) * price;

            // Report event to Segment analytics
            const segmentData: SegmentStreamCloseData = {
                asset: selectedToken ? selectedToken.symbol : '-',
                assetPrice: price,
                stream: data.stream,
                initializer: data.payer,
                closeTreasury: closeStreamOptions.closeTreasuryOption,
                vestedReturns: closeStreamOptions.vestedReturns,
                unvestedReturns: closeStreamOptions.unvestedReturns,
                feeAmount: closeStreamOptions.feeAmount,
                valueInUsd: usdValue
            };
            consoleOut('segment data:', segmentData, 'brown');
            segmentAnalytics.recordEvent(AppUsageEvent.StreamCloseFormButton, segmentData);

            // Log input data
            transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
                inputs: data
            });

            transactionLog.push({
                action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
                result: ''
            });

            // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
            // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
            consoleOut('Min balance required:', minRequiredBalance, 'blue');
            consoleOut('nativeBalance:', nativeBalance, 'blue');

            if (nativeBalance < minRequiredBalance) {
                setTransactionStatus({
                    lastOperation: transactionStatus.currentOperation,
                    currentOperation: TransactionStatus.TransactionStartFailure
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
                    result: `Not enough balance (${getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
                        }) to pay for network fees (${getAmountWithSymbol(minRequiredBalance, NATIVE_SOL_MINT.toBase58())
                        })`
                });
                customLogger.logWarning('Close stream transaction failed', { transcript: transactionLog });
                return false;
            }

            consoleOut('Starting Close Stream using MSP V2...', '', 'blue');
            // Create a transaction
            const result = await closeStream(data)
                .then(value => {
                    if (!value) { return false; }
                    consoleOut('closeStream returned transaction:', value);
                    setTransactionStatus({
                        lastOperation: TransactionStatus.InitTransactionSuccess,
                        currentOperation: TransactionStatus.SignTransaction
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
                        result: getTxIxResume(value)
                    });
                    transaction = value;
                    return true;
                })
                .catch(error => {
                    console.error('closeStream error:', error);
                    setTransactionStatus({
                        lastOperation: transactionStatus.currentOperation,
                        currentOperation: TransactionStatus.InitTransactionFailure
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                        result: `${error}`
                    });
                    customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                    return false;
                });

            return result;
        }

        const sendTx = async (): Promise<boolean> => {
            if (connection && wallet && wallet.publicKey && transaction) {
                const {
                  context: { slot: minContextSlot },
                  value: { blockhash, lastValidBlockHeight },
                } = await connection.getLatestBlockhashAndContext();
        
                transaction.feePayer = wallet.publicKey;
                transaction.recentBlockhash = blockhash;
        
                return wallet.sendTransaction(transaction, connection, { minContextSlot })
                    .then(sig => {
                        consoleOut('sendEncodedTransaction returned a signature:', sig);
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SendTransactionSuccess,
                            currentOperation: TransactionStatus.ConfirmTransaction
                        });
                        signature = sig;
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
                            result: `signature: ${signature}`
                        });
                        return true;
                    })
                    .catch(error => {
                        console.error(error);
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SendTransaction,
                            currentOperation: TransactionStatus.SendTransactionFailure
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
                            result: { error, encodedTx }
                        });
                        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                console.error('Cannot send transaction! Wallet not found!');
                setTransactionStatus({
                    lastOperation: TransactionStatus.SendTransaction,
                    currentOperation: TransactionStatus.WalletNotFound
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot send transaction! Wallet not found!'
                });
                customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        if (wallet && highlightedStream && vestingContract && selectedToken) {
            showTransactionExecutionModal();
            const created = await createTx();
            consoleOut('created:', created, 'blue');
            if (created && !transactionCancelled) {
                const sent = await sendTx();
                consoleOut('sent:', sent);
                if (sent && !transactionCancelled) {
                    consoleOut('Send Tx to confirmation queue:', signature);
                    const vestedReturns = getAmountWithSymbol(
                        closeStreamOptions.vestedReturns,
                        selectedToken.address,
                        false,
                        splTokenList,
                        selectedToken.decimals,
                    );
                    const unvestedReturns = getAmountWithSymbol(
                        closeStreamOptions.unvestedReturns,
                        selectedToken.address,
                        false,
                        splTokenList,
                        selectedToken.decimals,
                    );
                    const beneficiary = shortenAddress(highlightedStream.beneficiary);
                    const loadingMessage = multisigId
                        ? 'The Multisig proposal to close the vesting stream Dinero para mi sobrina is being confirmed.'
                        : `Vesting stream ${highlightedStream.name} closure is pending confirmation`;
                    const confirmedMultisigMessage = isDateInTheFuture(paymentStartDate)
                        ? `The proposal to close the vesting stream has been confirmed. Once approved, the unvested amount of ${unvestedReturns} will be returned to the vesting contract.`
                        : `The proposal to close the vesting stream has been confirmed. Once approved, the vested amount of ${vestedReturns} will be sent to ${beneficiary} and the stream will be closed.`;
                    const confirmedMessage = multisigId
                        ? confirmedMultisigMessage
                        : `Vesting stream ${highlightedStream.name} was closed successfully. Vested amount of ${vestedReturns} has been sent to ${beneficiary}. Unvested amount of ${unvestedReturns} was returned to the vesting contract.`;
                    enqueueTransactionConfirmation({
                        signature: signature,
                        operationType: OperationType.StreamClose,
                        finality: "confirmed",
                        txInfoFetchStatus: "fetching",
                        loadingTitle: "Confirming transaction",
                        loadingMessage: loadingMessage,
                        completedTitle: "Transaction confirmed",
                        completedMessage: confirmedMessage,
                        completedMessageTimeout: multisigId ? 8 : 5,
                        extras: {
                            vestingContractId: vestingContract.id as string,
                            multisigId: multisigId
                        }
                    });
                    setIsBusy(false);
                    onCloseStreamTransactionFinished();
                } else { setIsBusy(false); }
            } else { setIsBusy(false); }
        }

    };

    const refreshPage = () => {
        hideTransactionExecutionModal();
        window.location.reload();
    }

    const getStreamClosureMessage = () => {
        if (!paymentStartDate || !vestingContract) {
            return <div>&nbsp;</div>;
        }

        let message = '';

        if (publicKey && highlightedStream) {
            const beneficiary = highlightedStream.beneficiary.toBase58();
            if (isDateInTheFuture(paymentStartDate)) {
                message = t('vesting.close-account.close-stream-not-started');
            } else if (isContractFinished()) {
                message = t('vesting.close-account.close-stream-finished', { beneficiary: shortenAddress(beneficiary) });
            }
        }

        return (
            <div>{message}</div>
        );
    }

    /////////////////////
    // Data processing //
    /////////////////////

    // Update the streamList with treasuryStreams
    useEffect(() => {
        if (treasuryStreams) {
            setStreamList(treasuryStreams);
        }
    }, [treasuryStreams]);

    // Refresh the stream list
    useEffect(() => {
        if (!streamList || !msp) { return; }

        const timeout = setTimeout(() => {
            msp.refreshStreams(streamList || [])
            .then(streams => {
                setStreamList(streams);
            })
        }, 1000);

        return () => {
            clearTimeout(timeout);
        }
    }, [msp, streamList]);


    ///////////////
    // Rendering //
    ///////////////

    const renderStreamOptions = (item: Stream) => {
        if (!vestingContract) { return null; }

        const items: ItemType[] = [];

        if ((vestingContract.treasuryType === TreasuryType.Open ||
            (vestingContract.treasuryType === TreasuryType.Lock && item.status !== STREAM_STATUS.Running))) {
            //
            items.push({
                key: '01-close-stream',
                label: (
                    <div onClick={showCloseStreamModal}>
                        <span className="menu-item-text">{t('vesting.close-account.option-close-stream')}</span>
                    </div>
                )
            });
        }
        items.push({
            key: '02-copy-streamid',
            label: (
                <div onClick={() => copyAddressToClipboard(item.id)}>
                    <span className="menu-item-text">{t('vesting.close-account.option-copy-stream-id')}</span>
                </div>
            )
        });

        items.push({
            key: '03-show-stream',
            label: (
                <div onClick={() => {
                    sethHighlightedStream(item);
                    setHighLightableStreamId(item.id.toBase58());
                    showVestingContractStreamDetailModal();
                }}>
                    <span className="menu-item-text">{t('vesting.close-account.option-show-stream')}</span>
                </div>
            )
        });

        items.push({
            key: '04-explorer',
            label: (
                <a href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${item.id}${getSolanaExplorerClusterParam()}`}
                    target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('treasuries.treasury-streams.option-explorer-link')}</span>
                </a>
            )
        });

        const menu = (
            <Menu items={items} />
        );

        return (
            <Dropdown
                overlay={menu}
                trigger={["click"]}
                onOpenChange={(visibleChange: any) => {
                    if (visibleChange) {
                        sethHighlightedStream(item);
                        setHighLightableStreamId(item.id.toBase58());
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

    const renderTxExecutionResults = () => {
        if (isSuccess(transactionStatus.currentOperation)) {
            return (
                <>
                    <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                    <h4 className="font-bold mb-1 text-uppercase">
                        {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                    </h4>
                    <p className="operation">{t('transactions.status.tx-generic-operation-success')}</p>
                    <Button
                        block
                        type="primary"
                        shape="round"
                        size="middle"
                        onClick={() => ongoingOperation === OperationType.StreamClose
                                    ? onCloseStreamTransactionFinished()
                                    : hideTransactionExecutionModal()}>
                        {t('general.cta-finish')}
                    </Button>
                </>
            );
        } else if (isError(transactionStatus.currentOperation)) {
            return (
                <>
                    <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
                    {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                        <h4 className="mb-4">
                            {t('transactions.status.tx-start-failure', {
                                accountBalance: getAmountWithSymbol(
                                    nativeBalance,
                                    NATIVE_SOL_MINT.toBase58()
                                ),
                                feeAmount: getAmountWithSymbol(
                                    minRequiredBalance,
                                    NATIVE_SOL_MINT.toBase58()
                                )
                            })
                            }
                        </h4>
                    ) : (
                        <h4 className="font-bold mb-3">
                            {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                        </h4>
                    )}
                    {transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                        <div className="row two-col-ctas mt-3">
                            <div className="col-6">
                                <Button
                                    block
                                    type="text"
                                    shape="round"
                                    size="middle"
                                    onClick={() => ongoingOperation === OperationType.StreamClose
                                                ? onExecuteCloseStreamTransaction(retryOperationPayload)
                                                : hideTransactionExecutionModal()}>
                                    {t('general.retry')}
                                </Button>
                            </div>
                            <div className="col-6">
                                <Button
                                    block
                                    type="primary"
                                    shape="round"
                                    size="middle"
                                    onClick={() => refreshPage()}>
                                    {t('general.refresh')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            block
                            type="primary"
                            shape="round"
                            size="middle"
                            onClick={hideTransactionExecutionModal}>
                            {t('general.cta-close')}
                        </Button>
                    )}
                </>
            );
        } else {
            return (
                <>
                    <Spin indicator={bigLoadingIcon} className="icon" />
                    <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
                </>
            );
        }
    }

    return (
        <>
            <div className="tab-inner-content-wrapper vesting-contract-streams vertical-scroll">
                <Spin spinning={loadingTreasuryStreams}>
                    {(streamList && streamList.length > 0) ? (
                        streamList.map((item, index) => {

                            const getSelectedClass = () => {
                                return highlightedStream && highlightedStream.id === item.id ? 'selected' : '';
                            }

                            return (
                                <div key={`${index + 50}`} id={`${item.id}`}
                                    className={
                                        `transaction-list-row stripped-rows ${isDeletedStream(item.id.toBase58())
                                            ? 'disabled blurry-1x'
                                            : getSelectedClass()}`
                                    }>
                                    <div className="description-cell no-padding simplelink" onClick={() => {
                                        sethHighlightedStream(item);
                                        setHighLightableStreamId(item.id.toBase58());
                                        showVestingContractStreamDetailModal();
                                    }}>
                                        <div className="title text-truncate">{getStreamTitle(item)}</div>
                                        <div className="subtitle text-truncate">{getStreamSubtitle(item)}</div>
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
                                    <p>{getNoStreamsMessage()}</p>
                                </>
                            )}
                        </>
                    )}
                </Spin>
            </div>

            {isVestingContractStreamDetailModalVisible && highlightedStream && (
                <VestingContractStreamDetailModal
                    accountAddress={accountAddress}
                    handleClose={closeVestingContractStreamDetailModal}
                    highlightedStream={highlightedStream}
                    isVisible={isVestingContractStreamDetailModalVisible}
                    msp={msp}
                    selectedToken={selectedToken}
                />
            )}

            {isCloseStreamModalVisible && (
                <StreamCloseModal
                    canCloseTreasury={treasuryStreams.length === 1 ? true : false}
                    content={getStreamClosureMessage()}
                    handleClose={hideCloseStreamModal}
                    handleOk={(options: VestingContractCloseStreamOptions) => onAcceptCloseStream(options)}
                    hasContractFinished={isContractFinished()}
                    isVisible={isCloseStreamModalVisible}
                    mspClient={msp}
                    selectedToken={selectedToken}
                    streamDetail={highlightedStream}
                    transactionFees={transactionFees}
                />
            )}

            {/* Transaction execution modal */}
            <Modal
                className="mean-modal no-full-screen"
                maskClosable={false}
                open={isTransactionExecutionModalVisible}
                title={getTransactionModalTitle(transactionStatus, isBusy, t)}
                onCancel={hideTransactionExecutionModal}
                width={360}
                footer={null}>
                <div className="transaction-progress">
                    {isBusy ? (
                        <>
                            <Spin indicator={bigLoadingIcon} className="icon" />
                            <h4 className="font-bold mb-1">
                                {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                            </h4>
                            {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                                <div className="indication">{t('transactions.status.instructions')}</div>
                            )}
                        </>
                    ) : renderTxExecutionResults()}
                </div>
            </Modal>

        </>
    );
};
