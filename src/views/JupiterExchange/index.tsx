import { Connection } from "@solana/web3.js";
import { Spin } from "antd";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import useLocalStorage from "../../hooks/useLocalStorage";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import "./style.less";

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
