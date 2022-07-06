import React, { useCallback, useEffect, useContext, useState } from 'react';
import { Button, Checkbox, Col, Modal, Row } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { StreamTemplate, TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { cutNumber, formatPercent, formatThousands, getAmountWithSymbol, isValidNumber, makeDecimal, makeInteger, shortenAddress } from '../../../../utils/utils';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut, getLockPeriodOptionLabel, getPaymentIntervalFromSeconds, getPaymentRateOptionLabel, getReadableDate, isLocal, isValidAddress, toUsCurrency } from '../../../../utils/ui';
import { WizardStepSelector } from '../../../../components/WizardStepSelector';
import { useTranslation } from 'react-i18next';
import BN from 'bn.js';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { useWallet } from '../../../../contexts/wallet';
import { InfoCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { isError } from '../../../../utils/transactions';
import { IconEdit, IconWarning } from '../../../../Icons';
import { VestingContractStreamCreateOptions } from '../../../../models/vesting';
import { PaymentRateType } from '../../../../models/enums';
import { CUSTOM_TOKEN_NAME } from '../../../../constants';
import { InfoIcon } from '../../../../components/InfoIcon';

export const VestingContractCreateStreamModal = (props: {
    handleClose: any;
    handleOk: any;
    isBusy: boolean;
    isMultisigTreasury: boolean;
    isVisible: boolean;
    isXsDevice: boolean;
    minRequiredBalance: number;
    nativeBalance: number;
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
        streamTemplate,
        transactionFees,
        vestingContract,
        withdrawTransactionFees,
    } = props;
    const {
        theme,
        tokenList,
        selectedToken,
        loadingPrices,
        isWhitelisted,
        fromCoinAmount,
        recipientAddress,
        transactionStatus,
        isVerifiedRecipient,
        setIsVerifiedRecipient,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
        setRecipientAddress,
        setFromCoinAmount,
        setSelectedToken,
        setEffectiveRate,
        refreshPrices,
    } = useContext(AppStateContext);
    const { t } = useTranslation('common');
    const [today] = useState(new Date());
    const { publicKey, wallet } = useWallet();
    const [currentStep, setCurrentStep] = useState(0);
    const [vestingStreamName, setVestingStreamName] = useState<string>('');
    const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
    const [tokenAmount, setTokenAmount] = useState(new BN(0));
    const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);

    // Setting from the vesting contract
    const [treasuryOption, setTreasuryOption] = useState<TreasuryType | undefined>(undefined);
    const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
    const [paymentStartDate, setPaymentStartDate] = useState<string>("");
    const [lockPeriodAmount, updateLockPeriodAmount] = useState<string>("");
    const [lockPeriodFrequency, setLockPeriodFrequency] = useState<PaymentRateType>(PaymentRateType.PerMonth);
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>("");
    const [cliffRelease, setCliffRelease] = useState<string>("")
    const [paymentRateAmount, setPaymentRateAmount] = useState<string>("");


    /////////////////
    //  Callbacks  //
    /////////////////

    const toggleOverflowEllipsisMiddle = useCallback((state: boolean) => {
        const ellipsisElements = document.querySelectorAll(".ant-select.token-selector-dropdown .ant-select-selector .ant-select-selection-item");
        if (ellipsisElements && ellipsisElements.length) {

            ellipsisElements.forEach(element => {
                if (state) {
                    if (!element.classList.contains('overflow-ellipsis-middle')) {
                        element.classList.add('overflow-ellipsis-middle');
                    }
                } else {
                    if (element.classList.contains('overflow-ellipsis-middle')) {
                        element.classList.remove('overflow-ellipsis-middle');
                    }
                }
            });

            setTimeout(() => {
                triggerWindowResize();
            }, 10);
        }
    }, []);

    const setCustomToken = useCallback((address: string) => {
        const unkToken: TokenInfo = {
            address: address,
            name: CUSTOM_TOKEN_NAME,
            chainId: 101,
            decimals: 6,
            symbol: shortenAddress(address),
        };
        setSelectedToken(unkToken);
        consoleOut("token selected:", unkToken, 'blue');
        setEffectiveRate(0);
        toggleOverflowEllipsisMiddle(true);
    }, [
        setEffectiveRate,
        setSelectedToken,
        toggleOverflowEllipsisMiddle
    ]);

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
                    unallocatedBalance: unallocatedBalance.toNumber(),
                    feeNumerator: feeNumerator,
                    feePercentage01: feeNumerator / feeDenaminator,
                    badStreamMaxAllocation: badStreamMaxAllocation.toNumber(),
                    feeAmount: feeAmount.toNumber(),
                    badTotal: badTotal.toNumber(),
                    badRemaining: badRemaining.toNumber(),
                    goodStreamMaxAllocation: goodStreamMaxAllocation.toNumber(),
                    goodTotal: goodTotal.toNumber(),
                    goodRemaining: goodRemaining.toNumber(),
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
        const minRequired = isMultisigTreasury ? minRequiredBalance : bf + ff;
        return minRequired;

    }, [isMultisigTreasury, minRequiredBalance, transactionFees]);

    const isStartDateFuture = useCallback((date: string): boolean => {
        const now = today.toUTCString();
        const nowUtc = new Date(now);
        const comparedDate = new Date(date);
        if (comparedDate > nowUtc) {
            return true;
        }
        return false;
    }, [today]);

    const getPaymentRateLabel = useCallback((
        rate: PaymentRateType,
        amount: string | undefined
    ): string => {
        let label = '';

        if (!selectedToken || !amount) {
            return label;
        }

        label = getAmountWithSymbol(parseFloat(amount || '0'), selectedToken.address, false, tokenList);
        switch (rate) {
            case PaymentRateType.PerMinute:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-minute')}`;
                break;
            case PaymentRateType.PerHour:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-hour')}`;
                break;
            case PaymentRateType.PerDay:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-day')}`;
                break;
            case PaymentRateType.PerWeek:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-week')}`;
                break;
            case PaymentRateType.PerMonth:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-month')}`;
                break;
            case PaymentRateType.PerYear:
                label += ` ${t('transactions.rate-and-frequency.payment-rates.per-year')}`;
                break;
            default:
                break;
        }
        return label;
    }, [selectedToken, t, tokenList]);


    /////////////////////
    // Data management //
    /////////////////////

    // Set treasury unalocated balance in BN
    useEffect(() => {
        if (isVisible && vestingContract) {
            const unallocated = vestingContract.balance - vestingContract.allocationAssigned;
            const ub = new BN(unallocated);
            consoleOut('unallocatedBalance:', ub.toNumber(), 'blue');
            setUnallocatedBalance(ub);
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

    // When modal goes visible, set the associated token
    useEffect(() => {
        if (isVisible && vestingContract) {
            const assTokenAddr = vestingContract.associatedToken as string;
            const token = getTokenByMintAddress(assTokenAddr);
            if (token) {
                const price = getTokenPriceByAddress(token.address) || getTokenPriceBySymbol(token.symbol);
                if (!selectedToken || selectedToken.address !== token.address) {
                    setSelectedToken(token);
                    setEffectiveRate(price);
                }
            } else if (!selectedToken || selectedToken.address !== assTokenAddr) {
                setCustomToken(assTokenAddr);
            }
        }
    }, [
        isVisible,
        selectedToken,
        vestingContract,
        getTokenPriceByAddress,
        getTokenPriceBySymbol,
        getTokenByMintAddress,
        setSelectedToken,
        setEffectiveRate,
        setCustomToken,
    ]);

    // When modal goes visible, set template data
    useEffect(() => {
        if (isVisible && vestingContract && streamTemplate) {
            setTreasuryOption(vestingContract.treasuryType);
            if (currentStep === 1) {
                const cliffPercent = makeDecimal(new BN(streamTemplate.cliffVestPercent), 4);
                setCliffReleasePercentage(formatPercent(cliffPercent, 4));
                setIsFeePaidByTreasurer(streamTemplate.feePayedByTreasurer);
                setPaymentStartDate(streamTemplate.startUtc as string);
                updateLockPeriodAmount(streamTemplate.durationNumberOfUnits.toString());
                const periodFrequency = getPaymentIntervalFromSeconds(streamTemplate.rateIntervalInSeconds);
                setLockPeriodFrequency(periodFrequency);
            }
        }
    }, [
        isVisible,
        currentStep,
        streamTemplate,
        vestingContract,
    ]);

    // Set Cliff release
    useEffect(() => {
        const percentageFromCoinAmount = parseFloat(fromCoinAmount) > 0 ? `${(parseFloat(fromCoinAmount) * parseFloat(cliffReleasePercentage) / 100)}` : '';

        setCliffRelease(percentageFromCoinAmount);

    }, [fromCoinAmount, cliffReleasePercentage]);

    // Set payment rate amount
    useEffect(() => {
        setPaymentRateAmount(cutNumber((parseFloat(fromCoinAmount) - parseFloat(cliffRelease)) / parseFloat(lockPeriodAmount), selectedToken?.decimals || 6));
    }, [cliffRelease, fromCoinAmount, lockPeriodAmount, selectedToken?.decimals]);

    // Window resize listener
    useEffect(() => {
        const resizeListener = () => {
            const NUM_CHARS = 4;
            const ellipsisElements = document.querySelectorAll(".overflow-ellipsis-middle");
            for (let i = 0; i < ellipsisElements.length; ++i) {
                const e = ellipsisElements[i] as HTMLElement;
                if (e.offsetWidth < e.scrollWidth) {
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

    const getStreamTxConfirmDescription = () => {
        const cliff = `${cutNumber(parseFloat(cliffRelease), selectedToken?.decimals || 6)} ${selectedToken?.symbol}`;
        const rate = `${paymentRateAmount} ${selectedToken?.symbol} ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`;
        return `Create stream to send ${rate} with ${cliff} released on commencement.`;
    }

    const getStreamTxConfirmedDescription = () => {
        const cliff = `${cutNumber(parseFloat(cliffRelease), selectedToken?.decimals || 6)} ${selectedToken?.symbol}`;
        const rate = `${paymentRateAmount} ${selectedToken?.symbol} ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`;
        return `Stream to send ${rate} with ${cliff} released on commencement has been scheduled.`;
    }

    const onStreamCreateClick = () => {
        const options: VestingContractStreamCreateOptions = {
            beneficiaryAddress: recipientAddress,
            feePayedByTreasurer: isFeePaidByTreasurer,
            interval: getPaymentRateOptionLabel(lockPeriodFrequency, t),
            rateAmount: parseFloat(paymentRateAmount),
            streamName: vestingStreamName,
            tokenAmount: tokenAmount.toNumber(),
            txConfirmDescription: getStreamTxConfirmDescription(),
            txConfirmedDescription: getStreamTxConfirmedDescription()
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
            setTokenAmount(makeInteger(newValue, selectedToken?.decimals || 6));
        }
    };

    const handleRecipientAddressChange = (e: any) => {
        const inputValue = e.target.value as string;
        // Set the input value
        const trimmedValue = inputValue.trim();
        setRecipientAddress(trimmedValue);
    }

    const handleRecipientAddressFocusIn = () => {
        setTimeout(() => {
            triggerWindowResize();
        }, 10);
    }

    const handleRecipientAddressFocusOut = () => {
        setTimeout(() => {
            triggerWindowResize();
        }, 10);
    }

    const onIsVerifiedRecipientChange = (e: any) => {
        setIsVerifiedRecipient(e.target.checked);
    }

    const isAddressOwnAccount = (): boolean => {
        return recipientAddress && wallet && publicKey && recipientAddress === publicKey.toBase58()
            ? true : false;
    }

    const isStepOneValid = (): boolean => {
        return  publicKey &&
                selectedToken &&
                vestingStreamName && vestingStreamName.length <= 32 &&
                recipientAddress &&
                isValidAddress(recipientAddress) &&
                !isAddressOwnAccount() &&
                nativeBalance > 0 &&
                tokenAmount && tokenAmount.toNumber() > 0 &&
                ((isFeePaidByTreasurer && tokenAmount.lte(maxAllocatableAmount)) ||
                 (!isFeePaidByTreasurer && tokenAmount.lte(unallocatedBalance)))
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
        return  !publicKey
            ? t('transactions.validation.not-connected')
            : !vestingStreamName || vestingStreamName.length > 32
                ? t('vesting.create-stream.stream-name-empty')
                : !recipientAddress || !isValidAddress(recipientAddress)
                    ? t('vesting.create-stream.beneficiary-address-missing')
                    : isAddressOwnAccount()
                        ? t('vesting.create-stream.cannot-send-to-yourself')
                        : !selectedToken || unallocatedBalance.isZero()
                            ? t('transactions.validation.no-balance')
                            : !tokenAmount || tokenAmount.isZero()
                                ? t('transactions.validation.no-amount')
                                : (isFeePaidByTreasurer && tokenAmount.gt(maxAllocatableAmount)) ||
                                (!isFeePaidByTreasurer && tokenAmount.gt(unallocatedBalance))
                                    ? t('transactions.validation.amount-high')
                                    : nativeBalance < getMinBalanceRequired()
                                        ? t('transactions.validation.insufficient-balance-needed', { balance: formatThousands(getMinBalanceRequired(), 4) })
                                        : t('vesting.create-stream.step-one-validation-pass');
    }

    const getStepTwoButtonLabel = (): string => {
        return  !isStepOneValid()
            ? getStepOneButtonLabel()
            : !isVerifiedRecipient
                ? t('transactions.validation.verified-recipient-unchecked')
                : t('vesting.create-stream.create-cta');
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
            className="mean-modal simple-modal unpadded-content"
            title={<div className="modal-title">{t('vesting.create-stream.modal-title')}</div>}
            footer={null}
            visible={isVisible}
            onCancel={handleClose}
            width={480}>
            <div className="scrollable-content pl-5 pr-4 py-2">

                <WizardStepSelector
                    step={currentStep}
                    steps={2}
                    extraClass="px-1 mb-2"
                    onValueSelected={onStepperChange}
                />

                <div className={`panel1 ${currentStep === 0 ? 'show' : 'hide'}`}>

                    {vestingContract && renderVcName()}

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
                                        onFocus={handleRecipientAddressFocusIn}
                                        onChange={handleRecipientAddressChange}
                                        onBlur={handleRecipientAddressFocusOut}
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
                            recipientAddress && !isValidAddress(recipientAddress) ? (
                                <span className="form-field-error">
                                    {t('transactions.validation.address-validation')}
                                </span>
                            ) : isAddressOwnAccount() ? (
                                <span className="form-field-error">
                                    {t('transactions.recipient.recipient-is-own-account')}
                                </span>
                            ) : (null)
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
                                            showName={selectedToken.name === CUSTOM_TOKEN_NAME ? true : false}
                                            showCaretDown={false}
                                            fullTokenInfo={selectedToken}
                                        />
                                    )}
                                    {
                                        selectedToken && unallocatedBalance ? (
                                            <div
                                                className="token-max simplelink"
                                                onClick={() => {
                                                    const decimals = selectedToken ? selectedToken.decimals : 6;
                                                    if (isFeePaidByTreasurer) {
                                                        const maxAmount = getMaxAmount(true);
                                                        consoleOut('tokenAmount:', tokenAmount.toNumber(), 'blue');
                                                        consoleOut('maxAmount:', maxAmount.toNumber(), 'blue');
                                                        setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                                        setTokenAmount(new BN(maxAmount));
                                                    } else {
                                                        const maxAmount = getMaxAmount();
                                                        setFromCoinAmount(cutNumber(makeDecimal(new BN(maxAmount), decimals), decimals));
                                                        setTokenAmount(new BN(maxAmount));
                                                    }
                                                }}>
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
                                    {unallocatedBalance && selectedToken
                                        ? getAmountWithSymbol(
                                            makeDecimal(new BN(unallocatedBalance), selectedToken.decimals),
                                            selectedToken.address,
                                            true,
                                            tokenList
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
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-sending')}</strong> {(fromCoinAmount) ? `${cutNumber(parseFloat(fromCoinAmount), selectedToken?.decimals || 6)} ${selectedToken?.symbol}` : "--"}
                        </Col>
                        <Col span={24}>
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-starting-on')}</strong> {
                                paymentStartDate
                                ? isStartDateFuture(paymentStartDate)
                                    ? getReadableDate(paymentStartDate, true)
                                    : t('vesting.create-stream.start-immediately')
                                : '--'
                            }
                        </Col>
                        <Col span={24}>
                            <strong>{t('treasuries.treasury-streams.add-stream-locked.panel3-cliff-release')}</strong> {cliffRelease ? (`${cutNumber(parseFloat(cliffRelease), selectedToken?.decimals || 6)} ${selectedToken?.symbol} (on commencement)`) : "--"}
                        </Col>
                        <Col span={24}>
                            <strong>Amount to be streamed: </strong>
                        <span>
                        {
                            (cliffRelease && lockPeriodAmount && selectedToken)
                            ? (`${parseFloat(fromCoinAmount) - parseFloat(cliffRelease)} ${selectedToken.symbol} over ${lockPeriodAmount} ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`)
                            : "--"
                        }
                        </span>
                        </Col>
                        <Col span={24}>
                        <strong>Release rate: </strong>
                        <span>
                            {
                            (cliffRelease && lockPeriodAmount && selectedToken)
                                ? (`${paymentRateAmount} ${selectedToken.symbol} / ${getPaymentRateOptionLabel(lockPeriodFrequency, t)}`)
                                : "--"
                            }
                        </span>
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
                                {isBusy
                                    ? t('vesting.create-stream.create-cta-busy')
                                    : isError(transactionStatus.currentOperation)
                                        ? t('general.retry')
                                        : getStepTwoButtonLabel()
                                }
                            </Button>
                        </div>
                    </div>

                </div>

            </div>
        </Modal>
    );
};
