import { Connection, PublicKey } from "@solana/web3.js";
import { Spin } from "antd";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { TokenListProvider, TokenInfo, ENV } from "@solana/spl-token-registry";
import { useJupiter, RouteInfo, TransactionFeeInfo } from "@jup-ag/react-hook";
import useLocalStorage from "../../hooks/useLocalStorage";
import { NATIVE_SOL_MINT } from "../../utils/ids";
import "./style.less";
import { consoleOut } from "../../utils/ui";

interface IJupiterFormProps {}

type UseJupiterProps = Parameters<typeof useJupiter>[0];

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

    /*

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

    const [tokenMap, setTokenMap] = React.useState<Map<string, TokenInfo>>(
        new Map()
    );

    const [formValue, setFormValue] = React.useState<UseJupiterProps>({
        amount: 0,
        inputMint: undefined,
        outputMint: undefined,
        slippage: 0,
    });

    const [inputTokenInfo, outputTokenInfo] = React.useMemo(() => {
        return [
          tokenMap.get(formValue.inputMint?.toBase58() || ""),
          tokenMap.get(formValue.outputMint?.toBase58() || ""),
        ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formValue.inputMint?.toBase58(), formValue.outputMint?.toBase58()]);

    React.useEffect(() => {
        new TokenListProvider().resolve().then((tokens) => {
          const tokenList = tokens.filterByChainId(ENV.MainnetBeta).getList();

          setTokenMap(
            tokenList.reduce((map, item) => {
              map.set(item.address, item);
              return map;
            }, new Map())
          );
        });
    }, [setTokenMap]);

    const amountInDecimal = React.useMemo(() => {
        return formValue.amount * 10 ** (inputTokenInfo?.decimals || 1);
    }, [inputTokenInfo, formValue.amount]);

    const { routeMap, allTokenMints, routes, loading, exchange, error } =
        useJupiter({
          ...formValue,
          amount: amountInDecimal,
    });

    const validOutputMints = React.useMemo(
        () => routeMap.get(formValue.inputMint?.toBase58() || "") || allTokenMints,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [routeMap, formValue.inputMint?.toBase58()]
    );

    // setup inputMint and outputMint
    React.useEffect(() => {
        if (!formValue.inputMint && allTokenMints.length) {
          const input = allTokenMints[0];
          const output = routeMap.get(input)![0];
          setFormValue((val) => ({
            ...val,
            inputMint: new PublicKey(allTokenMints[0]),
            outputMint: new PublicKey(output),
          }));
        }
    }, [
        formValue.inputMint,
        allTokenMints,
        routeMap
    ]);

    // ensure outputMint can be swapable to inputMint
    React.useEffect(() => {
        if (formValue.inputMint) {
          const possibleOutputs = routeMap.get(formValue.inputMint.toBase58());
    
          if (
            possibleOutputs &&
            !possibleOutputs?.includes(formValue.outputMint?.toBase58() || "")
          ) {
            setFormValue((val) => ({
              ...val,
              outputMint: new PublicKey(possibleOutputs[0]),
            }));
          }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formValue.inputMint?.toBase58(), formValue.outputMint?.toBase58()]);

    */

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
