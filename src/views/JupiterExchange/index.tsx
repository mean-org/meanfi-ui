import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Button, Col, Modal, Row, Spin } from "antd";
import { TokenInfo } from "@solana/spl-token-registry";
import { Jupiter, RouteInfo, TOKEN_LIST_URL, TransactionFeeInfo } from "@jup-ag/core";
import useLocalStorage from "../../hooks/useLocalStorage";
import { NATIVE_SOL_MINT, TOKEN_PROGRAM_ID, WRAPPED_SOL_MINT } from "../../utils/ids";
import { useWallet } from "../../contexts/wallet";
import { consoleOut, isLocal } from "../../utils/ui";
import { getJupiterTokenList } from "../../utils/api";
import { DEFAULT_SLIPPAGE_PERCENT, EXCHANGE_ROUTES_REFRESH_TIMEOUT, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { JupiterExchangeInput } from "../../components/JupiterExchangeInput";
import { useNativeAccount } from "../../contexts/accounts";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { formatAmount, isValidNumber } from "../../utils/utils";
import { AppStateContext } from "../../contexts/appstate";
import { IconSwapFlip } from "../../Icons";
import { SwapSettings } from "../../components/SwapSettings";
import { useTranslation } from "react-i18next";
import { TextInput } from "../../components/TextInput";
import { Identicon } from "../../components/Identicon";
import { JupiterExchangeOutput } from "../../components/JupiterExchangeOutput";
import { InfoCircleOutlined } from "@ant-design/icons";
import { appConfig } from "../..";
import BN from 'bn.js';
import "./style.less";
import { NATIVE_SOL } from "../../utils/tokens";
import { MEAN_TOKEN_LIST } from "../../constants/token-list";
import { InfoIcon } from "../../components/InfoIcon";

export const JupiterExchange = (props: {
    queryFromMint: string | null;
    queryToMint: string | null;
    connection: Connection;
}) => {

    const { t } = useTranslation("common");
    const { publicKey } = useWallet();
    const { account } = useNativeAccount();
    const [userBalances, setUserBalances] = useState<any>();
    const {
        coinPrices,
        refreshPrices,
    } = useContext(AppStateContext);
    const [lastFromMint, setLastFromMint] = useLocalStorage('lastFromToken', NATIVE_SOL_MINT.toBase58());
    const [fromMint, setFromMint] = useState<string | undefined>(lastFromMint);
    const [toMint, setToMint] = useState<string | undefined>(undefined);
    const [paramsProcessed, setParamsProcessed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [jupiter, setJupiter] = useState<Jupiter | undefined>(undefined);
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
    const [showRoutesList, setShowRoutesList] = useState(false);
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

    const platformFeesOwner = appConfig.getConfig().exchangeFeeAccountOwner;
    const platformFeeAmount = appConfig.getConfig().exchangeFlatFee;

    const connection = useMemo(() => props.connection, [props.connection]);

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
    },[]);

    // Set fromMint & toMint from query string if params are provided
    useEffect(() => {
        if (paramsProcessed || !props.queryFromMint || !props.queryToMint) { return; }

        if (props.queryFromMint) {
            setFromMint(props.queryFromMint);
            setLastFromMint(props.queryFromMint);
            if (props.queryToMint) {
                setToMint(props.queryToMint as string);
            }
            setParamsProcessed(true);
        }
    },[
        paramsProcessed,
        props.queryToMint,
        props.queryFromMint,
        setLastFromMint
    ]);

    const fromNative = useCallback(() => {
        return fromMint !== undefined && fromMint === NATIVE_SOL_MINT.toBase58() ? true : false;
    },[fromMint])

    const isWrap = useCallback(() => {

        return (
            fromMint !== undefined &&
            toMint !== undefined &&
            fromMint === NATIVE_SOL_MINT.toBase58() && 
            toMint === WRAPPED_SOL_MINT.toBase58()
        ) ? true : false;
    
    },[
        fromMint, 
        toMint
    ])

    const isUnwrap = useCallback(() => {
    
        return (
            fromMint !== undefined &&
            toMint !== undefined &&
            fromMint === WRAPPED_SOL_MINT.toBase58() && 
            toMint === NATIVE_SOL_MINT.toBase58()
        ) ? true : false;
    
    },[
        fromMint, 
        toMint
    ])

    // Fetch token list from Jupiter API
    const loadJupiterTokenList = useCallback(async () => {
        try {
            const tokens: TokenInfo[] = await getJupiterTokenList(TOKEN_LIST_URL['mainnet-beta']);
            if (tokens && tokens.length) {
                tokens.unshift(sol);
                const itemIndex = tokens.findIndex(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
                const modifiedWsol = MEAN_TOKEN_LIST.filter(t => t.chainId === 101 && t.address === WRAPPED_SOL_MINT_ADDRESS);
                if (itemIndex !== -1 && modifiedWsol && modifiedWsol.length) {
                    tokens.splice(itemIndex, 1, modifiedWsol[0]);
                }
                setTokenList(tokens);
                consoleOut("tokens from Jupiter API:", tokens, 'blue');
            }
        } catch (error) {
            console.error(error);
            setTokenList([]);
        }
    },[sol]);

    // Load token list from Jupiter API
    useEffect(() => {
        if (!tokenList || tokenList.length === 0) {
            loadJupiterTokenList();
        }
    }, [
        tokenList,
        loadJupiterTokenList
    ]);

    // Token map for quick lookup.
    useEffect(() => {

        if (!tokenList) { return; }

        const timeout = setTimeout(() => {

            const list: any = { };

            for (let info of tokenList) {
                let mint = JSON.parse(JSON.stringify(info));
                if (mint.logoURI) {
                    list[mint.address] = mint;
                }
            }

            setMintList(list);
            setShowFromMintList(list);
            setShowToMintList(undefined);
        });

        return () => {
            clearTimeout(timeout);
        }

    }, [tokenList]);

    // Init the Jupiter instance
    useEffect(() => {

        const initJupiter = async () => {
            return await Jupiter.load({
                connection,
                cluster: "mainnet-beta",
                user: publicKey || undefined
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
        try {
            if (!inputToken) {
                return {};
            }
      
            const possiblePairs = inputToken
                ? routeMap.get(inputToken.address) || []
                : []; // return an array of token mints that can be swapped with SOL
            const possiblePairsTokenInfo: { [key: string]: TokenInfo | undefined } = {};
                possiblePairs.forEach((address) => {
                    const pick = tokens.find((t) => t.address === address);
                    if (pick) {
                        possiblePairsTokenInfo[address] = pick;
                    }
            });
            // Perform your conditionals here to use other outputToken
            // const alternativeOutputToken = possiblePairsTokenInfo[USDT_MINT_ADDRESS]
            return possiblePairsTokenInfo;
        } catch (error) {
            throw error;
        }
    };

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
        try {
            if (!inputToken || !outputToken) {
                return null;
            }

            console.log("Getting routes");
            const inputAmountLamports = inputToken
                ? Math.round(inputAmount * 10 ** inputToken.decimals)
                : 0; // Lamports based on token decimals
            const routes = inputToken && outputToken
                ? (await jupiter.computeRoutes(
                    new PublicKey(inputToken.address),
                    new PublicKey(outputToken.address),
                    inputAmountLamports,
                    slippage,
                    true
                ))
                : null;

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
        } catch (error) {
            throw error;
        }
    };

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

            balancesMap[NATIVE_SOL_MINT.toBase58()] = account ? (account.lamports / LAMPORTS_PER_SOL) : 0;

            const tokens = Object.values(mintList)
                .filter((t: any) => t.symbol !== 'SOL')
                .map((t: any) => new PublicKey(t.address));

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

                    if (mintList[address]) {
                        balancesMap[address] = decoded.amount.toNumber() / (10 ** mintList[address].decimals);
                    } else {
                        balancesMap[address] = 0;
                    }
                }
                setUserBalances(balancesMap);
            };

            const promise = connection.getTokenAccountsByOwner(
                publicKey, { programId: TOKEN_PROGRAM_ID }
            );

            promise
                .then((response: any) => success(response))
                .catch((_error: any) => error(_error, tokens));

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        tokenList,
        account,
        mintList,
        publicKey,
        connection,
    ]);

    const isValidBalance = useCallback(() => {

        if (!connection || !publicKey || !fromMint || !userBalances || !feeInfo) {
          return false;
        }

        let valid = false;
        let balance = userBalances[NATIVE_SOL_MINT.toBase58()];

        valid = balance >= feeInfo.signatureFee;

        // TODO: I need to ask
        // if (isWrap() || fromMint !== NATIVE_SOL_MINT.toBase58()) {
        //   valid = balance >= networkFee;
        // } else {
        //   valid = balance >= (platformFee + networkFee);
        // }

        return valid;

    }, [
        feeInfo,
        fromMint,
        publicKey,
        connection,
        userBalances,
    ]);

    // Calculates the max allowed amount to swap
    const getMaxAllowedSwapAmount = useCallback(() => {

        if (!fromMint || !toMint || !userBalances || !feeInfo) {
            return 0;
        }

        let maxAmount = 0;
        let balance = parseFloat(userBalances[fromMint]);

        if (fromMint === sol.address) {
            maxAmount = balance - 0.05;
        } else {
            maxAmount = balance;
        }

        return maxAmount < 0 ? 0 : maxAmount;

    }, [
        sol,
        toMint,
        feeInfo,
        fromMint,
        userBalances
    ]);

    // Automatically update all token balances
    useEffect(() => {
        if (fromMint && publicKey && mintList && account && tokenList) {
            refreshUserBalances();
        }
    }, [
        fromMint,
        tokenList,
        account,
        mintList,
        publicKey,
        refreshUserBalances
    ]);

    // Get routeMap, which maps each tokenMint and their respective tokenMints that are swappable
    // const routeMap = jupiter.getRouteMap();
    const routeMap =  useMemo(() => {
        let map = undefined;
        if (jupiter) {
            map = jupiter.getRouteMap();
        }
        consoleOut('routeMap:', map, 'blue');
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
            if (fromNative()) {
                const toToken = tokenList.find((t) => t.address === WRAPPED_SOL_MINT_ADDRESS);
                if (toToken) {
                    setToMint(WRAPPED_SOL_MINT_ADDRESS);
                    setOutputToken(toToken);
                    setSelectedRoute(undefined);
                }
            }
        }
    }, [
        fromMint,
        tokenList,
        fromNative
    ]);

    // Establish the outputToken (changing the toMint is enough to trigger this)
    useEffect(() => {
        if (toMint) {
            consoleOut('toMint:', toMint, 'blue');
            const token = tokenList.find((t) => t.address === toMint);
            consoleOut('token:', token, 'blue');
            if (token) {
                setOutputToken(token);
                if (token.address === sol.address) {
                    setSelectedRoute(undefined);
                }
            }
        }
    }, [
        sol,
        toMint,
        tokenList
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

        setRefreshing(true);

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
            if (inputToken.address === WRAPPED_SOL_MINT_ADDRESS) {
                const list: any = { };
                list[sol.address] = sol;
                for (let info of Object.values(pairs)) {
                    let mint = JSON.parse(JSON.stringify(info));
                    if (mint.logoURI) {
                        list[mint.address] = mint;
                    }
                }
                setShowToMintList(list);
                setPossiblePairsTokenInfo(list);
            } else {
                setShowToMintList(pairs);
                setPossiblePairsTokenInfo(pairs);
            }
        } else {
            setPossiblePairsTokenInfo(undefined);
            if (fromNative()) {
                setOutputToken(sol);
                setSelectedRoute(undefined);
            }
            setShowToMintList(undefined);
        }
    }, [
        sol,
        routeMap,
        tokenList,
        inputToken,
        fromNative
    ]);

    // Get routes on demmand based on input/output tokens, amount and slippage
    // Routes are sorted based on outputAmount, so ideally the first route is the best.
    const refreshRoutes = useCallback(() => {

        if (!jupiter || !inputToken || !outputToken || !slippage) {
            setRefreshing(false);
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

        setRefreshing(true);
        getRoutes()
            .then(response => {
                const routes = response ? response.routesInfos : [];
                let filteredRoutes: RouteInfo[] = [];
                if (routes.length) {
                    filteredRoutes = routes.filter(r => r.outAmount);
                    setSelectedRoute(filteredRoutes[0]);
                    console.log("Possible number of routes:", filteredRoutes.length);
                    console.log("Best quote: ", filteredRoutes[0].outAmount);
                } else {
                    setSelectedRoute(undefined);
                }
                setRoutes(filteredRoutes);
            })
            .catch(error => console.error(error))
            .finally(() => setRefreshing(false));
    }, [
        jupiter,
        slippage,
        inputToken,
        outputToken,
        inputAmount
    ]);

    // Automatically get routes
    useEffect(() => {

        if (!jupiter || !inputToken || !outputToken || !slippage) {
            setRefreshing(false);
            return;
        }

        setRefreshing(true);
        refreshRoutes();
    }, [
        jupiter,
        slippage,
        inputToken,
        outputToken,
        inputAmount,
        refreshRoutes
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

        if (!connection) {
            return;
        }

        const timeout = setTimeout(() => {

            let label = '';

            if (!publicKey) {
                label = t("transactions.validation.not-connected");
            } else if (!inputToken || !fromMint || !toMint) {
                label = t("transactions.validation.invalid-exchange");
            } else if (inputAmount === 0) {
                label = t("transactions.validation.no-amount");
            } else if (isInAmountTooLow()) {
                label = t("transactions.validation.minimum-swap-amount", { 
                    mintAmount: toUiAmount(new BN(minInAmount || 0), inputToken.decimals), 
                    fromMint: inputToken.symbol
                });
            } else if(inputAmount > getMaxAllowedSwapAmount()) {
                label = t("transactions.validation.amount-low");
            } else if (inputAmount > 0 && !selectedRoute && !isWrap() && !isUnwrap()) {
                label = t("transactions.validation.exchange-unavailable");
            } else if (isWrap()) {
                label = 'Wrap';
            } else if (isUnwrap()) {
                label = 'Unwrap';
            } else {    
                label = t("transactions.validation.valid-approve");
            }

            setTransactionStartButtonLabel(label);

        });

        return () => {
            clearTimeout(timeout);
        }

    }, [
        t,
        isUnwrap,
        isWrap,
        toMint,
        fromMint,
        publicKey,
        connection,
        inputToken,
        inputAmount,
        minInAmount,
        selectedRoute,
        isValidBalance,
        isInAmountTooLow,
        getMaxAllowedSwapAmount
    ]);

    // Updates the token list everytime is filtered
    const updateTokenListByFilter = useCallback((searchString?: string) => {

        if (!connection) { return; }

        if (!mintList) { return; }

        const searchFilter = searchString || tokenFilter;

        const timeout = setTimeout(() => {

            const filter = (t: any) => {
                return (
                    t.symbol.toLowerCase().startsWith(searchFilter.toLowerCase()) ||
                    t.name.toLowerCase().startsWith(searchFilter.toLowerCase()) ||
                    t.address.toLowerCase().startsWith(searchFilter.toLowerCase())
                );
            };

            if (subjectTokenSelection === 'source') {
                let showFromList = !searchFilter
                    ? mintList
                    : Object.values(mintList)
                        .filter((t: any) => filter(t));
                setShowFromMintList(showFromList);
            }

            if (subjectTokenSelection === 'destination') {

                let showToList = !searchFilter
                    ? possiblePairsTokenInfo || undefined
                    : possiblePairsTokenInfo ? Object.values(possiblePairsTokenInfo)
                        .filter((t: any) => filter(t)) : undefined;

                setShowToMintList(showToList);
            }

        });

        return () => { 
            clearTimeout(timeout);
        }

    }, [
        mintList,
        connection,
        tokenFilter,
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

    const onTokenSearchInputChange = useCallback((e: any) => {

        const input = e.target.value;

        const newValue = input.trim();
        setTokenFilter(newValue);
        updateTokenListByFilter(newValue);

    },[
        updateTokenListByFilter
    ]);

    // Set fees
    useEffect(() => {
        if (selectedRoute) {
            selectedRoute.getDepositAndFee()
                .then(value => {
                    consoleOut('transactionFeeInfo:', value, 'blue');
                    setFeeInfo(value);
                });
        }
    },[selectedRoute]);

    // Getters

    const toUiAmount = (amount: BN, decimals: number) => {
        if (!amount || !decimals) {
            return 0;
        }
        return amount.toNumber() / (10 ** decimals);
    }

    const toTokenAmount = (amount: number, decimals: number) => {
        if (!amount || !decimals) {
            return 0;
        }
        return amount * (10 ** decimals);
    }

    const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
        return (
            source &&
            destination &&
            source.name === destination.name &&
            source.address === destination.address
        ) ? true : false;
    }

    const getPricePerToken = useCallback((token: TokenInfo): number => {
        const tokenSymbol = token.symbol.toUpperCase();
        const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

        return coinPrices && coinPrices[symbol]
            ? coinPrices[symbol]
            : 0;
    }, [coinPrices]);

    // Event handling
    const onShowLpListToggled = (value: boolean) => {
        setShowRoutesList(value);
    };

    const onSlippageChanged = (value: any) => {
        setSlippage(value);
    };

    const handleSwapFromAmountChange = useCallback((e: any) => {

        const input = e.target;

        if (!input) { return; }

        const newValue = input.value;

        if (newValue === null || newValue === undefined || newValue === "") {
            setFromAmount('');
            setInputAmount(0);
        } else if (newValue === '.') {
            setFromAmount('.');
            setInputAmount(0);
        } else if (isValidNumber(newValue)) {
            setFromAmount(newValue);
            setInputAmount(parseFloat(newValue));
        }

    },[]);

    const flipMintsCallback = useCallback(() => {
        if (!toMint) { return; }

        const timeout = setTimeout(() => {
            const oldFrom = fromMint;
            const oldTo = toMint;
            setFromMint(oldTo);
            setToMint(oldFrom);
            setSelectedRoute(undefined);
            setRoutes([]);
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

        if (jupiter && inputToken && outputToken && slippage && !isWrap() && !isUnwrap()) {
            timer = setInterval(() => {
                consoleOut(`Trigger refresh routes after ${EXCHANGE_ROUTES_REFRESH_TIMEOUT / 1000} seconds`);
                setRefreshing(true);
                refreshRoutes();
            }, EXCHANGE_ROUTES_REFRESH_TIMEOUT);
        }

        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [
        jupiter,
        slippage,
        inputToken,
        outputToken,
        refreshRoutes,
        isUnwrap,
        isWrap,
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
        } else if(inputAmount > getMaxAllowedSwapAmount()) {
            result = false;
        } else if (inputAmount > 0 && !selectedRoute && !isWrap() && !isUnwrap()) {
            result = false;
        } else {    
            result = true;
        }

        return result;
    },[
        toMint,
        fromMint,
        publicKey,
        inputToken,
        inputAmount,
        selectedRoute,
        isWrap,
        isUnwrap,
        isInAmountTooLow,
        getMaxAllowedSwapAmount
    ]);

    // Rendering
    const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
        return (
            <Row>
                <Col span={11} className="text-right">{caption}</Col>
                <Col span={1} className="text-center fg-secondary-70">{separator}</Col>
                <Col span={11} className="text-left fg-secondary-70">{value}</Col>
            </Row>
        );
    };

    // Info items will draw inside the popover
    const txInfoContent = () => {
        return fromMint && toMint && selectedRoute ? (
            <>
            {
                !refreshing && inputAmount && feeInfo && infoRow(
                    t("transactions.transaction-info.network-transaction-fee"),
                    `${toUiAmount(new BN(feeInfo.signatureFee), sol.decimals)} SOL`
                )
            }
            {/* {
                !refreshing && fromAmount && feesInfo && !isWrap() && !isUnwrap() &&
                infoRow(
                t("transactions.transaction-info.protocol-transaction-fee", { protocol: exchangeInfo.fromAmm }),
                `${parseFloat(feesInfo.protocol.toFixed(mintList[fromMint].decimals))} ${mintList[fromMint].symbol}`
                )
            } */}
            {
                !refreshing && inputAmount && slippage && infoRow(
                    t("transactions.transaction-info.slippage"),
                    `${slippage.toFixed(2)}%`
                )
            }
            {/* {
                !refreshing && fromAmount &&
                infoRow(
                t("transactions.transaction-info.recipient-receives"),                
                `${exchangeInfo.minAmountOut?.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`
                )
            } */}
            {
                !refreshing && inputAmount && selectedRoute && infoRow(
                    t("transactions.transaction-info.price-impact"),                
                    `${parseFloat((selectedRoute.priceImpactPct || 0).toFixed(4))}%`
                )
            }
            {/* {
                !refreshing && fromAmount && exchangeInfo.fromAmm &&
                infoRow(
                t("transactions.transaction-info.exchange-on"),
                `${exchangeInfo.fromAmm}`,
                ':'
                )
            } */}
            </>
        ) : null;
    }

    const renderSourceTokenList = (
        <>
            {showFromMintList && Object.values(showFromMintList).length ? (
                Object.values(showFromMintList).map((token: any, index) => {
                    const onClick = () => {
                        if (!fromMint || fromMint !== token.address) {
                            setFromMint(token.address);
                            setLastFromMint(token.address);
                            consoleOut('fromMint:', token.address, 'blue');
                            const selectedToken = showFromMintList[token.address];
                            consoleOut('selectedToken:', selectedToken, 'blue');
                            if (selectedToken) {
                                setInputToken(selectedToken);
                                refreshUserBalances();
                            }
                        }
                        onCloseTokenSelector();
                    };

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
                                <div className="token-symbol">{token.symbol}</div>
                                <div className="token-name">{token.name}</div>
                            </div>
                            {publicKey &&
                                userBalances &&
                                mintList[token.address] &&
                                userBalances[token.address] > 0 && (
                                    <div className="token-balance">
                                        {!userBalances[token.address] ||
                                            userBalances[token.address] === 0
                                            ? ""
                                            : userBalances[token.address].toFixed(
                                                mintList[token.address].decimals
                                            )}
                                    </div>
                                )}
                        </div>
                    );
                })
            ) : (
                <p>{t("general.loading")}...</p>
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
                                setOutputToken(selectedToken);
                                if (selectedToken.address === sol.address) {
                                    setSelectedRoute(undefined);
                                }
                                refreshUserBalances();
                            }
                        }
                        onCloseTokenSelector();
                    };

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
                                <div className="token-symbol">{token.symbol}</div>
                                <div className="token-name">{token.name}</div>
                            </div>
                            {
                                publicKey && userBalances && mintList[token.address] && userBalances[token.address] > 0 && (
                                    <div className="token-balance">
                                        {
                                            !userBalances[token.address] || userBalances[token.address] === 0
                                                ? ''
                                                : userBalances[token.address].toFixed(mintList[token.address].decimals)
                                        }
                                    </div>
                                )
                            }
                        </div>
                    );
                })
            ) : (
                <p>{t("general.loading")}...</p>
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

            <Spin spinning={isBusy || refreshing}>
                <div className="swap-wrapper">

                    {/* Source token / amount */}
                    {fromMint && (
                        <JupiterExchangeInput
                            token={inputToken}
                            tokenBalance={
                                (userBalances && mintList[fromMint] && parseFloat(userBalances[fromMint]) > 0
                                    ? parseFloat(userBalances[fromMint]).toFixed(mintList[fromMint].decimals)
                                    : '')
                            }
                            tokenAmount={fromAmount}
                            onInputChange={handleSwapFromAmountChange}
                            onMaxAmount={
                                () => {
                                    const maxFromAmount = getMaxAllowedSwapAmount();
                                    // console.log('maxFromAmount', maxFromAmount);
                                    if (toMint && mintList[fromMint] && maxFromAmount > 0) {
                                        setInputAmount(maxFromAmount);
                                        const formattedAmount = maxFromAmount.toFixed(mintList[fromMint].decimals);                
                                        setFromAmount(formattedAmount);
                                    }
                                }
                            }
                            onSelectToken={() => {
                                setSubjectTokenSelection("source");
                                showTokenSelector();
                            }}
                            onPriceClick={() => refreshPrices()}
                            inputPosition="right"
                            translationId="source"
                            inputLabel={
                                showFromMintList[fromMint]
                                    ? `~$${fromAmount
                                        ? formatAmount(parseFloat(fromAmount) * getPricePerToken(showFromMintList[fromMint] as TokenInfo), 2)
                                        : '0.00' }`
                                    : ''
                            }
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
                        <span className="settings-wrapper pr-3">
                            <SwapSettings
                                currentValue={slippage}
                                showLpList={showRoutesList}
                                onToggleShowLpList={onShowLpListToggled}
                                onValueSelected={onSlippageChanged}
                            />
                        </span>
                    </div>

                    {fromMint && (
                        <JupiterExchangeOutput
                            fromToken={inputToken || undefined}
                            fromTokenAmount={fromAmount}
                            toToken={outputToken || undefined}
                            toTokenBalance={
                                (publicKey && toMint && userBalances && userBalances[toMint] && mintList[toMint] && outputToken
                                    ? parseFloat(userBalances[toMint] || 0).toFixed(outputToken.decimals)
                                    : '')
                            }
                            toTokenAmount={isWrap() || isUnwrap()
                                ? fromAmount
                                : selectedRoute && outputToken
                                    ? toUiAmount(new BN(selectedRoute.outAmount), outputToken.decimals).toFixed(outputToken.decimals)
                                    : ''
                            }
                            readonly={fromNative()}
                            mintList={mintList}
                            onSelectToken={() => {
                                setSubjectTokenSelection("destination");
                                showTokenSelector();
                            }}
                            routes={routes}
                            onSelectedRoute={(route: any) => {
                                consoleOut('onSelectedRoute:', route, 'blue');
                                setSelectedRoute(route);
                            }}
                            showRoutes={showRoutesList && !isWrap() && !isUnwrap()}
                        />

                    )}

                    {/* Powered by Jupiter */}
                    {(!isWrap() && !isUnwrap()) && (
                        <div className="flexible-left">
                            <div className="left">&nbsp;</div>
                            <div className="right font-size-75 fg-secondary-50">Powered by Jupiter <img src="/assets/jupiter-logo.svg" className="jupiter-logo" alt="Jupiter Aggregator" /></div>
                        </div>
                    )}

                    {/* Title bar with settings */}
                    {(!isWrap() && !isUnwrap()) && (
                        <div className="info-line-and-settings flexible-left">
                            <div className="left"><span>&nbsp;</span></div>
                            <div className="right info-line">
                            {
                                inputToken && outputToken && selectedRoute && selectedRoute.outAmount ? (
                                <>
                                    {!refreshing && (
                                        <>
                                        <div className="left">
                                            {
                                            (`1 ${inputToken.symbol} ≈ ${(toUiAmount(new BN(selectedRoute.outAmount), outputToken.decimals) / inputAmount).toFixed(outputToken.decimals)} ${outputToken.symbol}`)
                                            }
                                        </div>
                                        <div className="right pl-1">
                                            {
                                                fromAmount ? (
                                                    <InfoIcon content={txInfoContent()} placement="leftBottom">
                                                        <InfoCircleOutlined />
                                                    </InfoIcon>
                                                ) : null
                                            }
                                        </div>
                                        </>
                                    )}
                                </>
                                ) : (<span>-</span>)
                            }
                            </div>
                        </div>
                    )}

                    {/* Action button */}
                    <Button
                        className="main-cta"
                        block
                        type="primary"
                        shape="round"
                        size="large"
                        onClick={() => {}}
                        disabled={!isExchangeValid() || refreshing} >
                        {transactionStartButtonLabel}
                    </Button>

                </div>
            </Spin>

            {/* Token selection modal */}
            <Modal
                className="mean-modal unpadded-content"
                visible={isTokenSelectorModalVisible}
                title={
                    <div className="modal-title">{t("token-selector.modal-title")}</div>
                }
                onCancel={onCloseTokenSelector}
                width={450}
                footer={null}>
                <div className="token-selector-wrapper">
                    <div className="token-search-wrapper">
                        <TextInput
                            value={tokenFilter}
                            placeholder={t('token-selector.search-input-placeholder')}
                            onInputChange={onTokenSearchInputChange} />
                    </div>
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
