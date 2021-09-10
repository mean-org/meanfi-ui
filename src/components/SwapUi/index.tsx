import { Button, Modal, Row, Col, Spin } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSwapConnection } from "../../contexts/connection";
import { getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { ArrowDownOutlined, CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionOperationDescription, getTxFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { Constants, MSP_ACTIONS, PublicKeys, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, SERUM_PROGRAM_ID_V3, USDC_MINT, USDT_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { TransactionStatus } from "../../models/enums";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { TextInput } from "../TextInput";
import { DEFAULT_SLIPPAGE_PERCENT, getOutAmount, getSwapOutAmount, place, swap, unwrap, wrap } from "../../utils/swap";
import { isOfficalMarket, LiquidityPoolInfo } from "../../utils/pools";
// import { NATIVE_SOL } from "../../utils/tokens";
// import { TokenInfo } from "@solana/spl-token-registry";
import { cloneDeep } from "lodash-es";
import useLocalStorage from "../../hooks/useLocalStorage";
import { Market } from "../../models/market";
import { Orderbook } from "@project-serum/serum";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getLiquidityPools } from "../../utils/liquidity";
import { TokenAmount } from "../../utils/safe-math";
import { getMarkets } from "../../utils/markets";
import { getMultipleAccounts } from "../../utils/accounts";
import * as base64 from "base64-js";
import BN from "bn.js";
import "./style.less";

import { AMM_POOLS, TOKENS } from "../../amms/data";
import { AmmPoolInfo, Client, ORCA, TokenInfo } from "../../amms/types";
import { getClient, getOptimalPool, getTokensPools } from "../../amms/utils";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SwapUi = () => {

  const { t } = useTranslation("common");
  const { publicKey, wallet, connected } = useWallet();
  const connection = useSwapConnection();
  const {
    transactionStatus,
    previousWalletConnectState,
    setTransactionStatus,
    setPreviousWalletConnectState

  } = useContext(AppStateContext);

  // Added by YAF (Token balance)
  const [smallAmount, setSmallAmount] = useState(0);
  const [fromMintTokenBalance, setFromMintTokenBalance] = useState(0);
  const [toMintTokenBalance, setToMintTokenBalance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [toSwapAmount, setToSwapAmount] = useState("");
  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', USDC_MINT.toBase58());
  // const [lastSwapToMint, setLastSwapToMint] = useLocalStorage('lastSwapToMint', NATIVE_SOL_MINT.toBase58());
  // Work with our swap From/To subjects
  const [fromMint, setFromMint] = useState<PublicKey | undefined>(new PublicKey(lastSwapFromMint));
  const [toMint, setToMint] = useState<PublicKey | undefined>(); //useState(new PublicKey(lastSwapToMint));
  // Continue normal flow
  const [fromAmount, setFromAmount] = useState("");
  const [maxFromAmount, setMaxFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isWrap, setIsWrap] = useState(false);
  const [isUnwrap, setIsUnwrap] = useState(false);
  const [outToPrice, setOutToPrice] = useState("");
  const [priceImpact, setPriceImpact] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [feeAmount, setFeeAmount] = useState(0);
  const [market, setMarket] = useState<Market>();
  const [orderbooks, setOrderbooks]= useState<any>([]);
  const [pool, setPool] = useState<LiquidityPoolInfo>();
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [fromTokenList, setFromTokenList] = useState<TokenInfo[]>([]);
  const [toTokenList, setToTokenList] = useState<TokenInfo[]>([]);
  const [tokenFilter, setTokenFilter] = useState("");
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map<string, TokenInfo>());
  const [tokenBalances, setTokenBalances] = useState<Map<string, string>>(new Map<string, string>());
  const [isFlipping, setIsFlipping] = useState(false);
  const [shouldUpdateBalances, setShouldUpdateBalances] = useState(true);
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [isValidBalance, setIsValidBalance] = useState(true);
  const [isValidSwapAmount, setIsValidSwapAmount] = useState(false);
  // Transaction execution modal
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const hideTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  // FEES
  const [txFees, setTxFees] = useState<TransactionFees>({
    blockchainFee: 0,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });

  // AGGREGATOR
  const [swapClient, setSwapClient] = useState<Client>();
  const [optimalPool, setOptimalPool] = useState<AmmPoolInfo>();

  // Get Tx fees
  useEffect(() => {

    if (!connection) { return; }

    const timeout = setTimeout(() => {
      const action = isWrap || isUnwrap ? MSP_ACTIONS.wrap : MSP_ACTIONS.swap;
      calculateActionFees(connection, action)
        .then(values => {
          setTxFees(values);
          console.log('fees', values);
        })
        .catch(_error => { console.log(_error); });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    isUnwrap, 
    isWrap
  ]);

  // Updates isWrap/isUnwrap
  useMemo(() => {

    if (!fromMint || !toMint) {
      return;
    }

    setIsWrap(
      fromMint &&
      toMint &&
      fromMint.equals(NATIVE_SOL_MINT) && 
      toMint.equals(WRAPPED_SOL_MINT)
    );

    setIsUnwrap(
      fromMint &&
      toMint &&
      fromMint.equals(WRAPPED_SOL_MINT) && 
      toMint.equals(NATIVE_SOL_MINT)
    );
    
  }, [
    fromMint, 
    toMint
  ]);

  // Updates the token list everytime is filtered
  useEffect(() => {

    if (!TOKENS.length) { return; }

    const timeout = setTimeout(() => {
      let list: TokenInfo[] = [];
      // const symbols = Object.keys(TOKENS);
      // list.push(NATIVE_SOL);
      
      for (let info of TOKENS) {
        let token = cloneDeep(info);
        if (token.logoURI) {
          list.push(token);
        }
      }

      let fromList: TokenInfo[] = [];
      let toList: TokenInfo[] = [];

      if (subjectTokenSelection === 'source') {
        fromList = !tokenFilter ? list : list.filter((t: TokenInfo) =>
          t.symbol.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.name.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.address.toLowerCase().startsWith(tokenFilter.toLowerCase())
        );
      }

      if (subjectTokenSelection === 'destination') {
        toList = !tokenFilter ? list : list.filter((t: TokenInfo) =>
          t.symbol.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.name.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.address.toLowerCase().startsWith(tokenFilter.toLowerCase())
        );
      }
      
      setTokenList(list);
      setFromTokenList(fromList);
      setToTokenList(toList);
    });

    return () => { 
      clearTimeout(timeout);
    }
    
  }, [
    subjectTokenSelection, 
    tokenFilter
  ]);

  // Token map for quick lookup.
  useMemo(() => {

    let list = [];
    // const symbols = Object.keys(TOKENS);
    // list.push(NATIVE_SOL);
    
    for (let info of TOKENS) {
      let token = cloneDeep(info);
      if (token.logoURI) {
        list.push(token);
      }
    }

    const map = new Map<string, TokenInfo>();
    list.forEach((t: TokenInfo) => {
      map.set(t.address, t);
    });
    
    setTokenMap(map);
    
  }, [
  ]);

  // Updates the amounts when is wrap or unwrap
  useEffect(() => { 

    if (!isWrap && !isUnwrap) { return; }

    const timeout = setTimeout(() => {
      const priceAmount = 1;
      const fromAmountValid = fromAmount && parseFloat(fromAmount);
      const amount = fromAmountValid ? parseFloat(fromAmount) : 1;
      setOutToPrice('1');
      setPriceImpact('0.00');
      const amountOut = parseFloat(((amount - feeAmount) * priceAmount).toFixed(9));
      const amountWithFee = parseFloat(((amount - feeAmount) * priceAmount).toFixed(9));
      setToAmount(fromAmountValid ? amountOut.toString() : '');      
      setToSwapAmount(fromAmountValid ? amountWithFee.toString() : '');
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    feeAmount, 
    fromAmount, 
    isUnwrap, 
    isWrap
  ]);

  // Updates the amounts from pool (in Raydium is no correct at all)
  useEffect(() => {

    if (!fromMint || !toMint || !pool || isWrap || isUnwrap) { 
      return; 
    }

    const timeout = setTimeout(() => {
      let outAmount = 0;
      let outWithSlippageAndFeesAmount = 0;
      let price = 0;
      const priceAmount = 1;
      const fromAmountValid = fromAmount && parseFloat(fromAmount);
      const amount = fromAmountValid ? parseFloat(fromAmount) : 1;
      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
      // always calculate the price based on the unit
      const { amountOut, amountOutWithSlippage, priceImpact } = getSwapOutAmount(
        pool,
        fromMint.toBase58(),
        toMint.toBase58(),
        priceAmount.toFixed(fromDecimals),
        slippage
      );

      if (!amountOut.isNullOrZero()) {
        outAmount = parseFloat((+amountOut.fixed() * (amount - feeAmount)).toFixed(toDecimals));
        outWithSlippageAndFeesAmount = parseFloat((+amountOutWithSlippage.fixed() * (amount - feeAmount)).toFixed(toDecimals));
        price = +amountOut.fixed();
        setPriceImpact(priceImpact.toFixed(2));
        setOutToPrice(price.toString());
        setToAmount(fromAmountValid ? outAmount.toString() : '');
        setToSwapAmount(fromAmountValid ? outWithSlippageAndFeesAmount.toString() : '');
      }
    });

    return () => {
      clearTimeout(timeout);
    }
    
  }, [
    fromMint, 
    toMint, 
    pool, 
    fromAmount, 
    slippage, 
    tokenMap, 
    isWrap, 
    isUnwrap,
    feeAmount
  ]);

  // Updates the amounts from serum markets
  useEffect(() => {

    if (!fromMint || !toMint || isWrap || isUnwrap || !market || !orderbooks.length) { 
      return;
    }

    const timeout = setTimeout(() => {
      let outAmount = 0;
      let outWithSlippageAndFeesAmount = 0;
      let price = 0;
      const priceAmount = 1;
      const fromAmountValid = fromAmount && parseFloat(fromAmount);
      const amount = fromAmount && parseFloat(fromAmount) ? parseFloat(fromAmount) : 1;
      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
      const bids = (orderbooks.filter((ob: any) => ob.isBids)[0]).slab;
      const asks = (orderbooks.filter((ob: any) => !ob.isBids)[0]).slab;

      const { amountOut, amountOutWithSlippage, priceImpact } = getOutAmount(
        market,
        asks,
        bids,
        fromMint.toBase58(),
        toMint.toBase58(),
        priceAmount.toFixed(fromDecimals),
        slippage
      );
      
      const out = new TokenAmount(amountOut, toDecimals, false);
      const outWithSlippage = new TokenAmount(amountOutWithSlippage, toDecimals, false);

      if (!out.isNullOrZero()) {
        outAmount = parseFloat((+out.fixed() * (amount - feeAmount)).toFixed(toDecimals));
        outWithSlippageAndFeesAmount = parseFloat((+outWithSlippage.fixed() * (amount - feeAmount)).toFixed(toDecimals));
        price = +out.fixed();
      }

      setPriceImpact(priceImpact.toFixed(2));
      setOutToPrice(price.toString());
      setToAmount(fromAmountValid ? outAmount.toString() : '');
      setToSwapAmount(fromAmountValid ? outWithSlippageAndFeesAmount.toString() : '');
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    fromMint,
    toMint,
    market,
    orderbooks,
    fromAmount, 
    slippage, 
    toSwapAmount, 
    tokenMap,
    isWrap,
    isUnwrap,
    feeAmount
  ]);

  // Updates liquidity pool info
  useEffect(() => {

    if (!connection || !fromMint || !toMint || isWrap || isUnwrap || isFlipping) {
      if (isFlipping) { setIsFlipping(false); }
      return;
    }

    setRefreshing(true);

    const timeout = setTimeout(() => {

      // const tokensPools = getTokensPools(
      //   fromMint.toBase58(),
      //   toMint.toBase58()
      // );

      // console.log('tokensPools => ', tokensPools);

      // if (tokensPools.length) {
      //   // find the optimal pool and get the client for that pool
      //   let optimalPool = getOptimalPool(tokensPools);
      //   setOptimalPool(optimalPool);
      //   let client = swapClient;
        
      //   if (!client || optimalPool.protocolAddress !== client.protocolAddress) {
      //     client = getClient(connection, optimalPool.protocolAddress) as Client;
      //     setSwapClient(client);
      //   }
        
      // } else {
      //   // just find a market
        
      // }

      getLiquidityPools(connection)
        .then((poolInfos) => {

          const poolInfo = Object.values(poolInfos).filter((lp: any) => {
            return (lp.coin.address === fromMint.toBase58() && lp.pc.address === toMint.toBase58()) || 
                    (lp.pc.address === fromMint.toBase58() && lp.coin.address === toMint.toBase58());            
          })[0] as LiquidityPoolInfo | undefined;
      
          console.log('pool', poolInfo);
          setPool(poolInfo);
      
          if (poolInfo) {
            setMarket(undefined);
            setRefreshing(false);
          } else {            
            getMarkets(connection)
              .then((marketInfos) => {

                let newMarketKey;

                for(let address in marketInfos) {

                  if (isOfficalMarket(address)) {
                    let info = cloneDeep(marketInfos[address]);
                    let fromAddress = fromMint.toBase58();
                    let toAddress = toMint.toBase58();

                    if (fromAddress === NATIVE_SOL_MINT.toBase58()) {
                      fromAddress = WRAPPED_SOL_MINT.toBase58();
                    }

                    if (toAddress === NATIVE_SOL_MINT.toBase58()) {
                      toAddress = WRAPPED_SOL_MINT.toBase58();
                    }

                    if (
                      (info.baseMint.toBase58() === fromAddress && info.quoteMint.toBase58() === toAddress) ||
                      (info.quoteMint.toBase58() === fromAddress && info.baseMint.toBase58() === toAddress)
                    ) {
                      newMarketKey = new PublicKey(address);
                    }  
                  }
                }
 
                if (!newMarketKey) {
                  setRefreshing(false);
                  return;
                }

                const serumProgramKey = new PublicKey(SERUM_PROGRAM_ID_V3);

                Market.load(connection, newMarketKey, {}, serumProgramKey)
                  .then((marketInfo) => {

                    setMarket(marketInfo);

                    if (!marketInfo || !marketInfo.bids || !marketInfo.asks) {
                      setRefreshing(false);
                      return;
                    }

                    getMultipleAccounts(connection, [marketInfo.bids, marketInfo.asks], 'confirmed')
                      .then((accounts) => {

                        if (!accounts || accounts.length < 2) {
                          setOrderbooks([]);
                          setRefreshing(false);
                          return;
                        }

                        const orderBooks = [];

                        for (let info of accounts) {
                          if (info) {
                            const data = info.account.data;
                            const orderbook = Orderbook.decode(marketInfo, data);
                            orderBooks.push(orderbook);
                          }        
                        }
                        
                        setOrderbooks(orderBooks);
                        setMarket(marketInfo);
                        console.log('marketInfo', marketInfo);
                        setRefreshing(false);
                      })
                      .catch(_error => { 
                        console.log(_error);
                        setRefreshing(false);
                      });
                  })
                  .catch(_error => { 
                    console.log(_error);
                    setRefreshing(false);
                  });
              })
              .catch(_error => { 
                console.log(_error);
                setRefreshing(false);
              });
          }
        })
        .catch(_error => { 
          console.log(_error);
          setRefreshing(false);
        });
    });

    return () => {
      setRefreshing(false);
      clearTimeout(timeout);
    }

  }, [
    connection, 
    fromMint, 
    toMint,
    isWrap,
    isUnwrap,
    isFlipping,
    // NEW
    // swapClient
  ]);

  // Automatically update all tokens balance
  useEffect(() => {
    
    if (!connected || !publicKey || !tokenMap || isFlipping) {
      if (isFlipping) { setIsFlipping(false); }
      return;
    }

    const timeout = setTimeout(() => {
      let balancesMap = new Map<string, string>();
      for (let item of tokenMap.values()) {
        if (item.address === NATIVE_SOL_MINT.toBase58()) {
          connection.getAccountInfo(publicKey).then(info => {
            let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
            balancesMap.set(item.address, balance.toString());
          })
          .catch(_error => { console.log(_error); });
        } else {
          Token.getAssociatedTokenAddress(
            ASSOCIATED_TOKEN_PROGRAM_ID,
            TOKEN_PROGRAM_ID,
            new PublicKey(item.address),
            publicKey
    
          ).then(addr => {
            if (addr) {
              connection.getTokenAccountBalance(addr).then(info => {
                let balance = info && info.value ? (info.value.uiAmount || 0) : 0;
                balancesMap.set(item.address, balance.toString());
              }).catch(_error => { 
                balancesMap.set(item.address, '');
              });
            }
          });
        }
      }
      setTokenBalances(balancesMap);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    publicKey, 
    tokenMap, 
    isFlipping, 
    connection
  ]);

  // Automatically update fromMint token balance once
  useEffect(() => {
    
    if (!connected || !publicKey || !fromMint) {
      if (isFlipping) { setIsFlipping(false); }
      setFromMintTokenBalance(0);
      return;
    }

    const timeout = setTimeout(() => {
      if (fromMint.equals(NATIVE_SOL_MINT)) {
        connection.getAccountInfo(publicKey).then(info => {
          let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
          setFromMintTokenBalance(balance);
          setShouldUpdateBalances(false);
        })
        .catch(_error => { console.log(_error); });
      } else {
        Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMint,
          publicKey
  
        ).then(addr => {
          if (addr) {
            connection.getTokenAccountBalance(addr).then(info => {
              let balance = info && info.value ? (info.value.uiAmount || 0) : 0;
              setFromMintTokenBalance(balance);
              setShouldUpdateBalances(false);
            }).catch(_error => { console.log(_error); });
          }
        });
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected,
    fromMint,
    connection, 
    publicKey,
    isFlipping,
    shouldUpdateBalances
  ]);

  // Automatically update toMint token balance once
  useEffect(() => {
    
    if (!connected || !publicKey || !toMint) {
      if (isFlipping) { setIsFlipping(false); }
      setToMintTokenBalance(0);
      return;
    }

    const timeout = setTimeout(() => {
      if (toMint.equals(NATIVE_SOL_MINT)) {
        connection.getAccountInfo(publicKey).then(info => {
          let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
          setToMintTokenBalance(balance);
          setShouldUpdateBalances(false);
        }).catch(_error => { console.log(_error); });
      } else {
        Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          toMint,
          publicKey
  
        ).then(addr => {
          if (addr) {
            connection.getTokenAccountBalance(addr).then(info => {
              let balance = info && info.value ? (info.value.uiAmount || 0) : 0;
              setToMintTokenBalance(balance);
              setShouldUpdateBalances(false);
            }).catch(_error => { console.log(_error); });
          }
        });
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected,
    toMint,
    connection, 
    publicKey,
    isFlipping,
    shouldUpdateBalances
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState === connected) {
      return;
    }

    const timeout = setTimeout(() => {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('Refreshing balances...', '', 'blue');
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        if (fromMint) {
          setLastSwapFromMint(fromMint.toString());
        }
        setPreviousWalletConnectState(false);
      }
    });

    return () => { 
      clearTimeout(timeout);
    };

  }, [
    connected, 
    fromMint,
    toMint,
    lastSwapFromMint, 
    previousWalletConnectState, 
    setLastSwapFromMint, 
    setPreviousWalletConnectState
  ]);

  // Validation
  // Automatically updates the fee amount
  useEffect(() => {

    if (!fromMint || !txFees) { return; }

    const timeout = setTimeout(() => {
      const fromAmountValid = fromAmount && parseFloat(fromAmount) 
        ? parseFloat(fromAmount) 
        : 0;

      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const amount = getTxFeeAmount(txFees, fromAmountValid);
      
      // if (!amount) { return; }

      const formattedAmount = parseFloat(amount.toFixed(fromDecimals));
      setFeeAmount(formattedAmount);
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    fromMint,
    fromAmount, 
    txFees, 
    tokenMap,
    fromMintTokenBalance
  ]);

  // Automatically updates the max allowed amount to swap
  useEffect(() => {

    if (!connected || !fromMint) { return; }
    
    const timeout = setTimeout(() => {

      let maxAmount = '';
      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const txFee = getTxFeeAmount(txFees, (fromAmount || '0'));

      if (fromMint.equals(NATIVE_SOL_MINT)) {
        const nativeBalance = parseFloat(tokenBalances.get(NATIVE_SOL_MINT.toBase58()) || '0');
        const totalFees = txFee + txFees.blockchainFee;
        maxAmount = ((nativeBalance - totalFees) < 0 ? (fromAmount || '0') : (nativeBalance - totalFees).toFixed(9));
      } else {
        maxAmount = ((fromMintTokenBalance - txFee) < 0 ? (fromAmount || '0') : (fromMintTokenBalance - txFee).toFixed(fromDecimals));
      }
      setMaxFromAmount(maxAmount);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    fromMint, 
    fromAmount,
    fromMintTokenBalance, 
    txFees.blockchainFee, 
    tokenMap, 
    txFees, 
    tokenBalances
  ]);

  // Automatically updates if the balance is valid
  useEffect(() => {

    if (!connected || !fromMint || !fromMintTokenBalance) {
      return; 
    }

    const timeout = setTimeout(() => {
      let valid = true;

      if (fromMint.equals(NATIVE_SOL_MINT)) {
        const txFee = getTxFeeAmount(txFees, (fromAmount || 0));
        valid = fromMintTokenBalance > (txFee + txFees.blockchainFee) ? true : false;
      } else {
        const nativeBalance = parseFloat(tokenBalances.get(NATIVE_SOL_MINT.toBase58()) || '0');
        valid = nativeBalance > txFees.blockchainFee ? true : false;
      }
      setIsValidBalance(valid);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    fromAmount,
    fromMint, 
    fromMintTokenBalance, 
    txFees,
    tokenBalances
  ])

  // TODO: Review validation
  // Automatically updates if the from swap amount is valid
  useEffect(() => {

    const timeout = setTimeout(() => {
      const valid = (
        !fromMint ||
        !toMint ||
        !fromAmount ||
        !toSwapAmount ||
        !outToPrice ||
        parseFloat(fromAmount) === 0
  
      ) ? false : true;
  
      setIsValidSwapAmount(valid);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    fromAmount,
    fromMint, 
    toMint,
    outToPrice, 
    toSwapAmount,
    maxFromAmount
  ]);

  // Updates the allowed mints to select 
  useEffect(() => {

    if (!fromMint || !tokenList || !tokenList.length) { return; }

    const timeout = setTimeout(() => {

      const btcTokenInfo = tokenList.filter(info => info.symbol === 'BTC')[0];
      const ethTokenInfo = tokenList.filter(info => info.symbol === 'ETH')[0];

      if (!btcTokenInfo || !ethTokenInfo) { return; }

      if (fromMint && (fromMint.toBase58() === btcTokenInfo.address || fromMint.toBase58() === ethTokenInfo.address)) {
        const usdxList = tokenList.filter(t => { 
          return t.address === USDC_MINT.toBase58() || t.address === USDT_MINT.toBase58();
        });

        setToTokenList(usdxList);
        
        if (toMint && !toMint.equals(USDC_MINT) && !toMint.equals(USDT_MINT)) {
          setToMint(USDC_MINT);
        }
      }
    });

    return () => { 
      clearTimeout(timeout);
    }

  },[
    fromMint, 
    toMint, 
    tokenList
  ]);

  // Updates the allowed mints to select 
  useEffect(() => {

    if (!toMint || !tokenList || !tokenList.length) { return; }

    const timeout = setTimeout(() => {

      const btcTokenInfo = tokenList.filter(info => info.symbol === 'BTC')[0];
      const ethTokenInfo = tokenList.filter(info => info.symbol === 'ETH')[0];

      if (!btcTokenInfo || !ethTokenInfo) { return; }

      if (toMint && (toMint.toBase58() === btcTokenInfo.address || toMint.toBase58() === ethTokenInfo.address)) {
        const usdxList = tokenList.filter(t => { 
          return t.address === USDC_MINT.toBase58() || t.address === USDT_MINT.toBase58();
        });
    
        setFromTokenList(usdxList);
        
        if (fromMint && !fromMint.equals(USDC_MINT) && !fromMint.equals(USDT_MINT)) {
          setFromMint(USDC_MINT);
        }
      }
    });

    return () => { 
      clearTimeout(timeout);
    }

  },[
    fromMint,
    toMint,
    tokenList
  ]);

   // Token selection modal
   const showTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(true);
    setTimeout(() => {
      const input = document.getElementById("token-search-input");
      if (input) {
        input.focus();
      }
    }, 250);
  }, []);

  // Token selection modal close
  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    setTokenFilter('');

  }, []);

  // Event handling
  const handleSwapFromAmountChange = useCallback((e: any) => {

    const input = e.target;

    if (!input) { return; }

    const newValue = input.value;
    
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromAmount("");
      setToAmount("");
      setSmallAmount(0);
    } else if (isValidNumber(newValue)) {
      setFromAmount(newValue);
    }

  },[]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const input = e.target;

    if (!input) { return; }

    const newValue = input.value;
    setTokenFilter(newValue.trim());
    
  },[]);

  // TODO: Review this
  // const getMinimumSwapAmountLabel = () => {
  //   const from = tokenMap.get(fromMint!.toBase58());
  //   const toSymbol = tokenMap.get(toMint!.toBase58())?.symbol;

  //   return `${t('transactions.validation.minimum-swap-amount', {
  //     mintAmount: `${smallAmount} ${from?.symbol}`,
  //     toMint: `${toSymbol}`
  //   })}`;
  // }

  // TODO: Review this
  // Gets the label of the Swap button
  const getTransactionStartButtonLabel = (): string => {

    if (connected && !isValidBalance) {
      const needed = fromMint && fromMint.equals(NATIVE_SOL_MINT)
        ? parseFloat((getTxFeeAmount(txFees, fromMintTokenBalance) + txFees.blockchainFee).toFixed(9))
        : parseFloat(txFees.blockchainFee.toFixed(9));

      return `${t('transactions.validation.insufficient-balance-needed', {
        balance: `${needed}`
      })}`;
    }

    return !connected
      ? t("transactions.validation.not-connected")
      : !fromAmount
      ? t("transactions.validation.no-amount")
      : !isValidSwapAmount
      ? t("transactions.validation.amount-high")
      : t("transactions.validation.valid-approve")
  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return  source && destination &&
            source.name === destination.name &&
            source.address === destination.address
            ? true
            : false;
  }

  const flipMintsCallback = useCallback(() => {

    setIsFlipping(true);
    
    const timeout = setTimeout(() => {
      const oldFrom = fromMint;
      const oldTo = toMint;
      const oldFromBalance = fromMintTokenBalance;
      const oldToBalance = toMintTokenBalance;
      const oldToAmount = toAmount;
      setFromMint(oldTo);
      setToMint(oldFrom);
      setFromMintTokenBalance(oldToBalance);
      setToMintTokenBalance(oldFromBalance);
      setFromAmount(oldToAmount);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [ 
    toAmount,
    fromMint, 
    toMint, 
    toMintTokenBalance,
    fromMintTokenBalance
  ]);

  const getSwap = useCallback(async () => {

    if (!fromMint || !toMint || !wallet) {
      throw new Error("Unable to calculate mint decimals");
    }

    const mspOpsAccount = PublicKeys.MSP_OPS_KEY[Constants.MAINNET_BETA_SLUG];

    if (isWrap) {

      return wrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL),
        mspOpsAccount,
        new BN(feeAmount * LAMPORTS_PER_SOL)
      );

    } else if (isUnwrap) {

      return unwrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL),
        mspOpsAccount,
        new BN(feeAmount * LAMPORTS_PER_SOL)
      );

    } else {

      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const fromAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : fromMint,
        wallet.publicKey
      );

      const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
      const toAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        toMint.equals(NATIVE_SOL_MINT) ? WRAPPED_SOL_MINT : toMint,
        wallet.publicKey
      );

      if (pool) {

        return swap(
          connection,
          wallet,
          pool,
          fromMint,
          toMint,
          fromAccount,
          toAccount,
          new BN(parseFloat(fromAmount) * 10 ** fromDecimals),
          new BN(parseFloat(toSwapAmount) * 10 ** toDecimals),
          mspOpsAccount,
          new BN(feeAmount * 10 ** fromDecimals)
        );

      } else {

        const bids = (orderbooks.filter((ob: any) => ob.isBids)[0]).slab;
        const asks = (orderbooks.filter((ob: any) => !ob.isBids)[0]).slab;

        return place(
          connection,
          wallet,
          market as Market,
          asks,
          bids,
          fromMint,
          toMint,
          fromAccount,
          toAccount,
          new BN(parseFloat(fromAmount) * 10 ** fromDecimals),
          slippage,
          mspOpsAccount,
          new BN(feeAmount * 10 ** fromDecimals)
        );
      }
    }

  },[
    connection, 
    feeAmount, 
    fromAmount, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    market, 
    orderbooks, 
    pool, 
    slippage, 
    toMint, 
    toSwapAmount, 
    tokenMap, 
    wallet
  ]);

  const renderSourceTokenList = (
    <>
      {fromTokenList.length ? (
        fromTokenList.map((token, index) => {
          const onClick = () => {
            const newMint = new PublicKey(token.address);
            if (!fromMint || !fromMint.equals(newMint)) {
              setFromMint(newMint);
              setLastSwapFromMint(newMint.toBase58());
            }
            onCloseTokenSelector();
          };

          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                fromMint && fromMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, (toMint ? tokenMap.get(toMint.toBase58()) : undefined) as TokenInfo)
                  ? 'disabled'
                  : "simplelink"
              }`}
            >
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
                connected && token && tokenBalances.get(token.address) &&
                (
                  <div className="token-balance">
                    {
                      parseFloat(tokenBalances.get(token.address) || '0')
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

  const renderDestinationTokenList = (
    <>
      {toTokenList.length ? (
        toTokenList.map((token, index) => {
          const onClick = () => {
            const newMint = new PublicKey(token.address);
            if (!toMint || !toMint.equals(newMint)) {
              setToMint(newMint);
            }
            onCloseTokenSelector();
          };

          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                toMint && toMint.toBase58() === token.address
                  ? "selected"
                  : areSameTokens(token, tokenMap.get(fromMint?.toBase58() || NATIVE_SOL_MINT.toBase58()) as TokenInfo)
                  ? 'disabled'
                  : "simplelink"
              }`}
            >
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
                connected && token && tokenBalances.get(token.address) &&
                (
                  <div className="token-balance">
                    {
                      parseFloat(tokenBalances.get(token.address) || '0')
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

  const getTransactionModalTitle = () => {
    let title: any;
    if (isBusy) {
      title = t("transactions.status.modal-title-executing-transaction");
    } else {
      if (
        transactionStatus.lastOperation === TransactionStatus.Iddle &&
        transactionStatus.currentOperation === TransactionStatus.Iddle
      ) {
        title = null;
      } else if (
        transactionStatus.lastOperation ===
        TransactionStatus.TransactionFinished
      ) {
        title = t("transactions.status.modal-title-transaction-completed");
      } else {
        title = null;
      }
    }
    return title;
  };

  const isSuccess = useCallback(() => {

    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
    );
    
  },[
    transactionStatus.currentOperation
  ]);

  const isError = useCallback(() => {
    return transactionStatus.currentOperation ===
      TransactionStatus.TransactionStartFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.InitTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SignTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.SendTransactionFailure ||
      transactionStatus.currentOperation ===
        TransactionStatus.ConfirmTransactionFailure
      ? true
      : false;
      
  }, [
    transactionStatus.currentOperation
  ]);

  const onAfterTransactionModalClosed = useCallback(() => {

    if (isBusy) {
      setTransactionCancelled(true);
    }

    if (isSuccess()) {
      setFromAmount("");
      setToAmount("");
      setShouldUpdateBalances(true);
      hideTransactionModal();
    }
    
  }, [
    isBusy, 
    hideTransactionModal, 
    isSuccess,
    setShouldUpdateBalances
  ]);

  const createTx = useCallback(async () => {
    if (!wallet) {       
      return false; 
    }
    
    setTransactionStatus({
      lastOperation: TransactionStatus.TransactionStart,
      currentOperation: TransactionStatus.InitTransaction,
    });

    // Abort transaction in not enough balance to pay for gas fees and trigger TransactionStatus error
    // Whenever there is a flat fee, the balance needs to be higher than the sum of the flat fee plus the network fee
    if (!isValidBalance) {
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.TransactionStartFailure,
      });
      return false;
    }

    return getSwap()
      .then((tx) => {
        console.log("SWAP returned transaction:", tx);
        setTransactionStatus({
          lastOperation: TransactionStatus.InitTransactionSuccess,
          currentOperation: TransactionStatus.SignTransaction,
        });
        return tx;
      })
      .catch(_error => {
        console.log("SWAP transaction init error:", _error);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.InitTransactionFailure,
        });
        return undefined;
      });
    
  },[
    getSwap, 
    isValidBalance, 
    setTransactionStatus, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const signTx = useCallback(async (currentTx: Transaction) => {

    if (!wallet) {
      console.log("Cannot sign transaction! Wallet not found!");
      setTransactionStatus({
        lastOperation: TransactionStatus.SignTransaction,
        currentOperation: TransactionStatus.SignTransactionFailure,
      });
      return undefined;
    }

    console.log("Signing transaction...");

    return wallet.signTransaction(currentTx)
      .then((signedTx) => {
        console.log("signTransaction returned a signed transaction:", signedTx);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.SendTransaction,
        });
        return signedTx;
      })
      .catch(_error => {
        console.log("Signing transaction failed!", _error);
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure,
        });
        return undefined;
      });

  }, [
    setTransactionStatus, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const sendTx = useCallback(async (currentTx: Transaction) => {
    if (!wallet) {
      setTransactionStatus({
        lastOperation: TransactionStatus.SendTransaction,
        currentOperation: TransactionStatus.SendTransactionFailure
      });
      return undefined;
    }

    const serializedTx = currentTx.serialize();
    const encodedTx = base64.fromByteArray(serializedTx);
    console.log('tx serialized => ', encodedTx);

    return connection.sendRawTransaction(serializedTx)
      .then((sig) => {
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.SendTransactionSuccess
        });
        return sig;
      })
      .catch(_error => {
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        return undefined;
      });

  },[
    connection, 
    setTransactionStatus, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const confirmTx = useCallback(async (signature: string) => {

    return connection.getSignatureStatus(signature)
      .then((status) => { 
        if(status.value && status.value.confirmationStatus === 'confirmed') {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransactionSuccess,
            currentOperation: TransactionStatus.TransactionFinished
          });
          return signature;
        }
        return undefined;
      })
      .catch(_error => {
        setTransactionStatus({
          lastOperation: TransactionStatus.ConfirmTransaction,
          currentOperation: TransactionStatus.ConfirmTransactionFailure
        });
        return undefined;
      });

    // return connection.confirmTransaction(signature, 'confirmed')
    //   .then((response) => {
    //     if (response && response.value && !response.value.err) {
    //       console.log('confirmTransaction result:', response.value);
    //       setTransactionStatus({
    //         lastOperation: TransactionStatus.ConfirmTransactionSuccess,
    //         currentOperation: TransactionStatus.TransactionFinished
    //       });
    //       return response.value;
  
    //     } else if (response && response.value && response.value.err) {
    //       console.log('Error: ', response.value.err);
    //       setTransactionStatus({
    //         lastOperation: TransactionStatus.ConfirmTransaction,
    //         currentOperation: TransactionStatus.ConfirmTransactionFailure
    //       });
    //       return undefined;
    //     }
    //   })
    //   .catch(_error => {
    //     setTransactionStatus({
    //       lastOperation: TransactionStatus.ConfirmTransaction,
    //       currentOperation: TransactionStatus.ConfirmTransactionFailure
    //     });
    //     return undefined;
    //   });

  },[
    connection, 
    setTransactionStatus
  ]);

  const onTransactionStart = useCallback(async () => {

    consoleOut("Starting swap...");
    setTransactionCancelled(false);
    setIsBusy(true);

    if (wallet) {

      showTransactionModal();
      const swapTxs = await createTx();
      console.log("initialized:", swapTxs);

      if (!swapTxs || transactionCancelled) {
        setIsBusy(false);
      } else {
        const signedTx = await signTx(swapTxs);
        console.log("signed:", signedTx);

        if (!signedTx || transactionCancelled) {
          setIsBusy(false);
        } else {
          const signature = await sendTx(signedTx);

          if (!signature || transactionCancelled) {
            setIsBusy(false);
            return;
          }

          // let count = 1;
          let confirmed = await confirmTx(signature);

          while (!confirmed) {
            // console.log('count', count);
            confirmed = await confirmTx(signature);
          }

          console.log("confirmed:", confirmed); // put this in a link in the UI
          // Save signature to the state
          setIsBusy(false);
        }
      }      
    }
    
  }, [
    confirmTx, 
    createTx, 
    sendTx, 
    showTransactionModal, 
    signTx,
    transactionCancelled, 
    wallet
  ]);

  const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
    return (
      <Row>
        <Col span={11} className="text-right">
          {caption}
        </Col>
        <Col span={1} className="text-center fg-secondary-70">
          {separator}
        </Col>
        <Col span={11} className="text-left fg-secondary-70">
          {value}
        </Col>
      </Row>
    );
  };

  const infoMessage = (caption: string) => {
    return (
      <Row>
        <Col span={24} className="text-center fg-secondary-70">
          {caption}
        </Col>
      </Row>
    );
  };


  return (
    <Spin spinning={isBusy || refreshing}>
      <div className="swap-wrapper">
        {/* Source token / amount */}
        <CoinInput
          token={fromMint ? (tokenMap.get(fromMint.toBase58()) as TokenInfo) : undefined}
          tokenBalance={fromMintTokenBalance}
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={
            fromMint && !fromMint.equals(NATIVE_SOL_MINT) && parseFloat(maxFromAmount) > 0 &&
            (() => {
              setFromAmount(maxFromAmount);
            })
          }
          onSelectToken={() => {
            setSubjectTokenSelection("source");
            showTokenSelector();
          }}
          translationId="source"
        />

        <div className="flip-button-container">
          <div className="flip-button" onClick={flipMintsCallback}>
            <ArrowDownOutlined />
          </div>
        </div>

        {/* Destination token / amount */}
        <CoinInput
          token={toMint && tokenMap.get(toMint.toBase58()) as TokenInfo}
          tokenBalance={toMintTokenBalance}
          tokenAmount={toAmount}
          readonly={true}
          onInputChange={() => {}}
          onMaxAmount={() => {}}
          onSelectToken={() => {
            setSubjectTokenSelection("destination");
            showTokenSelector();
          }}
          translationId="destination"
        />

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

        {/* Info */}
        {
          fromMint && toMint && (
            <div className="p-2 mb-2">
              {
                !refreshing &&
                infoRow(
                  `1 ${tokenMap.get(fromMint.toBase58())?.symbol}`,
                  `${outToPrice} ${tokenMap.get(toMint.toBase58())?.symbol}`,
                  '≈'
                )
              }
              {
                !refreshing && isValidSwapAmount && slippage &&
                infoRow(
                  t("transactions.transaction-info.slippage"),
                  `${slippage.toFixed(1)}%`
                )
              }
              {
                !refreshing && isValidSwapAmount && fromAmount &&
                infoRow(
                  t("transactions.transaction-info.transaction-fee"),
                  `${feeAmount} ${tokenMap.get(fromMint.toBase58())?.symbol}`
                )
              }
              {
                !refreshing && isValidSwapAmount && toSwapAmount &&
                infoRow(
                  t("transactions.transaction-info.recipient-receives"),                
                  `${toSwapAmount} ${tokenMap.get(toMint.toBase58())?.symbol}`
                )
              }
              {
                !refreshing && isValidSwapAmount && priceImpact &&
                infoRow(
                  t("transactions.transaction-info.price-impact"),                
                  `${priceImpact}%`
                )
              }
            </div>
          )        
        }
        {/* Action button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={onTransactionStart}
          disabled={(!isValidBalance || !isValidSwapAmount)}>
          {getTransactionStartButtonLabel()}
        </Button>

        {/* Transaction execution modal */}
        <Modal
          className="mean-modal"
          maskClosable={false}
          visible={isTransactionModalVisible}
          title={getTransactionModalTitle()}
          onCancel={hideTransactionModal}
          afterClose={onAfterTransactionModalClosed}
          width={280}
          footer={null}
        >
          <div className="transaction-progress">
            {isBusy ? (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-1 text-uppercase">
                  {getTransactionOperationDescription(transactionStatus, t)}
                </h4>
                <p className="operation">
                  {t("transactions.status.tx-swap-operation", {
                    fromAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(fromAmount), fromMint!.toBase58()),
                    toAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(toAmount), toMint!.toBase58())
                    })
                  }
                </p>
                <div className="indication">
                  {t("transactions.status.instructions")}
                </div>
              </>
            ) : isSuccess() ? (
              <>
                <CheckOutlined
                  style={{ fontSize: 48 }}
                  className="icon"
                />
                <h4 className="font-bold mb-1 text-uppercase">
                  {getTransactionOperationDescription(transactionStatus, t)}
                </h4>
                <p className="operation">
                  {t("transactions.status.tx-swap-operation-success")}.
                </p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransactionModal}>
                  {t("general.cta-close")}
                </Button>
              </>
            ) : isError() ? (
              <>
                <WarningOutlined
                  style={{ fontSize: 48 }}
                  className="icon"
                />
                {transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t("transactions.status.tx-start-failure", {
                      accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                        fromMintTokenBalance,
                        WRAPPED_SOL_MINT_ADDRESS,
                        true
                      )} SOL`,
                      feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                        getComputedFees(txFees),
                        WRAPPED_SOL_MINT_ADDRESS,
                        true
                      )} SOL`
                    })}
                  </h4>
                ) : (
                  <h4 className="font-bold mb-1 text-uppercase">
                    {smallAmount
                      ? t('transactions.status.tx-send-failure-smallamount')
                      : getTransactionOperationDescription(transactionStatus, t)
                    }
                  </h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideTransactionModal}
                >
                  {t("general.cta-dismiss")}
                </Button>
              </>
            ) : (
              <>
                <Spin indicator={bigLoadingIcon} className="icon" />
                <h4 className="font-bold mb-4 text-uppercase">
                  {t("transactions.status.tx-wait")}...
                </h4>
              </>
            )}
          </div>
        </Modal>

      </div>
    </Spin>
    );
};
