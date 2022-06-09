import React, { useEffect, useState, useContext, useCallback } from 'react';
import { TokenInfo } from '@solana/spl-token-registry';
import { useConnection } from '../../../../contexts/connection';
import { useWallet } from '../../../../contexts/wallet';
import { AppStateContext } from '../../../../contexts/appstate';
import { cutNumber, fetchAccountTokens, getAmountWithSymbol, getTokenBySymbol, isValidNumber } from '../../../../utils/utils';
import { useAccountsContext, useNativeAccount } from '../../../../contexts/accounts';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { consoleOut, isLocal, isValidAddress, toUsCurrency } from '../../../../utils/ui';
import { confirmationEvents, TxConfirmationInfo } from '../../../../contexts/transaction-status';
import { EventType, OperationType, TransactionStatus } from '../../../../models/enums';
import { AppUsageEvent } from '../../../../utils/segment-service';
import { segmentAnalytics } from '../../../../App';
import { MAX_TOKEN_LIST_ITEMS, MIN_SOL_BALANCE_REQUIRED } from '../../../../constants';
import { TokenListItem } from '../../../../components/TokenListItem';
import { TextInput } from '../../../../components/TextInput';
import { useTranslation } from 'react-i18next';
import { Button, Drawer, Modal } from 'antd';
import { TokenDisplay } from '../../../../components/TokenDisplay';
import { calculateActionFees, MSP_ACTIONS, TransactionFees } from '@mean-dao/msp';
import { NATIVE_SOL } from '../../../../utils/tokens';
import { VESTING_ACCOUNT_TYPE_OPTIONS } from '../../../../constants/treasury-type-options';
import { CheckOutlined } from '@ant-design/icons';
import { TreasuryTypeOption } from '../../../../models/treasuries';
import { FormLabelWithIconInfo } from '../../../../components/FormLabelWithIconInfo';
import { WizardStepSelector } from '../../../../components/WizardStepSelector';
import { isMobile } from 'react-device-detect';
import useWindowSize from '../../../../hooks/useWindowResize';

