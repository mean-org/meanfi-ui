import { LoadingOutlined } from '@ant-design/icons';
import { getFees, MeanMultisig, MultisigParticipant, MultisigTransactionFees, MULTISIG_ACTIONS } from '@mean-dao/mean-multisig-sdk';
import { Connection, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import { Button, Col, Row, Slider, Tooltip } from 'antd';
import { SliderMarks } from 'antd/lib/slider';
import { segmentAnalytics } from 'App';
import { MultisigParticipants } from 'components/MultisigParticipants';
import { openNotification } from 'components/Notifications';
import { PreFooter } from 'components/PreFooter';
import { MAX_MULTISIG_PARTICIPANTS, MEAN_MULTISIG_ACCOUNT_LAMPORTS } from 'constants/common';
import { useAccountsContext } from 'contexts/accounts';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { confirmationEvents, TxConfirmationContext, TxConfirmationInfo } from 'contexts/transaction-status';
import { useWallet } from 'contexts/wallet';
import useWindowSize from 'hooks/useWindowResize';
import { IconHelpCircle, IconSafe } from 'Icons';
import { appConfig, customLogger } from 'index';
import { NATIVE_SOL_MINT } from 'middleware/ids';
import { AppUsageEvent } from 'middleware/segment-service';
import { consoleOut, getTransactionStatusForLogs, isValidAddress } from 'middleware/ui';
import { formatThousands, getAmountFromLamports, getAmountWithSymbol, getTxIxResume } from 'middleware/utils';
import { EventType, OperationType, TransactionStatus } from 'models/enums';
import { CreateNewSafeParams, ZERO_FEES } from 'models/multisig';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import "./style.scss";

const CreateSafeView = () => {
    const { t } = useTranslation('common');
    const { wallet, publicKey } = useWallet();
    const connectionConfig = useConnectionConfig();
    const account = useAccountsContext();
    const navigate = useNavigate();
    const {
        multisigAccounts,
        transactionStatus,
        setTransactionStatus,
        refreshMultisigs,
    } = useContext(AppStateContext);
    const {
        enqueueTransactionConfirmation,
      } = useContext(TxConfirmationContext);
    const { width } = useWindowSize();
    const [isXsDevice, setIsXsDevice] = useState<boolean>(false);
    const [multisigLabel, setMultisigLabel] = useState('');
    const [multisigThreshold, setMultisigThreshold] = useState(0);
    const [multisigOwners, setMultisigOwners] = useState<MultisigParticipant[]>([]);
    const [multisigAddresses, setMultisigAddresses] = useState<string[]>([]);
    const [transactionCancelled, setTransactionCancelled] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [canSubscribe, setCanSubscribe] = useState(true);
    const [minRequiredBalance, setMinRequiredBalance] = useState(0);
    const [multisigTransactionFees, setMultisigTransactionFees] = useState<MultisigTransactionFees>(ZERO_FEES);
    // Slider
    const [marks, setMarks] = useState<SliderMarks>();
    const [rangeMin, setRangeMin] = useState(0);
    const [rangeMax, setRangeMax] = useState(0);

    /////////////////
    //  Init code  //
    /////////////////

    const multisigAddressPK = useMemo(() => new PublicKey(appConfig.getConfig().multisigProgramAddress), []);

    const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
        commitment: "confirmed",
        disableRetryOnRateLimit: true
    }), [connectionConfig.endpoint]);

    const multisigClient = useMemo(() => {
        if (!connection || !publicKey || !connectionConfig.endpoint) { return null; }
        return new MeanMultisig(
            connectionConfig.endpoint,
            publicKey,
            "confirmed",
            multisigAddressPK
        );
    }, [
        publicKey,
        connection,
        multisigAddressPK,
        connectionConfig.endpoint,
    ]);

    const nativeBalance = useMemo(() => {
        return account && account.nativeAccount
            ? getAmountFromLamports(account.nativeAccount.lamports)
            : 0;
    }, [account]);


    ///////////////
    // Callbacks //
    ///////////////

    const resetTransactionStatus = useCallback(() => {
        setTransactionStatus({
            lastOperation: TransactionStatus.Iddle,
            currentOperation: TransactionStatus.Iddle
        });
    }, [setTransactionStatus]);

    const recordTxConfirmation = useCallback((signature: string, operation: OperationType, success = true) => {
        let event: any;
        if (operation === OperationType.CreateMultisig) {
            event = success ? AppUsageEvent.CreateSuperSafeAccountCompleted : AppUsageEvent.CreateSuperSafeAccountFailed;
            segmentAnalytics.recordEvent(event, { signature: signature });
        }
    }, []);

    const clearFormValues = useCallback(() => {
        setMultisigLabel('');
        setMultisigThreshold(1);
    }, []);

    // Setup event handler for Tx confirmed
    const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {

        if (item.operationType === OperationType.CreateMultisig) {
            consoleOut(`onTxConfirmed event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
            recordTxConfirmation(item.signature, item.operationType, true);
            setIsBusy(false);
            refreshMultisigs();
            clearFormValues();
            openNotification({
                title: 'SuperSafe account created',
                description: 'Your SuperSafe account was successfully created and it is ready to be used. Check it out under your account.',
                duration: 12,
                type: "success",
            });
        }

    }, [clearFormValues, recordTxConfirmation, refreshMultisigs]);

    // Setup event handler for Tx confirmation error
    const onTxTimedout = useCallback((item: TxConfirmationInfo) => {

        if (item.operationType === OperationType.CreateMultisig) {
            consoleOut(`onTxTimedout event handled for operation ${OperationType[item.operationType]}`, item, 'crimson');
            recordTxConfirmation(item.signature, item.operationType, false);
            setIsBusy(false);
            refreshMultisigs();
            openNotification({
                title: 'Create SuperSafe account',
                description: 'The transaction to create a SuperSafe account was not confirmed within 40 seconds. Solana may be congested right now. This page needs to be reloaded to verify the contract was successfully created.',
                duration: 12,
                type: "info",
            });
        }

    }, [recordTxConfirmation, refreshMultisigs]);

    /////////////////////
    // Data management //
    /////////////////////

    // Detect XS screen
    useEffect(() => {
        if (width < 576) {
            setIsXsDevice(true);
        } else {
            setIsXsDevice(false);
        }
    }, [width]);

    // Add current wallet address as first participant
    useEffect(() => {
        if (publicKey) {
            setMultisigThreshold(1);
            const items: MultisigParticipant[] = [];
            items.push({
                name: `Signer 1`,
                address: publicKey.toBase58()
            });
            setMultisigOwners(items);
            if (multisigAccounts && multisigAccounts.length > 0) {
                const msAddresses = multisigAccounts.map(ms => ms.id.toBase58());
                setMultisigAddresses(msAddresses);
            }
        }
    }, [multisigAccounts, publicKey]);

    // Get the Create multisig fees
    useEffect(() => {

        if (!publicKey || !multisigClient || multisigTransactionFees.multisigFee > 0) { return; }

        getFees(multisigClient.getProgram(), MULTISIG_ACTIONS.createMultisig)
            .then(value => {
                setMultisigTransactionFees(value);
                consoleOut('multisigTransactionFees:', value, 'orange');
                consoleOut('nativeBalance:', nativeBalance, 'blue');
                consoleOut('networkFee:', value.networkFee, 'blue');
                consoleOut('rentExempt:', value.rentExempt, 'blue');
                const totalMultisigFee = value.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
                consoleOut('multisigFee:', totalMultisigFee, 'blue');
                const minRequired = totalMultisigFee + value.rentExempt + value.networkFee;
                consoleOut('Min required balance:', minRequired, 'blue');
                // const minSolForOperations = minRequired > MIN_SOL_BALANCE_REQUIRED ? minRequired : MIN_SOL_BALANCE_REQUIRED;
                setMinRequiredBalance(minRequired);
            });

    }, [multisigClient, multisigTransactionFees.multisigFee, nativeBalance, publicKey]);

    // Set min and max for the slider
    useEffect(() => {
        const minRangeSelectable = 1;
        let maxRangeSelectable = 1;

        if (multisigOwners && multisigOwners.length > 0) {
            maxRangeSelectable = multisigOwners.length;
        }

        const marks: SliderMarks = {
            [minRangeSelectable]: `${minRangeSelectable} ${minRangeSelectable === 1 ? 'signer' : 'signers'}`,
            [maxRangeSelectable]: `${maxRangeSelectable} ${maxRangeSelectable === 1 ? 'signer' : 'signers'}`
        };
        setMarks(marks);
        setRangeMin(minRangeSelectable);
        setRangeMax(maxRangeSelectable);
    }, [multisigOwners]);

    // Setup event listeners
    useEffect(() => {
        if (canSubscribe) {
            setCanSubscribe(false);
            confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
            consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
            confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
            consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
        }
    }, [
        canSubscribe,
        onTxConfirmed,
        onTxTimedout
    ]);

    // Unsubscribe from events
    useEffect(() => {
        // Do unmounting stuff here
        return () => {
            confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
            consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
            confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
            consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
            setCanSubscribe(true);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    //////////////
    //  Events  //
    //////////////

    const onBackClick = () => {
        navigate(-1);
    }

    const onAccountCreateClick = () => {
        const params: CreateNewSafeParams = {
            label: multisigLabel,
            threshold: multisigThreshold,
            owners: multisigOwners
        };
        consoleOut('CreateNewSafeParams:', params, 'blue');
        onExecuteCreateMultisigTx(params);
    }

    const onExecuteCreateMultisigTx = async (data: CreateNewSafeParams) => {

        let transaction: Transaction;
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        resetTransactionStatus();
        setTransactionCancelled(false);
        setIsBusy(true);

        const createMultisig = async (createParams: any) => {

            if (!multisigClient || !publicKey) { return; }

            const owners = createParams.owners.map((p: MultisigParticipant) => {
                return {
                    address: new PublicKey(p.address),
                    name: p.name
                }
            });

            const tx = await multisigClient.createFundedMultisig(
                publicKey,
                MEAN_MULTISIG_ACCOUNT_LAMPORTS,
                createParams.label,
                createParams.threshold,
                owners
            );

            return tx;
        };

        const createTx = async (): Promise<boolean> => {

            if (publicKey && data) {
                consoleOut("Start transaction for create multisig", '', 'blue');
                consoleOut('Wallet address:', publicKey.toBase58());

                setTransactionStatus({
                    lastOperation: TransactionStatus.TransactionStart,
                    currentOperation: TransactionStatus.InitTransaction
                });

                // Create a transaction
                const payload = {
                    wallet: publicKey.toBase58(),                               // wallet
                    label: data.label,                                          // multisig label
                    threshold: data.threshold,
                    owners: data.owners,
                };

                consoleOut('data:', payload);

                // Log input data
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
                    inputs: payload
                });

                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
                    result: ''
                });

                // Abort transaction if not enough balance to pay for gas fees and trigger TransactionStatus error
                // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
                consoleOut('nativeBalance:', nativeBalance, 'blue');
                consoleOut('networkFee:', multisigTransactionFees.networkFee, 'blue');
                consoleOut('rentExempt:', multisigTransactionFees.rentExempt, 'blue');
                const totalMultisigFee = multisigTransactionFees.multisigFee + (MEAN_MULTISIG_ACCOUNT_LAMPORTS / LAMPORTS_PER_SOL);
                consoleOut('multisigFee:', totalMultisigFee, 'blue');
                const minRequired = totalMultisigFee + multisigTransactionFees.rentExempt + multisigTransactionFees.networkFee;
                consoleOut('Min required balance:', minRequired, 'blue');

                if (nativeBalance < minRequired) {
                    setTransactionStatus({
                        lastOperation: transactionStatus.currentOperation,
                        currentOperation: TransactionStatus.TransactionStartFailure
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
                        result: `Not enough balance (${getAmountWithSymbol(nativeBalance, NATIVE_SOL_MINT.toBase58())
                            }) to pay for network fees (${getAmountWithSymbol(
                                minRequired,
                                NATIVE_SOL_MINT.toBase58()
                            )
                            })`
                    });
                    customLogger.logWarning('Create multisig transaction failed', { transcript: transactionLog });
                    return false;
                }

                return createMultisig(payload)
                    .then(value => {
                        if (!value) { return false; }
                        consoleOut('createMultisig returned transaction:', value);
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
                        console.error('createMultisig error:', error);
                        setTransactionStatus({
                            lastOperation: transactionStatus.currentOperation,
                            currentOperation: TransactionStatus.InitTransactionFailure
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                            result: `${error}`
                        });
                        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                        return false;
                    });

            } else {
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot start transaction! Wallet not found!'
                });
                customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        const signTx = async (): Promise<boolean> => {
            if (!wallet || !wallet.publicKey) {
                console.error('Cannot sign transaction! Wallet not found!');
                setTransactionStatus({
                    lastOperation: TransactionStatus.SignTransaction,
                    currentOperation: TransactionStatus.WalletNotFound
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot sign transaction! Wallet not found!'
                });
                customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                return false;
            }
            const signedPublicKey = wallet.publicKey;
            consoleOut('Signing transaction...');
            return wallet.signTransaction(transaction)
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
                            result: { signer: `${signedPublicKey.toBase58()}`, error: `${error}` }
                        });
                        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                        return false;
                    }
                    setTransactionStatus({
                        lastOperation: TransactionStatus.SignTransactionSuccess,
                        currentOperation: TransactionStatus.SendTransaction
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                        result: { signer: signedPublicKey.toBase58() }
                    });
                    return true;
                })
                .catch((error: any) => {
                    console.error(error);
                    setTransactionStatus({
                        lastOperation: TransactionStatus.SignTransaction,
                        currentOperation: TransactionStatus.SignTransactionFailure
                    });
                    transactionLog.push({
                        action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                        result: { signer: `${signedPublicKey.toBase58()}`, error: `${error}` }
                    });
                    customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                    return false;
                });
        }

        const sendTx = async (): Promise<boolean> => {
            if (wallet) {
                return connection
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
                        customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
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
                customLogger.logError('Create multisig transaction failed', { transcript: transactionLog });
                return false;
            }
        }

        if (wallet && data) {
            const create = await createTx();
            consoleOut('created:', create);
            if (create && !transactionCancelled) {
                const sign = await signTx();
                consoleOut('signed:', sign);
                if (sign && !transactionCancelled) {
                    const sent = await sendTx();
                    consoleOut('sent:', sent);
                    if (sent && !transactionCancelled) {
                        consoleOut('Send Tx to confirmation queue:', signature);
                        enqueueTransactionConfirmation({
                            signature: signature,
                            operationType: OperationType.CreateMultisig,
                            finality: "confirmed",
                            txInfoFetchStatus: "fetching",
                            loadingTitle: 'Confirming transaction',
                            loadingMessage: `Creating safe ${data.label}`,
                            completedTitle: 'Transaction confirmed',
                            completedMessage: `Safe ${data.label} successfully created`
                        });
                        resetTransactionStatus();
                    } else {
                        openNotification({
                            title: t('notifications.error-title'),
                            description: t('notifications.error-sending-transaction'),
                            type: "error"
                        });
                        setIsBusy(false);
                    }
                } else { setIsBusy(false); }
            } else { setIsBusy(false); }
        }

    }

    const onLabelInputValueChange = (e: any) => {
        setMultisigLabel(e.target.value);
    }

    const noDuplicateExists = (arr: MultisigParticipant[]): boolean => {
        const items = arr.map(i => i.address);
        return new Set(items).size === items.length ? true : false;
    }

    const isFormValid = () => {
        return multisigThreshold &&
            multisigThreshold >= 1 &&
            multisigThreshold <= MAX_MULTISIG_PARTICIPANTS &&
            multisigLabel &&
            multisigOwners.length >= multisigThreshold &&
            multisigOwners.length <= MAX_MULTISIG_PARTICIPANTS &&
            isOwnersListValid() &&
            noDuplicateExists(multisigOwners) &&
            nativeBalance >= minRequiredBalance
            ? true
            : false;
    }

    const isOwnersListValid = () => {
        return multisigOwners.every(o => o.address.length > 0 && isValidAddress(o.address));
    }

    const onSliderChange = (value?: number) => {
        setMultisigThreshold(value || rangeMin || 1);
    }


    ///////////////
    // Rendering //
    ///////////////

    function sliderTooltipFormatter(value?: number) {
        return (<span className="font-size-75">{`${value} ${value === 1 ? 'Signer' : 'Signers'}`}</span>);
    }

    const getMainCtaLabel = () => {
        if (nativeBalance < minRequiredBalance) {
            return t('transactions.validation.amount-sol-low');
        }
        if (isBusy) {
            return t('multisig.create-multisig.main-cta-busy');
        } else if (transactionStatus.currentOperation === TransactionStatus.Iddle) {
            return t('multisig.create-multisig.main-cta');
        } else if (transactionStatus.currentOperation === TransactionStatus.TransactionFinished) {
            return t('general.cta-finish');
        } else {
            return t('general.retry');
        }
    }

    const infoRow = (caption: string, value: string) => {
        return (
            <Row>
                <Col span={14} className="text-right pr-1">{caption}</Col>
                <Col span={10} className="text-left fg-secondary-70">{value}</Col>
            </Row>
        );
    }

    const renderMultisigNameField = () => {
        return (
            <div className="mb-3">
                <div className="form-label icon-label">
                    {t('multisig.create-multisig.multisig-label-input-label')}
                    <Tooltip placement="bottom" title={`I.e. "My company payroll", "Seed round vesting", etc.`}>
                        <span><IconHelpCircle className="mean-svg-icons" /></span>
                    </Tooltip>
                </div>
                <div className={`well ${isBusy ? 'disabled' : ''}`}>
                    <input
                        id="multisig-label-field"
                        className="w-100 general-text-input"
                        autoComplete="off"
                        autoCorrect="off"
                        type="text"
                        maxLength={32}
                        onChange={onLabelInputValueChange}
                        placeholder={t('multisig.create-multisig.multisig-label-placeholder')}
                        value={multisigLabel}
                    />
                </div>
            </div>
        );
    }

    const isSliderDisabled = () => {
        if (!multisigOwners || multisigOwners.length === 0) {
            return true;
        }
        return false;
    }

    const renderMultisigThresholdSlider = () => {
        return (
            <>
                <div className={`two-column-layout address-fixed ${isXsDevice ? 'mt-2' : 'mt-4'}`}>
                    <div className={isXsDevice ? 'left' : 'left pt-1'}>
                        <div className={`form-label icon-label ${isXsDevice ? 'mb-3' : 'mt-2'}`}>
                            {t('multisig.create-multisig.multisig-threshold-input-label')}
                            <Tooltip placement="bottom" title={t("multisig.create-multisig.multisig-threshold-question-mark-tooltip")}>
                                <span>
                                    <IconHelpCircle className="mean-svg-icons" />
                                </span>
                            </Tooltip>
                        </div>
                    </div>
                    <div className="right">
                        <div className="slider-container">
                            <Slider
                                marks={marks}
                                min={rangeMin}
                                max={rangeMax}
                                included={false}
                                disabled={isSliderDisabled()}
                                tooltip={{formatter: sliderTooltipFormatter, open: true}}
                                value={multisigThreshold}
                                onChange={onSliderChange}
                                dots={true} />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="container main-container">
                <div className="interaction-area">
                    <div className="title-and-subtitle mb-2">
                        <div className="title">
                            <IconSafe className="mean-svg-icons" />
                            <div>{t('multisig.create-multisig.modal-title')}</div>
                        </div>
                    </div>
                    <div className="place-transaction-box container-max-width-720 flat mb-0">
                        <div className="elastic-form-container">

                            {/* Multisig name */}
                            {renderMultisigNameField()}

                            {/* Multisig Owners selector */}
                            <MultisigParticipants
                                disabled={isBusy}
                                participants={multisigOwners}
                                label={
                                    t('multisig.create-multisig.multisig-participants', {
                                        numParticipants: multisigOwners.length,
                                    })
                                }
                                multisigAddresses={multisigAddresses}
                                onParticipantsChanged={(e: MultisigParticipant[]) => setMultisigOwners(e)}
                            />

                            {/* Multisig threshold */}
                            {renderMultisigThresholdSlider()}

                            {/* Fee info */}
                            {multisigTransactionFees.multisigFee && (
                                <div className="p-2 mt-2 mb-2">
                                    {infoRow(
                                        t('multisig.create-multisig.fee-info-label') + ' ≈',
                                        `${formatThousands(multisigTransactionFees.multisigFee + multisigTransactionFees.rentExempt, 9)} SOL`
                                    )}
                                </div>
                            )}

                            {/* CTAs */}
                            <div className={`two-column-form-layout${isXsDevice ? ' reverse' : ''}`}>
                                <div className={`left ${isXsDevice ? 'mb-3' : 'mb-0'}`}>
                                    <Button
                                        block
                                        type="default"
                                        shape="round"
                                        size="large"
                                        className="thin-stroke"
                                        onClick={onBackClick}>
                                        Cancel
                                    </Button>
                                </div>
                                <div className={`right ${isXsDevice ? 'mb-3' : 'mb-0'}`}>
                                    <Button
                                        block
                                        type="primary"
                                        shape="round"
                                        size="large"
                                        className="thin-stroke"
                                        disabled={isBusy || !isFormValid()}
                                        onClick={onAccountCreateClick}>
                                        {isBusy && (
                                            <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                                        )}
                                        {getMainCtaLabel()}
                                    </Button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
            <PreFooter />
        </>
    )
}

export default CreateSafeView;