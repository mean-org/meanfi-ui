import { Button, Modal, Row, Col, Spin } from "antd";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSwapConnection } from "../../contexts/connection";
import { formatAmount, getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { ArrowDownOutlined, CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionOperationDescription, getTxFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { TokenInfo } from "@solana/spl-token-registry";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { CoinInput } from "../CoinInput";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, SERUM_PROGRAM_ID_V3, USDC_MINT, USDT_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { encode } from "money-streaming/lib/utils";
import { TransactionStatus } from "../../models/enums";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { TextInput } from "../TextInput";
import { DEFAULT_SLIPPAGE_PERCENT, getOutAmount, getSwapOutAmount, place, swap, unwrap, wrap } from "../../utils/swap";
import "./style.less";
import { LiquidityPoolInfo } from "../../utils/pools";
import { NATIVE_SOL, TOKENS } from "../../utils/tokens";
import { cloneDeep } from "lodash-es";
import useLocalStorage from "../../hooks/useLocalStorage";
import { Market } from "../../models/market";
import BN from "bn.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getLiquidityPools } from "../../utils/liquidity";
import { TokenAmount } from "../../utils/safe-math";
import { getMarkets } from "../../utils/markets";
import { getMultipleAccounts } from "../../utils/accounts";
import { Orderbook } from "@project-serum/serum";
import * as base64 from "base64-js";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SwapUi = () => {

  const { t } = useTranslation("common");
  const { publicKey, wallet, connected } = useWallet();
  const connection = useSwapConnection();
  const {
    // coinPrices,
    transactionStatus,
    previousWalletConnectState,
    setTransactionStatus,
    setPreviousWalletConnectState

  } = useContext(AppStateContext);

  // Added by YAF (Token balance)
  const [smallAmount, setSmallAmount] = useState(0);
  const [fromMintTokenBalance, setFromMintTokenBalance] = useState(0);
  const [toMintTokenBalance, setToMintTokenBalance] = useState(0);
  const [isUpdatingPools, setIsUpdatingPools] = useState(false);
  const [isUpdatingMarkets, setIsUpdatingMarkets] = useState(false);
  const [toSwapAmount, setToSwapAmount] = useState("");
  //
  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', USDC_MINT.toBase58());
  // const [lastSwapToMint, setLastSwapToMint] = useLocalStorage('lastSwapToMint', NATIVE_SOL_MINT.toBase58());
  // Work with our swap From/To subjects
  const [fromMint, setFromMint] = useState<PublicKey | undefined>(new PublicKey(lastSwapFromMint));
  const [toMint, setToMint] = useState<PublicKey | undefined>(); //useState(new PublicKey(lastSwapToMint));
  // Continue normal flow
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [isWrap, setIsWrap] = useState(false);
  const [isUnwrap, setIsUnwrap] = useState(false);
  const [outToPrice, setOutToPrice] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [market, setMarket] = useState<Market>();
  const [orderbooks, setOrderbooks]= useState<any>([]);
  const [pool, setPool] = useState<LiquidityPoolInfo>();
  const [tokenList, setTokenList] = useState<TokenInfo[]>([]);
  const [tokenFilter, setTokenFilter] = useState("");
  const [tokenMap, setTokenMap] = useState<Map<string, TokenInfo>>(new Map<string, TokenInfo>());
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  // Transaction execution modal
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const hideTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  const [swapRateFlipped, setSwapRateFlipped] = useState(false);
  const [isFlipping, setIsFlipping] = useState(false);
  // FEES
  const [swapFees, setSwapFees] = useState<TransactionFees>({
    blockchainFee: 0,
    mspFlatFee: 0,
    mspPercentFee: 0,
  });

  // Get Tx fees
  useMemo(() => {

    calculateActionFees(connection, MSP_ACTIONS.swapTokens)
      .then(values => setSwapFees(values))
      .catch(_error => { });

  }, [
    connection
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

    let list = [];
    const symbols = Object.keys(TOKENS);
    list.push(NATIVE_SOL);
    
    for (let key of symbols) {
      let token = cloneDeep(TOKENS[key]);
      if (token.logoURI) {
        list.push(token);
      }
    }
        
    list = !tokenFilter ? list : list.filter((t: TokenInfo) =>
      t.symbol.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
      t.name.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
      t.address.toLowerCase().startsWith(tokenFilter.toLowerCase())
    );  
    
    setTokenList(list);

    return () => { }
    
  }, [
    tokenFilter, 
    tokenList.length
  ]);

  // Token map for quick lookup.
  useMemo(() => {

    const map = new Map<string, TokenInfo>();
    tokenList.forEach((t: TokenInfo) => {
      map.set(t.address, t);
    });
    
    setTokenMap(map);
    
  }, [
    tokenList
  ]);

  // Updates the amounts from pool
  useEffect(() => {

    if (!fromMint || !toMint || !pool) { return; }

    let outAmount = '';
    let outWithSlippageAmount = '';
    let price = '';

    const amount = fromAmount ? fromAmount : '1';
    const fromDecimals = tokenMap.get(fromMint.toBase58())?.decimals || 6;
    const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
    const { amountOut, amountOutWithSlippage } = getSwapOutAmount(
      pool,
      fromMint.toBase58(),
      toMint.toBase58(),
      amount,
      slippage
    );

    if (!amountOut.isNullOrZero()) {
      outAmount = fromAmount ? amountOut.fixed() : '';
      outWithSlippageAmount = fromAmount ? amountOutWithSlippage.fixed() : '';
      const outPrice = +new TokenAmount(
        parseFloat(amountOut.fixed()) / parseFloat(amount),
        fromDecimals,
        false
      ).fixed();
      price = formatAmount(outPrice, toDecimals);
    }

    setOutToPrice(price);
    setToAmount(outAmount);
    setToSwapAmount(outWithSlippageAmount);
    
  }, [
    fromMint,
    toMint,
    pool,
    fromAmount, 
    slippage, 
    tokenMap
  ]);

  // Updates the amounts from serum markets
  useEffect(() => {

    if (!fromMint || !toMint || !market || orderbooks.length < 2) { 
      return; 
    }

    let outAmount = '';
    let outWithSlippageAmount = '';
    let price = '';

    const amount = fromAmount ? fromAmount : '1';
    const toDecimals = tokenMap.get(toMint.toBase58())?.decimals || 6;
    const bids = (orderbooks.filter((ob: any) => ob.isBids)[0]).slab;
    const asks = (orderbooks.filter((ob: any) => !ob.isBids)[0]).slab;
    console.log('orderbooks', orderbooks);
    console.log('bids', bids);
    console.log('asks', asks);
    const { amountOut, amountOutWithSlippage } = getOutAmount(
      market,
      asks,
      bids,
      fromMint.toBase58(),
      toMint.toBase58(),
      amount,
      slippage
    );
    
    // console.log('slippage', slippage);
    const out = new TokenAmount(amountOut, toDecimals, false);
    const outWithSlippage = new TokenAmount(amountOutWithSlippage, toDecimals, false);

    if (!out.isNullOrZero()) {
      if (!toSwapAmount || parseFloat(toSwapAmount) <= parseFloat(outWithSlippage.fixed())) {
        outAmount = fromAmount ? out.fixed() : '';
        outWithSlippageAmount = fromAmount ? outWithSlippage.fixed() : '';
        const outPrice = +new TokenAmount(
          parseFloat(out.fixed()) / parseFloat(amount),
          toDecimals,
          false
        ).fixed();
        price = formatAmount(outPrice, toDecimals);
      }
    }

    setOutToPrice(price);
    setToAmount(outAmount);
    setToSwapAmount(outWithSlippageAmount);

  }, [
    fromMint,
    toMint,
    market,
    orderbooks,
    fromAmount, 
    slippage, 
    toSwapAmount, 
    tokenMap
  ]);

  // Updates orderbooks (bids/asks)
  const updateOrderBooks = useCallback(async (
    from: PublicKey | undefined, 
    to: PublicKey | undefined,
    market: Market
  ) => {

    if (!from || !to || !market || !market.bids || !market.asks) { 
      setIsUpdatingPools(false);
      setIsUpdatingMarkets(false);
      return; 
    }

    const accounts = await getMultipleAccounts(
      connection, 
      [
        market.bids, 
        market.asks
      ], 
      connection.commitment
    );

    const orderBooks = [];

    for (let info of accounts) {
      if (info) {
        const data = info.account.data;
        const orderbook = Orderbook.decode(market, data);
        orderBooks.push(orderbook);
      }        
    }

    setOrderbooks(orderBooks);
    setIsUpdatingPools(false);
    setIsUpdatingMarkets(false);

  }, [
    connection,
    setIsUpdatingMarkets
  ]);

  // Updates market
  const updateMarkets = useCallback(async (from: PublicKey | undefined, to: PublicKey | undefined) => {

    if (!from || !to) {
      setIsUpdatingPools(false);
      setIsUpdatingMarkets(false);
      return;
    }

    const marketInfos = await getMarkets(connection);

    if (!marketInfos) {
      setIsUpdatingPools(false);
      setIsUpdatingMarkets(false);
      return;
    }

    for(let address in marketInfos) {
      
      let info = marketInfos[address];
      let fromAddress = from.toBase58();
      let toAddress = to.toBase58();

      if (fromAddress === NATIVE_SOL_MINT.toBase58()) {
        fromAddress = WRAPPED_SOL_MINT.toBase58();
      }

      if (toAddress === NATIVE_SOL_MINT.toBase58()) {
        toAddress = WRAPPED_SOL_MINT.toBase58();
      }

      if (
        (info.baseMint.toBase58() === fromAddress && info.quoteMint.toBase58() === toAddress) ||
        (info.baseMint.toBase58() === toAddress && info.quoteMint.toBase58() === fromAddress)
      ) {

        const marketInfo = await Market.load(
          connection, 
          new PublicKey(address),
          { }, 
          new PublicKey(SERUM_PROGRAM_ID_V3)
        );

        setMarket(marketInfo);

        await updateOrderBooks(
          new PublicKey(fromAddress),
          new PublicKey(toAddress),
          marketInfo
        );

        break;
      }
    }

    setIsUpdatingPools(false);
    setIsUpdatingMarkets(false);

  },[
    connection, 
    updateOrderBooks
  ]);

  // Updates liquidity pool info
  const updatePools = useCallback(async (from: PublicKey | undefined, to: PublicKey | undefined) => {

    if (!from || !to) {
      setIsUpdatingPools(false);
      setIsUpdatingMarkets(false);
      return;
    }

    const poolInfos = await getLiquidityPools(connection, from, to);
    const poolInfo = Object.values(poolInfos).filter((lp: any) => {
      return (lp.coin.address === from.toBase58() && lp.pc.address === to.toBase58()) || 
             (lp.pc.address === from.toBase58() && lp.coin.address === to.toBase58());
        
    })[0] as LiquidityPoolInfo;

    if (poolInfo) {
      setMarket(undefined);
      setPool(poolInfo);
      setIsUpdatingPools(false);
      setIsUpdatingMarkets(false);
    } else {
      setPool(undefined);
      updateMarkets(from, to);
    }
    
  }, [
    connection,
    updateMarkets,
    setIsUpdatingPools
  ]);  

  // Automatically update fromMint token balance once
  const updateFromTokenBalance = useCallback((from: PublicKey) => {
    
    if (isFlipping || !publicKey || !from) {
      if (!isFlipping) {
        setFromMintTokenBalance(0);
      }
      return;
    }

    if (from.equals(NATIVE_SOL_MINT)) {
      connection.getAccountInfo(publicKey).then(info => {
        let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
        setFromMintTokenBalance(balance);
      })
      .catch(_error => { });
    } else {
      Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        from,
        publicKey

      ).then(addr => {
        if (addr) {
          connection.getTokenAccountBalance(addr).then(info => {
            let balance = info && info.value ? (info.value.uiAmount || 0) : 0;
            setFromMintTokenBalance(balance);
          }).catch(_error => { });
        }
      });
    }

  }, [
    isFlipping,
    connection, 
    publicKey
  ]);

  // Automatically update toMint token balance once
  const updateToTokenBalance = useCallback((to: PublicKey) => {
    
    if (isFlipping || !publicKey || !to) {
      if (!isFlipping) {
        setToMintTokenBalance(0);
      }
      return;
    }

    if (to.equals(NATIVE_SOL_MINT)) {
      connection.getAccountInfo(publicKey).then(info => {
        let balance = info ? info.lamports / LAMPORTS_PER_SOL : 0;
        setToMintTokenBalance(balance);
      }).catch(_error => { });
    } else {
      Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        to,
        publicKey

      ).then(addr => {
        if (addr) {
          connection.getTokenAccountBalance(addr).then(info => {
            let balance = info && info.value ? (info.value.uiAmount || 0) : 0;
            setToMintTokenBalance(balance);
          }).catch(_error => { });
        }
      });
    }

  }, [
    isFlipping,
    connection, 
    publicKey
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

  const onCloseTokenSelector = useCallback(() => {
    setTokenSelectorModalVisibility(false);
    setTokenFilter('');

  }, []);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState === connected) {
      return;
    }

    // User is connecting
    if (!previousWalletConnectState && connected) {
      consoleOut('Refreshing balances...', '', 'blue');
      setFromMint(new PublicKey(lastSwapFromMint));
      setPreviousWalletConnectState(true);
      updateFromTokenBalance(fromMint as PublicKey);
      updateToTokenBalance(toMint as PublicKey);

    } else if (previousWalletConnectState && !connected) {
      consoleOut('User is disconnecting...', '', 'blue');
      setLastSwapFromMint(fromMint!.toString());
      setPreviousWalletConnectState(false);
    }

    return () => { };

  }, [
    connected, 
    publicKey, 
    previousWalletConnectState, 
    fromMint, 
    toMint, 
    lastSwapFromMint, 
    setLastSwapFromMint, 
    setPreviousWalletConnectState,
    updateFromTokenBalance,
    updateToTokenBalance
  ]);

  // Event handling
  const handleSwapFromAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromAmount("");
      setToAmount("");
      setSmallAmount(0);
    } else if (isValidNumber(newValue)) {
      setFromAmount(newValue);
    }
  };

  const onTokenSearchInputChange = (e: any) => {
    const newValue = e.target.value as string;
    setTokenFilter(newValue.trim());
  }

  // Validation
  const getFeeAmount = useCallback((amount: any): number => {
    const feeAmount = getTxFeeAmount(swapFees, parseFloat(amount));
    const fromDecimals = tokenMap.get(fromMint!.toBase58())?.decimals || 6;
    const formattedAmount = parseFloat(formatAmount(feeAmount, fromDecimals));

    return formattedAmount;

  },[
    fromMint, 
    swapFees, 
    tokenMap
  ]);

  const isValidBalance = useCallback(() => {
    return fromMint && NATIVE_SOL_MINT.equals(fromMint)
      ? (parseFloat(fromAmount) - getFeeAmount(fromAmount) < fromMintTokenBalance)
      : (fromMintTokenBalance > getFeeAmount(fromAmount));
  }, [
    fromAmount, 
    fromMint, 
    fromMintTokenBalance, 
    getFeeAmount
  ])

  // TODO: Review validation
  const isSwapAmountValid = (): boolean => {

    return (
      connected &&
      fromMintTokenBalance &&
      fromMint &&
      fromAmount &&
      parseFloat(fromAmount) > 0 &&
      parseFloat(fromAmount) > getFeeAmount(fromAmount) &&
      parseFloat(fromAmount) > getFeeAmount(fromAmount) &&
      isValidBalance()

    ) ? true : false;
  };

  const getMinimumSwapAmountLabel = () => {
    const from = tokenMap.get(fromMint!.toBase58());
    const toSymbol = tokenMap.get(toMint!.toBase58())?.symbol;

    return `${t('transactions.validation.minimum-swap-amount', {
      mintAmount: `${smallAmount} ${from?.symbol}`,
      toMint: `${toSymbol}`
    })}`;

  }

  const getTransactionStartButtonLabel = (): string => {

    if (parseFloat(fromAmount) < smallAmount) {
      return  getMinimumSwapAmountLabel();
    }

    return !connected
      ? t("transactions.validation.not-connected")
      : !fromMint || !fromMintTokenBalance
      ? t("transactions.validation.no-balance")
      : !fromAmount
      ? t("transactions.validation.no-amount")
      : parseFloat(fromAmount) > fromMintTokenBalance
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

  const flipMints = () => {
    setIsFlipping(true);
    const oldFrom = fromMint;
    const oldTo = toMint;
    const oldToAmount = toAmount;
    // const oldFromAmount = fromAmount;
    const oldToBalance = toMintTokenBalance;
    const oldFromBalance = fromMintTokenBalance;
    setFromMint(oldTo);
    setToMint(oldFrom);
    setFromAmount(oldToAmount);
    // setToAmount(oldFromAmount);
    setFromMintTokenBalance(oldToBalance);
    setToMintTokenBalance(oldFromBalance);
    setSwapRateFlipped(!swapRateFlipped);
  }

  const minimumSwapSize = (amount: number) => {
    
    if (!market) {
      return 0;
    }

    let result = 0;
    const fairAmount = 1;
    const isSol = fromMint?.equals(NATIVE_SOL_MINT) || toMint?.equals(NATIVE_SOL_MINT);
    const isUSDX = 
      fromMint?.equals(USDC_MINT) || 
      fromMint?.equals(USDT_MINT) || 
      toMint?.equals(USDC_MINT) || 
      toMint?.equals(USDT_MINT);

    if (isSol) {
      result = fromMint?.equals(NATIVE_SOL_MINT) ? market.minOrderSize : market.minOrderSize * fairAmount;
    } else if (isUSDX) {
      result = amount < (market.minOrderSize/* * fairAmount*/) ? (market.minOrderSize * fairAmount) : 0;
    } else {
      // if (toMarket) {
      //   result = amount < (toMarket.minOrderSize * fairAmount) ? (toMarket.minOrderSize * fairAmount) : 0;
      // } else {
      //   result = amount < (fromMarket.minOrderSize * fairAmount) ? (fromMarket.minOrderSize * fairAmount) : 0;
      // }
    }

    const fromDecimals = tokenMap.get(fromMint!.toBase58())?.decimals || 6;
    const formattedResult = formatAmount(result, fromDecimals);
    result = parseFloat(formattedResult) + getFeeAmount(amount);

    return result;
  };

  const getSwap = useCallback(async () => {

    if (!fromMint || !toMint || !wallet) {
      throw new Error("Unable to calculate mint decimals");
    }

    if (isWrap) {

      return wrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL)
      );

    } else if (isUnwrap) {

      return unwrap(
        connection,
        wallet,
        Keypair.generate(),
        new BN(parseFloat(fromAmount) * LAMPORTS_PER_SOL)
      );

    } else {

      const fromAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMint,
        wallet.publicKey
      );

      const toAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        toMint,
        wallet.publicKey
      );

      if (pool) {

        return swap(
          connection,
          wallet,
          pool,
          fromMint.toBase58(),
          toMint.toBase58(),
          fromAccount,
          toAccount,
          fromAmount,
          toSwapAmount
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
          fromMint.toBase58(),
          toMint.toBase58(),
          fromAccount,
          toAccount,
          fromAmount,
          slippage
        );
      }
    }

  },[
    connection,
    fromMint,
    toMint,
    fromAmount, 
    isUnwrap, 
    isWrap, 
    market, 
    orderbooks,
    pool, 
    slippage, 
    toSwapAmount, 
    wallet
  ]);

  const renderSourceTokenList = (
    <>
      {tokenList.length ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            const newMint = new PublicKey(token.address);
            setIsFlipping(false);
            setFromMint(newMint);
            setLastSwapFromMint(newMint.toBase58());
            setIsUpdatingPools(true);
            setIsUpdatingMarkets(true);
            setTimeout(() => {
              updateFromTokenBalance(newMint);
              updatePools(newMint, toMint);
            });
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
      {tokenList.length ? (
        tokenList.map((token, index) => {
          const onClick = () => {
            console.log('token.address', token.address);
            const newMint = new PublicKey(token.address);
            setIsFlipping(false);
            setToMint(newMint);
            setIsUpdatingPools(true);
            setIsUpdatingMarkets(true);
            setTimeout(() => {
              updateToTokenBalance(newMint);
              updatePools(fromMint, newMint);
            });
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

  const isSuccess = (): boolean => {
    return (
      transactionStatus.currentOperation ===
      TransactionStatus.TransactionFinished
    );
  };

  const isError = (): boolean => {
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
  };

  const onAfterTransactionModalClosed = () => {
    if (isBusy) {
      setTransactionCancelled(true);
    }
    if (isSuccess()) {
      setFromAmount("");
      setToAmount("");
      hideTransactionModal();
    }
  };

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
    if (!isValidBalance()) {
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.TransactionStartFailure,
      });
      return false;
    }

    try {
      const tx = await getSwap();

      if (tx) {
        console.log("SWAP returned transaction:", tx);
        setTransactionStatus({
          lastOperation: TransactionStatus.InitTransactionSuccess,
          currentOperation: TransactionStatus.SignTransaction,
        });
        return tx;
      }
    } catch(error) {
      console.log("SWAP transaction init error:", error);
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.InitTransactionFailure,
      });
      return undefined;
    }
    
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

    try {
      const signedTx = await wallet.signTransaction(currentTx);

      if (signedTx) {
        console.log("signTransaction returned a signed transaction:", signedTx);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.SendTransaction,
        });
        return signedTx;
      }

    } catch(error) {
      console.log("Signing transaction failed!", error);
      setTransactionStatus({
        lastOperation: TransactionStatus.SignTransaction,
        currentOperation: TransactionStatus.SignTransactionFailure,
      });
      return undefined;
    }
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
    
    try {
      const serializedTx = currentTx.serialize();
      const encodedTx = base64.fromByteArray(serializedTx);
      console.log('tx serialized => ', encodedTx);
      const sig = await connection.sendRawTransaction(serializedTx);

      if (sig) {
        console.log('sendSignedTransaction returned a signature:', sig);
        setTransactionStatus({
          lastOperation: transactionStatus.currentOperation,
          currentOperation: TransactionStatus.SendTransactionSuccess
        });
        return sig;
      }

      return undefined;

    } catch(error) {
      setTransactionStatus({
        lastOperation: TransactionStatus.SendTransaction,
        currentOperation: TransactionStatus.SendTransactionFailure
      });
      return undefined;
    }    
  },[
    connection, 
    setTransactionStatus, 
    transactionStatus.currentOperation, 
    wallet
  ]);

  const confirmTx = useCallback(async (signature: string) => {

    try {

      const confirmed = await connection.confirmTransaction(signature, 'confirmed');

      if (confirmed && confirmed.value && !confirmed.value.err) {
        console.log('confirmTransaction result:', confirmed.value);
        setTransactionStatus({
          lastOperation: TransactionStatus.ConfirmTransactionSuccess,
          currentOperation: TransactionStatus.TransactionFinished
        });
        return confirmed.value;

      } else if (confirmed && confirmed.value && confirmed.value.err) {
        console.log('Error: ', confirmed.value.err);
        setTransactionStatus({
          lastOperation: TransactionStatus.ConfirmTransaction,
          currentOperation: TransactionStatus.ConfirmTransactionFailure
        });
        return undefined;
      }
    } catch(error) {
      setTransactionStatus({
        lastOperation: TransactionStatus.ConfirmTransaction,
        currentOperation: TransactionStatus.ConfirmTransactionFailure
      });
      return undefined;
    }
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

          const confirmed = await confirmTx(signature);
          
          if (!confirmed) {
            setIsBusy(false);
            return;
          }

          console.log("confirmed:", signature); // put this in a link in the UI
          // Save signature to the state
          setFromAmount('');
          updateFromTokenBalance(fromMint as PublicKey);
          updateToTokenBalance(toMint as PublicKey);
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
    updateFromTokenBalance,
    updateToTokenBalance,
    setFromAmount,
    transactionCancelled, 
    wallet,
    fromMint,
    toMint
  ]);

  const infoRow = (caption: string, value: string, separator: string = '≈', route: boolean = false) => {
    return (
      <Row>
        <Col span={10} className="text-right">
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
    <Spin spinning={isBusy || (isUpdatingPools && isUpdatingMarkets && !isFlipping)}>
      <div className="swap-wrapper">
        {/* Source token / amount */}
        <CoinInput
          token={fromMint ? (tokenMap.get(fromMint.toBase58()) as TokenInfo) : undefined}
          tokenBalance={fromMintTokenBalance}
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={() => {
            setFromAmount(fromMintTokenBalance.toString());
            const minSwapSize = minimumSwapSize(fromMintTokenBalance);
            setSmallAmount(minSwapSize);
          }}
          onSelectToken={() => {
            setSubjectTokenSelection("source");
            showTokenSelector();
          }}
          translationId="source"
        />

        <div className="flip-button-container">
          <div className="flip-button" onClick={() => flipMints()}>
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
          onMaxAmount={() => setToAmount(toMintTokenBalance.toString())}
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
          fromMint && toMint ? (
          <div className="p-2 mb-2">
            { 
              isWrap
                ? infoRow(
                  `1 ${tokenMap.get(fromMint.toBase58())?.symbol}`,
                  `1 ${tokenMap.get(toMint.toBase58())?.symbol}`,
                  '=',
                  true
                )
                : (
                  outToPrice &&
                  infoRow(
                    `1 ${tokenMap.get(fromMint.toBase58())?.symbol}`,
                    `${outToPrice} ${tokenMap.get(toMint.toBase58())?.symbol}`,
                    '≈',
                    true
                  )
                )
            }
            {
              isSwapAmountValid() &&
              infoRow(
                t("transactions.transaction-info.transaction-fee"),
                formatAmount(
                  getFeeAmount(fromAmount), 
                  tokenMap.get(fromMint.toBase58())?.decimals

                ) + ` ${tokenMap.get(fromMint.toBase58())?.symbol || "USDC"}`
              )
            }
            {
              isSwapAmountValid() &&
              infoRow(
                t("transactions.transaction-info.recipient-receives"),
                formatAmount(
                  parseFloat(toSwapAmount),
                  tokenMap.get(toMint.toBase58())?.decimals

                ) + ` ${tokenMap.get(toMint.toBase58())?.symbol || "SOL"}`
              )
            }
          </div>
        ) : (
          <div className="p-2 mb-2">
            {infoMessage(t('swap.insufficient-liquidity'))}
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
          disabled={!isSwapAmountValid()}>
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
                        getComputedFees(swapFees),
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
