import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { Button, Divider, Modal, Tooltip } from "antd";
import { TokenInfo } from "@solana/spl-token-registry";
import { getPlatformFeeAccounts, Jupiter, RouteInfo, TOKEN_LIST_URL, TransactionFeeInfo } from "@jup-ag/core";
import useLocalStorage from "../../hooks/useLocalStorage";
import { TOKEN_PROGRAM_ID } from "../../utils/ids";
import { useWallet } from "../../contexts/wallet";
import { consoleOut, getTransactionStatusForLogs, isProd } from "../../utils/ui";
import { getJupiterTokenList } from "../../utils/api";
import { DEFAULT_SLIPPAGE_PERCENT, EXCHANGE_ROUTES_REFRESH_TIMEOUT, MAX_TOKEN_LIST_ITEMS, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { JupiterExchangeInput } from "../../components/JupiterExchangeInput";
import { useNativeAccount, useUserAccounts } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { cutNumber, formatThousands, getTxIxResume, isValidNumber, toTokenAmount, toUiAmount } from "../../utils/utils";
import { AppStateContext } from "../../contexts/appstate";
import { IconSwapFlip } from "../../Icons";
import { SwapSettings } from "../../components/SwapSettings";
import { useTranslation } from "react-i18next";
import { TextInput } from "../../components/TextInput";
import { Identicon } from "../../components/Identicon";
import { JupiterExchangeOutput } from "../../components/JupiterExchangeOutput";
import { InfoCircleOutlined, LoadingOutlined, ReloadOutlined, SyncOutlined, WarningFilled } from "@ant-design/icons";
import { appConfig, customLogger } from "../..";
import BN from 'bn.js';
import "./style.scss";
import { NATIVE_SOL } from "../../utils/tokens";
import { MEAN_TOKEN_LIST, PINNED_TOKENS } from "../../constants/token-list";
import { InfoIcon } from "../../components/InfoIcon";
import { OperationType, TransactionStatus } from "../../models/enums";
import { unwrapSol } from "@mean-dao/hybrid-liquidity-ag";
import { SignerWalletAdapter } from "@solana/wallet-adapter-base";
import { TokenDisplay } from "../../components/TokenDisplay";
import { TransactionStatusContext } from "../../contexts/transaction-status";
import { notify } from "../../utils/notifications";

export const COMMON_EXCHANGE_TOKENS = ['USDC', 'USDT', 'MEAN', 'SOL'];
const MINIMUM_REQUIRED_SOL_BALANCE = 0.05;
let inputDebounceTimeout: any;

export const JupiterExchange = (props: {
    queryFromMint: string | null;
    queryToMint: string | null;
    connection: Connection;
}) => {

    const { t } = useTranslation("common");
    const { publicKey, wallet, connected } = useWallet();
    const { account } = useNativeAccount();
    const { tokenAccounts } = useUserAccounts();
    const [previousBalance, setPreviousBalance] = useState(account?.lamports);
    const [nativeBalance, setNativeBalance] = useState(0);
    const [wSolBalance, setWsolBalance] = useState(0);
    const [userBalances, setUserBalances] = useState<any>();
    const {
        transactionStatus,
        previousWalletConnectState,
        setTransactionStatus,
        refreshPrices,
    } = useContext(AppStateContext);
    const { enqueueTransactionConfirmation } = useContext(TransactionStatusContext);
    const [isBusy, setIsBusy] = useState(false);
    const [isUnwrapping, setIsUnwrapping] = useState(false);
    const [fromMint, setFromMint] = useState<string | undefined>();
    const [toMint, setToMint] = useState<string | undefined>(undefined);
    const [paramsProcessed, setParamsProcessed] = useState(false);
    const [refreshingRoutes, setRefreshingRoutes] = useState(false);
    const [jupiter, setJupiter] = useState<Jupiter | undefined>(undefined);
    const [jupiterReady, setJupiterReady] = useState(false);
    const [slippage, setSlippage] = useLocalStorage('slippage', DEFAULT_SLIPPAGE_PERCENT);
    const [fromAmount, setFromAmount] = useState("");
    const [inputAmount, setInputAmount] = useState(0);
    // The full list, any filtering should be against this one
    const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
    const [mintList, setMintList] = useState<any>({});
    const [possiblePairsTokenInfo, setPossiblePairsTokenInfo] = useState<any>(undefined);
    const [inputToken, setInputToken] = useState<TokenInfo | undefined>(undefined);
    const [outputToken, setOutputToken] = useState<TokenInfo | undefined>(undefined);
    const [routes, setRoutes] = useState<RouteInfo[]>([]);
    const [showFullRoutesList, setShowFullRoutesList] = useState(false);
    const [selectedRoute, setSelectedRoute] = useState<RouteInfo>();
    const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
    const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
    const [showFromMintList, setShowFromMintList] = useState<any>({});
    const [showToMintList, setShowToMintList] = useState<any>({});
    const [tokenFilter, setTokenFilter] = useState("");
    const [minInAmount, setMinInAmount] = useState<number | undefined>(undefined);
    const [minOutAmount, setMinOutAmount] = useState<number | undefined>(undefined);
    const [transactionStartButtonLabel, setTransactionStartButtonLabel] = useState('');
    const [feeInfo, setFeeInfo] = useState<TransactionFeeInfo | undefined>(undefined);
    const [quickTokens, setQuickTokens] = useState<TokenInfo[]>([]);
    const [swapRate, setSwapRate] = useState(false)

    const platformFeesOwner = appConfig.getConfig().exchangeFeeAccountOwner;
    const platformFeeAmount = appConfig.getConfig().exchangeFlatFee;

    const connection = useMemo(() => props.connection, [props.connection]);

    const getPlatformFee = useCallback(async () => {
        consoleOut('platformFeesOwner:', platformFeesOwner, 'green');
        consoleOut('platformFeeAmount:', platformFeeAmount, 'green');
        if (connection) {
            return {
                feeBps: platformFeeAmount * 100,
                feeAccounts: await getPlatformFeeAccounts(
                    connection,
                    new PublicKey(platformFeesOwner)
                )
            };
        } else {
            return undefined;
        }
    }, [
        connection,
        platformFeesOwner,
        platformFeeAmount,
    ]);

    const sol = useMemo(() => {
        return {
            address: NATIVE_SOL.address,
            chainId: 101,
            decimals: NATIVE_SOL.decimals,
            name: NATIVE_SOL.name,
            symbol: NATIVE_SOL.symbol,
            tags: NATIVE_SOL.tags,
            logoURI: NATIVE_SOL.logoURI
        } as TokenInfo;
    }, []);

    const isFromSol = useCallback(() => {
        return fromMint !== undefined && (fromMint === sol.address || fromMint === WRAPPED_SOL_MINT_ADDRESS)
            ? true
            : false;
    }, [
        sol,
        fromMint
    ])

    const isToSol = useCallback(() => {
        return toMint !== undefined && (toMint === sol.address || toMint === WRAPPED_SOL_MINT_ADDRESS)
            ? true
            : false;
    }, [
        sol,
        toMint
    ])

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

    // Keep wSOL balance updated
    useEffect(() => {
        if (!publicKey) { return; }

        let balance = 0;

        if (tokenAccounts && tokenAccounts.length > 0 && tokenList) {
            const wSol = tokenAccounts.findIndex(t => {
                const mint = t.info.mint.toBase58();
                return !t.pubkey.equals(publicKey) && mint === WRAPPED_SOL_MINT_ADDRESS
                    ? true
                    : false;
            });
            if (wSol !== -1) {
                const wSolInfo = tokenAccounts[wSol].info;
                const mint = wSolInfo.mint.toBase58();
                const amount = wSolInfo.amount.toNumber();
                const token = tokenList.find(t => t.address === mint);
                balance = token ? toUiAmount(new BN(amount), token.decimals) : 0;
            }
        }

        setWsolBalance(balance);

    }, [
        publicKey,
        tokenList,
        tokenAccounts,
    ]);

    // Set fromMint & toMint from query string if params are provided
    useEffect(() => {
        if (paramsProcessed) { return; }

        setParamsProcessed(true);

        if (props.queryFromMint || props.queryToMint) {
            if (props.queryFromMint) {
                setFromMint(props.queryFromMint);
            }
            if (props.queryToMint) {
                setToMint(props.queryToMint as string);
            }
        } else if (!props.queryFromMint && !props.queryToMint) {
            const from = MEAN_TOKEN_LIST.filter(t => t.chainId === 101 && t.symbol === 'USDC');
            if (from && from.length) {
                setFromMint(from[0].address);
            }
            const to = MEAN_TOKEN_LIST.filter(t => t.chainId === 101 && t.symbol === 'MEAN');
            if (to && to.length) {
                setToMint(to[0].address);
            }
        }
    }, [
        paramsProcessed,
        props.queryToMint,
        props.queryFromMint
    ]);

    // Fetch token list from Jupiter API
    useEffect(() => {
        const loadJupiterTokenList = async () => {
            try {
                const tokens: TokenInfo[] = await getJupiterTokenList(TOKEN_LIST_URL['mainnet-beta']);
                consoleOut('tokenList:', tokens, 'orange');
                setTokenList(tokens);
            } catch (error) {
                console.error(error);
                setTokenList([]);
            }
        };

        if (!tokenList || tokenList.length === 0) {
            loadJupiterTokenList();
        }
    }, [tokenList]);

    // Get a list of Quick Tokens based on a preferred list of symbols
    useEffect(() => {
        const qt: TokenInfo[] = [];
        COMMON_EXCHANGE_TOKENS.forEach(symbol => {
            const token = tokenList.find(t => t.symbol === symbol);
            if (token) {
                qt.push(token);
            }
        });
        consoleOut('quickTokens:', qt, 'blue');
        setQuickTokens(qt);
    }, [tokenList]);

    // Update all token balances on demmand
    const refreshUserBalances = useCallback(() => {

        if (!connection) {
            return;
        }

        if (!publicKey || !tokenList) {
            return;
        }

        const timeout = setTimeout(() => {

            const balancesMap: any = {};

            const tokenAddressesList = tokenList.map((t: any) => new PublicKey(t.address));

            const error = (_error: any, tl: PublicKey[]) => {
                console.error(_error);
                for (let t of tl) {
                    balancesMap[t.toBase58()] = 0;
                }
            };

            const success = (response: any) => {
                for (let acc of response.value) {
                    const decoded = ACCOUNT_LAYOUT.decode(acc.account.data);
                    const address = decoded.mint.toBase58();
                    const item = tokenList.find(t => t.address === address);

                    if (address === WRAPPED_SOL_MINT_ADDRESS) {
                        balancesMap[address] = nativeBalance;
                    } else {
                        if (item) {
                            balancesMap[address] = decoded.amount.toNumber() / (10 ** item.decimals);
                        } else {
                            balancesMap[address] = 0;
                        }
                    }
                }
                setUserBalances(balancesMap);
            };

            const promise = connection.getTokenAccountsByOwner(
                publicKey, { programId: TOKEN_PROGRAM_ID }
            );

            promise
                .then((response: any) => success(response))
                .catch((_error: any) => error(_error, tokenAddressesList));

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        publicKey,
        tokenList,
        connection,
        nativeBalance,
    ]);

    // Automatically update all token balances
    useEffect(() => {
        if (fromMint && publicKey && account && tokenList) {
            refreshUserBalances();
        }
    }, [
        fromMint,
        tokenList,
        account,
        publicKey,
        refreshUserBalances
    ]);

    /**
     *  Token map for quick lookup.
     *  Every time the balances change rebuild the list of source tokens this way
     * 
     * - create dictionary with items with balances
     *   loop through the mintList verifying against userBalances
     *     add to dictionary if balance > 0 and not already in the list
     * - add items from the pinned list to the dictionary
     *   loop through pinned list
     *     add to dictionary if item not already in the list
     * - add the rest of the items to the dictionary
     *   loop through the mintList (the full list)
     *     add to dictionary if not already added
     */
    useEffect(() => {

        if (!tokenList) { return; }

        const timeout = setTimeout(() => {

            const newList: any = {};

            // First add those with balance
            if (publicKey && userBalances) {

                for (const token of tokenList) {
                    let mint = JSON.parse(JSON.stringify(token));
                    if (mint.logoURI && token.address !== sol.address && userBalances[token.address] > 0) {
                        newList[mint.address] = mint;
                    }
                }

            }

            // Then add tokens from pinned list not already in the dictionary
            MEAN_TOKEN_LIST.filter(t => t.chainId === 101 && PINNED_TOKENS.includes(t.symbol))
                .forEach(item => {
                    if (!newList[item.address]) {
                        newList[item.address] = item;
                    }
                });

            // Add all other tokens
            tokenList.forEach(item => {
                if (!newList[item.address]) {
                    newList[item.address] = item;
                }
            });

            setMintList(newList);
            setShowFromMintList(newList);
            setShowToMintList(undefined);
        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        sol,
        publicKey,
        tokenList,
        userBalances,
    ]);

    // Init the Jupiter instance
    useEffect(() => {

        const initJupiter = async () => {
            return await Jupiter.load({
                connection,
                cluster: "mainnet-beta",
                user: publicKey || undefined,
                // wrapUnwrapSOL: false,
                platformFeeAndAccounts: await getPlatformFee(),
            });
        }

        initJupiter()
            .then(value => {
                consoleOut('Jupiter ->', value);
                setJupiter(value);
            })
            .catch(error => {
                console.error(error);
                setJupiter(undefined);
            });
    }, [
        publicKey,
        connection,
        getPlatformFee
    ]);

    const getPossiblePairsTokenInfo = ({
        tokens,
        routeMap,
        inputToken,
    }: {
        tokens: TokenInfo[];
        routeMap: Map<string, string[]>;
        inputToken?: TokenInfo;
    }) => {

        if (!inputToken) { return {}; }

        const possiblePairs = inputToken
            ? routeMap.get(inputToken.address) || []
            : []; // return an array of token mints that can be swapped with the selected inputToken

        const possiblePairsTokenInfo: { [key: string]: TokenInfo | undefined } = {};
        possiblePairs.forEach((address) => {
            const pick = tokens.find((t) => t.address === address);
            if (pick) {
                possiblePairsTokenInfo[address] = pick;
            }
        });
        return possiblePairsTokenInfo;

    };

    // Calculates the max allowed amount to swap
    // Review the whole MAX amount story. Jupiter seems to always charge 0.05 SOL no matter what.
    const getMaxAllowedSwapAmount = useCallback(() => {

        if (!fromMint || !toMint || !userBalances) {
            return 0;
        }

        let balance = fromMint === WRAPPED_SOL_MINT_ADDRESS
            ? nativeBalance - MINIMUM_REQUIRED_SOL_BALANCE
            : userBalances[fromMint] || 0;

        return balance <= 0 ? 0 : balance;

    }, [
        toMint,
        fromMint,
        userBalances,
        nativeBalance,
    ]);

    // Get routeMap, which maps each tokenMint and their respective tokenMints that are swappable
    // const routeMap = jupiter.getRouteMap();
    const routeMap = useMemo(() => {
        let map = undefined;
        if (jupiter) {
            map = jupiter.getRouteMap();
            consoleOut('routeMap:', map, 'blue');
        }
        return map;
    }, [jupiter]);

    // Establish the inputToken (changing the fromMint is enough to trigger this)
    useEffect(() => {
        if (fromMint) {
            consoleOut('fromMint:', fromMint, 'blue');
            const token = tokenList.find((t) => t.address === fromMint);
            consoleOut('token:', token, 'blue');
            if (token) {
                setInputToken(token);
            }
        }
    }, [
        toMint,
        fromMint,
        tokenList,
        subjectTokenSelection
    ]);

    // Establish the outputToken (changing the toMint is enough to trigger this)
    useEffect(() => {
        if (toMint) {
            consoleOut('toMint:', toMint, 'blue');
            const token = tokenList.find((t) => t.address === toMint);
            consoleOut('token:', token, 'blue');
            if (token) {
                setOutputToken(token);
            }
        }
    }, [
        toMint,
        tokenList,
        subjectTokenSelection
    ]);

    useEffect(() => {
        if (inputToken) {
            consoleOut('inputToken:', inputToken, 'blue');
        }
    }, [
        inputToken
    ]);

    // Find all possible outputToken based on the inputToken
    useEffect(() => {

        if (!routeMap || !tokenList || !inputToken) { return; }

        const getPairs = () => {
            return getPossiblePairsTokenInfo({
                tokens: tokenList,
                routeMap,
                inputToken,
            })
        }
        const pairs = getPairs();
        consoleOut('toMintList:', pairs, 'blue');

        if (pairs) {

            const toList: any = {};

            // First add those with balance
            if (publicKey && userBalances) {
                for (let info of Object.values(pairs)) {
                    let mint = JSON.parse(JSON.stringify(info)) as TokenInfo;
                    if (mint.logoURI && userBalances[mint.address] > 0) {
                        toList[mint.address] = mint;
                    }
                }
            }

            // Then add tokens from pinned list not already in the dictionary
            MEAN_TOKEN_LIST.filter(t => t.chainId === 101 && PINNED_TOKENS.includes(t.symbol))
                .forEach(item => {
                    if (!toList[item.address] && pairs[item.address]) {
                        toList[item.address] = item;
                    }
                });

            // Add all other items
            for (let info of Object.values(pairs)) {
                let mint = JSON.parse(JSON.stringify(info)) as TokenInfo;
                if (mint.logoURI && !toList[mint.address]) {
                    toList[mint.address] = mint;
                }
            }

            setShowToMintList(toList);
            setPossiblePairsTokenInfo(toList);

        } else {

            setPossiblePairsTokenInfo(undefined);
            setShowToMintList(undefined);
        }
    }, [
        toMint,
        routeMap,
        publicKey,
        tokenList,
        inputToken,
        userBalances,
        subjectTokenSelection,
    ]);

    // Get routes on demmand based on input/output tokens, amount and slippage
    // Routes are sorted based on outputAmount, so ideally the first route is the best.
    const refreshRoutes = useCallback(() => {

        const getJupiterRoutes = async ({
            jupiter,
            inputToken,
            outputToken,
            inputAmount,
            slippage,
        }: {
            jupiter: Jupiter;
            inputToken?: TokenInfo;
            outputToken?: TokenInfo;
            inputAmount: number;
            slippage: number;
        }) => {

            if (!inputToken || !outputToken) { return null; }

            console.log("Getting routes");
            const inputAmountLamports = inputToken
                ? Math.round(inputAmount * 10 ** inputToken.decimals)
                : 0; // Lamports based on token decimals
            const routes = inputToken && outputToken
                ?   await jupiter.computeRoutes({
                        inputMint: new PublicKey(inputToken.address),
                        outputMint: new PublicKey(outputToken.address),
                        inputAmount: inputAmountLamports,
                        onlyDirectRoutes: isFromSol() || isToSol(),
                        slippage,
                        forceFetch: true,
                    })
                :   null;

            if (routes && routes.routesInfos) {
                consoleOut('routesInfos:', routes.routesInfos, 'blue');
                if (inputAmount) {
                    setMinInAmount(routes.routesInfos[0].marketInfos[0].minInAmount);
                    setMinOutAmount(routes.routesInfos[0].marketInfos[0].minOutAmount);
                    return routes;
                } else {
                    setMinInAmount(undefined);
                    setMinOutAmount(undefined);
                    return null;
                }
            } else {
                return null;
            }
        };

        if (!jupiter || !inputToken || !outputToken || !slippage) {
            setRefreshingRoutes(false);
            return;
        }

        const getRoutes = async () => {
            return await getJupiterRoutes({
                jupiter,
                inputToken,
                outputToken,
                inputAmount,
                slippage
            });
        }

        if (!inputAmount) {
            setRoutes([]);
            setSelectedRoute(undefined);
            return;
        }

        setRefreshingRoutes(true);
        getRoutes()
            .then(response => {
                const routes = response ? response.routesInfos : [];
                let filteredRoutes: RouteInfo[] = [];
                if (routes.length) {
                    filteredRoutes = routes.filter(r => r.outAmount);
                    setSelectedRoute(filteredRoutes[0]);
                    consoleOut(`Filtered ${filteredRoutes.length} possible routes:`, filteredRoutes, 'blue');
                    consoleOut('Best route:', filteredRoutes[0], 'blue');
                } else {
                    setSelectedRoute(undefined);
                }
                setRoutes(filteredRoutes);
            })
            .catch(error => console.error(error))
            .finally(() => setRefreshingRoutes(false));
    }, [
        jupiter,
        slippage,
        inputToken,
        outputToken,
        inputAmount,
        isFromSol,
        isToSol,
    ]);

    // Automatically get routes
    useEffect(() => {

        if (!jupiter || !inputToken || !outputToken || !slippage) {
            setRefreshingRoutes(false);
            return;
        }

        setRefreshingRoutes(true);
        refreshRoutes();
    }, [
        jupiter,
        slippage,
        inputToken,
        outputToken,
        inputAmount,
        refreshRoutes
    ]);

    // Hook on wallet connect/disconnect
    useEffect(() => {
        if (previousWalletConnectState !== connected) {
            if (!previousWalletConnectState && connected && publicKey) {
                consoleOut('User is connecting...', publicKey.toBase58(), 'green');
            } else if (previousWalletConnectState && !connected) {
                consoleOut('User is disconnecting...', '', 'green');
                setUserBalances(undefined);
            }
        }
    }, [
        connected,
        publicKey,
        previousWalletConnectState,
    ]);

    const isInAmountTooLow = useCallback(() => {
        if (inputToken && inputAmount && minInAmount) {
            const tokenAmount = toTokenAmount(inputAmount, inputToken.decimals);
            return tokenAmount < (minInAmount || 0) ? true : false;
        }
        return false;
    }, [
        inputToken,
        inputAmount,
        minInAmount,
    ]);

    // Updates the label of the Swap button
    useEffect(() => {

        if (!connection) { return; }

        const timeout = setTimeout(() => {

            let label = '';

            if (!jupiterReady) {
                label = 'Loading exchange';
            } else if (!publicKey) {
                label = t('transactions.validation.not-connected');
            } else if (!inputToken || !fromMint || !toMint) {
                label = t('transactions.validation.invalid-exchange');
            } else if (inputAmount === 0) {
                label = t('transactions.validation.no-amount');
            } else if (isInAmountTooLow()) {
                label = t('transactions.validation.minimum-swap-amount', {
                    mintAmount: toUiAmount(new BN(minInAmount || 0), inputToken.decimals),
                    fromMint: inputToken.symbol
                });
            } else if (inputAmount > getMaxAllowedSwapAmount()) {
                label = t('transactions.validation.amount-low');
            } else if (inputAmount > 0 && !selectedRoute && refreshingRoutes) {
                label = t('swap.getting-routes');
            } else if (inputAmount > 0 && !selectedRoute && !refreshingRoutes) {
                label = t('transactions.validation.exchange-unavailable');
            } else {
                label = t('transactions.validation.valid-approve');
            }

            setTransactionStartButtonLabel(label);

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        t,
        toMint,
        fromMint,
        publicKey,
        connection,
        inputToken,
        inputAmount,
        minInAmount,
        jupiterReady,
        selectedRoute,
        refreshingRoutes,
        getMaxAllowedSwapAmount,
        isInAmountTooLow,
    ]);

    // Updates the token list everytime is filtered
    const updateTokenListByFilter = useCallback((searchString?: string) => {

        if (!connection) { return; }

        if (!mintList) { return; }

        const timeout = setTimeout(() => {

            const filter = (t: any) => {
                return (
                    t.symbol.toLowerCase().includes(searchString?.toLowerCase()) ||
                    t.name.toLowerCase().includes(searchString?.toLowerCase())
                );
            };

            if (subjectTokenSelection === 'source') {
                let showFromList = !searchString
                    ? mintList
                    : Object.values(mintList)
                        .filter((t: any) => filter(t));

                setShowFromMintList(showFromList);
            }

            if (subjectTokenSelection === 'destination') {

                let showToList = !searchString
                    ? possiblePairsTokenInfo ? Object.values(possiblePairsTokenInfo).filter(t => t) : {}
                    : possiblePairsTokenInfo ? Object.values(possiblePairsTokenInfo)
                        .filter((t: any) => filter(t)) : {};

                setShowToMintList(showToList);
            }

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        mintList,
        connection,
        possiblePairsTokenInfo,
        subjectTokenSelection,
    ]);

    // Token selection modal
    const showTokenSelector = useCallback(() => {

        const timeout = setTimeout(() => {

            setTokenFilter('');
            updateTokenListByFilter('');
            setTokenSelectorModalVisibility(true);
            const input = document.getElementById("token-search-input");

            if (input) {
                input.focus();
            }

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [updateTokenListByFilter]);

    // Token selection modal close
    const onCloseTokenSelector = useCallback(() => {

        const timeout = setTimeout(() => {
            setTokenFilter('');
            updateTokenListByFilter('');
            setTokenSelectorModalVisibility(false);
        });

        return () => {
            clearTimeout(timeout);
        }

    }, [updateTokenListByFilter]);

    const onInputCleared = useCallback(() => {
        setTokenFilter('');
        updateTokenListByFilter('');
    }, [
        updateTokenListByFilter
    ]);

    const onTokenSearchInputChange = useCallback((e: any) => {

        const input = e.target.value;
        if (input) {
            setTokenFilter(input);
            updateTokenListByFilter(input);
        } else {
            setTokenFilter('');
            updateTokenListByFilter('');
        }

    }, [
        updateTokenListByFilter
    ]);

    // Set fees
    useEffect(() => {
        if (selectedRoute) {
            selectedRoute.getDepositAndFee()
                .then(value => {
                    consoleOut('feeInfo:', value, 'blue');
                    setFeeInfo(value);
                });
        }
    }, [selectedRoute]);

    // Getters

    const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
        return (
            source &&
            destination &&
            source.name === destination.name &&
            source.address === destination.address
        ) ? true : false;
    }

    // Event handling
    const onShowLpListToggled = () => {
        setShowFullRoutesList(value => !value);
    };

    const onSlippageChanged = (value: any) => {
        setSlippage(value);
    };

    const debounceInputOnChange = (value: string) => {
        clearTimeout(inputDebounceTimeout);
        inputDebounceTimeout = setTimeout(() => {
            consoleOut('input ====>', value, 'orange');
            setInputAmount(parseFloat(value));
        }, 500);
    }

    const handleSwapFromAmountChange = useCallback((e: any) => {

        let newValue = e.target.value;

        const splitted = newValue.toString().split('.');
        const left = splitted[0];
        if (left.length > 1) {
          const number = splitted[0] - 0;
          splitted[0] = `${number}`;
          newValue = splitted.join('.');
        }

        if (newValue === null || newValue === undefined || newValue === "") {
            setFromAmount('');
            setInputAmount(0);
        } else if (newValue === '.') {
            setFromAmount('.');
            setInputAmount(0);
        } else if (isValidNumber(newValue)) {
            setFromAmount(newValue);
            debounceInputOnChange(newValue);
        }

    }, []);

    const flipMintsCallback = useCallback(() => {
        if (!toMint) { return; }

        const timeout = setTimeout(() => {
            const oldFrom = fromMint;
            const oldTo = toMint;
            setFromMint(oldTo);
            setSelectedRoute(undefined);
            setRoutes([]);
            setToMint(oldFrom);
            refreshUserBalances();
        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        toMint,
        fromMint,
        refreshUserBalances
    ]);

    // Refresh routes every 30 seconds
    useEffect(() => {
        let timer: any;

        if (jupiter && inputToken && outputToken && slippage && inputAmount) {
            timer = setInterval(() => {
                if (!isBusy) {
                    consoleOut(`Trigger refresh routes after ${EXCHANGE_ROUTES_REFRESH_TIMEOUT / 1000} seconds`);
                    setRefreshingRoutes(true);
                    refreshRoutes();
                }
            }, EXCHANGE_ROUTES_REFRESH_TIMEOUT);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [
        isBusy,
        jupiter,
        slippage,
        inputToken,
        outputToken,
        inputAmount,
        refreshRoutes,
    ]);

    // Set Jupiter ready
    useEffect(() => {
        if (jupiter && routeMap && showToMintList) {
            setJupiterReady(true);
        }
    }, [jupiter, routeMap, showToMintList]);

    const onStartUnwrapTx = async () => {
        let transaction: Transaction;
        let signedTransaction: Transaction;
        let signature: any;
        let encodedTx: string;
        const transactionLog: any[] = [];

        const createTx = async (): Promise<boolean> => {
            if (wallet) {
                setTransactionStatus({
                    lastOperation: TransactionStatus.TransactionStart,
                    currentOperation: TransactionStatus.InitTransaction,
                });

                consoleOut('wrapAmount:', wSolBalance, 'blue')

                // Log input data
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
                    inputs: `wrapAmount: ${wSolBalance}`
                });

                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
                    result: ''
                });

                return await unwrapSol(
                    connection,                 // connection
                    wallet,                     // wallet
                    Keypair.generate(),
                    wSolBalance                 // amount
                )
                    .then((value) => {
                        consoleOut("unwrapSol returned transaction:", value);
                        // Stage 1 completed - The transaction is created and returned
                        setTransactionStatus({
                            lastOperation: TransactionStatus.InitTransactionSuccess,
                            currentOperation: TransactionStatus.SignTransaction,
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
                            result: getTxIxResume(value)
                        });
                        transaction = value;
                        return true;
                    })
                    .catch((error) => {
                        console.error("unwrapSol transaction init error:", error);
                        setTransactionStatus({
                            lastOperation: transactionStatus.currentOperation,
                            currentOperation: TransactionStatus.InitTransactionFailure,
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
                            result: `${error}`
                        });
                        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot start transaction! Wallet not found!'
                });
                customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                return false;
            }
        };

        const signTx = async (): Promise<boolean> => {
            if (wallet) {
                consoleOut("Signing transaction...");
                return await wallet
                    .signTransaction(transaction)
                    .then((signed: Transaction) => {
                        consoleOut("signTransaction returned a signed transaction:", signed);
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
                                result: { signer: `${wallet.publicKey.toBase58()}`, error: `${error}` }
                            });
                            customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                            return false;
                        }
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransactionSuccess,
                            currentOperation: TransactionStatus.SendTransaction,
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
                            result: { signer: wallet.publicKey.toBase58() }
                        });
                        return true;
                    })
                    .catch(error => {
                        console.error("Signing transaction failed!");
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SignTransaction,
                            currentOperation: TransactionStatus.SignTransactionFailure,
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
                            result: { signer: `${wallet.publicKey.toBase58()}`, error: `${error}` }
                        });
                        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                console.error("Cannot sign transaction! Wallet not found!");
                setTransactionStatus({
                    lastOperation: TransactionStatus.SignTransaction,
                    currentOperation: TransactionStatus.WalletNotFound,
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot sign transaction! Wallet not found!'
                });
                customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                return false;
            }
        };

        const sendTx = async (): Promise<boolean> => {
            if (wallet) {
                return await connection
                    .sendEncodedTransaction(encodedTx)
                    .then((sig) => {
                        consoleOut("sendEncodedTransaction returned a signature:", sig);
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SendTransactionSuccess,
                            currentOperation: TransactionStatus.ConfirmTransaction,
                        });
                        signature = sig;
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
                            result: `signature: ${signature}`
                        });
                        return true;
                    })
                    .catch((error) => {
                        console.error(error);
                        setTransactionStatus({
                            lastOperation: TransactionStatus.SendTransaction,
                            currentOperation: TransactionStatus.SendTransactionFailure,
                        });
                        transactionLog.push({
                            action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
                            result: { error, encodedTx }
                        });
                        customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                        return false;
                    });
            } else {
                setTransactionStatus({
                    lastOperation: TransactionStatus.SendTransaction,
                    currentOperation: TransactionStatus.WalletNotFound,
                });
                transactionLog.push({
                    action: getTransactionStatusForLogs(TransactionStatus.WalletNotFound),
                    result: 'Cannot send transaction! Wallet not found!'
                });
                customLogger.logError('Unwrap transaction failed', { transcript: transactionLog });
                return false;
            }
        };

        if (wallet) {
            setIsUnwrapping(true);
            const create = await createTx();
            consoleOut("created:", create);
            if (create) {
                const sign = await signTx();
                consoleOut("signed:", sign);
                if (sign) {
                    const sent = await sendTx();
                    consoleOut("sent:", sent);
                    if (sent) {
                        enqueueTransactionConfirmation({
                            signature: signature,
                            operationType: OperationType.Unwrap,
                            finality: "confirmed",
                            txInfoFetchStatus: "fetching",
                            loadingTitle: 'Confirming transaction',
                            loadingMessage: `Unwrap ${formatThousands(wSolBalance, sol.decimals)} SOL`,
                            completedTitle: 'Transaction confirmed',
                            completedMessage: `Successfully unwrapped ${formatThousands(wSolBalance, sol.decimals)} SOL`
                        });
                        setIsUnwrapping(false);
                        setInputAmount(0);
                        setFromAmount('');
                        setTimeout(() => {
                            refreshUserBalances();
                        });
                    } else {
                        notify({
                            message: t('notifications.error-title'),
                            description: t('notifications.error-sending-transaction'),
                            type: "error"
                        });
                        setIsUnwrapping(false);
                    }
                } else { setIsUnwrapping(false); }
            } else { setIsUnwrapping(false); }
        }
    }

    const onStartSwapTx = useCallback(async () => {
        if (!jupiter || !wallet || !selectedRoute || !publicKey) { return; }

        setIsBusy(true);

        // Prepare execute exchange
        const { execute } = await jupiter.exchange({
            routeInfo: selectedRoute,
        });

        // Execute swap
        const swapResult: any = await execute({
            wallet: wallet as SignerWalletAdapter,
        });

        if (swapResult.error) {
            console.log(swapResult.error);
        } else {
            console.log(`https://explorer.solana.com/tx/${swapResult.txid}`);
            console.log(`inputAddress=${swapResult.inputAddress.toString()} outputAddress=${swapResult.outputAddress.toString()}`);
            console.log(`inputAmount=${swapResult.inputAmount} outputAmount=${swapResult.outputAmount}`);
            setInputAmount(0);
            setFromAmount('');
            refreshUserBalances();
        }

        setIsBusy(false);

    }, [
        wallet,
        jupiter,
        publicKey,
        selectedRoute,
        refreshUserBalances
    ]);

    // Validation

    const isExchangeValid = useCallback((): boolean => {
        let result = true;

        if (!publicKey) {
            result = false;
        } else if (!inputToken || !fromMint || !toMint) {
            result = false;
        } else if (inputAmount === 0) {
            result = false;
        } else if (isInAmountTooLow()) {
            result = false;
        } else if (inputAmount > getMaxAllowedSwapAmount()) {
            result = false;
        } else if (inputAmount > 0 && !selectedRoute) {
            result = false;
        } else {
            result = true;
        }

        return result;
    }, [
        toMint,
        fromMint,
        publicKey,
        inputToken,
        inputAmount,
        selectedRoute,
        isInAmountTooLow,
        getMaxAllowedSwapAmount
    ]);

    // Rendering
    const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
        return (
            <>
                <div className="three-col-info-row">
                    <div className="left text-right">{caption}</div>
                    <div className="middle text-center">{separator}</div>
                    <div className="right text-left">{value}</div>
                </div>
            </>
        );
    };

    // Info items will draw inside the popover
    const txInfoContent = () => {
        return fromMint && toMint && selectedRoute ? (
            <>
                {
                    !refreshingRoutes && inputAmount && feeInfo && feeInfo.minimumSOLForTransaction === feeInfo.signatureFee && infoRow(
                        t('transactions.transaction-info.network-transaction-fee'),
                        `${toUiAmount(new BN(feeInfo.signatureFee), sol.decimals)} SOL`
                    )
                }
                {
                    !refreshingRoutes && inputAmount && feeInfo && feeInfo.minimumSOLForTransaction > feeInfo.signatureFee && infoRow(
                        t('transactions.transaction-info.minimum-sol-for-transaction'),
                        `${toUiAmount(new BN(feeInfo.minimumSOLForTransaction), sol.decimals)} SOL`
                    )
                }
                {
                    !refreshingRoutes && inputAmount && slippage && infoRow(
                        t('transactions.transaction-info.slippage'),
                        `${slippage.toFixed(2)}%`
                    )
                }
                {
                    !refreshingRoutes && inputAmount && selectedRoute && infoRow(
                        t('transactions.transaction-info.price-impact'),
                        selectedRoute.priceImpactPct * 100 < 0.1
                            ? '0.1%'
                            : `${(selectedRoute.priceImpactPct * 100).toFixed(4)}%`,
                        selectedRoute.priceImpactPct * 100 < 0.1 ? '<' : '≈'
                    )
                }
                {
                    !refreshingRoutes && inputAmount && outputToken && infoRow(
                        t('transactions.transaction-info.minimum-received'),
                        `${formatThousands(
                            selectedRoute?.outAmountWithSlippage /
                              10 ** outputToken.decimals || 1,
                            outputToken.decimals
                        )} ${outputToken.symbol}`
                    )
                }
            </>
        ) : null;
    }

    const renderCommonTokens = () => {
        return quickTokens.map((token: TokenInfo, index: number) => {
            const onClick = () => {
                if (subjectTokenSelection === "source") {
                    if (!fromMint || fromMint !== token.address) {
                        setFromMint(token.address);
                        consoleOut('fromMint:', token.address, 'blue');
                        const selectedToken = showFromMintList[token.address];
                        consoleOut('selectedToken:', selectedToken, 'blue');
                        if (selectedToken) {
                            refreshUserBalances();
                        }
                    }
                    onCloseTokenSelector();
                } else {
                    if (!toMint || toMint !== token.address) {
                        setToMint(token.address);
                        consoleOut('toMint:', token.address, 'blue');
                        const selectedToken = showToMintList[token.address] as TokenInfo;
                        consoleOut('selectedToken:', selectedToken, 'blue');
                        if (selectedToken) {
                            setOutputToken(selectedToken);
                            refreshUserBalances();
                        }
                    }
                    onCloseTokenSelector();
                }
            };

            return (
                <Button
                    key={`${index}`}
                    type="ghost"
                    shape="round"
                    size="small"
                    onClick={onClick}
                    className="no-stroke">
                    {token.address === WRAPPED_SOL_MINT_ADDRESS ? (
                        <TokenDisplay className="inherit-font" mintAddress={token.address} symbol="SOL" onClick={() => { }} />
                    ) : (
                        <TokenDisplay className="inherit-font" mintAddress={token.address} onClick={() => { }} />
                    )}
                </Button>
            );
        })
    }

    const renderSourceTokenList = (
        <>
            {showFromMintList && Object.values(showFromMintList).length ? (
                Object.values(showFromMintList).map((token: any, index) => {
                    const onClick = () => {
                        if (!fromMint || fromMint !== token.address) {
                            setFromMint(token.address);
                            consoleOut('fromMint:', token.address, 'blue');
                            const selectedToken = showFromMintList[token.address];
                            consoleOut('selectedToken:', selectedToken, 'blue');
                            if (selectedToken) {
                                refreshUserBalances();
                            }
                        }
                        onCloseTokenSelector();
                    };

                    if (index < MAX_TOKEN_LIST_ITEMS) {
                        return (
                            <div
                                key={index + 100}
                                onClick={onClick}
                                className={`token-item ${fromMint && fromMint === token.address
                                    ? "selected"
                                    : areSameTokens(
                                        token,
                                        toMint ? showFromMintList[toMint] : undefined
                                    )
                                        ? "disabled"
                                        : "simplelink"
                                    }`}>
                                <div className="token-icon">
                                    {token.logoURI ? (
                                        <img
                                            alt={`${token.name}`}
                                            width={24}
                                            height={24}
                                            src={token.logoURI}
                                        />
                                    ) : (
                                        <Identicon
                                            address={token.address}
                                            style={{ width: "24", display: "inline-flex" }}
                                        />
                                    )}
                                </div>
                                <div className="token-description">
                                    <div className="token-symbol">{token.address === WRAPPED_SOL_MINT_ADDRESS ? 'SOL' : token.symbol}</div>
                                    <div className="token-name m-0">{token.address === WRAPPED_SOL_MINT_ADDRESS ? 'Solana' : token.name}</div>
                                </div>
                                <div className="token-balance">
                                    {
                                        publicKey &&
                                        userBalances &&
                                        mintList[token.address] &&
                                        userBalances[token.address] ?
                                        (token.address === WRAPPED_SOL_MINT_ADDRESS
                                            ? formatThousands(nativeBalance, mintList[token.address].decimals)
                                            : formatThousands(userBalances[token.address], mintList[token.address].decimals))
                                        : (<span>&nbsp;</span>)
                                    }
                                </div>
                            </div>
                        );
                    } else {
                        return null;
                    }
                })
            ) : (
                <p>{t('token-selector.no-matches')}</p>
            )}
        </>
    );

    const renderDestinationTokenList = (
        <>
            {showToMintList && Object.values(showToMintList).length ? (
                Object.values(showToMintList).map((token: any, index) => {
                    const onClick = () => {
                        if (!toMint || toMint !== token.address) {
                            setToMint(token.address);
                            consoleOut('toMint:', token.address, 'blue');
                            const selectedToken = showToMintList[token.address] as TokenInfo;
                            consoleOut('selectedToken:', selectedToken, 'blue');
                            if (selectedToken) {
                                refreshUserBalances();
                            }
                        }
                        onCloseTokenSelector();
                    };

                    if (index < MAX_TOKEN_LIST_ITEMS) {
                        return (
                            <div
                                key={index + 100}
                                onClick={onClick}
                                className={`token-item ${toMint && toMint === token.address
                                    ? "selected"
                                    : areSameTokens(token, (fromMint ? showToMintList[fromMint] : undefined))
                                        ? 'disabled'
                                        : "simplelink"
                                    }`}>
                                <div className="token-icon">
                                    {token.logoURI ? (
                                        <img
                                            alt={`${token.name}`}
                                            width={24}
                                            height={24}
                                            src={token.logoURI}
                                        />
                                    ) : (
                                        <Identicon
                                            address={token.address}
                                            style={{ width: "24", display: "inline-flex" }}
                                        />
                                    )}
                                </div>
                                <div className="token-description">
                                    <div className="token-symbol">{token.address === WRAPPED_SOL_MINT_ADDRESS ? 'SOL' : token.symbol}</div>
                                    <div className="token-name m-0">{token.address === WRAPPED_SOL_MINT_ADDRESS ? 'Solana' : token.name}</div>
                                </div>
                                <div className="token-balance">
                                    {
                                        publicKey &&
                                        userBalances &&
                                        mintList[token.address] &&
                                        userBalances[token.address] ?
                                        (token.address === WRAPPED_SOL_MINT_ADDRESS
                                            ? formatThousands(nativeBalance, mintList[token.address].decimals)
                                            : formatThousands(userBalances[token.address], mintList[token.address].decimals))
                                        : (<span>&nbsp;</span>)
                                    }
                                </div>
                            </div>
                        );
                    } else {
                        return null;
                    }
                })
            ) : (
                <p>{t('token-selector.no-matches')}</p>
            )}
        </>
    );

    return (
        <>
            {/* {isLocal() && (
                <div className="debug-bar">
                    <span className="ml-1">feeInfo:</span><span className="ml-1 font-bold fg-dark-active">{feeInfo ? feeInfo.signatureFee : '-'}</span>
                    <span className="ml-1">minInAmount:</span><span className="ml-1 font-bold fg-dark-active">{minInAmount || '-'}</span>
                    <span className="ml-1">minOutAmount:</span><span className="ml-1 font-bold fg-dark-active">{minOutAmount || '-'}</span>
                </div>
            )} */}

            {wSolBalance > 0 && (
                <div className="swap-wrapper">
                    <div className="well mb-1">
                        <div className="flex-fixed-right align-items-center">
                            <div className="left">You have {formatThousands(wSolBalance, sol.decimals)} <strong>wrapped SOL</strong> in your wallet. Click to unwrap to native SOL.</div>
                            <div className="right">
                                <Button
                                    type="primary"
                                    shape="round"
                                    disabled={isUnwrapping}
                                    onClick={onStartUnwrapTx}
                                    size="small">
                                    {isUnwrapping ? 'Unwrapping SOL' : 'Unwrap SOL'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="swap-wrapper">

                {/* Source token / amount */}
                {fromMint && (
                    <JupiterExchangeInput
                        token={inputToken}
                        tokenBalance={
                            userBalances &&
                                mintList[fromMint]
                                ? (mintList[fromMint] as TokenInfo).address === WRAPPED_SOL_MINT_ADDRESS
                                    ? nativeBalance > 0
                                        ? nativeBalance.toFixed(mintList[fromMint].decimals)
                                        : ''
                                    : parseFloat(userBalances[fromMint]) > 0
                                        ? parseFloat(userBalances[fromMint]).toFixed(mintList[fromMint].decimals)
                                        : ''
                                : ''
                        }
                        tokenAmount={fromAmount}
                        onInputChange={handleSwapFromAmountChange}
                        onMaxAmount={
                            () => {
                                const maxFromAmount = getMaxAllowedSwapAmount();
                                console.log('maxFromAmount', maxFromAmount);
                                if (toMint && mintList[fromMint] && maxFromAmount > 0) {
                                    setInputAmount(maxFromAmount);
                                    const formattedAmount = cutNumber(maxFromAmount, mintList[fromMint].decimals);
                                    setFromAmount(formattedAmount);
                                }
                            }
                        }
                        onSelectToken={() => {
                            setSubjectTokenSelection("source");
                            showTokenSelector();
                        }}
                        hint={
                            inputToken && inputToken.address === WRAPPED_SOL_MINT_ADDRESS
                                ? 'We recommend having at least 0.05 SOL for any transaction'
                                : ''
                        }
                        className="mb-0"
                        disabled={!jupiterReady}
                        onPriceClick={() => refreshPrices()}
                        onBalanceClick={() => refreshUserBalances()}
                    />
                )}

                {(inputToken && outputToken && inputAmount && isInAmountTooLow()) ? (
                    <div className="input-amount-too-low flex-row flex-center">
                        <InfoCircleOutlined className="font-size-75" />
                        <span>Minimum swap is at least {toUiAmount(new BN(minInAmount || 0), inputToken.decimals)} {inputToken.symbol} for {toUiAmount(new BN(minOutAmount || 0), outputToken.decimals)} {outputToken.symbol}</span>
                    </div>
                ) : null}

                <div className="flip-button-container">
                    {/* Flip button */}
                    <div className="flip-button" onClick={flipMintsCallback}>
                        <IconSwapFlip className="mean-svg-icons" />
                    </div>
                    {/* Settings icon */}
                    <span className="flex-fixed-right flex align-items-center pl-3 pr-3">
                        <div className="left flex-row text-left align-items-center">
                            {
                                inputToken && outputToken && selectedRoute && selectedRoute.outAmount ? (
                                    <>
                                        <span className="simplelink underline-on-hover" onClick={() => setSwapRate(!swapRate)}>
                                            {swapRate ? (
                                                <>
                                                    1 {inputToken.symbol} ≈{' '}
                                                    {(toUiAmount(new BN(selectedRoute.outAmount), outputToken.decimals) / inputAmount).toFixed(outputToken.decimals)}
                                                    {' '}
                                                    {outputToken.symbol}
                                                </>
                                            ) : (
                                                <>
                                                    1 {outputToken.symbol} ≈{' '}
                                                    {(inputAmount / toUiAmount(new BN(selectedRoute.outAmount), outputToken.decimals)).toFixed(outputToken.decimals)}
                                                    {' '}
                                                    {inputToken.symbol}
                                                </>
                                            )}
                                        </span>
                                        {fromAmount && (
                                            <InfoIcon content={txInfoContent()} placement="bottom">
                                                <InfoCircleOutlined style={{ lineHeight: 0 }} />
                                            </InfoIcon>
                                        )}
                                        {/* Refresh routes */}
                                        <span className="icon-button-container">
                                            {refreshingRoutes || isBusy ? (
                                                <span className="icon-container"><SyncOutlined spin /></span>
                                            ) : (
                                                <Tooltip placement="bottom" title="Refresh routes">
                                                    <Button
                                                        type="default"
                                                        shape="circle"
                                                        size="small"
                                                        icon={<ReloadOutlined />}
                                                        onClick={() => {
                                                            setRefreshingRoutes(true);
                                                            refreshRoutes();
                                                        }}
                                                    />
                                                </Tooltip>
                                            )}
                                        </span>
                                    </>
                                ) : (<span>&nbsp;</span>)
                            }
                        </div>
                        <div className="right">
                            <SwapSettings
                                currentValue={slippage}
                                onValueSelected={onSlippageChanged}
                            />
                        </div>
                    </span>
                </div>

                {fromMint && (
                    <JupiterExchangeOutput
                        fromToken={inputToken || undefined}
                        fromTokenAmount={fromAmount}
                        toToken={outputToken || undefined}
                        toTokenBalance={
                            publicKey &&
                                toMint &&
                                userBalances &&
                                mintList[toMint]
                                ? (mintList[toMint] as TokenInfo).address === WRAPPED_SOL_MINT_ADDRESS
                                    ? nativeBalance > 0
                                        ? nativeBalance.toFixed(mintList[toMint].decimals)
                                        : ''
                                    : parseFloat(userBalances[toMint]) > 0
                                        ? parseFloat(userBalances[toMint]).toFixed(mintList[toMint].decimals)
                                        : ''
                                : ''
                        }
                        toTokenAmount={isFromSol()
                            ? fromAmount
                            : selectedRoute && outputToken
                                ? toUiAmount(new BN(selectedRoute.outAmount), outputToken.decimals).toFixed(outputToken.decimals)
                                : ''
                        }
                        mintList={mintList}
                        onBalanceClick={() => refreshUserBalances()}
                        onSelectToken={() => {
                            setSubjectTokenSelection("destination");
                            showTokenSelector();
                        }}
                        className="mb-2"
                        routes={routes}
                        onSelectedRoute={(route: any) => {
                            consoleOut('onSelectedRoute:', route, 'blue');
                            setSelectedRoute(route);
                        }}
                        isBusy={isBusy || refreshingRoutes || !jupiterReady}
                        showAllRoutes={showFullRoutesList}
                        onToggleShowFullRouteList={onShowLpListToggled}
                    />

                )}

                {/* Action button */}
                <Button
                    className={`main-cta ${isBusy ? 'inactive' : ''}`}
                    block
                    type="primary"
                    shape="round"
                    size="large"
                    onClick={onStartSwapTx}
                    disabled={
                        !isExchangeValid() ||
                        !isProd() ||
                        refreshingRoutes
                    }>
                    {isBusy && (
                        <span className="mr-1"><LoadingOutlined style={{ fontSize: '16px' }} /></span>
                    )}
                    {isBusy
                        ? 'Swapping'
                        : transactionStartButtonLabel
                    }
                </Button>

                {/* Warning */}
                {!isProd() && (
                    <div className="notifications">
                        <div data-show="true" className="ant-alert ant-alert-warning" role="alert">
                            <span role="img" aria-label="exclamation-circle" className="anticon anticon-exclamation-circle ant-alert-icon">
                                <WarningFilled />
                            </span>
                            <div className="ant-alert-content">
                                <div className="ant-alert-message">
                                    {t('swap.exchange-warning')}&nbsp;
                                    <a className="primary-link" href={`${appConfig.getConfig('production').appUrl}/exchange`} target="_blank" rel="noopener noreferrer">MAINNET</a>
                                    <span className="ml-1">(<a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer"
                                        href="https://docs.meanfi.com/tutorials/faq#why-is-the-mean-exchange-not-available-to-test-in-devnet">Why?</a>)</span>
                                </div>
                                <div className="ant-alert-description"></div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Token selection modal */}
            <Modal
                className="mean-modal unpadded-content"
                visible={isTokenSelectorModalVisible}
                title={
                    <div className="modal-title">{t('token-selector.modal-title')}</div>
                }
                onCancel={onCloseTokenSelector}
                width={420}
                footer={null}>
                <div className="token-selector-wrapper">
                    <div className="token-search-wrapper">
                        <TextInput
                            value={tokenFilter}
                            allowClear={true}
                            extraClass="mb-1"
                            onInputClear={onInputCleared}
                            placeholder={t('token-selector.exchange-search-input-placeholder')}
                            onInputChange={onTokenSearchInputChange} />
                    </div>
                    <div className="common-token-shortcuts">
                        {renderCommonTokens()}
                    </div>
                    <Divider />
                    <div className="token-list vertical-scroll">
                        {subjectTokenSelection === "source"
                            ? renderSourceTokenList
                            : renderDestinationTokenList}
                    </div>
                </div>
            </Modal>

        </>
    );
};
