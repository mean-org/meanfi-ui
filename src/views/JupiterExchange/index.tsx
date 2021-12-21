import { Connection } from "@solana/web3.js";
import { Spin } from "antd";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
// import { Jupiter, RouteInfo, TOKEN_LIST_URL } from "@jup-ag/core";
import useLocalStorage from "../../hooks/useLocalStorage";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import "./style.less";
import { TokenInfo } from "@solana/spl-token-registry";
import { consoleOut } from "../../utils/ui";
import { getJupiterTokenList } from "../../utils/api";

export const JupiterExchange = (props: {
    queryFromMint: string | null;
    queryToMint: string | null;
    connection: Connection;
}) => {

    const [lastFromMint, setLastFromMint] = useLocalStorage('lastFromToken', NATIVE_SOL_MINT.toBase58());
    const [fromMint, setFromMint] = useState<string | undefined>(lastFromMint);
    const [toMint, setToMint] = useState<string | undefined>(undefined);
    const [paramsProcessed, setParamsProcessed] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [tokenList, setTokenList] = useState<TokenInfo[]>([]);

    const connection = useMemo(() => props.connection, [props.connection]);

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

    // Fetch token list from Jupiter API
    // const loadJupiterTokenList = useCallback(async () => {
    //     try {
    //         const tokens: TokenInfo[] = await getJupiterTokenList(TOKEN_LIST_URL['mainnet-beta']);
    //         if (tokens && tokens.length) {
    //             setTokenList(tokens);
    //             consoleOut("tokens from Jupiter API:", tokens, 'blue');
    //         }
    //     } catch (error) {
    //         console.error(error);
    //         setTokenList([]);
    //     }
    // },[]);

    // useEffect(() => {
    //     if (!tokenList || tokenList.length === 0) {
    //         loadJupiterTokenList();
    //     }
    // }, [
    //     tokenList,
    //     loadJupiterTokenList
    // ]);

    return (
        <>
            <Spin spinning={isBusy || refreshing}>
                <div className="swap-wrapper">
                    <p>Naked... for now</p>
                </div>
            </Spin>
        </>
    );
};
