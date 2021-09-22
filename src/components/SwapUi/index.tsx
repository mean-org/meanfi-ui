import { Row, Col, Spin, Modal, Button } from "antd";
import { SwapSettings } from "../SwapSettings";
import { CoinInput } from "../CoinInput";
import { TextInput } from "../TextInput";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSwapConnection } from "../../contexts/connection";
import { getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { ArrowDownOutlined, CheckOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTxPercentFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { MSP_ACTIONS, TransactionFees } from "money-streaming/lib/types";
import { Constants } from "money-streaming/lib/constants";
import { calculateActionFees } from "money-streaming/lib/utils";
import { useTranslation } from "react-i18next";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, USDC_MINT, USDT_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { TransactionStatus } from "../../models/enums";
import { DEFAULT_SLIPPAGE_PERCENT } from "../../utils/swap";
import useLocalStorage from "../../hooks/useLocalStorage";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import "./style.less";

// NEW
import { TOKENS } from "../../amms/data";
import { LPClient, ExchangeInfo, SERUM, TokenInfo, FeesInfo } from "../../amms/types";
import { SerumClient } from "../../amms/serum/types";
import { getClient, getExchangeInfo, getFormattedAmount, getOptimalPool, getTokensPools, unwrap, wrap } from "../../amms/utils";
import { cloneDeep } from "lodash";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { InfoIcon } from "../InfoIcon";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SwapUi = (props: {
  queryFromMint: string | null;
  queryToMint: string | null;
}) => {

  // Use injected params
  const {queryFromMint, queryToMint} = props;

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
  const [refreshing, setRefreshing] = useState(false);
  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', USDC_MINT.toBase58());
  // Continue normal flow
  const [fromAmount, setFromAmount] = useState("");
  const [isWrap, setIsWrap] = useState(false);
  const [isUnwrap, setIsUnwrap] = useState(false);
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [tokenFilter, setTokenFilter] = useState("");
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
  const [txFees, setTxFees] = useState<TransactionFees>();
  // AGGREGATOR
  const [lastFromMint, setLastFromMint] = useLocalStorage('lastFromToken', NATIVE_SOL_MINT.toBase58());
  const [fromMint, setFromMint] = useState<string | undefined>(lastFromMint);
  const [toMint, setToMint] = useState<string | undefined>();
  const [fromSwapAmount, setFromSwapAmount] = useState(0);
  const [maxFromAmount, setMaxFromAmount] = useState(0);
  const [fromBalance, setFromBalance] = useState('');
  const [toBalance, setToBalance] = useState('');
  const [userAccount, setUserAccount] = useState<any | undefined>();
  const [userBalances, setUserBalances] = useState<any>();
  const [mintList, setMintList] = useState<any>({});
  const [showFromMintList, setShowFromMintList] = useState<any>({});
  const [showToMintList, setShowToMintList] = useState<any>({});  
  const [swapClient, setSwapClient] = useState<any>();
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo>();
  const [refreshTime, setRefreshTime] = useState(0);
  const [feesInfo, setFeesInfo] = useState<FeesInfo>();
  const [transactionStartButtonLabel, setTransactionStartButtonLabel] = useState('');

  // Automatically updates the user account
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!connected || !publicKey) { return; }
    
    const timeout = setTimeout(() => {

      const error = (_error: any) => console.log(_error);
      const success = (info: any) => {
        console.info('user', info);
        setUserAccount(info);
      };

      connection.getAccountInfo(publicKey)
        .then((accInfo: any) => success(accInfo))
        .catch(_error => error(_error));

    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connected, 
    connection, 
    publicKey,
    shouldUpdateBalances
  ]);

  // Get Tx fees
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    const timeout = setTimeout(() => {

      const action = isWrap || isUnwrap 
        ? MSP_ACTIONS.wrap 
        : MSP_ACTIONS.swap;
      
      const success = (fees: TransactionFees) => {
        setTxFees(fees);
        console.info('fees', fees);
      };

      const error = (_error: any) => console.log(_error);

      calculateActionFees(connection, action)
        .then((fees: TransactionFees) => success(fees))
        .catch((_error: any) => error(_error));
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

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!fromMint || !toMint) {
      return;
    }

    setIsWrap((
      fromMint &&
      toMint &&
      fromMint === NATIVE_SOL_MINT.toBase58() && 
      toMint === WRAPPED_SOL_MINT.toBase58()

    ) ? true : false);

    setIsUnwrap((
        fromMint &&
        toMint &&
        fromMint === WRAPPED_SOL_MINT.toBase58() && 
        toMint === NATIVE_SOL_MINT.toBase58()
      ) ? true : false
    );
    
  }, [
    connection, 
    fromMint, 
    toMint
  ]);

  // Updates the token list everytime is filtered
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!mintList) { return; }

    const timeout = setTimeout(() => {

      const filter = (t: any) => {
        return (
          t.symbol.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.name.toLowerCase().startsWith(tokenFilter.toLowerCase()) ||
          t.address.toLowerCase().startsWith(tokenFilter.toLowerCase())
        );
      };      
      
      if (subjectTokenSelection === 'source') {

        let showFromList = !tokenFilter 
          ? mintList 
          : Object.values(mintList)
            .filter((t: any) => filter(t));

        setShowFromMintList(showFromList);

      } 
      
      if (subjectTokenSelection === 'destination') {

        let showToList = !tokenFilter 
          ? mintList 
          : Object.values(mintList)
            .filter((t: any) => filter(t));

        setShowToMintList(showToList);
      }

    });

    return () => { 
      clearTimeout(timeout);
    }
    
  }, [
    connection,
    tokenFilter, 
    subjectTokenSelection, 
    mintList
  ]);

  // Token map for quick lookup.
  useMemo(() => {

    const list: any = { };

    for (let info of TOKENS) {
      let mint = cloneDeep(info);
      if (mint.logoURI) {
        list[mint.address] = mint;
      }
    }

    setMintList(list);
    setShowFromMintList(list);
    setShowToMintList(list);

  }, []);

  // Updates the amounts when is wrap or unwrap
  useEffect(() => { 

    if ((!isWrap && !isUnwrap) || !txFees) { return; }

    const timeout = setTimeout(() => {

      const aggregatorFees = getTxPercentFeeAmount(txFees, fromSwapAmount);
      const exchange = {
        amountIn: fromSwapAmount,
        amountOut: fromSwapAmount - aggregatorFees,
        minAmountOut: fromSwapAmount - aggregatorFees,
        outPrice: 1,
        priceImpact: 0.00,
        networkFees: txFees.blockchainFee,
        protocolFees: 0

      } as ExchangeInfo;

      console.log('exchange', exchange);

      setExchangeInfo(exchange);

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    isUnwrap, 
    isWrap, 
    fromSwapAmount, 
    txFees
  ]);

  // Automatically reset and refresh the counter to update exchange info
  useEffect(() => {

    if (!connection || !fromMint || !toMint || !refreshTime) {
      return; 
    }

    const success = () => setRefreshTime(refreshTime - 1);
    const timeout = setTimeout(() => success, 1000);

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

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!fromMint || !toMint || !txFees || !swapClient || isWrap || isUnwrap) { 
      return; 
    }
    
    const timeout = setTimeout(() => {

      const aggregatorFees = getTxPercentFeeAmount(txFees, fromSwapAmount);
      const amount = fromSwapAmount - aggregatorFees;

      const success = (info: ExchangeInfo) => {
        console.info('Exchange', info);
        setExchangeInfo(info);
      };

      const error = (_error: any) => console.error(_error);

      const promise = getExchangeInfo(
        swapClient,
        fromMint,
        toMint,
        amount,
        slippage
      );

      promise
        .then((info: ExchangeInfo) => success(info))
        .catch((_error: any) => error(_error));

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    fromMint,
    fromSwapAmount, 
    isUnwrap, 
    isWrap, 
    slippage, 
    swapClient, 
    toMint, 
    txFees
  ]);

  // Automatically updates the fees info
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!fromMint || !toMint || !txFees || !exchangeInfo) {
      return;
    }

    const timeout = setTimeout(() => {

      const aggregatorFees = getTxPercentFeeAmount(txFees, fromSwapAmount);
      const fees = {
        aggregator: aggregatorFees,
        protocol: exchangeInfo.protocolFees,
        network: exchangeInfo.networkFees === 0 ? txFees.blockchainFee : exchangeInfo.networkFees,
        total: isWrap || isUnwrap ? aggregatorFees : aggregatorFees + exchangeInfo.protocolFees

      } as FeesInfo;

      setFeesInfo(fees);

    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    exchangeInfo, 
    fromSwapAmount, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    toMint, 
    txFees
  ]);
  
  // Updates liquidity pool info
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!fromMint || !toMint || isWrap || isUnwrap || isFlipping) {
      setIsFlipping(false); 
      return;
    }

    const timeout = setTimeout(() => {

      setRefreshing(true);

      const error = (_error: any) => {
        console.log(_error);
        setRefreshing(false); 
      };

      const tokensPools = getTokensPools(fromMint, toMint);
      console.log('pools', tokensPools);
      let promise: any;
      let client: any;

      if (tokensPools.length) {
        const optimalPool = getOptimalPool(tokensPools);
        client = getClient(connection, optimalPool.protocolAddress) as LPClient;
        if (!client) {
          error(new Error('Exchange client not found'));
          return;
        }
        promise = client.getPoolInfo(optimalPool.address);
      } else {
        client = getClient(connection, SERUM.toBase58()) as SerumClient;
        if (!client) {
          error(new Error('Exchange client not found'));
          return;
        }
        promise = client.getMarketInfo(fromMint, toMint);
      }

      const consoleMsg = tokensPools.length ? 'Liquidity Pool' : 'Serum Market';
      const success = (info: any) => {

        if (tokensPools.length) {
          console.info(consoleMsg, info);
          setSwapClient(client);
          setRefreshing(false);

        } else {

          const orderBooksSuccess = (orderbooks: any) => {
            console.info(consoleMsg, info);
            console.info('Orderbooks', orderbooks);
            setSwapClient(client);
            setRefreshing(false);
          }

          client.getMarketOrderbooks(info)
            .then((orderbooks: any) => orderBooksSuccess(orderbooks))
            .catch((_error: any) => error(_error));
        }
      };

      promise
        .then((info: any) => success(info))
        .catch((_error: any) => error(_error));

    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    fromMint, 
    isFlipping, 
    isUnwrap, 
    isWrap, 
    toMint
  ]);

  // Automatically update all tokens balance
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }
    
    if (!connected || !mintList || !publicKey || !userAccount) {
      return;
    }

    const timeout = setTimeout(() => {
      
      const balancesMap: any = {};

      balancesMap[NATIVE_SOL_MINT.toBase58()] = 
        userAccount ? userAccount.lamports / LAMPORTS_PER_SOL : 0;

      const tokens = Object.values(mintList)
        .filter((t: any) => t.symbol !== 'SOL')
        .map((t: any) => new PublicKey(t.address));

      const error = (_error: any, tokens: PublicKey[]) => {
        console.error(_error);
        for (let t of tokens) {
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
        setShouldUpdateBalances(false);
      };

      const promise = connection.getTokenAccountsByOwner(
        publicKey, 
        { programId: TOKEN_PROGRAM_ID }, 
        connection.commitment
      );
        
      promise
        .then((response: any) => success(response))
        .catch((_error: any) => error(_error, tokens));

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    mintList, 
    publicKey, 
    userAccount,
    shouldUpdateBalances
  ]);

  // Automatically update from token balance once
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }
    
    if (!connected || !userAccount || !fromMint || !userBalances) {
      setFromBalance('0');
      setShouldUpdateBalances(false);
      return;
    }

    const timeout = setTimeout(() => {

      let balance = 0;

      if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        balance = userAccount.lamports / LAMPORTS_PER_SOL;
      } else {
        balance = userBalances[fromMint];
      }

      setFromBalance(balance.toString());
      setShouldUpdateBalances(false);

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    fromMint, 
    userAccount, 
    userBalances
  ]);

  // Automatically update to token balance once
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }
    
    if (!connected || !userAccount || !userBalances || !toMint) {
      setToBalance('0');
      setShouldUpdateBalances(false);
      return;
    }

    const timeout = setTimeout(() => {

      let balance = 0;

      if (toMint === NATIVE_SOL_MINT.toBase58()) {
        balance = userAccount.lamports / LAMPORTS_PER_SOL;
      } else {
        balance = userBalances[toMint];
      }

      setToBalance(balance.toString());
      setShouldUpdateBalances(false);

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    toMint, 
    userAccount, 
    userBalances
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState === connected) {
      return;
    }

    const timeout = setTimeout(() => {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        console.info('Refreshing balances...');
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        console.info('User is disconnecting...');
        if (fromMint) {
          setLastSwapFromMint(fromMint.toString());
        }
        setPreviousWalletConnectState(false);
        setUserAccount(undefined);
        setUserBalances(undefined);
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

  // Automatically updates if the balance is valid
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!connected || !fromMint || !feesInfo || !userBalances) {
      setIsValidBalance(false);
      return;
    }

    const timeout = setTimeout(() => {

      let balance = userBalances[NATIVE_SOL_MINT.toBase58()];

      if (isWrap) {
        setIsValidBalance(balance >= (feesInfo.aggregator + feesInfo.network));
      } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        setIsValidBalance(balance >= (feesInfo.total + feesInfo.network));
      } else {
        setIsValidBalance(balance >= feesInfo.network);
      }

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection, 
    feesInfo, 
    fromMint, 
    isWrap, 
    userBalances
  ]);

  // Automatically updates if the swap amount is valid
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    if (!connected) {
      setIsValidSwapAmount(false);
      return;
    }
    
    const timeout = setTimeout(() => {      
      setIsValidSwapAmount(fromSwapAmount > 0 && fromSwapAmount <= maxFromAmount);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connected, 
    connection,
    fromSwapAmount, 
    maxFromAmount
  ])

  // Updates the allowed to mints to select 
  useEffect(() => {

    if (!fromMint || !mintList) { return; }

    const timeout = setTimeout(() => {

      if (fromMint === WRAPPED_SOL_MINT.toBase58()) {

        const solList: any[] = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'SOL');

        setShowToMintList(solList);
        setToMint(NATIVE_SOL_MINT.toBase58());

        return;
      }

      const btcMintInfos: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC' || m.symbol === 'renBTC');

      if (!btcMintInfos || btcMintInfos.length === 0) { return; }

      const fromBtcInfo = btcMintInfos.find((i: any) => i.address === fromMint);
 
      if (fromBtcInfo) {

        const counterpartyInfo: any = fromBtcInfo.symbol === 'BTC' 
          ? Object.values(mintList).filter((i: any) => i.symbol === 'renBTC')[0]
          : Object.values(mintList).filter((i: any) => i.symbol === 'BTC')[0];

        const filteredList: any[] = Object
          .values(mintList)
          .filter((m: any) => 
            m.symbol === 'USDC' || 
            m.symbol === counterpartyInfo.symbol
          );

        if (fromBtcInfo.symbol === 'BTC') {
          filteredList.push(...Object.values(mintList).filter((m: any) => m.symbol === 'USDT'));
        }
    
        setShowToMintList(filteredList);
        
        if (
          toMint &&
          toMint !== USDC_MINT.toBase58() && 
          toMint !== USDT_MINT.toBase58() && 
          toMint !== counterpartyInfo.address
        ) {
          setToMint(USDC_MINT.toBase58());
        }

      } else {
        setShowToMintList(mintList);
      }

    });

    return () => { 
      clearTimeout(timeout);
    }

  },[
    fromMint, 
    mintList, 
    showFromMintList, 
    toMint
  ]);

  // Updates the allowed from mints to select 
  useEffect(() => {

    if (!toMint || !mintList) { return; }

    const timeout = setTimeout(() => {

      const btcMintInfos: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC' || m.symbol === 'renBTC');

      if (!btcMintInfos || btcMintInfos.length === 0) { return; }

      const toBtcInfo = btcMintInfos.find((i: any) => i.address === toMint);

      if (toBtcInfo) {

        const counterpartyInfo: any = toBtcInfo.symbol === 'BTC' 
          ? Object.values(mintList).filter((i: any) => i.symbol === 'renBTC')[0]
          : Object.values(mintList).filter((i: any) => i.symbol === 'BTC')[0];

        const filteredList: any[] = Object
          .values(mintList)
          .filter((m: any) => 
            m.symbol === 'USDC' || 
            m.symbol === counterpartyInfo.symbol
          );

        if (toBtcInfo.symbol === 'BTC') {
          filteredList.push(...Object.values(mintList).filter((m: any) => m.symbol === 'USDT'));
        }
    
        setShowFromMintList(filteredList);
        
        if (
          fromMint && 
          fromMint !== USDC_MINT.toBase58() && 
          fromMint !== USDT_MINT.toBase58() && 
          fromMint !== counterpartyInfo.address
        ) {
          setFromMint(USDC_MINT.toBase58());
        }

      } else {
        setShowFromMintList(mintList);
      }

    });

    return () => { 
      clearTimeout(timeout);
    }

  },[
    fromMint, 
    mintList, 
    showToMintList, 
    toMint
  ]);

   // Token selection modal
   const showTokenSelector = useCallback(() => {

    const timeout =setTimeout(() => {

      setTokenSelectorModalVisibility(true);
      const input = document.getElementById("token-search-input");

      if (input) {
        input.focus();
      }

    });

    return () => {
      clearTimeout(timeout);
    }

  }, []);

  // Token selection modal close
  const onCloseTokenSelector = useCallback(() => {
    
    const timeout = setTimeout(() => {

      setTokenSelectorModalVisibility(false);
      setTokenFilter('');

    });

    return () => {
      clearTimeout(timeout);
    }

  }, []);

  // Event handling
  const handleSwapFromAmountChange = useCallback((e: any) => {

    const input = e.target;

    if (!input) { return; }

    const newValue = input.value;
    
    if (newValue === null || newValue === undefined || newValue === "" || !isValidNumber(newValue)) {
      setFromAmount('');
      setFromSwapAmount(0);
    } else {
      setFromAmount(newValue);
      setFromSwapAmount(parseFloat(newValue));
    }

  },[]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const input = e.target;

    if (!input) { return; }

    const newValue = input.value;
    setTokenFilter(newValue.trim());
    
  },[]);

  // Updates the label of the Swap button
  useEffect(() => {

    if (!connection) {
      console.error('No connection');
      return;
    }

    const timeout = setTimeout(() => {

      let label = t("transactions.validation.not-connected");

      if (!connected) {
        label = t("transactions.validation.not-connected");
      } else if (fromSwapAmount === 0) {
        label = t("transactions.validation.no-amount");
      } else if (!fromMint || !toMint || !feesInfo) {
        label = t("transactions.validation.invalid-exchange");
      } else if(!isValidBalance) {

        let needed = 0;

        if (isWrap) {
          needed = feesInfo.aggregator + feesInfo.network;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = feesInfo.total + feesInfo.network;
        } else {
          needed = feesInfo.network;
        }

        needed = Math.round(parseFloat(needed.toFixed(4)));

        if (needed === 0) {
          needed = Math.round(parseFloat(needed.toFixed(9)));
        }

        label = t("transactions.validation.insufficient-balance-needed", { balance: needed.toString() });

      } else if (!isValidSwapAmount) {

        let needed = 0;
        const symbol = mintList[fromMint].symbol;

        if (isWrap) {
          needed = fromSwapAmount + feesInfo.aggregator + feesInfo.network;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = fromSwapAmount + feesInfo.total + feesInfo.network;
        } else if (isUnwrap) {
          needed = fromSwapAmount + feesInfo.aggregator;
        } else {
          needed = fromSwapAmount + feesInfo.total;
        }

        needed = parseFloat(needed.toFixed(4));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(mintList[fromMint].decimals));
        }

        label = t("transactions.validation.insufficient-amount-needed", { amount: needed.toString(), symbol });

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
    connected, 
    connection, 
    feesInfo, 
    fromSwapAmount, 
    fromMint, 
    isUnwrap, 
    isValidBalance, 
    isValidSwapAmount, 
    isWrap, 
    mintList,  
    toMint
  ]);

  // Calculates the max allowed amount to swap
  useEffect(() => {

    if (!fromMint || !toMint || !fromBalance || !userBalances || !exchangeInfo) {
      setMaxFromAmount(0);
      return;
    }

    const timeout = setTimeout(() => {

      let maxAmount = 0;
      let balance = parseFloat(fromBalance);

      if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        balance = userBalances[fromMint];
      }

      if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        maxAmount = balance - exchangeInfo.networkFees;
      } else {
        maxAmount = balance;
      }

      setMaxFromAmount(maxAmount < 0 ? 0 : maxAmount);

    });

    return () => {
      clearTimeout(timeout);
    }
    
  }, [
    exchangeInfo, 
    fromBalance, 
    fromMint, 
    toMint, 
    userBalances
  ]);

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
      // const oldFromBalance = fromMintTokenBalance;
      const oldFromBalance = fromBalance;
      // const oldToBalance = toMintTokenBalance;
      const oldToBalance = toBalance;
      // const oldToAmount = toAmount;
      setFromMint(oldTo);
      setToMint(oldFrom);
      // setFromAmount(oldToAmount);
      // setFromSwapAmount(parseFloat(oldToAmount));
      setFromBalance(oldToBalance);
      setToBalance(oldFromBalance);
      // setShouldUpdateBalances(true);
      setRefreshTime(0);
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    fromBalance, 
    fromMint, 
    toBalance, 
    toMint
  ]);

  const getSwap = useCallback(async () => {

    if (!fromMint || !toMint || !mintList[fromMint] || !mintList[toMint] || !wallet || !feesInfo || !exchangeInfo || !exchangeInfo.amountIn || !exchangeInfo.amountOut) {
      throw new Error("Error executing transaction");
    }

    const fromDecimals = mintList[fromMint].decimals;
    const feeAmount = parseFloat(feesInfo.aggregator.toFixed(fromDecimals));
    const feeAmountBn = new BN(feeAmount * 10 ** fromDecimals);

    if (isWrap || isUnwrap) {

      const amountIn = parseFloat((exchangeInfo.amountIn - feesInfo.aggregator).toFixed(fromDecimals));
      const amountInBn = new BN(amountIn * 10 ** fromDecimals);

      if (isWrap) {

        return wrap(
          connection,
          wallet,
          Keypair.generate(),
          amountInBn,
          Constants.MSP_OPS,
          feeAmountBn
        );
  
      }
      
      if (isUnwrap) {
  
        return unwrap(
          connection,
          wallet,
          Keypair.generate(),
          amountInBn,
          Constants.MSP_OPS,
          feeAmountBn
        );
  
      }

    } else {

      if (!swapClient) {
        throw new Error("Error: Unknown AMM client");
      }

      return swapClient.getSwap(
        wallet.publicKey,
        fromMint,
        toMint,
        exchangeInfo.amountIn,
        exchangeInfo.amountOut,
        slippage,
        Constants.MSP_OPS.toBase58(),
        feeAmount
      );
    }

  },[
    connection, 
    exchangeInfo,
    feesInfo, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    mintList, 
    slippage, 
    swapClient, 
    toMint, 
    wallet
  ]);

  const renderSourceTokenList = (
    <>
      {Object.values(showFromMintList).length ? (
        Object.values(showFromMintList).map((token: any, index) => {
          const onClick = () => {
            if (!fromMint || fromMint !== token.address) {
              setFromMint(token.address);
              setLastFromMint(token.address);
            }
            onCloseTokenSelector();
          };

          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                fromMint && fromMint === token.address
                  ? "selected"
                  : areSameTokens(token, (toMint ? showFromMintList[toMint] : undefined))
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
                connected && userBalances && mintList[token.address] && userBalances[token.address] > 0 && (
                  <div className="token-balance">
                  {
                    !userBalances[token.address] || userBalances[token.address] === 0
                      ? '' 
                      : getFormattedAmount(userBalances[token.address], mintList[token.address].decimals)
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
      {Object.values(showToMintList).length ? (
        Object.values(showToMintList).map((token: any, index) => {
          const onClick = () => {
            if (!toMint || toMint !== token.address) {
              setToMint(token.address);
            }
            onCloseTokenSelector();
          };

          return (
            <div
              key={index + 100}
              onClick={onClick}
              className={`token-item ${
                toMint && toMint === token.address
                  ? "selected"
                  : areSameTokens(token, (fromMint ? showToMintList[fromMint] : undefined))
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
                connected && userBalances && mintList[token.address] && userBalances[token.address] > 0 && (
                  <div className="token-balance">
                  {
                    !userBalances[token.address] || userBalances[token.address] === 0
                      ? '' 
                      : getFormattedAmount(userBalances[token.address], mintList[token.address].decimals)
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
      setFromSwapAmount(0);
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
    const encodedTx = serializedTx.toString('base64');
    console.log('tx encoded => ', encodedTx);

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
          setFromAmount('');
          setFromSwapAmount(0);
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

  // Info items will draw inside the popover
  const txInfoContent = () => {
    return fromMint && toMint && exchangeInfo ? (
      <>
      {
        !refreshing && fromAmount && slippage &&
        infoRow(
          t("transactions.transaction-info.slippage"),
          `${slippage.toFixed(2)}%`
        )
      }
      {
        !refreshing && fromAmount && feesInfo &&
        infoRow(
          t("transactions.transaction-info.transaction-fee"),
          `${feesInfo.total.toFixed(mintList[fromMint].decimals)} ${mintList[fromMint].symbol}`
        )
      }
      {
        !refreshing && fromAmount &&
        infoRow(
          t("transactions.transaction-info.recipient-receives"),                
          `${exchangeInfo.minAmountOut?.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`
        )
      }
      {
        !refreshing && fromAmount &&
        infoRow(
          t("transactions.transaction-info.price-impact"),                
          `${exchangeInfo.priceImpact?.toFixed(2)}%`
        )
      }
      {
        !refreshing && fromAmount && exchangeInfo.fromAmm &&
        infoRow(
          t("transactions.transaction-info.exchange-on"),                
          `${exchangeInfo.fromAmm}`,
          ':'
        )
      }
      </>
    ) : null;
  }

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
          token={fromMint && mintList[fromMint]}
          tokenBalance={
            (fromMint && fromBalance && mintList[fromMint] && parseFloat(fromBalance) > 0
              ? getFormattedAmount(parseFloat(fromBalance), mintList[fromMint].decimals)
              : '')
          }
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={
            fromMint && toMint && mintList[fromMint] &&
            (() => {
              if (maxFromAmount > 0) {
                setFromSwapAmount(maxFromAmount);
                const formattedAmount = getFormattedAmount(maxFromAmount, mintList[fromMint].decimals);                
                setFromAmount(formattedAmount);
              }
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
          token={toMint && mintList[toMint]}
          tokenBalance={
            (toMint && toBalance && mintList[toMint] && parseFloat(toBalance)
              ? getFormattedAmount(parseFloat(toBalance), mintList[toMint].decimals)
              : '')
          }
          tokenAmount={
            (toMint && mintList[toMint] && exchangeInfo && exchangeInfo.amountIn && exchangeInfo.amountOut 
              ? getFormattedAmount(exchangeInfo.amountOut, mintList[toMint].decimals)
              : '')
          }
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
          fromMint && toMint && exchangeInfo && exchangeInfo.outPrice && (
            <div className="p-2 mb-2 text-right">
              {!refreshing && (
                <div className="transaction-info-popover-row flexible-left">
                  <div className="left">
                    {(`1 ${mintList[fromMint].symbol} ≈ ${exchangeInfo.outPrice.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`)}
                  </div>
                  <div className="right pl-1">
                    {
                      fromAmount ? (
                        <InfoIcon content={txInfoContent()} placement="leftBottom" />
                      ) : null
                    }
                  </div>
                </div>
              )}
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
          disabled={!isValidBalance || !isValidSwapAmount}>
          {transactionStartButtonLabel}
        </Button>

        {/* Transaction execution modal */}
        <Modal
          className="mean-modal"
          maskClosable={false}
          visible={isTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideTransactionModal}
          afterClose={onAfterTransactionModalClosed}
          width={330}
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
                    fromMint && toMint && fromAmount && exchangeInfo && exchangeInfo.amountOut &&
                    t("transactions.status.tx-swap-operation", {
                      fromAmount: `${fromAmount} ${mintList[fromMint].symbol}`,
                      toAmount: `${exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`
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
                {txFees && transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                  <h4 className="mb-4">
                    {t("transactions.status.tx-start-failure", {
                      accountBalance: `${getTokenAmountAndSymbolByTokenAddress(
                        parseFloat(fromBalance),
                        WRAPPED_SOL_MINT.toBase58(),
                        true
                      )} SOL`,
                      feeAmount: `${getTokenAmountAndSymbolByTokenAddress(
                        getComputedFees(txFees),
                        WRAPPED_SOL_MINT.toBase58(),
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
                  onClick={hideTransactionModal}>
                  {t("general.cta-close")}
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
