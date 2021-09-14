import { Row, Col, Spin, Modal, Button } from "antd";
import { SwapSettings } from "../SwapSettings";
import { CoinInput } from "../CoinInput";
import { TextInput } from "../TextInput";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSwapConnection } from "../../contexts/connection";
import { getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { ArrowDownOutlined, CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTxFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { Constants } from "money-streaming/lib/constants";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, USDC_MINT, USDT_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { TransactionStatus } from "../../models/enums";
import { DEFAULT_SLIPPAGE_PERCENT, unwrap, wrap } from "../../utils/swap";
import useLocalStorage from "../../hooks/useLocalStorage";
import { Market } from "../../models/market";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as base64 from "base64-js";
import BN from "bn.js";
import "./style.less";

// NEW
import { TOKENS } from "../../amms/data";
import { LPClient, ExchangeInfo, SERUM, TokenInfo } from "../../amms/types";
import { SerumClient } from "../../amms/serum/types";
import { getClient, getOptimalPool, getTokensPools } from "../../amms/utils";
import { LiquidityPoolInfo } from "../../utils/pools";
import { cloneDeep } from "lodash";

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
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [fromTokenList, setFromTokenList] = useState<TokenInfo[]>([]);
  const [toTokenList, setToTokenList] = useState<TokenInfo[]>([]);
  const [tokenFilter, setTokenFilter] = useState("");
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map<string, TokenInfo>());
  const [tokenBalances, setTokenBalances] = useState<Map<string, string>>(new Map<string, string>());
  const [isFlipping, setIsFlipping] = useState(false);
  const [shouldUpdateBalances, setShouldUpdateBalances] = useState(true);
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [isValidBalance, setIsValidBalance] = useState(false);
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
  const [swapClient, setSwapClient] = useState<any>();
  // const [currentPool, setCurrentPool] = useState<any>();
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo>();
  // const [serumMarket, setSerumMarket] = useState<any>();
  // const [marketOrderbooks, setMarketOrderbooks] = useState<any[]>([]);
  const [refreshTime, setRefreshTime] = useState(0);
  const [feeAmounts, setFeeAmounts] = useState<any>({
    network: 0,
    protocol: 0,
    aggregator: 0,
    total: 0
  });

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
      const amountOut = parseFloat((amount  * priceAmount).toFixed(9));
      const amountWithFee = parseFloat(((amount - feeAmounts.total) * priceAmount).toFixed(9));
      setToAmount(fromAmountValid ? amountOut.toString() : '');      
      setToSwapAmount(fromAmountValid ? amountWithFee.toString() : '');
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    feeAmounts, 
    fromAmount, 
    isUnwrap, 
    isWrap
  ]);

  // Automatically reset and refresh the counter to update exchange info
  useEffect(() => {

    if (!connection || !fromMint || !toMint || !refreshTime) {
      return; 
    }

    const timeout = setTimeout(() => {
      setRefreshTime(refreshTime - 1);
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    fromMint, 
    refreshTime, 
    toMint
  ]);

  // Automatically updates the exchange info
  useEffect(() => {

    if (!fromMint || !toMint || !swapClient || isWrap || isUnwrap || !fromAmount) { 
      return; 
    }

    const timeout = setTimeout(() => {
      const amount = parseFloat(fromAmount);
      const aggregatorFees = getTxFeeAmount(txFees, amount);
      swapClient
        .getExchangeInfo(
          fromMint.toBase58(),
          toMint.toBase58(),
          amount - aggregatorFees,
          parseFloat(slippage.toFixed(1))
        )
        .then((ex: ExchangeInfo) => {
          console.log(ex);
          setExchangeInfo(ex);
        })
        .catch((_error: any) => { 
          console.log(_error);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    fromAmount, 
    fromMint,
    toMint,
    isUnwrap, 
    isWrap, 
    slippage, 
    swapClient,
    txFees
  ]);

  // Updates the amounts from exchange info
  useEffect(() => {

    if (!fromMint || !toMint || isWrap || isUnwrap || !exchangeInfo) { 
      return; 
    }

    const timeout = setTimeout(() => {
      const fromAmountValid = fromAmount && parseFloat(fromAmount);
      const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
      setPriceImpact(exchangeInfo.priceImpact.toFixed(toDecimals));
      setOutToPrice(exchangeInfo.outPrice.toFixed(toDecimals));
      setToAmount(fromAmountValid ? exchangeInfo.outAmount.toFixed(toDecimals) : '');
      setToSwapAmount(fromAmountValid ? exchangeInfo.outMinimumAmount.toFixed(toDecimals) : '');
    });

    return () => {
      clearTimeout(timeout);
    }
    
  }, [
    exchangeInfo, 
    fromAmount, 
    fromMint, 
    toMint, 
    isUnwrap, 
    isWrap, 
    tokenMap
  ]);
  
  // Updates liquidity pool info
  useEffect(() => {

    if (!connection || !fromMint || !toMint || isWrap || isUnwrap || isFlipping || refreshTime > 0) {
      if (isFlipping) { setIsFlipping(false); }
      return;
    }

    const timeout = setTimeout(() => {

      setRefreshing(true);
      const tokensPools = getTokensPools(fromMint.toBase58(), toMint.toBase58());

      if (tokensPools.length) {
      // find the optimal pool and get the client for that pool
      let optimalPool = getOptimalPool(tokensPools);
      let client = getClient(connection, optimalPool.protocolAddress) as LPClient;

      client
        .getPoolInfo(optimalPool.address)
        .then((_poolInfo: any) => {
          setSwapClient(client);
          setRefreshTime(30);
          setRefreshing(false);
        })
        .catch((_error: any) => { 
          console.log(_error);
          setRefreshing(false); 
        });

    } else {
      // just find a market (Serum client)
      let client = getClient(connection, SERUM.toBase58()) as SerumClient;
      
      client
        .getMarketInfo(
          fromMint.toBase58(),
          toMint.toBase58()
        )
        .then((marketInfo: any) => {
          console.log('marketInfo', marketInfo);
          client
            .getMarketOrderbooks(marketInfo)
            .then((_orderBooks: any[]) => {
              setSwapClient(client);
              setRefreshTime(30);
              setRefreshing(false);
            })
            .catch((_error: any) => {
              console.log(_error);
              setRefreshing(false);
            });
        })
        .catch((_error: any) => {
          console.log(_error);
          setRefreshing(false);
        });
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    fromMint,
    toMint,
    isFlipping, 
    isUnwrap, 
    isWrap,
    refreshTime
  ]);

  // Automatically update all tokens balance
  useEffect(() => {
    
    if (!connected || !publicKey || !tokenMap) {
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
          .catch(_error => { 
            balancesMap.set(item.address, '');
          });

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
          }).catch(_error => {
            balancesMap.set(item.address, '');
          });
        }
      }

      setTokenBalances(balancesMap);
      setShouldUpdateBalances(false);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    publicKey, 
    tokenMap, 
    connection,
    shouldUpdateBalances
  ]);

  // Automatically update fromMint token balance once
  useEffect(() => {
    
    if (!connected || !publicKey || !fromMint) {
      setFromMintTokenBalance(0);
      setShouldUpdateBalances(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (fromMint.equals(NATIVE_SOL_MINT)) {
        connection.getAccountInfo(publicKey).then(info => {
          let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
          setFromMintTokenBalance(balance);
          setShouldUpdateBalances(false);
        })
        .catch(_error => { 
          setFromMintTokenBalance(0);
          setShouldUpdateBalances(false);
        });
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
            }).catch(_error => { 
              console.log(_error); 
              setFromMintTokenBalance(0);
              setShouldUpdateBalances(false);
            });
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
    shouldUpdateBalances
  ]);

  // Automatically update toMint token balance once
  useEffect(() => {
    
    if (!connected || !publicKey || !toMint) {
      setToMintTokenBalance(0);
      setShouldUpdateBalances(false);
      return;
    }

    const timeout = setTimeout(() => {
      if (toMint.equals(NATIVE_SOL_MINT)) {
        connection.getAccountInfo(publicKey).then(info => {
          let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
          setToMintTokenBalance(balance);
          setShouldUpdateBalances(false);
        }).catch(_error => { 
          setToMintTokenBalance(0);
          setShouldUpdateBalances(false);
         });
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
            }).catch(_error => { 
              // console.log(_error);
              setToMintTokenBalance(0);
              setShouldUpdateBalances(false);
             });
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

    if (!fromMint || !txFees || !exchangeInfo) { return; }

    const timeout = setTimeout(() => {
      const fromAmountValid = fromAmount && parseFloat(fromAmount) 
        ? parseFloat(fromAmount) 
        : 0;

      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const amount = getTxFeeAmount(txFees, fromAmountValid);
      const protocolAmount = parseFloat((exchangeInfo.protocolFees * fromAmountValid / 100).toFixed(fromDecimals));
      const fees = {
        network: txFees.blockchainFee,
        protocol: protocolAmount,
        aggregator: parseFloat(amount.toFixed(fromDecimals)),
        total: parseFloat((amount + protocolAmount).toFixed(fromDecimals))
      };
      console.log('fees', fees);
      // const total = fees.aggregator + fees.protocol;
      // const formattedAmount = parseFloat(total.toFixed(fromDecimals));
      setFeeAmounts(fees);
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    fromMint,
    fromAmount, 
    txFees, 
    tokenMap,
    fromMintTokenBalance,
    exchangeInfo
  ]);

  // Automatically updates the max allowed amount to swap
  useEffect(() => {

    if (!connected || !fromMint || !exchangeInfo) { return; }
    
    const timeout = setTimeout(() => {

      let maxAmount = 0;
      const validfromAmount = isValidNumber(fromAmount) ? parseFloat(fromAmount) : 0;
      const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
      const txFee = getTxFeeAmount(txFees, validfromAmount);
      const totalFees = txFee + exchangeInfo.protocolFees;

      if (fromMint.equals(NATIVE_SOL_MINT)) {
        const nativeBalance = parseFloat(tokenBalances.get(NATIVE_SOL_MINT.toBase58()) || '0');
        maxAmount = (nativeBalance - totalFees) < 0 
          ? parseFloat(validfromAmount.toFixed(9))
          : parseFloat((nativeBalance - totalFees).toFixed(9));

      } else {
        maxAmount = (fromMintTokenBalance - totalFees) < 0 
          ? parseFloat(validfromAmount.toFixed(9))
          : parseFloat((fromMintTokenBalance - totalFees).toFixed(fromDecimals));
      }

      setMaxFromAmount(maxAmount.toString());
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    exchangeInfo, 
    fromAmount, 
    fromMint, 
    fromMintTokenBalance, 
    tokenBalances, 
    tokenMap, 
    txFees
  ]);

  // Automatically updates if the balance is valid
  useEffect(() => {

    if (!connected || !fromMint || !fromMintTokenBalance) {
      setIsValidBalance(false);
      return; 
    }
    
    const timeout = setTimeout(() => {

      const amount = fromAmount ? parseFloat(fromAmount) : 0;
      const txFee = getTxFeeAmount(txFees, amount);

      if (amount > fromMintTokenBalance) {
        setIsValidBalance(false);
      } else {
        let valid = false;
        let amountWithfees = 0;
        const nativeBalance = parseFloat(tokenBalances.get(NATIVE_SOL_MINT.toBase58()) || '0');

        if (fromMint.equals(NATIVE_SOL_MINT)) {
          amountWithfees = amount - txFee + txFees.blockchainFee;
          valid = nativeBalance > amountWithfees ? true : false;
        } else {
          valid = nativeBalance > txFees.blockchainFee ? true : false;
        }

        setIsValidBalance(valid);
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    fromAmount, 
    fromMint, 
    fromMintTokenBalance, 
    tokenBalances, 
    txFees
  ])

  // TODO: Review validation
  // Automatically updates if the from swap amount is valid
  useEffect(() => {

    const timeout = setTimeout(() => {
      const valid = (
        fromMint &&
        toMint &&
        fromAmount &&
        toSwapAmount &&
        outToPrice &&
        parseFloat(fromAmount) > 0
  
      ) ? true : false;
  
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
      // const ethTokenInfo = tokenList.filter(info => info.symbol === 'ETH')[0];

      if (!btcTokenInfo /* || !ethTokenInfo */) { return; }

      if (fromMint && (fromMint.toBase58() === btcTokenInfo.address /* || fromMint.toBase58() === ethTokenInfo.address */)) {
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
      // const ethTokenInfo = tokenList.filter(info => info.symbol === 'ETH')[0];

      if (!btcTokenInfo /* || !ethTokenInfo */) { return; }

      if (toMint && (toMint.toBase58() === btcTokenInfo.address /* || toMint.toBase58() === ethTokenInfo.address*/)) {
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

  // Updates the label of the Swap button
  const getTransactionStartButtonLabel = (): string => {

    let label = '';

    if (!connected) {
      label = t("transactions.validation.not-connected");
    } else if(connected && !fromMintTokenBalance)  {
      label = t("transactions.validation.amount-low");
    } else if (!fromAmount) {
      label = t("transactions.validation.no-amount");
    } else {
      const amount = parseFloat(fromAmount);
      const symbol = fromMint && fromMint.equals(NATIVE_SOL_MINT)
        ? (tokenMap.get(fromMint.toBase58())?.symbol || '') : '';
  
      if (amount > fromMintTokenBalance) {
        label = t('transactions.validation.amount-high', { symbol });
      } else if (!isValidSwapAmount) {
        label = t("transactions.validation.invalid-exchange");
      } else if(isValidBalance) {
        label = t("transactions.validation.valid-approve");
      } else {
        const nativeBalance = parseFloat(tokenBalances.get(NATIVE_SOL_MINT.toBase58()) || '0');
        const txFee = getTxFeeAmount(txFees, amount);
        
        if (fromMint && fromMint.equals(NATIVE_SOL_MINT)) {
          const amountWithFees = amount - txFee + txFees.blockchainFee;
          const needed =  Math.abs(nativeBalance - amountWithFees);       
          label = `${t('transactions.validation.insufficient-balance-needed', {
            balance: `${(nativeBalance + needed).toFixed(9)}`
          })}`; 
        } else {
          const amountWithFees = amount + txFees.blockchainFee;
          const needed = Math.abs(nativeBalance - amountWithFees);
          label = `${t('transactions.validation.insufficient-balance-needed', {
            balance: `${(nativeBalance + needed).toFixed(9)}`
          })}`;
        }
      }
    }

    return label;
  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return (
      source &&
      destination &&
      source.name === destination.name &&
      source.address === destination.address
    ) ? true : false;
  }

  const flipMintsCallback = useCallback(() => {
    
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
      setRefreshTime(0);
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

    if (!fromMint || !toMint || !wallet || !swapClient || !fromAmount) {
      throw new Error("Error executing transaction");
    }

    const aggregatorFee = getTxFeeAmount(txFees, parseFloat(fromAmount));

    if (isWrap) {

      return wrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL),
        Constants.MSP_OPS,
        new BN(aggregatorFee * LAMPORTS_PER_SOL)
      );

    } else if (isUnwrap) {

      return unwrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL),
        Constants.MSP_OPS,
        new BN(aggregatorFee * LAMPORTS_PER_SOL)
      );

    } else {

      return swapClient.getSwap(
        wallet.publicKey,
        fromMint.toBase58(),
        toMint.toBase58(),
        parseFloat(fromAmount),
        parseFloat(toAmount),
        slippage,
        Constants.MSP_OPS.toBase58(),
        aggregatorFee
      );
    }

  },[
    connection, 
    fromAmount, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    slippage, 
    swapClient, 
    toAmount, 
    toMint, 
    wallet, 
    txFees
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
              setRefreshTime(0);
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
              setRefreshTime(0);
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

    return connection.confirmTransaction(signature)
      .then((resp) => { 
        if(resp && resp.value && !resp.value.err) {
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

  },[
    connection, 
    setTransactionStatus
  ]);

  const onTransactionStart = useCallback(async () => {

    consoleOut("Starting swap...");
    setTransactionCancelled(false);
    setRefreshTime(60);
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

          let confirmed = await confirmTx(signature);

          if (!confirmed) {
            setIsBusy(false);
            return;
          }

          console.log("confirmed:", confirmed); // put this in a link in the UI
          setShouldUpdateBalances(true);
          setTimeout(() => setIsBusy(false), 1000);
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

  const onSlippageChanged = (value: any) => {
    setSlippage(value);
  };

  return (
    <Spin spinning={isBusy || refreshing}>
      <div className="swap-wrapper">

        {/* Title bar with settings */}
        <div className="swap-title-and-settings flexible-left">
          <div className="left title">{t('ui-menus.main-menu.swap')}</div>
          <div className="right"><SwapSettings currentValue={slippage} onValueSelected={onSlippageChanged}/></div>
        </div>

        {/* Source token / amount */}
        <CoinInput
          token={fromMint ? (tokenMap.get(fromMint.toBase58()) as TokenInfo) : undefined}
          tokenBalance={fromMintTokenBalance}
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={
            fromMint && !fromMint.equals(NATIVE_SOL_MINT) &&
            (() => {
              const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
              const aggregatorFee = getTxFeeAmount(txFees, fromMintTokenBalance);
              setFromAmount((fromMintTokenBalance - aggregatorFee).toFixed(fromDecimals));
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
                  `${slippage.toFixed(2)}%`
                )
              }
              {
                !refreshing && isValidSwapAmount && fromAmount &&
                infoRow(
                  t("transactions.transaction-info.transaction-fee"),
                  `${feeAmounts.total} ${tokenMap.get(fromMint.toBase58())?.symbol}`
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
              {
                !refreshing && isValidSwapAmount && exchangeInfo &&
                infoRow(
                  t("transactions.transaction-info.exchange-on"),                
                  `${exchangeInfo.origin}`,
                  ':'
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
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
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
                  {
                    fromMint && toMint &&
                    t("transactions.status.tx-swap-operation", {
                      // fromAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(fromAmount), fromMint!.toBase58()),
                      fromAmount: `${fromAmount} ${tokenMap.get(fromMint.toBase58())?.symbol}`,
                      // toAmount: getTokenAmountAndSymbolByTokenAddress(parseFloat(toAmount), toMint!.toBase58())
                      toAmount: `${toAmount} ${tokenMap.get(toMint.toBase58())?.symbol}`
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
