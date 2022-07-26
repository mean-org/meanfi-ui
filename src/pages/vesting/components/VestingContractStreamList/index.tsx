import React, { useCallback, useContext, useState } from 'react';
import {
    calculateActionFees,
    MSP,
    MSP_ACTIONS,
    Stream,
    STREAM_STATUS,
    TransactionFees,
    Treasury,
    TreasuryType,
    Constants as MSPV2Constants,
    StreamTemplate
} from '@mean-dao/msp';
import { consoleOut, copyText, getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, getTimeToNow, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs } from '../../../../utils/ui';
import { AppStateContext } from '../../../../contexts/appstate';
import { NO_FEES, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { Button, Dropdown, Menu, Modal, Spin } from 'antd';
import { useTranslation } from 'react-i18next';
import { cutNumber, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, makeDecimal, shortenAddress } from '../../../../utils/utils';
import { TokenInfo } from '@solana/spl-token-registry';
import BN from 'bn.js';
import { openNotification } from '../../../../components/Notifications';
import { IconVerticalEllipsis } from '../../../../Icons';
import { getSolanaExplorerClusterParam, useConnection } from '../../../../contexts/connection';
import { OperationType, TransactionStatus } from '../../../../models/enums';
import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { TreasuryTopupParams } from '../../../../models/common-types';
import { VestingContractAddFundsModal } from '../VestingContractAddFundsModal';
import { VestingContractStreamDetailModal } from '../VestingContractStreamDetailModal';
import { StreamCloseModal } from '../StreamCloseModal';
import { StreamPauseModal } from '../StreamPauseModal';
import { StreamResumeModal } from '../StreamResumeModal';
import { isError, isSuccess } from '../../../../utils/transactions';
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { PublicKey, Transaction } from '@solana/web3.js';
import { useWallet } from '../../../../contexts/wallet';
import { customLogger } from '../../../..';
import { NATIVE_SOL_MINT } from '../../../../utils/ids';
import { TxConfirmationContext } from '../../../../contexts/transaction-status';
import { VestingContractCloseStreamOptions } from '../../../../models/vesting';
import { AppUsageEvent, SegmentStreamCloseData, SegmentStreamStatusChangeActionData } from '../../../../utils/segment-service';
import { segmentAnalytics } from '../../../../App';

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
        streamTemplate,
        treasuryStreams,
        userBalances,
        vestingContract,
    } = props;
    const {
        splTokenList,
        tokenBalance,
        selectedToken,
        deletedStreams,
        transactionStatus,
        setHighLightableStreamId,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
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
    const [withdrawTransactionFees, setWithdrawTransactionFees] = useState<TransactionFees>({
      blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
    });
    const [transactionCancelled, setTransactionCancelled] = useState(false);
    const [ongoingOperation, setOngoingOperation] = useState<OperationType | undefined>(undefined);
    const [retryOperationPayload, setRetryOperationPayload] = useState<any>(undefined);
    // const [paymentStartDate, setPaymentStartDate] = useState<string>("");

    const isDateInTheFuture = useCallback((date: string): boolean => {
        const now = new Date().toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, []);

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

    const getNoStreamsMessage = useCallback(() => {
        if (vestingContract && streamTemplate) {
            const paymentStartDate = streamTemplate.startUtc as string;
            // When a contract has started with 0 streams, say it
            if (!isDateInTheFuture(paymentStartDate) && vestingContract.totalStreams === 0) {
                return 'As this contract has started, no streams are able to be added to it.';
            }
        }

        return t('vesting.vesting-account-streams.no-streams');
    }, [isDateInTheFuture, streamTemplate, t, vestingContract]);

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

    const getStreamTitle = (item: Stream): string => {
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

    const getStreamSubtitle = useCallback((item: Stream) => {
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
                    title += ` ${getShortDate(item.startUtc as string, true)}`;
                } else {
                    title = t('streams.stream-list.subtitle-running-inbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string, true)}`;
                }
            } else {
                if (item.status === STREAM_STATUS.Schedule) {
                    title = t('streams.stream-list.subtitle-scheduled-outbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string, true)}`;
                } else {
                    title = t('streams.stream-list.subtitle-running-outbound', {
                        rate: rateAmount
                    });
                    title += ` ${getShortDate(item.startUtc as string, true)}`;
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
            const v2 = vestingContract as Treasury;
            if (v2.version && v2.version >= 2) {
                getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            } else {
                getTransactionFees(MSP_ACTIONS.closeStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            }
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
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        setTransactionCancelled(false);
        setOngoingOperation(OperationType.StreamClose);
        setRetryOperationPayload(closeStreamOptions);
        setIsBusy(true);

        const closeStream = async (data: any) => {

            if (!msp) { return null; }

            if (!isMultisigTreasury) {
                return await msp.closeStream(
                    new PublicKey(data.payer),              // payer
                    new PublicKey(data.payer),              // destination
                    new PublicKey(data.stream),             // stream,
                    data.closeTreasury,                     // closeTreasury
                    true                                    // TODO: Define if the user can determine this
                );
            }

            if (!vestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

            const treasury = vestingContract as Treasury;
            const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

            if (!multisig) { return null; }

            const closeStream = await msp.closeStream(
                new PublicKey(data.payer),              // payer
                new PublicKey(data.payer),              // TODO: This should come from the UI 
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
                MSPV2Constants.MSP,
                ixAccounts,
                ixData
            );

            return tx;
        }

        const createTx = async (): Promise<boolean> => {
            if (!publicKey || !highlightedStream || !msp) {
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
            const streamPublicKey = new PublicKey(highlightedStream.id as string);

            const data = {
                stream: streamPublicKey.toBase58(),                     // stream
                payer: publicKey.toBase58(),                            // initializer
                closeTreasury: closeStreamOptions.closeTreasuryOption        // closeTreasury
            }
            consoleOut('data:', data);
            const price = selectedToken
                ? getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol)
                : 0;

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
                valueInUsd: price * (closeStreamOptions.vestedReturns + closeStreamOptions.unvestedReturns)
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
                    result: `Not enough balance (${getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
                        }) to pay for network fees (${getTokenAmountAndSymbolByTokenAddress(minRequiredBalance, NATIVE_SOL_MINT.toBase58())
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

        const signTx = async (): Promise<boolean> => {
            if (wallet && publicKey) {
                consoleOut('Signing transaction...');
                return await wallet.signTransaction(transaction)
                    .then((signed: Transaction) => {
                        consoleOut('signTransaction returned a signed transaction:', signed);
                        signedTransaction = signed;
                        // Try signature verification by serializing the transaction
                        try {
                            encodedTx = signedTransaction.serialize().toString('base64');
                            consoleOut('encodedTx:', encodedTx, 'orange');
                        } catch (error) {
                            console.error(error);
                            setTransactionStatus({
                                lastOperation: TransactionStatus.SignTransaction,
                                currentOperation: TransactionStatus.SignTransactionFailure
                            });
                            transactionLog.push({
                                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                                result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                            });
                            customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                            return false;
                        }
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransactionSuccess,
                            currentOperation: TransactionStatus.SendTransaction
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                            result: { signer: publicKey.toBase58() }
                        });
                        return true;
                    })
                    .catch(error => {
                        console.error(error);
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransaction,
                            currentOperation: TransactionStatus.SignTransactionFailure
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                            result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                        });
                        customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                console.error('Cannot sign transaction! Wallet not found!');
                setTransactionStatus({
                    lastOperation: TransactionStatus.SignTransaction,
                    currentOperation: TransactionStatus.WalletNotFound
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot sign transaction! Wallet not found!'
                });
                customLogger.logError('Close stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        const sendTx = async (): Promise<boolean> => {
            if (wallet) {
                return await connection
                    .sendEncodedTransaction(encodedTx)
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

        if (wallet && highlightedStream && vestingContract) {
            showTransactionExecutionModal();
            const created = await createTx();
            consoleOut('created:', created, 'blue');
            if (created && !transactionCancelled) {
                const sign = await signTx();
                consoleOut('sign:', sign);
                if (sign && !transactionCancelled) {
                    const sent = await sendTx();
                    consoleOut('sent:', sent);
                    if (sent && !transactionCancelled) {
                        const treasury = vestingContract as Treasury;
                        const multisig = multisigAccounts
                            ? multisigAccounts.find(m => m.authority.toBase58() === treasury.treasurer)
                            : undefined;
                        consoleOut('Send Tx to confirmation queue:', signature);
                        const message = `Vesting stream ${highlightedStream.name} was closed successfully. Vested amount of [${
                            getTokenAmountAndSymbolByTokenAddress(
                                closeStreamOptions.vestedReturns,
                                highlightedStream.associatedToken as string,
                                false, splTokenList
                            )
                        }] has been sent to [${shortenAddress(highlightedStream.beneficiary as string)}]. Unvested amount of [${
                            getTokenAmountAndSymbolByTokenAddress(
                                closeStreamOptions.unvestedReturns,
                                highlightedStream.associatedToken as string,
                                false, splTokenList
                            )
                        }] was returned to the vesting contract.`;
                        enqueueTransactionConfirmation({
                            signature: signature,
                            operationType: OperationType.StreamClose,
                            finality: "confirmed",
                            txInfoFetchStatus: "fetching",
                            loadingTitle: "Confirming transaction",
                            loadingMessage: `Vesting stream ${highlightedStream.name} closure is pending confirmation`,
                            completedTitle: "Transaction confirmed",
                            completedMessage: message,
                            extras: {
                                vestingContractId: vestingContract.id as string,
                                multisigId: multisig ? multisig.authority.toBase58() : ''
                            }
                        });
                        setIsBusy(false);
                        onCloseStreamTransactionFinished();
                    } else { setIsBusy(false); }
                } else { setIsBusy(false); }
            } else { setIsBusy(false); }
        }

    };

    // Pause stream modal
    const [isPauseStreamModalVisible, setIsPauseStreamModalVisibility] = useState(false);
    const showPauseStreamModal = useCallback(() => {
        resetTransactionStatus();
        if (vestingContract) {
            const v2 = vestingContract as Treasury;
            if (v2.version && v2.version >= 2) {
                getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            } else {
                getTransactionFees(MSP_ACTIONS.pauseStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            }
            setIsPauseStreamModalVisibility(true);
        }
    }, [getTransactionFees, resetTransactionStatus, vestingContract]);

    const hidePauseStreamModal = useCallback(() => setIsPauseStreamModalVisibility(false), []);
    const onAcceptPauseStream = () => {
        hidePauseStreamModal();
        onExecutePauseStreamTransaction();
    };

    const onPauseStreamTransactionFinished = () => {
        resetTransactionStatus();
        hideTransactionExecutionModal();
        refreshTokenBalance();
        setOngoingOperation(undefined);
    };

    const onExecutePauseStreamTransaction = async () => {
        let transaction: Transaction;
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        resetTransactionStatus();
        setTransactionCancelled(false);
        setOngoingOperation(OperationType.StreamPause);
        setIsBusy(true);

        const pauseStream = async (data: any) => {

            if (!msp) { return null; }

            if (!isMultisigTreasury) {
                return await msp.pauseStream(
                    new PublicKey(data.payer),             // payer,
                    new PublicKey(data.payer),             // treasurer,
                    new PublicKey(data.stream),            // stream,
                );
            }

            if (!vestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

            const treasury = vestingContract as Treasury;
            const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

            if (!multisig) { return null; }

            const pauseStream = await msp.pauseStream(
                new PublicKey(data.payer),                   // payer
                multisig.authority,                          // treasurer
                new PublicKey(data.stream),                  // stream,
            );

            const ixData = Buffer.from(pauseStream.instructions[0].data);
            const ixAccounts = pauseStream.instructions[0].keys;
            const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

            const tx = await multisigClient.createTransaction(
                publicKey,
                "Pause Stream",
                "", // description
                new Date(expirationTime * 1_000),
                OperationType.StreamPause,
                multisig.id,
                MSPV2Constants.MSP,
                ixAccounts,
                ixData
            );

            return tx;
        }

        const createTx = async (): Promise<boolean> => {
            if (!publicKey || !highlightedStream || !msp) {
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot start transaction! Wallet not found!'
                });
                customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
                return false;
            }

            setTransactionStatus({
                lastOperation: TransactionStatus.TransactionStart,
                currentOperation: TransactionStatus.InitTransaction
            });
            const streamPublicKey = new PublicKey(highlightedStream.id as string);

            const data = {
                stream: streamPublicKey.toBase58(),               // stream
                payer: publicKey.toBase58(),                      // payer
            }
            consoleOut('data:', data);

            // Report event to Segment analytics
            const segmentData: SegmentStreamStatusChangeActionData = {
                action: 'Pause',
                streamId: data.stream
            };
            consoleOut('segment data:', segmentData, 'brown');
            segmentAnalytics.recordEvent(AppUsageEvent.StreamStatusChangeFormButton, segmentData);

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
                    result: `Not enough balance (${getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
                        }) to pay for network fees (${getTokenAmountAndSymbolByTokenAddress(minRequiredBalance, NATIVE_SOL_MINT.toBase58())
                        })`
                });
                customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
                return false;
            }

            consoleOut('Starting Stream Pause using MSP V2...', '', 'blue');
            // Create a transaction
            const result = await pauseStream(data)
                .then((value: any) => {
                    if (!value) { return false; }
                    consoleOut('pauseStream returned transaction:', value);
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
                .catch((error: any) => {
                    console.error('pauseStream error:', error);
                    setTransactionStatus({
                        lastOperation: transactionStatus.currentOperation,
                        currentOperation: TransactionStatus.InitTransactionFailure
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                        result: `${error}`
                    });
                    customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
                    return false;
                });

            return result;
        }

        const signTx = async (): Promise<boolean> => {
            if (wallet && publicKey) {
                consoleOut('Signing transaction...');
                return await wallet.signTransaction(transaction)
                    .then((signed: Transaction) => {
                        consoleOut('signTransaction returned a signed transaction:', signed);
                        signedTransaction = signed;
                        // Try signature verification by serializing the transaction
                        try {
                            encodedTx = signedTransaction.serialize().toString('base64');
                            consoleOut('encodedTx:', encodedTx, 'orange');
                        } catch (error) {
                            console.error(error);
                            setTransactionStatus({
                                lastOperation: TransactionStatus.SignTransaction,
                                currentOperation: TransactionStatus.SignTransactionFailure
                            });
                            transactionLog.push({
                                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                                result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                            });
                            customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
                            return false;
                        }
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransactionSuccess,
                            currentOperation: TransactionStatus.SendTransaction
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                            result: { signer: publicKey.toBase58() }
                        });
                        return true;
                    })
                    .catch(error => {
                        console.error('Signing transaction failed!');
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransaction,
                            currentOperation: TransactionStatus.SignTransactionFailure
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                            result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                        });
                        customLogger.logWarning('Pause stream transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                console.error('Cannot sign transaction! Wallet not found!');
                setTransactionStatus({
                    lastOperation: TransactionStatus.SignTransaction,
                    currentOperation: TransactionStatus.WalletNotFound
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot sign transaction! Wallet not found!'
                });
                customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        const sendTx = async (): Promise<boolean> => {
            const encodedTx = signedTransaction.serialize().toString('base64');
            consoleOut('encodedTx:', encodedTx, 'orange');
            if (wallet) {
                return await connection
                    .sendEncodedTransaction(encodedTx)
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
                        customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
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
                customLogger.logError('Pause stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        if (wallet && highlightedStream) {
            showTransactionExecutionModal();
            const created = await createTx();
            consoleOut('created:', created, 'blue');
            if (created && !transactionCancelled) {
                const sign = await signTx();
                consoleOut('sign:', sign);
                if (sign && !transactionCancelled) {
                    const sent = await sendTx();
                    consoleOut('sent:', sent);
                    if (sent && !transactionCancelled) {
                        consoleOut('Send Tx to confirmation queue:', signature);
                        enqueueTransactionConfirmation({
                            signature: signature,
                            operationType: OperationType.StreamPause,
                            finality: "confirmed",
                            txInfoFetchStatus: "fetching",
                            loadingTitle: "Confirming transaction",
                            loadingMessage: `Pause stream: ${highlightedStream.name}`,
                            completedTitle: "Transaction confirmed",
                            completedMessage: `Successfully paused stream: ${highlightedStream.name}`,
                            extras: highlightedStream.id as string
                        });
                        setIsBusy(false);
                        onPauseStreamTransactionFinished();
                    } else { setIsBusy(false); }
                } else { setIsBusy(false); }
            } else { setIsBusy(false); }
        }

    };

    // Resume stream modal
    const [isResumeStreamModalVisible, setIsResumeStreamModalVisibility] = useState(false);
    const showResumeStreamModal = useCallback(() => {
        resetTransactionStatus();
        if (vestingContract) {
            const v2 = vestingContract as Treasury;
            if (v2.version && v2.version >= 2) {
                getTransactionFees(MSP_ACTIONS.resumeStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            } else {
                getTransactionFees(MSP_ACTIONS.resumeStream).then(value => {
                    setTransactionFees(value);
                    consoleOut('transactionFees:', value, 'orange');
                });
            }
            setIsResumeStreamModalVisibility(true);
        }
    }, [getTransactionFees, resetTransactionStatus, vestingContract]);

    const hideResumeStreamModal = useCallback(() => setIsResumeStreamModalVisibility(false), []);
    const onAcceptResumeStream = () => {
        hideResumeStreamModal();
        onExecuteResumeStreamTransaction();
    };

    const onResumeStreamTransactionFinished = () => {
        resetTransactionStatus();
        hideTransactionExecutionModal();
        refreshTokenBalance();
        setOngoingOperation(undefined);
    };

    const onExecuteResumeStreamTransaction = async () => {
        let transaction: Transaction;
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        resetTransactionStatus();
        setTransactionCancelled(false);
        setOngoingOperation(OperationType.StreamResume);
        setIsBusy(true);

        const resumeStream = async (data: any) => {

            if (!msp) { return null; }

            if (!isMultisigTreasury) {
                return await msp.resumeStream(
                    new PublicKey(data.payer),             // payer,
                    new PublicKey(data.payer),             // treasurer,
                    new PublicKey(data.stream),            // stream,
                );
            }

            if (!vestingContract || !multisigClient || !multisigAccounts || !publicKey) { return null; }

            const treasury = vestingContract as Treasury;
            const multisig = multisigAccounts.filter(m => m.authority.toBase58() === treasury.treasurer)[0];

            if (!multisig) { return null; }

            const resumeStream = await msp.resumeStream(
                new PublicKey(data.payer),                   // payer
                multisig.authority,                          // treasurer
                new PublicKey(data.stream),                  // stream,
            );

            const ixData = Buffer.from(resumeStream.instructions[0].data);
            const ixAccounts = resumeStream.instructions[0].keys;
            const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

            const tx = await multisigClient.createTransaction(
                publicKey,
                "Resume Stream",
                "", // description
                new Date(expirationTime * 1_000),
                OperationType.StreamResume,
                multisig.id,
                MSPV2Constants.MSP,
                ixAccounts,
                ixData
            );

            return tx;
        }

        const createTx = async (): Promise<boolean> => {
            if (!publicKey || !highlightedStream || !msp) {
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot start transaction! Wallet not found!'
                });
                customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
                return false;
            }

            setTransactionStatus({
                lastOperation: TransactionStatus.TransactionStart,
                currentOperation: TransactionStatus.InitTransaction
            });

            const streamPublicKey = new PublicKey(highlightedStream.id as string);
            const data = {
                stream: streamPublicKey.toBase58(),               // stream
                payer: publicKey.toBase58(),                      // payer
            }
            consoleOut('data:', data);

            // Report event to Segment analytics
            const segmentData: SegmentStreamStatusChangeActionData = {
                action: 'Resume',
                streamId: data.stream
            };
            consoleOut('segment data:', segmentData, 'brown');
            segmentAnalytics.recordEvent(AppUsageEvent.StreamStatusChangeFormButton, segmentData);

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
                    result: `Not enough balance (${getTokenAmountAndSymbolByTokenAddress(nativeBalance, NATIVE_SOL_MINT.toBase58())
                        }) to pay for network fees (${getTokenAmountAndSymbolByTokenAddress(minRequiredBalance, NATIVE_SOL_MINT.toBase58())
                        })`
                });
                customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
                return false;
            }

            consoleOut('Starting Stream Resume using MSP V2...', '', 'blue');
            // Create a transaction
            const result = await resumeStream(data)
                .then(value => {
                    if (!value) { return false; }
                    consoleOut('resumeStream returned transaction:', value);
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
                    console.error('resumeStream error:', error);
                    setTransactionStatus({
                        lastOperation: transactionStatus.currentOperation,
                        currentOperation: TransactionStatus.InitTransactionFailure
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                        result: `${error}`
                    });
                    customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
                    return false;
                });

            return result;
        }

        const signTx = async (): Promise<boolean> => {
            if (wallet && publicKey) {
                consoleOut('Signing transaction...');
                return await wallet.signTransaction(transaction)
                    .then((signed: Transaction) => {
                        consoleOut('signTransaction returned a signed transaction:', signed);
                        signedTransaction = signed;
                        // Try signature verification by serializing the transaction
                        try {
                            encodedTx = signedTransaction.serialize().toString('base64');
                            consoleOut('encodedTx:', encodedTx, 'orange');
                        } catch (error) {
                            console.error(error);
                            setTransactionStatus({
                                lastOperation: TransactionStatus.SignTransaction,
                                currentOperation: TransactionStatus.SignTransactionFailure
                            });
                            transactionLog.push({
                                action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                                result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                            });
                            customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
                            return false;
                        }
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransactionSuccess,
                            currentOperation: TransactionStatus.SendTransaction
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                            result: { signer: publicKey.toBase58() }
                        });
                        return true;
                    })
                    .catch(error => {
                        console.error('Signing transaction failed!');
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransaction,
                            currentOperation: TransactionStatus.SignTransactionFailure
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                            result: { signer: `${publicKey.toBase58()}`, error: `${error}` }
                        });
                        customLogger.logWarning('Resume stream transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                console.error('Cannot sign transaction! Wallet not found!');
                setTransactionStatus({
                    lastOperation: TransactionStatus.SignTransaction,
                    currentOperation: TransactionStatus.WalletNotFound
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot sign transaction! Wallet not found!'
                });
                customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        const sendTx = async (): Promise<boolean> => {
            if (wallet) {
                return await connection
                    .sendEncodedTransaction(encodedTx)
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
                        customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
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
                customLogger.logError('Resume stream transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        if (wallet && highlightedStream) {
            showTransactionExecutionModal();
            const created = await createTx();
            consoleOut('created:', created, 'blue');
            if (created && !transactionCancelled) {
                const sign = await signTx();
                consoleOut('sign:', sign);
                if (sign && !transactionCancelled) {
                    const sent = await sendTx();
                    consoleOut('sent:', sent);
                    if (sent && !transactionCancelled) {
                        consoleOut('Send Tx to confirmation queue:', signature);
                        enqueueTransactionConfirmation({
                            signature: signature,
                            operationType: OperationType.StreamResume,
                            finality: "confirmed",
                            txInfoFetchStatus: "fetching",
                            loadingTitle: "Confirming transaction",
                            loadingMessage: `Resume stream: ${highlightedStream.name}`,
                            completedTitle: "Transaction confirmed",
                            completedMessage: `Successfully resumed stream: ${highlightedStream.name}`,
                            extras: highlightedStream.id as string
                        });
                        setIsBusy(false);
                        onResumeStreamTransactionFinished();
                    } else { setIsBusy(false); }
                } else { setIsBusy(false); }
            } else { setIsBusy(false); }
        }

    };

    const refreshPage = () => {
        hideTransactionExecutionModal();
        window.location.reload();
    }

    const getStreamClosureMessage = () => {
        let message = '';

        if (publicKey && highlightedStream) {

            const me = publicKey.toBase58();
            // TODO: So, the message for a multisig treasury would be the same of that of a regular treasury???
            // const treasurer = highlightedStream.treasurer as string;
            const beneficiary = highlightedStream.beneficiary as string;

            if (beneficiary === me) {
                message = t('close-stream.context-beneficiary', { beneficiary: shortenAddress(beneficiary) });
            } else {
                message = t('close-stream.context-treasurer-single-beneficiary', { beneficiary: shortenAddress(beneficiary) });
            }

        }

        return (
            <div>{message}</div>
        );
    }

    const getStreamPauseMessage = () => {
        let message = '';

        if (publicKey && highlightedStream) {

            const treasury = highlightedStream.treasury as string;
            const beneficiary = highlightedStream.beneficiary as string;

            message = t('streams.pause-stream-confirmation', {
                treasury: shortenAddress(treasury),
                beneficiary: shortenAddress(beneficiary)
            });

        }

        return (
            <div>{message}</div>
        );
    }

    const getStreamResumeMessage = () => {
        let message = '';

        if (publicKey && highlightedStream) {

            const treasury = highlightedStream.treasury as string;
            const beneficiary = highlightedStream.beneficiary as string;

            message = t('streams.resume-stream-confirmation', {
                treasury: shortenAddress(treasury),
                beneficiary: shortenAddress(beneficiary)
            });

        }

        return (
            <div>{message}</div>
        );
    }

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
                                        <Menu.Item key="1" onClick={showResumeStreamModal}>
                                            <span className="menu-item-text">{t('treasuries.treasury-streams.option-resume-stream')}</span>
                                        </Menu.Item>
                                    )}
                                </>
                            ) : item.status === STREAM_STATUS.Running ? (
                                <Menu.Item key="2" onClick={showPauseStreamModal}>
                                    <span className="menu-item-text">{t('treasuries.treasury-streams.option-pause-stream')}</span>
                                </Menu.Item>
                            ) : null
                        }
                        <Menu.Item key="3" onClick={showAddFundsModal}>
                            <span className="menu-item-text">{t('streams.stream-detail.add-funds-cta')}</span>
                        </Menu.Item>
                    </>
                )}
                {(vestingContract.treasuryType === TreasuryType.Open ||
                 (vestingContract.treasuryType === TreasuryType.Lock && item.status !== STREAM_STATUS.Running)) && (
                    <Menu.Item key="4" onClick={showCloseStreamModal}>
                        <span className="menu-item-text">{t('vesting.close-account.option-close-stream')}</span>
                    </Menu.Item>
                )}
                <Menu.Item key="5" onClick={() => copyAddressToClipboard(item.id)}>
                    <span className="menu-item-text">{t('vesting.close-account.option-copy-stream-id')}</span>
                </Menu.Item>
                <Menu.Item key="6" onClick={showVestingContractStreamDetailModal}>
                    <span className="menu-item-text">{t('vesting.close-account.option-show-stream')}</span>
                </Menu.Item>
                <Menu.Item key="7">
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
                                    <div className="description-cell no-padding simplelink" onClick={() => {
                                        sethHighlightedStream(item);
                                        setHighLightableStreamId(item.id as string);
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

            {isAddFundsModalVisible && (
                <VestingContractAddFundsModal
                    associatedToken={vestingContract ? vestingContract.associatedToken as string : ''}
                    handleClose={closeAddFundsModal}
                    handleOk={onAcceptAddFunds}
                    isBusy={isBusy}
                    isVisible={isAddFundsModalVisible}
                    nativeBalance={nativeBalance}
                    minRequiredBalance={minRequiredBalance}
                    streamTemplate={streamTemplate}
                    transactionFees={transactionFees}
                    treasuryStreams={treasuryStreams}
                    userBalances={userBalances}
                    vestingContract={vestingContract}
                    withdrawTransactionFees={withdrawTransactionFees}
                />
            )}

            {isVestingContractStreamDetailModalVisible && highlightedStream && (
                <VestingContractStreamDetailModal
                    accountAddress={accountAddress}
                    handleClose={closeVestingContractStreamDetailModal}
                    highlightedStream={highlightedStream}
                    isVisible={isVestingContractStreamDetailModalVisible}
                    msp={msp}
                />
            )}

            {isCloseStreamModalVisible && (
                <StreamCloseModal
                    isVisible={isCloseStreamModalVisible}
                    selectedToken={selectedToken}
                    transactionFees={transactionFees}
                    streamDetail={highlightedStream}
                    handleOk={(options: VestingContractCloseStreamOptions) => onAcceptCloseStream(options)}
                    handleClose={hideCloseStreamModal}
                    content={getStreamClosureMessage()}
                    mspClient={msp}
                    canCloseTreasury={treasuryStreams.length === 1 ? true : false}
                />
            )}

            <StreamPauseModal
                isVisible={isPauseStreamModalVisible}
                selectedToken={selectedToken}
                transactionFees={transactionFees}
                tokenBalance={tokenBalance}
                streamDetail={highlightedStream}
                handleOk={onAcceptPauseStream}
                handleClose={hidePauseStreamModal}
                content={getStreamPauseMessage()}
            />

            <StreamResumeModal
                isVisible={isResumeStreamModalVisible}
                selectedToken={selectedToken}
                transactionFees={transactionFees}
                tokenBalance={tokenBalance}
                streamDetail={highlightedStream}
                handleOk={onAcceptResumeStream}
                handleClose={hideResumeStreamModal}
                content={getStreamResumeMessage()}
            />

            {/* Transaction execution modal */}
            <Modal
                className="mean-modal no-full-screen"
                maskClosable={false}
                visible={isTransactionExecutionModalVisible}
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
                    ) : isSuccess(transactionStatus.currentOperation) ? (
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
                                onClick={() => ongoingOperation === OperationType.StreamPause
                                    ? onPauseStreamTransactionFinished()
                                    : ongoingOperation === OperationType.StreamResume
                                        ? onResumeStreamTransactionFinished()
                                        : ongoingOperation === OperationType.StreamClose
                                            ? onCloseStreamTransactionFinished()
                                            : hideTransactionExecutionModal()}>
                                {t('general.cta-finish')}
                            </Button>
                        </>
                    ) : isError(transactionStatus.currentOperation) ? (
                        <>
                            <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
                            {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                                <h4 className="mb-4">
                                    {t('transactions.status.tx-start-failure', {
                                        accountBalance: getTokenAmountAndSymbolByTokenAddress(
                                            nativeBalance,
                                            NATIVE_SOL_MINT.toBase58()
                                        ),
                                        feeAmount: getTokenAmountAndSymbolByTokenAddress(
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
                                            onClick={() => ongoingOperation === OperationType.StreamPause
                                                ? onExecutePauseStreamTransaction()
                                                : ongoingOperation === OperationType.StreamResume
                                                    ? onExecuteResumeStreamTransaction()
                                                    : ongoingOperation === OperationType.StreamClose
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
                    ) : (
                        <>
                            <Spin indicator={bigLoadingIcon} className="icon" />
                            <h4 className="font-bold mb-4 text-uppercase">{t('transactions.status.tx-wait')}...</h4>
                        </>
                    )}
                </div>
            </Modal>

        </>
    );
};
