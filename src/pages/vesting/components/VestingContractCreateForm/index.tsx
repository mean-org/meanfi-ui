import React, { useEffect, useState, useContext, useCallback } from 'react';
import { TokenInfo } from '@solana/spl-token-registry';
import { getNetworkIdByEnvironment, useConnection } from '../../../../contexts/connection';
import { useWallet } from '../../../../contexts/wallet';
import { AppStateContext } from '../../../../contexts/appstate';
import { addDays, cutNumber, getAmountWithSymbol, isValidInteger, isValidNumber, shortenAddress, slugify, toTokenAmount } from '../../../../utils/utils';
import { consoleOut, getLockPeriodOptionLabel, getRateIntervalInSeconds, isValidAddress, PaymentRateTypeOption, toUsCurrency } from '../../../../utils/ui';
import { PaymentRateType } from '../../../../models/enums';
import { CUSTOM_TOKEN_NAME, DATEPICKER_FORMAT, MAX_TOKEN_LIST_ITEMS, MIN_SOL_BALANCE_REQUIRED } from '../../../../constants';
import { TokenListItem } from '../../../../components/TokenListItem';
import { TextInput } from '../../../../components/TextInput';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, DatePicker, Drawer, Dropdown, Menu, Modal, Spin, TimePicker } from 'antd';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { SubCategory, TransactionFees, TreasuryType } from '@mean-dao/msp';
import { NATIVE_SOL } from '../../../../utils/tokens';
import { VESTING_ACCOUNT_TYPE_OPTIONS } from '../../../../constants/treasury-type-options';
import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import { TreasuryTypeOption } from '../../../../models/treasuries';
import { FormLabelWithIconInfo } from '../../../../components/FormLabelWithIconInfo';
import { WizardStepSelector } from '../../../../components/WizardStepSelector';
import { isMobile } from 'react-device-detect';
import useWindowSize from '../../../../hooks/useWindowResize';
import { IconCaretDown } from '../../../../Icons';
import { VestingContractCategory, VestingContractCreateOptions, VESTING_CATEGORIES } from '../../../../models/vesting';
import { isError } from '../../../../utils/transactions';
import moment from 'moment';
import { AccountInfo, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { environment } from '../../../../environments/environment';
import { PendingProposalsComponent } from '../PendingProposalsComponent';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { Identicon } from '../../../../components/Identicon';
import { InputMean } from '../../../../components/InputMean';

const timeFormat="hh:mm A"

export const VestingContractCreateForm = (props: {
    accountAddress: string;
    inModal: boolean;
    isBusy: boolean;
    isMultisigContext: boolean;
    loadingMultisigAccounts: boolean;
    nativeBalance: number;
    onStartTransaction: any;
    selectedList: TokenInfo[];
    selectedMultisig: MultisigInfo | undefined;
    token: TokenInfo | undefined;
    tokenChanged: any;
    transactionFees: TransactionFees;
    userBalances: any;
}) => {
    const {
        accountAddress,
        inModal,
        isBusy,
        isMultisigContext,
        loadingMultisigAccounts,
        nativeBalance,
        onStartTransaction,
        selectedList,
        selectedMultisig,
        token,
        tokenChanged,
        transactionFees,
        userBalances,
    } = props;
    const { t } = useTranslation('common');
    const connection = useConnection();
    const { connected, publicKey } = useWallet();
    const {
        loadingPrices,
        lockPeriodAmount,
        paymentStartDate,
        transactionStatus,
        lockPeriodFrequency,
        pendingMultisigTxCount,
        setLockPeriodFrequency,
        getTokenPriceBySymbol,
        setLockPeriodAmount,
        setPaymentStartDate,
        setEffectiveRate,
        refreshPrices,
    } = useContext(AppStateContext);
    const { width } = useWindowSize();
    const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
    const [tokenFilter, setTokenFilter] = useState("");
    const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
    const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
    const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
    const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
    const [vestingLockName, setVestingLockName] = useState<string>('');
    const [vestingCategory, setVestingCategory] = useState<VestingContractCategory | undefined>(undefined);
    const [vestingLockFundingAmount, setVestingLockFundingAmount] = useState<string>('');
    const [currentStep, setCurrentStep] = useState(0);
    const percentages = [5, 10, 15, 20];
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>("");
    const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
    const [treasuryOption, setTreasuryOption] = useState<TreasuryTypeOption>(VESTING_ACCOUNT_TYPE_OPTIONS[0]);
    const [contractTime, setContractTime] = useState<string | undefined>(undefined);
    const [proposalTitle, setProposalTitle] = useState("");

    const getFeeAmount = useCallback(() => {
        return transactionFees.blockchainFee + transactionFees.mspFlatFee;
    }, [transactionFees.blockchainFee, transactionFees.mspFlatFee]);

    const getMinSolBlanceRequired = useCallback(() => {
        return getFeeAmount() > MIN_SOL_BALANCE_REQUIRED
            ? getFeeAmount()
            : MIN_SOL_BALANCE_REQUIRED;

    }, [getFeeAmount]);

    const getMaxAmount = useCallback(() => {
        const amount = nativeBalance - getMinSolBlanceRequired();
        return amount > 0 ? amount : 0;
    }, [getMinSolBlanceRequired, nativeBalance]);

    const getTokenPrice = useCallback(() => {
        if (!vestingLockFundingAmount || !selectedToken) {
            return 0;
        }

        return parseFloat(vestingLockFundingAmount) * getTokenPriceBySymbol(selectedToken.symbol);
    }, [vestingLockFundingAmount, selectedToken, getTokenPriceBySymbol]);

    const autoFocusInput = useCallback(() => {
        const input = document.getElementById("token-search-otp");
        if (input) {
            setTimeout(() => {
                input.focus();
            }, 100);
        }
    }, []);

    // Token selection modal
    const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);

    const showTokenSelector = useCallback(() => {
        setTokenSelectorModalVisibility(true);
        autoFocusInput();
    }, [autoFocusInput]);

    const onCloseTokenSelector = useCallback(() => {
        hideDrawer();
        setTokenSelectorModalVisibility(false);
        if (tokenFilter && !isValidAddress(tokenFilter)) {
            setTokenFilter('');
        }
    }, [tokenFilter]);

    // Updates the token list everytime is filtered
    const updateTokenListByFilter = useCallback((searchString: string) => {

        if (!selectedList) {
            return;
        }

        const timeout = setTimeout(() => {

            const filter = (t: any) => {
                return (
                    t.symbol.toLowerCase().includes(searchString.toLowerCase()) ||
                    t.name.toLowerCase().includes(searchString.toLowerCase()) ||
                    t.address.toLowerCase().includes(searchString.toLowerCase())
                );
            };

            const showFromList = !searchString
                ? selectedList
                : selectedList.filter((t: any) => filter(t));

            setFilteredTokenList(showFromList);

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [selectedList]);

    const onInputCleared = useCallback(() => {
        setTokenFilter('');
        updateTokenListByFilter('');
    }, [
        updateTokenListByFilter
    ]);

    const onTokenSearchInputChange = useCallback((e: any) => {

        const newValue = e.target.value;
        setTokenFilter(newValue);
        updateTokenListByFilter(newValue);

    }, [
        updateTokenListByFilter
    ]);

    const onFeePayedByTreasurerChange = (e: any) => {
        consoleOut('onFeePayedByTreasurerChange:', e.target.checked, 'blue');
        setIsFeePaidByTreasurer(e.target.checked);
    }

    const getOneDayAhead = useCallback(() => {
        const time =  moment().format(timeFormat);
        setContractTime(time);
        const date = addDays(new Date(), 1).toLocaleDateString("en-US");
        setPaymentStartDate(date);
    }, [setPaymentStartDate]);

    /////////////////////
    // Data management //
    /////////////////////

    // Set an initial time for creating a contract
    useEffect(() => {
        if (contractTime === undefined) {
            getOneDayAhead();
        }
    }, [contractTime, getOneDayAhead]);

    // Process inputs
    useEffect(() => {
        if (token) {
            setSelectedToken(token);
        }
    }, [token, inModal]);

    // Keep token balance updated
    useEffect(() => {

        if (!connection || !publicKey || !userBalances || !selectedToken) {
            setSelectedTokenBalance(0);
            return;
        }

        const timeout = setTimeout(() => {
            setSelectedTokenBalance(userBalances[selectedToken.address]);
        });

        return () => {
            clearTimeout(timeout);
        }

    }, [connection, publicKey, selectedToken, userBalances]);

    // Detect XS screen
    useEffect(() => {
        if (width < 576) {
            setIsXsDevice(true);
        } else {
            setIsXsDevice(false);
        }
    }, [width]);

    // Reset results when the filter is cleared
    useEffect(() => {
        if (selectedList && selectedList.length && filteredTokenList.length === 0 && !tokenFilter) {
            updateTokenListByFilter(tokenFilter);
        }
    }, [
        selectedList,
        tokenFilter,
        filteredTokenList,
        updateTokenListByFilter
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

    ////////////////////////////////////
    // Events, actions and Validation //
    ////////////////////////////////////

    const showDrawer = () => {
        setIsTokenSelectorVisible(true);
        autoFocusInput();
    };

    const hideDrawer = () => {
        setIsTokenSelectorVisible(false);
    };

    // TODO: Modify payload as needed
    const onAccountCreateClick = () => {
        const parsedDate = Date.parse(paymentStartDate as string);
        const startUtc = new Date(parsedDate);
        const shortTime = moment(contractTime, timeFormat).format("HH:mm");
        const to24hTime = moment(shortTime, "HH:mm");
        startUtc.setHours(to24hTime.hours());
        startUtc.setMinutes(to24hTime.minutes());
        startUtc.setSeconds(to24hTime.seconds());
        // const startDatePlusOffset = new Date(startUtc.getTime() + startUtc.getTimezoneOffset() * 60000);
        // const timeShiftedStartUtc = new Date(startDatePlusOffset);
        consoleOut('start date in UTC:', startUtc, 'darkorange');
        const options: VestingContractCreateOptions = {
            vestingContractTitle: proposalTitle,
            vestingContractName: vestingLockName,
            vestingCategory: vestingCategory ? vestingCategory.value : SubCategory.default,
            vestingContractType: treasuryOption ? treasuryOption.type : TreasuryType.Lock,
            token: selectedToken as TokenInfo,
            amount: vestingLockFundingAmount,
            feePayedByTreasurer: isFeePaidByTreasurer,
            duration: parseFloat(lockPeriodAmount),
            durationUnit: getRateIntervalInSeconds(lockPeriodFrequency),
            cliffVestPercent: parseFloat(cliffReleasePercentage) || 0,
            startDate: startUtc,
            multisig: isMultisigContext ? accountAddress : '',
            fundingAmount: toTokenAmount(parseFloat(vestingLockFundingAmount), (selectedToken as TokenInfo).decimals)
        };
        onStartTransaction(options);
    }

    const handleVestingLockNameChange = (e: any) => {
        setVestingLockName(e.target.value);
    }

    const getLockPeriodOptionsFromEnum = (value: any): PaymentRateTypeOption[] => {
        let index = 0;
        const options: PaymentRateTypeOption[] = [];
        for (const enumMember in value) {
            const mappedValue = parseInt(enumMember, 10);
            if (!isNaN(mappedValue)) {
                const item = new PaymentRateTypeOption(
                    index,
                    mappedValue,
                    getLockPeriodOptionLabel(mappedValue, t)
                );
                options.push(item);
            }
            index++;
        }
        return options;
    }

    const handleLockPeriodAmountChange = (e: any) => {

        const newValue = e.target.value;
 
        if (isValidInteger(newValue)) {
            setLockPeriodAmount(newValue);
        } else {
            setLockPeriodAmount("");
        }

    }

    const handleLockPeriodOptionChange = (val: PaymentRateType) => {
        setLockPeriodFrequency(val);
    }

    const onVestingLockFundingAmountChange = (e: any) => {

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
            setVestingLockFundingAmount("");
        } else if (newValue === '.') {
            setVestingLockFundingAmount(".");
        } else if (isValidNumber(newValue)) {
            setVestingLockFundingAmount(newValue);
        }
    };

    const onStepperChange = (value: number) => {
        setCurrentStep(value);
    }

    const onContinueStepOneButtonClick = () => {
        setCurrentStep(1);
    }

    const onBackClick = () => {
        setCurrentStep(0);
    }

    const handleDateChange = (date: string) => {
        setPaymentStartDate(date);
    }

    const handleCliffReleaseAmountChange = (e: any) => {

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
            setCliffReleasePercentage("");
        } else if (newValue === '.') {
            setCliffReleasePercentage(".");
        } else if (isValidNumber(newValue)) {
            setCliffReleasePercentage(newValue);
        }
    };

    const handleVestingAccountTypeSelection = (option: TreasuryTypeOption) => {
        setTreasuryOption(option);
    }

    const isStepOneValid = (): boolean => {
        let maxAmount = 0;
        if (selectedToken) {
            if (selectedToken.address === NATIVE_SOL.address) {
                const amount = getMaxAmount();
                maxAmount = parseFloat(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
            } else {
                maxAmount = parseFloat(cutNumber(tokenBalance, selectedToken.decimals));
            }
        }
        return  publicKey &&
                ((!proposalTitle && !isMultisigContext) || (proposalTitle && isMultisigContext)) &&
                vestingLockName &&
                selectedToken &&
                nativeBalance > 0 && nativeBalance >= getMinSolBlanceRequired() &&
                (!vestingLockFundingAmount || parseFloat(vestingLockFundingAmount) <= maxAmount)
            ? true
            : false;
    };

    const isStepTwoValid = (): boolean => {
        return  isStepOneValid() &&
                lockPeriodAmount &&
                parseFloat(lockPeriodAmount) > 0 &&
                lockPeriodFrequency
        ? true
        : false;
    };

    const onChangeValuePercentages = (value: number) => {
        setCliffReleasePercentage(`${value}`);
    };

    const onTimePickerChange = (time: moment.Moment | null, timeString: string) => {
        if (time) {
            const shortTime = time.format(timeFormat);
            setContractTime(shortTime);
        }
    };

    const getStepOneButtonLabel = () => {
        let maxAmount = 0;
        if (selectedToken) {
            if (selectedToken.address === NATIVE_SOL.address) {
                const amount = getMaxAmount();
                maxAmount = parseFloat(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
            } else {
                maxAmount = parseFloat(cutNumber(tokenBalance, selectedToken.decimals));
            }
        }
        return  !publicKey
            ? t('transactions.validation.not-connected')
            : isMultisigContext && !proposalTitle
                ? 'Add a proposal title'
                : !vestingLockName
                    ? 'Add contract name'
                    : !nativeBalance || nativeBalance < getMinSolBlanceRequired()
                        ? t('transactions.validation.amount-sol-low')
                        : (vestingLockFundingAmount && parseFloat(vestingLockFundingAmount) > maxAmount)
                            ? t('transactions.validation.amount-high')
                            : t('transactions.validation.valid-continue');

    }

    const getStepTwoButtonLabel = () => {
        let maxAmount = 0;
        if (selectedToken) {
            if (selectedToken.address === NATIVE_SOL.address) {
                const amount = getMaxAmount();
                maxAmount = parseFloat(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
            } else {
                maxAmount = parseFloat(cutNumber(tokenBalance, selectedToken.decimals));
            }
        }
        return  !publicKey
            ? t('transactions.validation.not-connected')
            : isMultisigContext && !proposalTitle
                ? 'Add a proposal title'
                : !vestingLockName
                    ? 'Add contract name'
                    : !nativeBalance || nativeBalance < getMinSolBlanceRequired()
                        ? t('transactions.validation.amount-sol-low')
                        : (vestingLockFundingAmount && parseFloat(vestingLockFundingAmount) > maxAmount)
                            ? t('transactions.validation.amount-high')
                            : !lockPeriodAmount
                                ? 'Set vesting period'
                                : !lockPeriodFrequency
                                    ? 'Set vesting period'
                                    : t('vesting.create-account.create-cta');

    }

    const todayAndPriorDatesDisabled = (current: any) => {
        // Can not select neither today nor days before today
        return current && current < moment().add(1, 'day').startOf('day');
    }

    const onResetDate = () => {
        const date = addDays(new Date(), 1).toLocaleDateString("en-US");
        setPaymentStartDate(date);
    }

    const onTitleInputValueChange = (e: any) => {
        setProposalTitle(e.target.value);
    }

    ///////////////
    // Rendering //
    ///////////////

    const lockPeriodOptionsMenu = (
        <Menu>
            {getLockPeriodOptionsFromEnum(PaymentRateType).map((item) => {
                return (
                    <Menu.Item
                        key={item.key}
                        onClick={() => handleLockPeriodOptionChange(item.value)}>
                        {item.text}
                    </Menu.Item>
                );
            })}
        </Menu>
    );

    const vestingCategoriesMenu = (
        <Menu>
            {VESTING_CATEGORIES.map(item => {
                return (
                    <Menu.Item
                        key={`${slugify(item.label)}-${item.value}`}
                        onClick={() => setVestingCategory(item)}>
                        {item.label}
                    </Menu.Item>
                );
            })}
        </Menu>
    );

    const renderTokenList = (
        <>
            {(filteredTokenList && filteredTokenList.length > 0) && (
                filteredTokenList.map((t, index) => {
                    const onClick = function () {
                        tokenChanged(t);
                        setSelectedToken(t);

                        consoleOut("token selected:", t.symbol, 'blue');
                        setEffectiveRate(getTokenPriceBySymbol(t.symbol));
                        onCloseTokenSelector();
                    };

                    if (index < MAX_TOKEN_LIST_ITEMS) {
                        const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
                        return (
                            <TokenListItem
                                key={t.address}
                                name={t.name || CUSTOM_TOKEN_NAME}
                                mintAddress={t.address}
                                token={t}
                                className={selectedToken && selectedToken.address === t.address ? "selected" : "simplelink"}
                                onClick={onClick}
                                balance={balance}
                                showZeroBalances={false}
                            />
                        );
                    } else {
                        return null;
                    }
                })
            )}
        </>
    );

    const renderTokenSelectorInner = (
        <div className="token-selector-wrapper">
            <div className="token-search-wrapper">
                <TextInput
                    id="token-search-otp"
                    value={tokenFilter}
                    allowClear={true}
                    extraClass="mb-2"
                    onInputClear={onInputCleared}
                    placeholder={t('token-selector.search-input-placeholder')}
                    error={
                        tokenFilter && selectedToken && selectedToken.decimals === -1
                            ? 'Account not found'
                            : tokenFilter && selectedToken && selectedToken.decimals === -2
                                ? 'Account is not a token mint'
                                : ''
                    }
                    onInputChange={onTokenSearchInputChange} />
            </div>
            <div className="token-list">
                {filteredTokenList.length > 0 && renderTokenList}
                {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
                    <TokenListItem
                        key={tokenFilter}
                        name={CUSTOM_TOKEN_NAME}
                        mintAddress={tokenFilter}
                        className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
                        onClick={async () => {
                            const address = tokenFilter;
                            let decimals = -1;
                            let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
                            try {
                                accountInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
                                consoleOut('accountInfo:', accountInfo, 'blue');
                            } catch (error) {
                                console.error(error);
                            }
                            if (accountInfo) {
                                if ((accountInfo as any).data["program"] &&
                                    (accountInfo as any).data["program"] === "spl-token" &&
                                    (accountInfo as any).data["parsed"] &&
                                    (accountInfo as any).data["parsed"]["type"] &&
                                    (accountInfo as any).data["parsed"]["type"] === "mint") {
                                    decimals = (accountInfo as any).data["parsed"]["info"]["decimals"];
                                } else {
                                    decimals = -2;
                                }
                            }
                            const unknownToken: TokenInfo = {
                                address,
                                name: CUSTOM_TOKEN_NAME,
                                chainId: getNetworkIdByEnvironment(environment),
                                decimals,
                                symbol: `[${shortenAddress(address)}]`,
                            };
                            tokenChanged(unknownToken);
                            setSelectedToken(unknownToken);
                            if (userBalances && userBalances[address]) {
                                setSelectedTokenBalance(userBalances[address]);
                            }
                            consoleOut("token selected:", unknownToken, 'blue');
                            // Do not close on errors (-1 or -2)
                            if (decimals >= 0) {
                                onCloseTokenSelector();
                            }
                        }}
                        balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
                    />
                )}
            </div>
        </div>
    );

    const renderDatePickerExtraPanel = () => {
        return (
            <span className="flat-button tiny stroked primary" onClick={onResetDate}>
                <span className="mx-1">Reset</span>
            </span>
        );
    }

    const renderSelectedMultisig = () => {
        return (
            selectedMultisig && (
                <div className={`transaction-list-row w-100 no-pointer`}>
                    <div className="icon-cell">
                        <Identicon address={selectedMultisig.id} style={{ width: "30", display: "inline-flex" }} />
                    </div>
                    <div className="description-cell">
                        <div className="title text-truncate">{selectedMultisig.label}</div>
                        <div className="subtitle text-truncate">{shortenAddress(selectedMultisig.id.toBase58(), 8)}</div>
                    </div>
                    <div className="rate-cell">
                        <div className="rate-amount">
                            {
                                t('multisig.multisig-accounts.pending-transactions', {
                                    txs: selectedMultisig.pendingTxsAmount
                                })
                            }
                        </div>
                    </div>
                </div>
            )
        )
    }

    const renderTreasuryOption = (option: TreasuryTypeOption) => {
        return (
            <div key={`${option.translationId}`} className="item-card mb-0 selected"
                onClick={() => {
                    if (!option.disabled) {
                        handleVestingAccountTypeSelection(option);
                    }
                }}>
                <div className="checkmark"><CheckOutlined /></div>
                <div className="item-meta">
                    <div className="item-name">{t(`vesting.create-account.vesting-account-type-options.${option.translationId}-name`)}</div>
                    <div className="item-description">{t(`vesting.create-account.vesting-account-type-options.${option.translationId}-description`)}</div>
                </div>
            </div>
        );
    }

    return (
        <>
            <Spin spinning={loadingMultisigAccounts}>

                {!inModal && (
                    <PendingProposalsComponent
                        accountAddress={accountAddress}
                        extraClasses="no-pointer justify-content-center shift-up-3 mb-2"
                        pendingMultisigTxCount={pendingMultisigTxCount}
                    />
                )}

                <div className={`${inModal ? 'scrollable-content pl-5 pr-4 py-2' : 'elastic-form-container'}`}>

                    <WizardStepSelector
                        step={currentStep}
                        steps={2}
                        extraClass="px-1 mb-2"
                        onValueSelected={onStepperChange}
                    />

                    <div className={`panel1 ${currentStep === 0 ? 'show' : 'hide'}`}>

                        <h2 className="form-group-label">{t('vesting.create-account.step-one-label')}</h2>

                        {/* Treasury type */}
                        <div className="items-card-list click-disabled mt-2 mb-3">
                            {renderTreasuryOption(treasuryOption)}
                        </div>

                        {/* Proposal title */}
                        {isMultisigContext && selectedMultisig && (
                            <div className="mb-3 mt-3">
                                <div className="form-label text-left">{t('multisig.proposal-modal.title')}</div>
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

                        {/* Vesting Lock name */}
                        <div className="form-label">{t('vesting.create-account.vesting-contract-name-label')}</div>
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
                                        onChange={handleVestingLockNameChange}
                                        placeholder="Name for this no-code vesting lock account"
                                        spellCheck="false"
                                        value={vestingLockName}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Token to vest */}
                        <FormLabelWithIconInfo
                            label={
                                isMultisigContext
                                    ? t('vesting.create-account.multisig-vesting-contract-token-label')
                                    : t('vesting.create-account.vesting-contract-token-label')
                            }
                            tooltipText={t('vesting.create-account.vesting-contract-token-tooltip')}
                        />
                        <div className="well">
                            <div className="flex-fixed-left">
                                <div className="left">
                                    <span className="add-on simplelink">
                                        {selectedToken && (
                                            <TokenDisplay onClick={() => inModal ? showDrawer() : showTokenSelector()}
                                                mintAddress={selectedToken.address}
                                                name={selectedToken.name}
                                                showCaretDown={true}
                                                showName={selectedToken.name === CUSTOM_TOKEN_NAME ? true : false}
                                                fullTokenInfo={selectedToken}
                                            />
                                        )}
                                        {!isMultisigContext && selectedToken && tokenBalance && tokenBalance > getMinSolBlanceRequired() ? (
                                            <div className="token-max simplelink" onClick={() => {
                                                if (selectedToken.address === NATIVE_SOL.address) {
                                                    const amount = getMaxAmount();
                                                    setVestingLockFundingAmount(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
                                                } else {
                                                    setVestingLockFundingAmount(cutNumber(tokenBalance, selectedToken.decimals));
                                                }
                                            }}>
                                                MAX
                                            </div>
                                        ) : null}
                                    </span>
                                </div>
                                <div className="right">
                                    {isMultisigContext ? (
                                        <span>&nbsp;</span>
                                    ) : (
                                        <input
                                            className="general-text-input text-right"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            autoCorrect="off"
                                            type="text"
                                            onChange={onVestingLockFundingAmountChange}
                                            pattern="^[0-9]*[.,]?[0-9]*$"
                                            placeholder="0.0"
                                            minLength={1}
                                            maxLength={79}
                                            spellCheck="false"
                                            value={vestingLockFundingAmount}
                                        />
                                    )}
                                </div>
                            </div>
                            <div className="flex-fixed-right">
                                <div className="left inner-label">
                                    <span>{t('transactions.send-amount.label-right')}:</span>
                                    <span>
                                        {`${tokenBalance && selectedToken
                                            ? getAmountWithSymbol(tokenBalance, selectedToken.address, true)
                                            : "0"
                                            }`
                                        }
                                    </span>
                                </div>
                                {!isMultisigContext && (
                                    <div className="right inner-label">
                                        {publicKey ? (
                                            <>
                                                <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                                                ~{vestingLockFundingAmount
                                                    ? toUsCurrency(getTokenPrice())
                                                    : "$0.00"
                                                }
                                                </span>
                                            </>
                                        ) : (
                                            <span>~$0.00</span>
                                        )}
                                    </div>
                                )}
                            </div>
                            {nativeBalance < getMinSolBlanceRequired() && (
                                <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
                            )}
                        </div>

                        {/* Display Multisig account */}
                        {isMultisigContext && selectedMultisig && (
                            <>
                                <div className="form-label">Multisig account</div>
                                <div className="well">
                                    {renderSelectedMultisig()}
                                </div>
                            </>
                        )}

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

                        <h2 className="form-group-label">{t('vesting.create-account.step-two-label')}</h2>

                        {/* Vesting category */}
                        <FormLabelWithIconInfo
                            label="Vesting category"
                            tooltipText="This vesting category helps identify the type of streams in this contract. Some examples are seed round, investor, marketing, token lock."
                        />
                        <div className="well">
                            <Dropdown
                                overlay={vestingCategoriesMenu}
                                trigger={["click"]}>
                                <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                                    <div className="left">
                                        {vestingCategory ? (
                                            <span>{vestingCategory.label}</span>
                                        ) : (
                                            <span className="placeholder-text">Please select a vesting category</span>
                                        )}
                                    </div>
                                    <div className="right">
                                        <IconCaretDown className="mean-svg-icons" />
                                    </div>
                                </span>
                            </Dropdown>
                        </div>

                        {/* Vesting period */}
                        <div className="form-label">Vesting period</div>
                        <div className="two-column-layout">
                            <div className="left">
                                <div className="well">
                                    <div className="flex-fixed-right">
                                        <div className="left">
                                            <input
                                                id="plock-period-field"
                                                className="w-100 general-text-input"
                                                autoComplete="on"
                                                autoCorrect="off"
                                                type="text"
                                                onChange={handleLockPeriodAmountChange}
                                                placeholder={`Number of ${getLockPeriodOptionLabel(lockPeriodFrequency, t)}`}
                                                spellCheck="false"
                                                min={1}
                                                value={lockPeriodAmount}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="right">
                                <div className="well">
                                    <Dropdown
                                        overlay={lockPeriodOptionsMenu}
                                        trigger={["click"]}>
                                        <span className="dropdown-trigger no-decoration flex-fixed-right align-items-center">
                                            <div className="left">
                                                <span>{getLockPeriodOptionLabel(lockPeriodFrequency, t)}{" "}</span>
                                            </div>
                                            <div className="right">
                                                <IconCaretDown className="mean-svg-icons" />
                                            </div>
                                        </span>
                                    </Dropdown>
                                </div>
                            </div>
                        </div>

                        {/* Contract commencement date */}
                        <FormLabelWithIconInfo
                            label="Contract commencement date"
                            tooltipText="This the the contract start date and time and establishes when vesting will begin for all recipients. No additional streams can be created once the vesting contract has started."
                        />
                        <div className="two-column-layout">
                            <div className="left">
                                <div className="well">
                                    <div className="flex-fixed-right">
                                        <div className="left static-data-field">{paymentStartDate}</div>
                                        <div className="right">
                                            <div className="add-on simplelink">
                                                <>
                                                    {
                                                        <DatePicker
                                                            size="middle"
                                                            bordered={false}
                                                            className="addon-date-picker"
                                                            aria-required={true}
                                                            allowClear={false}
                                                            disabledDate={todayAndPriorDatesDisabled}
                                                            placeholder="Pick a date"
                                                            onChange={(value: any, date: string) => handleDateChange(date)}
                                                            value={moment(
                                                                paymentStartDate,
                                                                DATEPICKER_FORMAT
                                                            ) as any}
                                                            format={DATEPICKER_FORMAT}
                                                            showNow={false}
                                                            showToday={false}
                                                            renderExtraFooter={renderDatePickerExtraPanel}
                                                        />
                                                    }
                                                </>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="right">
                                <div className="well time-picker">
                                    <TimePicker
                                        defaultValue={moment()}
                                        bordered={false}
                                        allowClear={false}
                                        size="middle"
                                        use12Hours
                                        format={timeFormat}
                                        onChange={onTimePickerChange} />
                                </div>
                            </div>
                        </div>

                        {/* Cliff release */}
                        <FormLabelWithIconInfo
                            label="Cliff release (On commencement date)"
                            tooltipText="The percentage of allocated funds released to each recipient once the vesting contract starts."
                        />
                        <div className="well">
                            <div className="flexible-right mb-1">
                                <div className="token-group">
                                    {percentages.map((percentage, index) => (
                                        <div key={index} className="mb-1 d-flex flex-column align-items-center">
                                            <div className="token-max simplelink active" onClick={() => onChangeValuePercentages(percentage)}>{percentage}%</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex-fixed-left">
                                <div className="left">
                                    <span className="add-on simplelink">
                                        {selectedToken && (
                                            <TokenDisplay onClick={() => { }}
                                                mintAddress={selectedToken.address}
                                                name={selectedToken.name}
                                                showName={selectedToken.name === CUSTOM_TOKEN_NAME ? true : false}
                                                fullTokenInfo={selectedToken}
                                            />
                                        )}
                                    </span>
                                </div>
                                <div className="right flex-row justify-content-end align-items-center">
                                    <input
                                        className="general-text-input text-right"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        type="text"
                                        onChange={handleCliffReleaseAmountChange}
                                        pattern="^[0-9]*[.,]?[0-9]*$"
                                        placeholder="0.0"
                                        minLength={1}
                                        maxLength={79}
                                        spellCheck="false"
                                        value={cliffReleasePercentage}
                                    />
                                    <span className="suffix">%</span>
                                </div>
                            </div>
                        </div>

                        {/* Streaming fees will be paid from the vesting contract's funds */}
                        <div className="ml-1 mb-3">
                            <Checkbox checked={isFeePaidByTreasurer} onChange={onFeePayedByTreasurerChange}>{t('vesting.create-account.fee-paid-by-treasury')}</Checkbox>
                        </div>

                        {/* CTAs */}
                        <div className={`two-column-form-layout${inModal || isXsDevice ? ' reverse' : ''}`}>
                            <div className={`left ${inModal || isXsDevice ? 'mb-3' : 'mb-0'}`}>
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
                            <div className={`right ${inModal || isXsDevice ? 'mb-3' : 'mb-0'}`}>
                                <Button
                                    block
                                    type="primary"
                                    shape="round"
                                    size="large"
                                    className="thin-stroke"
                                    disabled={isBusy || !isStepTwoValid()}
                                    onClick={onAccountCreateClick}>
                                    {isBusy && (
                                        <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                                    )}
                                    {isBusy
                                        ? t('vesting.create-account.create-cta-busy')
                                        : isError(transactionStatus.currentOperation)
                                            ? t('general.retry')
                                            : getStepTwoButtonLabel()
                                    }
                                </Button>
                            </div>
                        </div>

                    </div>

                </div>

            </Spin>

            {inModal && (
                <Drawer
                    title={t('token-selector.modal-title')}
                    placement="bottom"
                    closable={true}
                    onClose={onCloseTokenSelector}
                    visible={isTokenSelectorVisible}
                    getContainer={false}
                    style={{ position: 'absolute' }}>
                    {renderTokenSelectorInner}
                </Drawer>
            )}

            {/* Token selection modal */}
            {!inModal && isTokenSelectorModalVisible && (
                <Modal
                    className="mean-modal unpadded-content"
                    visible={isTokenSelectorModalVisible}
                    title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
                    onCancel={onCloseTokenSelector}
                    width={450}
                    footer={null}>
                    {renderTokenSelectorInner}
                </Modal>
            )}
        </>
    );
};