export const VestingLockCreateAccount = (props: {
    inModal: boolean;
    token?: TokenInfo;
    tokenChanged: any;
}) => {
    const { inModal, token, tokenChanged } = props;
    const { t } = useTranslation('common');
    const connection = useConnection();
    const { connected, publicKey } = useWallet();
    const {
        tokenList,
        userTokens,
        splTokenList,
        loadingPrices,
        previousWalletConnectState,
        getTokenPriceBySymbol,
        setTransactionStatus,
        setEffectiveRate,
        refreshPrices,
    } = useContext(AppStateContext);
    const { account } = useNativeAccount();
    const accounts = useAccountsContext();
    const { width } = useWindowSize();
    const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
    const [userBalances, setUserBalances] = useState<any>();
    const [previousBalance, setPreviousBalance] = useState(account?.lamports);
    const [nativeBalance, setNativeBalance] = useState(0);
    const [tokenFilter, setTokenFilter] = useState("");
    const [filteredTokenList, setFilteredTokenList] = useState<TokenInfo[]>([]);
    const [selectedList, setSelectedList] = useState<TokenInfo[]>([]);
    const [canSubscribe, setCanSubscribe] = useState(true);
    const [isTokenSelectorVisible, setIsTokenSelectorVisible] = useState(false);
    const [selectedToken, setSelectedToken] = useState<TokenInfo | undefined>(undefined);
    const [tokenBalance, setSelectedTokenBalance] = useState<number>(0);
    const [vestingLockName, setVestingLockName] = useState<string>('');
    const [vestingLockFundingAmount, setVestingLockFundingAmount] = useState<string>('');
    const [otpFees, setOtpFees] = useState<TransactionFees>({
        blockchainFee: 0, mspFlatFee: 0, mspPercentFee: 0
    });
    const { treasuryOption, setTreasuryOption } = useContext(AppStateContext);
    const [currentStep, setCurrentStep] = useState(0);

    const resetTransactionStatus = useCallback(() => {

        setTransactionStatus({
            lastOperation: TransactionStatus.Iddle,
            currentOperation: TransactionStatus.Iddle
        });

    }, [
        setTransactionStatus
    ]);

    const recordTxConfirmation = useCallback((signature: string, success = true) => {
        const event = success
            ? AppUsageEvent.CreateStreamingAccountCompleted
            : AppUsageEvent.CreateStreamingAccountFailed;
        segmentAnalytics.recordEvent(event, { signature: signature });
    }, []);

    // Setup event handler for Tx confirmed
    const onTxConfirmed = useCallback((item: TxConfirmationInfo) => {
        consoleOut("onTxConfirmed event executed:", item, 'crimson');
        // setIsBusy(false);
        resetTransactionStatus();
        if (item && item.operationType === OperationType.TreasuryCreate) {
            recordTxConfirmation(item.signature, true);
        }
    }, [
        resetTransactionStatus,
        recordTxConfirmation,
    ]);

    // Setup event handler for Tx confirmation error
    const onTxTimedout = useCallback((item: TxConfirmationInfo) => {
        consoleOut("onTxTimedout event executed:", item, 'crimson');
        if (item && item.operationType === OperationType.TreasuryCreate) {
            recordTxConfirmation(item.signature, false);
        }
        // setIsBusy(false);
        resetTransactionStatus();
    }, [recordTxConfirmation, resetTransactionStatus]);

    // Process inputs
    useEffect(() => {
        if (token && inModal) {
            setSelectedToken(token);
            return;
        } else {
            let from: TokenInfo | undefined = undefined;
            if (token) {
                from = token
                    ? token.symbol === 'SOL'
                        ? getTokenBySymbol('wSOL')
                        : getTokenBySymbol(token.symbol)
                    : getTokenBySymbol('MEAN');

                if (from) {
                    setSelectedToken(from);
                }
            } else {
                from = getTokenBySymbol('MEAN');
                if (from) {
                    setSelectedToken(from);
                }
            }
        }
    }, [token, selectedToken, inModal]);

    // Fees
    useEffect(() => {
        const getTransactionFees = async (): Promise<TransactionFees> => {
            return await calculateActionFees(connection, MSP_ACTIONS.createStreamWithFunds);
        }
        if (!otpFees.mspFlatFee) {
            getTransactionFees().then(values => {
                setOtpFees(values);
                consoleOut("otpFees:", values);
            });
        }
    }, [connection, otpFees]);

    // Keep account balance updated
    useEffect(() => {

        const getAccountBalance = (): number => {
            return (account?.lamports || 0) / LAMPORTS_PER_SOL;
        }

        if (account?.lamports !== previousBalance || !nativeBalance) {
            setNativeBalance(getAccountBalance());
            // Update previous balance
            setPreviousBalance(account?.lamports);
        }
    }, [
        account,
        nativeBalance,
        previousBalance,
    ]);

    // Automatically update all token balances and rebuild token list
    useEffect(() => {

        if (!connection) {
            console.error('No connection');
            return;
        }

        if (!publicKey || !userTokens || !tokenList || !accounts || !accounts.tokenAccounts) {
            return;
        }

        const timeout = setTimeout(() => {

            const balancesMap: any = {};

            fetchAccountTokens(connection, publicKey)
                .then(accTks => {
                    if (accTks) {

                        const meanTokensCopy = new Array<TokenInfo>();
                        const intersectedList = new Array<TokenInfo>();
                        const userTokensCopy = JSON.parse(JSON.stringify(userTokens)) as TokenInfo[];

                        // Build meanTokensCopy including the MeanFi pinned tokens
                        userTokensCopy.forEach(item => {
                            meanTokensCopy.push(item);
                        });

                        // Now add all other items but excluding those in userTokens
                        splTokenList.forEach(item => {
                            if (!userTokens.includes(item)) {
                                meanTokensCopy.push(item);
                            }
                        });

                        // Create a list containing tokens for the user owned token accounts
                        accTks.forEach(item => {
                            balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
                            const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
                            const tokenFromMeanTokensCopy = meanTokensCopy.find(t => t.address === item.parsedInfo.mint);
                            if (tokenFromMeanTokensCopy && !isTokenAccountInTheList) {
                                intersectedList.push(tokenFromMeanTokensCopy);
                            }
                        });

                        intersectedList.unshift(userTokensCopy[0]);
                        balancesMap[userTokensCopy[0].address] = nativeBalance;
                        intersectedList.sort((a, b) => {
                            if ((balancesMap[a.address] || 0) < (balancesMap[b.address] || 0)) {
                                return 1;
                            } else if ((balancesMap[a.address] || 0) > (balancesMap[b.address] || 0)) {
                                return -1;
                            }
                            return 0;
                        });

                        setSelectedList(intersectedList);
                        consoleOut('intersectedList:', intersectedList, 'orange');

                    } else {
                        for (const t of tokenList) {
                            balancesMap[t.address] = 0;
                        }
                        // set the list to the userTokens list
                        setSelectedList(tokenList);
                    }
                })
                .catch(error => {
                    console.error(error);
                    for (const t of tokenList) {
                        balancesMap[t.address] = 0;
                    }
                    setSelectedList(tokenList);
                })
                .finally(() => setUserBalances(balancesMap));

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        accounts,
        publicKey,
        tokenList,
        userTokens,
        connection,
        splTokenList,
        nativeBalance,
    ]);

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

    const getFeeAmount = useCallback(() => {
        return otpFees.blockchainFee + otpFees.mspFlatFee;
    }, [otpFees.blockchainFee, otpFees.mspFlatFee]);

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

    const showDrawer = () => {
        setIsTokenSelectorVisible(true);
        autoFocusInput();
    };

    const hideDrawer = () => {
        setIsTokenSelectorVisible(false);
    };

    const handleVestingLockNameChange = (e: any) => {
        setVestingLockName(e.target.value);
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

    const handleSelection = (option: TreasuryTypeOption) => {
        setTreasuryOption(option);
    }

    const onStepperChange = (value: number) => {
        setCurrentStep(value);
    }

    const onContinueStepOneButtonClick = () => {
        setCurrentStep(1);  // Go to step 2
    }

    const onBackClick = () => {
        setCurrentStep(0);
    }

    // Hook on wallet connect/disconnect
    useEffect(() => {

        if (previousWalletConnectState !== connected) {
            if (!previousWalletConnectState && connected && publicKey) {
                consoleOut('User is connecting...', publicKey.toBase58(), 'green');
            } else if (previousWalletConnectState && !connected) {
                consoleOut('User is disconnecting...', '', 'green');
                setSelectedTokenBalance(0);
                setUserBalances(undefined);
                confirmationEvents.off(EventType.TxConfirmSuccess, onTxConfirmed);
                consoleOut('Unsubscribed from event txConfirmed!', '', 'blue');
                confirmationEvents.off(EventType.TxConfirmTimeout, onTxTimedout);
                consoleOut('Unsubscribed from event onTxTimedout!', '', 'blue');
                setCanSubscribe(true);
            }
        } else if (!connected) {
            setSelectedTokenBalance(0);
        }

        return () => {
            clearTimeout();
        };

    }, [
        connected,
        publicKey,
        previousWalletConnectState,
        setSelectedTokenBalance,
        onTxConfirmed,
        onTxTimedout,
    ]);

    // Reset results when the filter is cleared
    useEffect(() => {
        if (tokenList && tokenList.length && filteredTokenList.length === 0 && !tokenFilter) {
            updateTokenListByFilter(tokenFilter);
        }
    }, [
        tokenList,
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

    // Setup event listeners
    useEffect(() => {
        if (publicKey && canSubscribe) {
            setCanSubscribe(false);
            confirmationEvents.on(EventType.TxConfirmSuccess, onTxConfirmed);
            consoleOut('Subscribed to event txConfirmed with:', 'onTxConfirmed', 'blue');
            confirmationEvents.on(EventType.TxConfirmTimeout, onTxTimedout);
            consoleOut('Subscribed to event txTimedout with:', 'onTxTimedout', 'blue');
        }
    }, [
        publicKey,
        canSubscribe,
        onTxConfirmed,
        onTxTimedout,
    ]);

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
                                name={t.name || 'Unknown'}
                                mintAddress={t.address}
                                token={t}
                                className={balance ? selectedToken && selectedToken.address === t.address ? "selected" : "simplelink" : "hidden"}
                                onClick={onClick}
                                balance={balance}
                                showZeroBalances={true}
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
                    onInputChange={onTokenSearchInputChange} />
            </div>
            <div className="token-list">
                {filteredTokenList.length > 0 && renderTokenList}
                {(tokenFilter && isValidAddress(tokenFilter) && filteredTokenList.length === 0) && (
                    <TokenListItem
                        key={tokenFilter}
                        name="Unknown"
                        mintAddress={tokenFilter}
                        className={selectedToken && selectedToken.address === tokenFilter ? "selected" : "simplelink"}
                        onClick={() => {
                            const uknwnToken: TokenInfo = {
                                address: tokenFilter,
                                name: 'Unknown',
                                chainId: 101,
                                decimals: 6,
                                symbol: '',
                            };
                            setSelectedToken(uknwnToken);
                            consoleOut("token selected:", uknwnToken, 'blue');
                            setEffectiveRate(0);
                            onCloseTokenSelector();
                        }}
                        balance={connected && userBalances && userBalances[tokenFilter] > 0 ? userBalances[tokenFilter] : 0}
                    />
                )}
            </div>
        </div>
    );

    return (
        <>
            {/* {isLocal() && (
                <div className="debug-bar">
                    <span className="ml-1">currentStep:</span><span className="ml-1 font-bold fg-dark-active">{currentStep}</span>
                </div>
            )} */}

            <div className={`${inModal ? 'scrollable-content' : 'elastic-form-container'}`}>

                <WizardStepSelector
                    step={currentStep}
                    steps={2}
                    extraClass="px-1 mb-2"
                    onValueSelected={onStepperChange}
                />

                <div className={`panel1${inModal ? ' p-3' : ''} ${currentStep === 0 ? 'show' : 'hide'}`}>

                    <h2 className="form-group-label">{t('vesting.create-account.step-one-label')}</h2>

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
                    <div className="form-label">{t('vesting.create-account.vesting-contract-token-label')}</div>
                    <div className="well">
                        <div className="flex-fixed-left">
                            <div className="left">
                                <span className="add-on simplelink">
                                    {selectedToken && (
                                        <TokenDisplay onClick={() => inModal ? showDrawer() : showTokenSelector()}
                                            mintAddress={selectedToken.address}
                                            name={selectedToken.name}
                                            showCaretDown={true}
                                            fullTokenInfo={selectedToken}
                                        />
                                    )}
                                    {selectedToken && tokenBalance && tokenBalance > getMinSolBlanceRequired() ? (
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
                            </div>
                        </div>
                        <div className="flex-fixed-right">
                            <div className="left inner-label">
                                <span>{t('transactions.send-amount.label-right')}:</span>
                                <span>
                                    {`${tokenBalance && selectedToken
                                        ? getAmountWithSymbol(tokenBalance, selectedToken.address, true)
                                        : "0"
                                        }`}
                                </span>
                            </div>
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
                        </div>
                        {selectedToken && selectedToken.address === NATIVE_SOL.address && (!tokenBalance || tokenBalance < MIN_SOL_BALANCE_REQUIRED) && (
                            <div className="form-field-error">{t('transactions.validation.minimum-balance-required')}</div>
                        )}
                    </div>

                    {/* Treasury type selector */}
                    <FormLabelWithIconInfo
                        label={t('vesting.create-account.vesting-contract-type-label')}
                        tooltip_text={t('vesting.create-account.vesting-contract-type-tooltip')}
                    />
                    <div className="items-card-list vertical-scroll">
                        {VESTING_ACCOUNT_TYPE_OPTIONS.map((option: TreasuryTypeOption, index) => {
                            return (
                                <div key={`${option.translationId}`} className={
                                    `item-card ${index === VESTING_ACCOUNT_TYPE_OPTIONS.length - 1 ? 'mb-0' : 'mb-1'}${option.type === treasuryOption?.type ? ' selected' : ''}${option.disabled ? ' disabled': ''}`
                                    }
                                    onClick={() => {
                                        if (!option.disabled) {
                                            handleSelection(option);
                                        }
                                    }}>
                                    <div className="checkmark"><CheckOutlined /></div>
                                    <div className="item-meta">
                                        <div className="item-name">{t(`vesting.create-account.vesting-account-type-options.${option.translationId}-name`)}</div>
                                        <div className="item-description">{t(`vesting.create-account.vesting-account-type-options.${option.translationId}-description`)}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* CTA */}
                    <div className="cta-container">
                        <Button
                            type="primary"
                            shape="round"
                            size="small"
                            className="thin-stroke"
                            onClick={onContinueStepOneButtonClick}>
                            Continue
                        </Button>
                    </div>

                </div>

                <div className={`panel1${inModal ? ' p-3' : ''} ${currentStep === 1 ? 'show' : 'hide'}`}>

                    <h2 className="form-group-label">{t('vesting.create-account.step-two-label')}</h2>

                    <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Eum quisquam, similique minus id nisi vitae! Nostrum modi fuga vitae ad laborum impedit! Maiores magnam, molestiae eos, quasi quo saepe quam corporis possimus rerum dolor corrupti cumque in blanditiis! Ab ullam vel aspernatur delectus rerum eaque non tenetur ipsam, alias, soluta consequuntur quidem porro et.</p>

                    <div className="two-column-form-layout">
                        <div className={`left ${inModal || isXsDevice ? 'mb-2' : 'mb-0'}`}>
                            <Button
                                block
                                type="primary"
                                shape="round"
                                size="small"
                                className="thin-stroke"
                                onClick={onBackClick}>
                                Back
                            </Button>
                        </div>
                        <div className="right">
                            <Button
                                block
                                type="primary"
                                shape="round"
                                size="small"
                                className="thin-stroke"
                                onClick={() => {}}>
                                Create vesting contract
                            </Button>
                        </div>
                    </div>
                </div>

            </div>

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
