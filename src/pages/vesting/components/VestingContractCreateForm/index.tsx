import { CheckOutlined, LoadingOutlined } from '@ant-design/icons';
import { MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import { SubCategory, TransactionFees, TreasuryType } from '@mean-dao/msp';
import { AccountInfo, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { Button, Checkbox, DatePicker, Drawer, Dropdown, Menu, Modal, Spin, TimePicker } from 'antd';
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import BigNumber from 'bignumber.js';
import { BN } from 'bn.js';
import { FormLabelWithIconInfo } from 'components/FormLabelWithIconInfo';
import { Identicon } from 'components/Identicon';
import { InputMean } from 'components/InputMean';
import { TextInput } from 'components/TextInput';
import { TokenDisplay } from 'components/TokenDisplay';
import { TokenListItem } from 'components/TokenListItem';
import { WizardStepSelector } from 'components/WizardStepSelector';
import { CUSTOM_TOKEN_NAME, DATEPICKER_FORMAT, MAX_TOKEN_LIST_ITEMS, MIN_SOL_BALANCE_REQUIRED } from 'constants/common';
import { NATIVE_SOL } from 'constants/tokens';
import { VESTING_ACCOUNT_TYPE_OPTIONS } from 'constants/treasury-type-options';
import { AppStateContext } from 'contexts/appstate';
import { getNetworkIdByEnvironment, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { environment } from 'environments/environment';
import useWindowSize from 'hooks/useWindowResize';
import { IconCaretDown } from 'Icons';
import { isError } from 'middleware/transactions';
import {
    consoleOut,
    getLockPeriodOptionLabel,
    getRateIntervalInSeconds,
    isProd,
    isValidAddress,
    toUsCurrency
} from 'middleware/ui';
import {
    addDays,
    cutNumber,
    getAmountWithSymbol,
    isValidInteger,
    isValidNumber,
    shortenAddress,
    slugify,
    toTokenAmount,
    toTokenAmountBn,
    toUiAmount
} from 'middleware/utils';
import { PaymentRateType } from 'models/enums';
import { PaymentRateTypeOption } from "models/PaymentRateTypeOption";
import { TokenInfo } from 'models/SolanaTokenInfo';
import { TreasuryTypeOption } from 'models/treasuries';
import { VestingContractCategory, VestingContractCreateOptions, VESTING_CATEGORIES } from 'models/vesting';
import moment from 'moment';
import { useCallback, useContext, useEffect, useState } from 'react';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { PendingProposalsComponent } from '../PendingProposalsComponent';

const timeFormat="hh:mm A";

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
        isWhitelisted,
        loadingPrices,
        lockPeriodAmount,
        transactionStatus,
        lockPeriodFrequency,
        pendingMultisigTxCount,
        setLockPeriodFrequency,
        getTokenPriceBySymbol,
        setLockPeriodAmount,
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
    const [tokenBalanceBn, setSelectedTokenBalanceBn] = useState(new BN(0));
    const [vestingLockName, setVestingLockName] = useState<string>('');
    const [vestingCategory, setVestingCategory] = useState<VestingContractCategory | undefined>(undefined);
    const [vestingLockFundingAmount, setVestingLockFundingAmount] = useState<string>('');
    const [currentStep, setCurrentStep] = useState(0);
    const percentages = [5, 10, 15, 20];
    const [cliffReleasePercentage, setCliffReleasePercentage] = useState<string>("");
    const [isFeePaidByTreasurer, setIsFeePaidByTreasurer] = useState(false);
    const [treasuryOption, setTreasuryOption] = useState<TreasuryTypeOption>(VESTING_ACCOUNT_TYPE_OPTIONS[0]);
    const [contractTime, setContractTime] = useState<string | undefined>(undefined);
    const [paymentStartDate, setPaymentStartDate] = useState<string | undefined>(undefined);
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

    const get30MinsAhead = useCallback(() => {
        if (!isProd() && isWhitelisted) {
            return moment().add(30, 'm');
        } else {
            return moment();
        }
    }, [isWhitelisted]);

    const getOneDayAhead = useCallback(() => {
        if (!isProd() && isWhitelisted) {
            const time =  get30MinsAhead().format(timeFormat);
            setContractTime(time);
        } else {
            const time =  moment().format(timeFormat);
            setContractTime(time);
            const date = addDays(new Date(), 1).toLocaleDateString("en-US");
            setPaymentStartDate(date);
        }
    }, [get30MinsAhead, isWhitelisted, setPaymentStartDate]);

    /////////////////////
    // Data management //
    /////////////////////

    // Set an initial date for creating a contract
    useEffect(() => {
        if (!paymentStartDate) {
            const today = new Date().toLocaleDateString("en-US");
            setPaymentStartDate(today);
        }
    }, [paymentStartDate, setPaymentStartDate]);

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
            setSelectedTokenBalanceBn(new BN(0));
            return;
        }

        const timeout = setTimeout(() => {
            const balance = userBalances[selectedToken.address] as number;
            setSelectedTokenBalance(balance);
            const balanceBn = toTokenAmount(balance, selectedToken.decimals);
            setSelectedTokenBalanceBn(new BN(balanceBn.toString()));
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

    // Do unmounting stuff here
    useEffect(() => {
        return () => {
            setContractTime(undefined);
            setPaymentStartDate('');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    ////////////////////////////////////
    // Events, actions and Validation //
    ////////////////////////////////////

    const canShowMaxCta = () => {
        if (tokenBalance && selectedToken) {
            if (selectedToken.address === NATIVE_SOL.address) {
                return tokenBalance > getMinSolBlanceRequired() ? true : false;
            }
            return tokenBalance > 0 ? true : false;
        }
        return false;
    }

    const showDrawer = () => {
        setIsTokenSelectorVisible(true);
        autoFocusInput();
    };

    const hideDrawer = () => {
        setIsTokenSelectorVisible(false);
    };

    const onAccountCreateClick = () => {
        const parsedDate = Date.parse(paymentStartDate as string);
        const startUtc = new Date(parsedDate);
        const shortTime = moment(contractTime, timeFormat).format("HH:mm");
        const to24hTime = moment(shortTime, "HH:mm");
        startUtc.setHours(to24hTime.hours());
        startUtc.setMinutes(to24hTime.minutes());
        startUtc.setSeconds(to24hTime.seconds());
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
            fundingAmount: toTokenAmount(vestingLockFundingAmount, (selectedToken as TokenInfo).decimals, true) as string
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
        if (!selectedToken) { return false; }

        let maxAmount = new BigNumber(0);
        if (selectedToken.address === NATIVE_SOL.address) {
            const amount = getMaxAmount();
            if (amount > 0) {
                maxAmount = new BigNumber(amount);
            }
        } else {
            maxAmount = new BigNumber(tokenBalanceBn.toString());
        }

        const fa = toTokenAmountBn(parseFloat(vestingLockFundingAmount), selectedToken.decimals);
        const fundingAmount = new BigNumber(fa.toString());

        return  publicKey &&
                ((!proposalTitle && !isMultisigContext) || (proposalTitle && isMultisigContext)) &&
                vestingLockName &&
                selectedToken &&
                nativeBalance > 0 && nativeBalance >= getMinSolBlanceRequired() &&
                (!vestingLockFundingAmount || fundingAmount.lte(maxAmount))
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

    const isProposalTitleRequiredAndMissing = () => {
        return selectedMultisig && !proposalTitle ? true : false;
    }

    const isSolLow = () => {
        return !nativeBalance || nativeBalance < getMinSolBlanceRequired() ? true : false;
    }

    const isFundingAmountHigh = () => {
        if (!selectedToken) { return false; }

        let maxAmount = new BigNumber(0);
        if (selectedToken.address === NATIVE_SOL.address) {
            const amount = getMaxAmount();
            if (amount > 0) {
                maxAmount = new BigNumber(amount);
            }
        } else {
            maxAmount = new BigNumber(tokenBalanceBn.toString());
        }
        const fa = toTokenAmountBn(parseFloat(vestingLockFundingAmount), selectedToken.decimals);
        const fundingAmount = new BigNumber(fa.toString());
        return vestingLockFundingAmount && fundingAmount.gt(maxAmount) ? true : false;
    }

    const getStepOneButtonLabel = () => {
        if (!selectedToken) { return false; }

        let maxAmount = new BigNumber(0);
        if (selectedToken.address === NATIVE_SOL.address) {
            const amount = getMaxAmount();
            if (amount > 0) {
                maxAmount = new BigNumber(amount);
            }
        } else {
            maxAmount = new BigNumber(tokenBalanceBn.toString());
        }

        const fa = toTokenAmountBn(parseFloat(vestingLockFundingAmount), selectedToken.decimals);
        const fundingAmount = new BigNumber(fa.toString());

        if (!publicKey) {
            return t('transactions.validation.not-connected');
        } else if (isProposalTitleRequiredAndMissing()) {
            return 'Add a proposal title';
        } else if (!vestingLockName) {
            return 'Add contract name';
        } else if (isSolLow()) {
            return t('transactions.validation.amount-sol-low');
        } else if (!selectedToken) {
            return 'No token selected';
        } else if (vestingLockFundingAmount && fundingAmount.gt(maxAmount)) {
            return t('transactions.validation.amount-high');
        } else {
            return t('transactions.validation.valid-continue');
        }
    }

    const getStepTwoButtonLabel = () => {
        if (!selectedToken) { return false; }

        if (!publicKey) {
            return t('transactions.validation.not-connected');
        } else if (isProposalTitleRequiredAndMissing()) {
            return 'Add a proposal title';
        } else if (!vestingLockName) {
            return 'Add contract name';
        } else if (isSolLow()) {
            return t('transactions.validation.amount-sol-low');
        } else if (!selectedToken) {
            return 'No token selected';
        } else if (isFundingAmountHigh()) {
            return t('transactions.validation.amount-high');
        } else if (!lockPeriodAmount) {
            return 'Set vesting period';
        } else if (!lockPeriodFrequency) {
            return 'Set vesting period';
        } else {
            return t('transactions.validation.valid-continue');
        }
    }

    const getMainCtaLabel = () => {
        if (isBusy) {
            return t('vesting.create-account.create-cta-busy');
        } else if (isError(transactionStatus.currentOperation)) {
            return t('general.retry');
        } else {
            return getStepTwoButtonLabel();
        }
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

    const lockPeriodOptionsMenu = () => {
        const items: ItemType[] = getLockPeriodOptionsFromEnum(PaymentRateType).map((item, index) => {
            return {
                key: `option-${index}`,
                label: (<span onClick={() => handleLockPeriodOptionChange(item.value)}>{item.text}</span>)
            };
        });

        return <Menu items={items} />;
    }

    const vestingCategoriesMenu = () => {
        const items: ItemType[] = VESTING_CATEGORIES.map((item, index) => {
            return {
                key: `${slugify(item.label)}-${item.value}`,
                label: (<span onClick={() => setVestingCategory(item)}>{item.label}</span>)
            };
        });

        return <Menu items={items} />;
    }

    //#region Token selector - render methods

    const getTokenListItemClass = (item: TokenInfo) => {
        return selectedToken?.address === item.address ? "selected" : "simplelink";
    }

    const getSingleTokenResultClass = () => {
        return selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink";
    }

    const renderTokenList = () => {
        return filteredTokenList.map((t, index) => {
            const onClick = function () {
                tokenChanged(t);
                setSelectedToken(t);

                consoleOut("token selected:", t.symbol, 'blue');
                setEffectiveRate(getTokenPriceBySymbol(t.symbol));
                onCloseTokenSelector();
            }

            if (index < MAX_TOKEN_LIST_ITEMS) {
                const balance = connected && userBalances && userBalances[t.address] > 0 ? userBalances[t.address] : 0;
                return (
                    <TokenListItem
                        key={t.address}
                        name={t.name || CUSTOM_TOKEN_NAME}
                        mintAddress={t.address}
                        token={t}
                        className={balance ? getTokenListItemClass(t) : "hidden"}
                        onClick={onClick}
                        balance={balance}
                        showUsdValues={true}
                    />
                );
            } else {
                return null;
            }
        });
    }

    const getSelectedTokenError = () => {
        if (tokenFilter && selectedToken) {
            if (selectedToken.decimals === -1) {
                return 'Account not found';
            } else if (selectedToken.decimals === -2) {
                return 'Account is not a token mint';
            }
        }
        return undefined;
    }

    const getBalanceForTokenFilter = () => {
        return connected && userBalances && userBalances[tokenFilter] > 0
            ? userBalances[tokenFilter]
            : 0;
    }

    const renderTokenSelectorInner = () => {
        return (
            <div className="token-selector-wrapper">
                <div className="token-search-wrapper">
                    <TextInput
                        id="token-search-rp"
                        value={tokenFilter}
                        allowClear={true}
                        extraClass="mb-2"
                        onInputClear={onInputCleared}
                        placeholder={t('token-selector.search-input-placeholder')}
                        error={getSelectedTokenError()}
                        onInputChange={onTokenSearchInputChange} />
                </div>
                <div className="token-list">
                    {renderTokenList()}
                    {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
                        <TokenListItem
                            key={tokenFilter}
                            name={CUSTOM_TOKEN_NAME}
                            mintAddress={tokenFilter}
                            className={getSingleTokenResultClass()}
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
                            balance={getBalanceForTokenFilter()}
                        />
                    )}
                </div>
            </div>
        );
    }

    //#endregion

    const getFormContainerClasses = () => {
        return inModal ? 'scrollable-content pl-5 pr-4 py-2' : 'elastic-form-container';
    }

    const getPanel1Classes = () => {
        return `panel1 ${currentStep === 0 ? 'show' : 'hide'}`;
    }

    const getPanel2Classes = () => {
        return `panel2 ${currentStep === 1 ? 'show' : 'hide'}`;
    }

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
                        <div className="subtitle text-truncate">{shortenAddress(selectedMultisig.id, 8)}</div>
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

    const renderPendingProposals = () => {
        if (inModal) { return null; }
        return(
            <PendingProposalsComponent
                accountAddress={accountAddress}
                extraClasses="no-pointer justify-content-center shift-up-3 mb-2"
                pendingMultisigTxCount={pendingMultisigTxCount}
            />
        );
    }

    const renderProposalTitleField = () => {
        if (isMultisigContext && selectedMultisig) {
            return (
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
            );
        }
        return null;
    }

    const getTokenToVestFormFieldTitle = () => {
        if (isMultisigContext) {
            return t('vesting.create-account.multisig-vesting-contract-token-label');
        } else {
            return t('vesting.create-account.vesting-contract-token-label');
        }
    }

    const renderTokenToVestSelectedItem = () => {
        if (!selectedToken) { return null; }

        return (
            <TokenDisplay onClick={() => inModal ? showDrawer() : showTokenSelector()}
                mintAddress={selectedToken.address}
                name={selectedToken.name}
                showCaretDown={true}
                fullTokenInfo={selectedToken}
            />
        );
    }

    const renderTokenToVestMaxCta = () => {
        if(!isMultisigContext && selectedToken && tokenBalance && canShowMaxCta()) {
            return (
                <div className="token-max simplelink" onClick={() => {
                    if (selectedToken.address === NATIVE_SOL.address) {
                        const amount = getMaxAmount();
                        setVestingLockFundingAmount(cutNumber(amount > 0 ? amount : 0, selectedToken.decimals));
                    } else {
                        setVestingLockFundingAmount(toUiAmount(tokenBalanceBn, selectedToken.decimals));
                    }
                }}>
                    MAX
                </div>
            );
        }
        return null;
    }

    const renderTokenToVestField = () => {
        return (
            <>
                <FormLabelWithIconInfo
                    label={getTokenToVestFormFieldTitle()}
                    tooltipText={t('vesting.create-account.vesting-contract-token-tooltip')}
                />
                <div className="well">
                    <div className="flex-fixed-left">
                        <div className="left">
                            <span className="add-on simplelink">
                                {renderTokenToVestSelectedItem()}
                                {renderTokenToVestMaxCta()}
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

            </>
        );
    }

    const renderContractNameField = () => {
        return (
            <>
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
                                value={vestingLockName} />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const renderMultisigAccount = () => {
        if (isMultisigContext && selectedMultisig) {
            return (
                <>
                    <div className="form-label">Multisig account</div>
                    <div className="well">
                        {renderSelectedMultisig()}
                    </div>
                </>
            );
        }
        return null;
    }

    const renderVestingCategoryField = () => {
        return (
            <>
                <FormLabelWithIconInfo
                    label="Vesting category"
                    tooltipText="This vesting category helps identify the type of streams in this contract. Some examples are seed round, investor, marketing, token lock."
                />
                <div className="well">
                    <Dropdown
                        overlay={vestingCategoriesMenu()}
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
            </>
        );
    }

    const renderVestingPeriodFields = () => {
        return (
            <>
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
            </>
        );
    }

    const renderCommencementDateFields = () => {
        return (
            <>
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
                                defaultValue={get30MinsAhead()}
                                bordered={false}
                                allowClear={false}
                                size="middle"
                                use12Hours
                                format={timeFormat}
                                onChange={onTimePickerChange} />
                        </div>
                    </div>
                </div>
            </>
        );
    }

    const renderCliffReleaseField = () => {
        return (
            <>
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
            </>
        );
    }


    return (
        <>
            <Spin spinning={loadingMultisigAccounts}>

                {renderPendingProposals()}

                <div className={getFormContainerClasses()}>

                    <WizardStepSelector
                        step={currentStep}
                        steps={2}
                        extraClass="px-1 mb-2"
                        onValueSelected={onStepperChange}
                    />

                    <div className={getPanel1Classes()}>

                        <h2 className="form-group-label">{t('vesting.create-account.step-one-label')}</h2>

                        {/* Treasury type */}
                        <div className="items-card-list click-disabled mt-2 mb-3">
                            {renderTreasuryOption(treasuryOption)}
                        </div>

                        {/* Proposal title */}
                        {renderProposalTitleField()}

                        {/* Vesting Contract name */}
                        {renderContractNameField()}

                        {/* Token to vest */}
                        {renderTokenToVestField()}

                        {/* Display Multisig account */}
                        {renderMultisigAccount()}

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

                    <div className={getPanel2Classes()}>

                        <h2 className="form-group-label">{t('vesting.create-account.step-two-label')}</h2>

                        {/* Vesting category */}
                        {renderVestingCategoryField()}

                        {/* Vesting period */}
                        {renderVestingPeriodFields()}

                        {/* Contract commencement date */}
                        {renderCommencementDateFields()}

                        {/* Cliff release */}
                        {renderCliffReleaseField()}

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
                                    {getMainCtaLabel()}
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
                    open={isTokenSelectorVisible}
                    getContainer={false}
                    style={{ position: 'absolute' }}>
                    {renderTokenSelectorInner()}
                </Drawer>
            )}

            {/* Token selection modal */}
            {!inModal && isTokenSelectorModalVisible && (
                <Modal
                    className="mean-modal unpadded-content"
                    open={isTokenSelectorModalVisible}
                    title={<div className="modal-title">{t('token-selector.modal-title')}</div>}
                    onCancel={onCloseTokenSelector}
                    width={450}
                    footer={null}>
                    {renderTokenSelectorInner()}
                </Modal>
            )}
        </>
    );
};
