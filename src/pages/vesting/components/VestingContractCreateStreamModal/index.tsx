import React, { useCallback, useEffect, useContext, useState } from 'react';
import { Button, Checkbox, Modal } from "antd";
import { TokenInfo } from '@solana/spl-token-registry';
import { TransactionFees, Treasury, TreasuryType } from '@mean-dao/msp';
import { cutNumber, getAmountWithSymbol, isValidNumber, makeDecimal, makeInteger, shortenAddress } from '../../../../utils/utils';
import { AppStateContext } from '../../../../contexts/appstate';
import { consoleOut, isValidAddress, toUsCurrency } from '../../../../utils/ui';
import { WizardStepSelector } from '../../../../components/WizardStepSelector';
import { useTranslation } from 'react-i18next';
import BN from 'bn.js';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { TreasuryTypeOption } from '../../../../models/treasuries';
import { useWallet } from '../../../../contexts/wallet';
import { LoadingOutlined } from '@ant-design/icons';
import { isError } from '../../../../utils/transactions';

export const VestingContractCreateStreamModal = (props: {
    handleClose: any;
    handleOk: any;
    isVisible: boolean;
    nativeBalance: number;
    transactionFees: TransactionFees;
    vestingContract: Treasury | undefined;
    withdrawTransactionFees: TransactionFees;
    isBusy: boolean;
    isXsDevice: boolean;
}) => {
    const {
        handleClose,
        handleOk,
        isVisible,
        nativeBalance,
        transactionFees,
        vestingContract,
        withdrawTransactionFees,
        isBusy,
        isXsDevice,
    } = props;
    const {
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
    const { publicKey, wallet } = useWallet();
    const [currentStep, setCurrentStep] = useState(0);
    const [vestingStreamName, setVestingStreamName] = useState<string>('');
    const [unallocatedBalance, setUnallocatedBalance] = useState(new BN(0));
    const [tokenAmount, setTokenAmount] = useState(new BN(0));
    const [maxAllocatableAmount, setMaxAllocatableAmount] = useState<any>(undefined);

    // Setting from the vesting contract
    const [treasuryOption, setTreasuryOption] = useState<TreasuryTypeOption | undefined>(undefined);
    const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);


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
            name: 'Unknown',
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

    // When modal goes visible, use the treasury associated token
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
        getTokenByMintAddress,
        getTokenPriceBySymbol,
        setSelectedToken,
        setEffectiveRate,
        setCustomToken,
    ]);

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

    // TODO: Create a type for this
    const onStreamCreateClick = () => {
        const options = {
            streamName: vestingStreamName,
            beneficiaryAddress: recipientAddress,
            amount: tokenAmount
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
                    <h2 className="form-group-label">{t('vesting.create-stream.step-one-label')}</h2>

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
                                    placeholder={t('vesting.create-stream.vesting-stream-name-placeholder')} // Name for this no-code vesting stream
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
                                        placeholder={t('transactions.recipient.placeholder')}
                                        required={true}
                                        spellCheck="false"
                                        value={recipientAddress} />
                                    <span id="payment-recipient-static-field"
                                        className={`${recipientAddress ? 'overflow-ellipsis-middle' : 'placeholder-text'}`}>
                                        {recipientAddress || t('transactions.recipient.placeholder')}
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
                    {(treasuryOption && treasuryOption.type === TreasuryType.Open) ? (
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
                            Next
                        </Button>
                    </div>


                </div>

                <div className={`panel2 ${currentStep === 1 ? 'show' : 'hide'}`}>
                    <h2 className="form-group-label">{t('vesting.create-stream.step-two-label')}</h2>

                    <div className="ml-1">
                        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t('transfers.verified-recipient-disclaimer')}</Checkbox>
                    </div>

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
                                    ? t('vesting.create-account.create-cta-busy')
                                    : isError(transactionStatus.currentOperation)
                                        ? t('general.retry')
                                        : t('vesting.create-account.create-cta')
                                }
                            </Button>
                        </div>
                    </div>

                </div>

            </div>
        </Modal>
    );
};
