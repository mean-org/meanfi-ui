import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { StreamTemplate, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { Button, Checkbox, Col, Modal, Row } from "antd";
import BN from 'bn.js';
import { InfoIcon } from 'components/InfoIcon';
import { InputMean } from 'components/InputMean';
import { TokenDisplay } from 'components/TokenDisplay';
import { WizardStepSelector } from 'components/WizardStepSelector';
import { MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from 'contexts/wallet';
import { IconEdit, IconWarning } from 'Icons';
import { isError } from 'middleware/transactions';
import {
    consoleOut,
    getLockPeriodOptionLabel,
    getPaymentIntervalFromSeconds,
    getPaymentRateOptionLabel,
    getReadableDate,
    isValidAddress,
    stringNumberFormat,
    toUsCurrency
} from 'middleware/ui';
import {
    displayAmountWithSymbol,
    formatPercent,
    formatThousands,
    isValidNumber,
    makeDecimal,
    toTokenAmount,
    toUiAmount
} from 'middleware/utils';
import { PaymentRateType } from 'models/enums';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { VestingContractStreamCreateOptions } from 'models/vesting';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const VestingContractCreateStreamModal = (props: {
    handleClose: any;
    handleOk: any;
    isBusy: boolean;
    isMultisigTreasury: boolean;
    isVisible: boolean;
    isXsDevice: boolean;
    minRequiredBalance: number;
    nativeBalance: number;
    selectedMultisig: MultisigInfo | undefined;
    selectedToken: TokenInfo | undefined;
    streamTemplate: StreamTemplate | undefined;
    transactionFees: TransactionFees;
    vestingContract: Treasury | undefined;
    withdrawTransactionFees: TransactionFees;
}) => {
    const {
        handleClose,
        handleOk,
        isBusy,
        isMultisigTreasury,
        isVisible,
        isXsDevice,
        minRequiredBalance,
        nativeBalance,
        selectedMultisig,
        selectedToken,
        streamTemplate,
        transactionFees,
        vestingContract,
        withdrawTransactionFees,
    } = props;
    const {
        theme,
        splTokenList,
        loadingPrices,
        isWhitelisted,
        fromCoinAmount,
        recipientAddress,
        transactionStatus,
        isVerifiedRecipient,
        setIsVerifiedRecipient,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        setRecipientAddress,
        setFromCoinAmount,
        refreshPrices,
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');
    const { publicKey } = useWallet();
    const [currentStep, setCurrentStep] = useState(0);
    const [vestingStreamName, setVestingStreamName] = useState<string>('');
    const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
    const [tokenAmount, setTokenAmount] = useState(new BN(0));
    const [maxAllocatableAmount, setMaxAllocatableAmount] = useState(new BN(0));
    // Setting from the vesting contract
    const [treasuryOption, setTreasuryOption] = useState<TreasuryType | undefined>(undefined);
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>("");
    const [cliffRelease, setCliffRelease] = useState<string>("");
    const [cliffReleaseBn, setCliffReleaseBn] = useState(new BN(0));
    const [paymentRateAmount, setPaymentRateAmount] = useState<string>("");
    const [paymentRateAmountBn, setPaymentRateAmountBn] = useState(new BN(0));
    const [amountToBeStreamedBn, setAmountToBeStreamedBn] = useState(new BN(0));
    const [proposalTitle, setProposalTitle] = useState('');

    const isFeePaidByTreasurer = useMemo(() => {
        return streamTemplate
            ? streamTemplate.feePayedByTreasurer
            : false;
    }, [streamTemplate]);

    /////////////////
    //  Callbacks  //
    /////////////////

    const getMaxAmount = useCallback((preSetting = false) => {
        if ((isFeePaidByTreasurer || preSetting) && withdrawTransactionFees) {
            const BASE_100_TO_BASE_1_MULTIPLIER = 10_000;
            const feeNumerator = withdrawTransactionFees.mspPercentFee * BASE_100_TO_BASE_1_MULTIPLIER;
            const feeDenaminator = 1000000;
            const badStreamMaxAllocation = unallocatedBalance
                .mul(new BN(feeDenaminator))
                .div(new BN(feeNumerator + feeDenaminator));

            const feeAmount = badStreamMaxAllocation
                .mul(new BN(feeNumerator))
                .div(new BN(feeDenaminator));

            const badTotal = badStreamMaxAllocation.add(feeAmount);
            const badRemaining = unallocatedBalance.sub(badTotal);
            const goodStreamMaxAllocation = unallocatedBalance.sub(feeAmount);
            const goodTotal = goodStreamMaxAllocation.add(feeAmount);
            const goodRemaining = unallocatedBalance.sub(goodTotal);
            const maxAmount = goodStreamMaxAllocation;

            if (isWhitelisted) {
                const debugTable: any[] = [];
                debugTable.push({
                    unallocatedBalance: unallocatedBalance.toString(),
                    feeNumerator: feeNumerator,
                    feePercentage01: feeNumerator / feeDenaminator,
                    badStreamMaxAllocation: badStreamMaxAllocation.toString(),
                    feeAmount: feeAmount.toString(),
                    badTotal: badTotal.toString(),
                    badRemaining: badRemaining.toString(),
                    goodStreamMaxAllocation: goodStreamMaxAllocation.toString(),
                    goodTotal: goodTotal.toString(),
                    goodRemaining: goodRemaining.toString(),
                });
                consoleOut('debug table', debugTable, 'blue');
            }

            if (!preSetting) {
                setMaxAllocatableAmount(maxAmount);
            }
            return maxAmount;
        }
        if (!preSetting) {
            setMaxAllocatableAmount(unallocatedBalance);
        }
        return unallocatedBalance;
    }, [
        isWhitelisted,
        unallocatedBalance,
        isFeePaidByTreasurer,
        withdrawTransactionFees,
    ]);

    const getTokenPrice = useCallback(() => {
        if (!fromCoinAmount || !selectedToken) {
            return 0;
        }
        const price = getTokenPriceByAddress(selectedToken.address) || getTokenPriceBySymbol(selectedToken.symbol);

        return parseFloat(fromCoinAmount) * price;
    }, [fromCoinAmount, getTokenPriceByAddress, getTokenPriceBySymbol, selectedToken]);

    const getMinBalanceRequired = useCallback(() => {
        if (!transactionFees) { return 0; }

        const bf = transactionFees.blockchainFee;       // Blockchain fee
        const ff = transactionFees.mspFlatFee;          // Flat fee (protocol)
        const fee = bf + ff;
        const minRequired = isMultisigTreasury ? minRequiredBalance : fee;
        return minRequired > MIN_SOL_BALANCE_REQUIRED ? minRequired : MIN_SOL_BALANCE_REQUIRED;

    }, [isMultisigTreasury, minRequiredBalance, transactionFees]);

    const getReleaseRate = useCallback(() => {
        if (!lockPeriodAmount || !selectedToken) {
            return '--';
        }

        return `${displayAmountWithSymbol(
            paymentRateAmountBn,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
            false
        )} ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`;
    }, [lockPeriodAmount, lockPeriodFrequency, paymentRateAmountBn, selectedToken, splTokenList, t]);

    const getCliffReleaseAmount = useCallback(() => {
        if (!cliffRelease || !selectedToken) {
            return '--';
        }

        return displayAmountWithSymbol(
            cliffReleaseBn,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
            false
        );
    }, [cliffRelease, cliffReleaseBn, selectedToken, splTokenList]);


    /////////////////////
    // Data management //
    /////////////////////

    // Set max allocatable amount
    useEffect(() => {
        if (withdrawTransactionFees && unallocatedBalance) {
            const maxAmount = getMaxAmount();
            consoleOut('maxAmount:', maxAmount, 'blue');
        }
    }, [getMaxAmount, unallocatedBalance, withdrawTransactionFees]);

    // Set treasury unalocated balance in BN
    useEffect(() => {

        const getUnallocatedBalance = (details: Treasury) => {
            const balance = new BN(details.balance);
            const allocationAssigned = new BN(details.allocationAssigned);
            return balance.sub(allocationAssigned);
        }

        if (isVisible && vestingContract) {
            const unallocated = getUnallocatedBalance(vestingContract);
            consoleOut('unallocatedBalance:', unallocated.toString(), 'blue');
            setUnallocatedBalance(unallocated);
        }
    }, [
        isVisible,
        vestingContract,
    ]);

    // Set max amount allocatable to a stream in BN the first time
    useEffect(() => {
        if (isVisible && vestingContract && withdrawTransactionFees && !isFeePaidByTreasurer) {
            getMaxAmount();
        }
    }, [
        isVisible,
        vestingContract,
        isFeePaidByTreasurer,
        withdrawTransactionFees,
        getMaxAmount
    ]);

    // When modal goes visible, set template data
    useEffect(() => {
        if (isVisible && vestingContract && streamTemplate) {
            consoleOut('this one I received:', streamTemplate, 'orange');
            setTreasuryOption(vestingContract.treasuryType);
            const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
            setCliffReleasePercentage(formatPercent(cliffPercent, 4));
            const localDate = new Date(streamTemplate.startUtc);
            const dateWithoutOffset = new Date(localDate.getTime() - (localDate.getTimezoneOffset() * 60000));
            setPaymentStartDate(dateWithoutOffset.toUTCString());
            updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
            const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
            setLockPeriodFrequency(periodFrequency);
        }
    }, [
        isVisible,
        currentStep,
        streamTemplate,
        vestingContract,
    ]);

    // Set Cliff release
    useEffect(() => {

        if (!selectedToken) { return; }

        const releasePct = parseFloat(cliffReleasePercentage) || 0;

        if (tokenAmount.gtn(0) && releasePct > 0) {
            const cr = tokenAmount.muln(releasePct).divn(100);
            setCliffReleaseBn(cr);
            setCliffRelease(cr.toString());
        }

    }, [cliffReleasePercentage, selectedToken, tokenAmount]);

    // Set payment rate amount
    useEffect(() => {

        if (!selectedToken) { return; }

        const releasePct = parseFloat(cliffReleasePercentage) || 0;

        if (tokenAmount.gtn(0)) {
            let toStream = tokenAmount;

            if (releasePct > 0) {
                const cr = tokenAmount.muln(releasePct).divn(100);
                toStream = tokenAmount.sub(cr);
            }

            const lpa = parseFloat(lockPeriodAmount);
            const ra = toStream.divn(lpa);

            setPaymentRateAmountBn(ra);
            setPaymentRateAmount(ra.toString());
        }
    }, [cliffReleasePercentage, fromCoinAmount, lockPeriodAmount, selectedToken, tokenAmount]);

    // Set the amount to be streamed
    useEffect(() => {

        if (!selectedToken) { return; }

        const releasePct = parseFloat(cliffReleasePercentage) || 0;

        if (tokenAmount.gtn(0)) {
            let toStream = tokenAmount;
            if (releasePct > 0) {
                const cr = tokenAmount.muln(releasePct).divn(100);
                toStream = tokenAmount.sub(cr);
            }
            setAmountToBeStreamedBn(toStream);
        }

    }, [cliffReleasePercentage, fromCoinAmount, selectedToken, tokenAmount]);

    // Window resize listener
    useEffect(() => {
        const resizeListener = () => {
            const NUM_CHARS = 4;
            const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
            for (const element of ellipsisElements) {
                const e = element as HTMLElement;
                if (e.offsetWidth < e.scrollWidth){
                  const text = e.textContent;
                  e.dataset.tail = text?.slice(text.length - NUM_CHARS);
                }
            }
        };
        // Call it a first time
        resizeListener();

        // set resize listener
        window.addEventListener('resize', resizeListener);

        // clean up function
        return () => {
            // remove resize listener
            window.removeEventListener('resize', resizeListener);
        }
    }, []);


    /////////////////////////
    // Events & validation //
    /////////////////////////

    const setMaxValue = useCallback(() => {

        consoleOut('clicked the MAX motherfkr!', '', 'blue');
        const decimals = selectedToken ? selectedToken.decimals : 6;
        const maxAmount = getMaxAmount();

        consoleOut('decimals:', decimals, 'blue');
        consoleOut('isFeePaidByTreasurer?', isFeePaidByTreasurer, 'blue');
        consoleOut('tokenAmount:', tokenAmount.toString(), 'blue');
        consoleOut('maxAmount:', maxAmount.toString(), 'blue');

        setFromCoinAmount(toUiAmount(new BN(maxAmount), decimals));
        setTokenAmount(new BN(maxAmount));

    }, [getMaxAmount, selectedToken, setFromCoinAmount, isFeePaidByTreasurer, tokenAmount]);

    const getStreamTxConfirmDescription = (multisig: string) => {
        if (!selectedToken) { return ''; }
        const cliff = getCliffReleaseAmount();
        const rate = getReleaseRate();
        let message = '';
        if (cliff === '--') {
            message = `Create stream to send ${rate} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}.`;
        } else {
            message = `Create stream to send ${rate} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)} with ${cliff} released on commencement.`;
        }
        return message;
    }

    const getStreamTxConfirmedDescription = (multisig: string) => {
        if (!selectedToken) { return ''; }
        const cliff = getCliffReleaseAmount();
        const rate = getReleaseRate();
        let message = '';
        if (cliff === '--') {
            message = `Stream to send ${rate} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)} has been ${multisig ? 'proposed' : 'scheduled'}.`;
        } else {
            message = `Stream to send ${rate} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)} with ${cliff} released on commencement has been ${multisig ? 'proposed' : 'scheduled'}.`;
        }
        return message;
    }

    const onStreamCreateClick = () => {
        if (!selectedToken) { return; }

        const multisig = isMultisigTreasury && selectedMultisig
            ? selectedMultisig.authority.toBase58()
            : '';
        const options: VestingContractStreamCreateOptions = {
            associatedToken: selectedToken,
            beneficiaryAddress: recipientAddress,
            feePayedByTreasurer: isFeePaidByTreasurer,
            interval: getPaymentRateOptionLabel(lockPeriodFrequency, t),
            multisig,
            rateAmount: parseFloat(paymentRateAmount),
            streamName: vestingStreamName,
            tokenAmount: tokenAmount,
            txConfirmDescription: getStreamTxConfirmDescription(multisig),
            txConfirmedDescription: getStreamTxConfirmedDescription(multisig),
            proposalTitle: proposalTitle || ''
        };
        handleOk(options);
    }

    const triggerWindowResize = () => {
        window.dispatchEvent(new Event('resize'));
    }

    const onStepperChange = (value: number) => {
        setCurrentStep(value);
    }

    const onContinueStepOneButtonClick = () => {
        setCurrentStep(1);
    }

    const onBackClick = () => {
        setCurrentStep(0);
    }

    const handleVestingStreamNameChange = (e: any) => {
        setVestingStreamName(e.target.value);
    }

    const handleFromCoinAmountChange = (e: any) => {

        let newValue = e.target.value;

        const decimals = selectedToken ? selectedToken.decimals : 0;
        const splitted = newValue.toString().split('.');
        const left = splitted[0];

        if (decimals && splitted[1]) {
            if (splitted[1].length > decimals) {
                splitted[1] = splitted[1].slice(0, -1);
                newValue = splitted.join('.');
            }
        } else if (left.length > 1) {
            const number = splitted[0] - 0;
            splitted[0] = `${number}`;
            newValue = splitted.join('.');
        }

        if (newValue === null || newValue === undefined || newValue === "") {
            setFromCoinAmount("");
            setTokenAmount(new BN(0));
        } else if (newValue === '.') {
            setFromCoinAmount(".");
        } else if (isValidNumber(newValue)) {
            setFromCoinAmount(newValue);
            setTokenAmount(new BN(toTokenAmount(newValue, decimals).toString()));
        }
    };

    const handleRecipientAddressChange = (e: any) => {
        const inputValue = e.target.value as string;
        // Set the input value
        const trimmedValue = inputValue.trim();
        setRecipientAddress(trimmedValue);
    }

    const handleRecipientAddressFocusInOut = () => {
        setTimeout(() => {
            triggerWindowResize();
        }, 10);
    }

    const onIsVerifiedRecipientChange = (e: any) => {
        setIsVerifiedRecipient(e.target.checked);
    }

    const isStepOneValid = (): boolean => {
        const mAa = new BN(maxAllocatableAmount || 0);
        const ub = new BN(unallocatedBalance || 0);
        return  publicKey &&
                ((isMultisigTreasury && selectedMultisig && proposalTitle) ||
                 (!isMultisigTreasury && !proposalTitle)) &&
                selectedToken &&
                vestingStreamName && vestingStreamName.length <= 32 &&
                recipientAddress &&
                isValidAddress(recipientAddress) &&
                nativeBalance >= getMinBalanceRequired() &&
                tokenAmount && tokenAmount.gtn(0) &&
                ((isFeePaidByTreasurer && tokenAmount.lte(mAa)) ||
                 (!isFeePaidByTreasurer && tokenAmount.lte(ub)))
        ? true
        : false;
    }

    const isStepTwoValid = (): boolean => {
        return  isStepOneValid() &&
                isVerifiedRecipient
        ? true
        : false;
    };

    const getStepOneButtonLabel = (): string => {
        const mAa = new BN(maxAllocatableAmount || 0);
        const ub = new BN(unallocatedBalance || 0);

        if (!publicKey) {
            return t('transactions.validation.not-connected');
        } else if (isMultisigTreasury && selectedMultisig && !proposalTitle) {
            return 'Add a proposal title';
        } else if (!vestingStreamName) {
            return t('vesting.create-stream.stream-name-empty');
        } else if (!recipientAddress || !isValidAddress(recipientAddress)) {
            return t('vesting.create-stream.beneficiary-address-missing');
        } else if (!selectedToken || unallocatedBalance.isZero()) {
            return t('transactions.validation.no-balance');
        } else if (!tokenAmount || tokenAmount.isZero()) {
            return t('transactions.validation.no-amount');
        } else if ((isFeePaidByTreasurer && tokenAmount.gt(mAa)) ||
                   (!isFeePaidByTreasurer && tokenAmount.gt(ub))) {
            return t('transactions.validation.amount-high');
        } else if (nativeBalance < getMinBalanceRequired()) {
            return t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) });
        } else {
            return t('vesting.create-stream.step-one-validation-pass');
        }
    }

    const getStepTwoButtonLabel = (): string => {
        if (!isStepOneValid()) {
            return getStepOneButtonLabel();
        } else if (!isVerifiedRecipient) {
            return t('transactions.validation.verified-recipient-unchecked');
        } else {
            return t('vesting.create-stream.create-cta');
        }
    }

    const getMainCtaLabel = () => {
        if (isBusy) {
            return t('vesting.create-stream.create-cta-busy');
        } else if (isError(transactionStatus.currentOperation)) {
            return t('general.retry');
        } else {
            return getStepTwoButtonLabel();
        }
    }

    const onTitleInputValueChange = (e: any) => {
        setProposalTitle(e.target.value);
    }


    ///////////////
    // Rendering //
    ///////////////

    const renderVcName = () => {
        if (!vestingContract) { return null; }
        return (
            <div className="flex-fixed-right px-1 mt-2 mb-2 font-size-120">
                <div className="left font-bold">
                    {vestingContract.name}
                </div>
                <div className="right">
                    <span className={`badge large ml-1 ${theme === 'light' ? 'golden fg-dark' : 'darken'}`}>
                        {treasuryOption === TreasuryType.Open ? 'Open' : 'Locked'}
                    </span>
                </div>
            </div>
        );
    }


    return (
        <Modal
            className="mean-modal simple-modal"
            title={<div className="modal-title">{t('vesting.create-stream.modal-title')}</div>}
            footer={null}
            open={isVisible}
            onCancel={handleClose}
            width={480}>

            <div className="scrollable-content">

                <WizardStepSelector
                    step={currentStep}
                    steps={2}
                    extraClass="px-1 mb-2"
                    onValueSelected={onStepperChange}
                />

                <div className={`panel1 ${currentStep === 0 ? 'show' : 'hide'}`}>

                    {vestingContract && renderVcName()}

                    {/* Proposal title */}
                    {isMultisigTreasury && selectedMultisig && (
                        <div className="mb-3">
                            <div className="form-label">{t('multisig.proposal-modal.title')}</div>
                            <InputMean
                                id="proposal-title-field"
                                name="Title"
                                className="w-100 general-text-input"
                                onChange={onTitleInputValueChange}
                                placeholder="Title for the multisig proposal"
                                value={proposalTitle}
                            />
                        </div>
                    )}

                    {/* Vesting Stream name */}
                    <div className="form-label">{t('vesting.create-stream.vesting-stream-name-label')}</div>
                    <div className="well">
                        <div className="flex-fixed-right">
                            <div className="left">
                                <input
                                    id="vesting-lock-name-input"
                                    className="w-100 general-text-input"
                                    autoComplete="on"
                                    autoCorrect="off"
                                    type="text"
                                    maxLength={32}
                                    onChange={handleVestingStreamNameChange}
                                    placeholder={t('vesting.create-stream.vesting-stream-name-placeholder')}
                                    spellCheck="false"
                                    value={vestingStreamName}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Beneficiary address */}
                    <div className="form-label">{t('vesting.create-stream.beneficiary-address-label')}</div>
                    <div className="well">
                        <div className="flex-fixed-right">
                            <div className="left position-relative">
                                <span className="recipient-field-wrapper">
                                    <input id="payment-recipient-field"
                                        className="general-text-input"
                                        autoComplete="on"
                                        autoCorrect="off"
                                        type="text"
                                        onFocus={handleRecipientAddressFocusInOut}
                                        onChange={handleRecipientAddressChange}
                                        onBlur={handleRecipientAddressFocusInOut}
                                        placeholder={t('vesting.create-stream.beneficiary-address-placeholder')}
                                        required={true}
                                        spellCheck="false"
                                        value={recipientAddress} />
                                    <span id="payment-recipient-static-field"
                                        className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                                        {recipientAddress || t('vesting.create-stream.beneficiary-address-placeholder')}
                                    </span>
                                </span>
                            </div>
                            <div className="right">
                                <span>&nbsp;</span>
                            </div>
                        </div>
                        {
                            recipientAddress && !isValidAddress(recipientAddress) && (
                                <span className="form-field-error">
                                    {t('transactions.validation.address-validation')}
                                </span>
                            )
                        }
                    </div>

                    {/* Amount to stream */}
                    {(treasuryOption === TreasuryType.Open) ? (
                        <div className="form-label">{t('vesting.create-stream.total-funds-to-stream')}</div>
                    ) : (
                        <div className="form-label">{t('vesting.create-stream.total-funds-to-commit')}</div>
                    )}
                    <div className="well mb-1">
                        <div className="flex-fixed-left">
                            <div className="left">
                                <span className="add-on">
                                    {selectedToken && (
                                        <TokenDisplay onClick={() => {}}
                                            mintAddress={selectedToken.address}
                                            name={selectedToken.name}
                                            showCaretDown={false}
                                            fullTokenInfo={selectedToken}
                                        />
                                    )}
                                    {
                                        selectedToken && unallocatedBalance ? (
                                            <div className="token-max simplelink" onClick={setMaxValue}>
                                                MAX
                                            </div>
                                        ) : null
                                    }
                                </span>
                            </div>
                            <div className="right">
                                <input
                                    className="general-text-input text-right"
                                    inputMode="decimal"
                                    autoComplete="off"
                                    autoCorrect="off"
                                    type="text"
                                    onChange={handleFromCoinAmountChange}
                                    pattern="^[0-9]*[.,]?[0-9]*$"
                                    placeholder="0.0"
                                    minLength={1}
                                    maxLength={79}
                                    spellCheck="false"
                                    value={fromCoinAmount}
                                />
                            </div>
                        </div>
                        <div className="flex-fixed-right">
                            <div className="left inner-label">
                                <span>{t('transactions.send-amount.label-right')}:</span>
                                <span>
                                    {
                                        unallocatedBalance && selectedToken
                                            ? stringNumberFormat(
                                                toUiAmount(unallocatedBalance, selectedToken.decimals),
                                                4,
                                            )
                                            : "0"
                                    }
                                </span>
                            </div>
                            <div className="right inner-label">
                                {publicKey ? (
                                    <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                                    ~{fromCoinAmount
                                        ? toUsCurrency(getTokenPrice())
                                        : "$0.00"
                                    }
                                    </span>
                                ) : (
                                    <span>~$0.00</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* CTA */}
                    <div className="cta-container">
                        <Button
                            type="primary"
                            shape="round"
                            size="large"
                            className="thin-stroke"
                            disabled={!isStepOneValid()}
                            onClick={onContinueStepOneButtonClick}>
                            {getStepOneButtonLabel()}
                        </Button>
                    </div>


                </div>

                <div className={`panel2 ${currentStep === 1 ? 'show' : 'hide'}`}>

                    {vestingContract && renderVcName()}

                    <div className="flex-fixed-right">
                        <div className="left">
                            <h2 className="form-group-label">{t('vesting.create-stream.step-two-label')}</h2>
                        </div>
                        <div className="right">
                            <span className="flat-button change-button" onClick={() => setCurrentStep(0)}>
                                <IconEdit className="mean-svg-icons" />
                                <span>{t('general.cta-change')}</span>
                            </span>
                        </div>
                    </div>

                    <div className="px-1 font-size-100 font-bold">{vestingStreamName ? vestingStreamName : "--"}</div>
                    <div className={`mb-2 px-1 ${isXsDevice ? 'font-size-80' : 'font-size-90'}`}>{recipientAddress ? recipientAddress : "--"}</div>

                    <Row className="mb-2 px-1">
                        <Col span={24}>
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-sending')}</strong>
                            <span className="ml-1">
                                {
                                    fromCoinAmount && selectedToken
                                        ? `${displayAmountWithSymbol(
                                                tokenAmount,
                                                selectedToken.address,
                                                selectedToken.decimals,
                                                splTokenList,
                                                false
                                            )}`
                                        : "--"
                                }
                            </span>
                        </Col>
                        <Col span={24}>
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-starting-on')}</strong>
                            <span className="ml-1">
                                {
                                    paymentStartDate
                                        ? getReadableDate(paymentStartDate, true)
                                        : '--'
                                }
                            </span>
                        </Col>
                        <Col span={24}>
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-cliff-release')}</strong>
                            <span className="ml-1">
                                {
                                    cliffRelease && selectedToken
                                        ? `${getCliffReleaseAmount()} (on commencement)`
                                        : "--"
                                }
                            </span>
                        </Col>
                        <Col span={24}>
                            <strong>Amount to be streamed:</strong>
                            <span className="ml-1">
                                {
                                    lockPeriodAmount && selectedToken
                                        ? `${displayAmountWithSymbol(
                                                amountToBeStreamedBn,
                                                selectedToken.address,
                                                selectedToken.decimals,
                                                splTokenList,
                                                false
                                            )} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`
                                        : "--"
                                }
                            </span>
                        </Col>
                        <Col span={24}>
                            <strong>Release rate:</strong>
                            <span className="ml-1">{getReleaseRate()}</span>
                        </Col>
                    </Row>

                    {treasuryOption === TreasuryType.Lock && (
                        <span className="warning-message icon-label mb-3">
                            <IconWarning className="mean-svg-icons" />
                            {t('treasuries.treasury-streams.add-stream-locked.panel3-warning-message')}
                        </span>
                    )}

                    <div className="ml-1">
                        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
                        <InfoIcon
                            content={<span>{t('vesting.create-stream.verified-recipient-disclaimer-tooltip')}</span>}
                            placement="top">
                            <InfoCircleOutlined style={{ lineHeight: 0 }} />
                        </InfoIcon>
                    </div>

                    {/* CTAs */}
                    <div className={`two-column-form-layout mt-3${isXsDevice ? ' reverse' : ''}`}>
                        <div className={`left ${isXsDevice ? 'mb-3' : 'mb-0'}`}>
                            <Button
                                block
                                type="default"
                                shape="round"
                                size="large"
                                className="thin-stroke"
                                onClick={onBackClick}>
                                Back
                            </Button>
                        </div>
                        <div className={`right ${isXsDevice ? 'mb-3' : 'mb-0'}`}>
                            <Button
                                block
                                type="primary"
                                shape="round"
                                size="large"
                                className="thin-stroke"
                                disabled={isBusy || !isStepTwoValid()}
                                onClick={onStreamCreateClick}>
                                {isBusy && (
                                    <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                                )}
                                {getMainCtaLabel()}
                            </Button>
                        </div>
                    </div>

                </div>

            </div>
        </Modal>
    );
};
