import { Row, Col, Spin, Modal, Button } from "antd";
import { SwapSettings } from "../SwapSettings";
import { CoinInput } from "../CoinInput";
import { TextInput } from "../TextInput";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatAmount, getComputedFees, getTokenAmountAndSymbolByTokenAddress, isValidNumber, sendSignedTransaction } from "../../utils/utils";
import { Identicon } from "../Identicon";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, getTxPercentFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useTranslation } from "react-i18next";
import { AccountMeta, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { NATIVE_SOL_MINT, USDC_MINT, USDT_MINT, WRAPPED_SOL_MINT } from "../../utils/ids";
import { TransactionStatus } from "../../models/enums";
import { DEFAULT_SLIPPAGE_PERCENT } from "../../utils/swap";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TOKENS } from "../../hybrid-liquidity-ag/data";
import { LPClient, ExchangeInfo, SERUM, TokenInfo, FeesInfo } from "../../hybrid-liquidity-ag/types";
import { SerumClient } from "../../hybrid-liquidity-ag/serum/types";
import { getClient, getExchangeInfo, getOptimalPool, getTokensPools, unwrap, wrap } from "../../hybrid-liquidity-ag/utils";
import { cloneDeep } from "lodash";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { InfoIcon } from "../InfoIcon";
import { MSP_OPS } from "../../hybrid-liquidity-ag/types";
import useLocalStorage from "../../hooks/useLocalStorage";
import "./style.less";
import { DdcaFrequencySelectorModal } from "../DdcaFrequencySelectorModal";
import { IconCaretDown, IconSwapFlip } from "../../Icons";
import { environment } from "../../environments/environment";
import { customLogger } from "../..";
import { DcaInterval } from "../../models/ddca-models";
import { DdcaSetupModal } from "../DdcaSetupModal";
import { DdcaClient } from '@mean-dao/ddca';
import { useConnectionConfig } from "../../contexts/connection";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const SwapUi = (props: {
  queryFromMint: string | null;
  queryToMint: string | null;
  connection: Connection;
}) => {

  const { t } = useTranslation("common");
  const connectionConfig = useConnectionConfig();
  const { publicKey, wallet, connected } = useWallet();
  const {
    coinPrices,
    ddcaOption,
    transactionStatus,
    previousWalletConnectState,
    setTransactionStatus,
    setPreviousWalletConnectState

  } = useContext(AppStateContext);

  const connection = useMemo(() => props.connection, [props.connection]);

  // Added by YAF (Token balance)
  const [refreshing, setRefreshing] = useState(false);
  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', USDC_MINT.toBase58());
  // Continue normal flow
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE_PERCENT);
  const [tokenFilter, setTokenFilter] = useState("");
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  const [isValidBalance, setIsValidBalance] = useState(false);
  const [isValidSwapAmount, setIsValidSwapAmount] = useState(false);
  // SWAP Transaction execution modal
  const showSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(true), []);
  const hideSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(false), []);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionLog, setTransactionLog] = useState<Array<any>>([]);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isSwapTransactionModalVisible, setSwapTransactionModalVisibility] = useState(false);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  // DDCA Transaction execution modal
  const showDdcaTransactionModal = useCallback(() => setDdcaTransactionModalVisibility(true), []);
  const hideDdcaTransactionModal = useCallback(() => setDdcaTransactionModalVisibility(false), []);
  const [isDdcaTransactionModalVisible, setDdcaTransactionModalVisibility] = useState(false);
  // FEES
  const [txFees, setTxFees] = useState<TransactionFees>();
  // AGGREGATOR
  const [lastFromMint, setLastFromMint] = useLocalStorage('lastFromToken', NATIVE_SOL_MINT.toBase58());
  const [fromMint, setFromMint] = useState<string | undefined>(props.queryFromMint ? props.queryFromMint : lastFromMint);
  const [toMint, setToMint] = useState<string | undefined>(undefined);
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
  const [renderCount, setRenderCount] = useState(0);

  // DDCA Option selector modal
  const [isDdcaOptionSelectorModalVisible, setDdcaOptionSelectorModalVisibility] = useState(false);
  const showDdcaOptionSelector = useCallback(() => setDdcaOptionSelectorModalVisibility(true), []);
  const onCloseDdcaOptionSelector = useCallback(() => setDdcaOptionSelectorModalVisibility(false), []);

  // DDCA Setup modal
  const [isDdcaSetupModalVisible, setDdcaSetupModalVisibility] = useState(false);
  const showDdcaSetup = useCallback(() => setDdcaSetupModalVisibility(true), []);
  const onCloseDdcaSetup = useCallback(() => setDdcaSetupModalVisibility(false), []);

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

  // Automatically updates the user account
  useEffect(() => {

    if (!connection) {
      return;
    }

    if (!connected || !publicKey) { return; }
    
    const timeout = setTimeout(() => {

      const error = (_error: any) => {
        console.error(_error);
        throw(_error);
      };
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
    renderCount
  ]);

  // Automatically updates user account balance (SOL) 
  useEffect(() => {

    if (!connection) {
      return;
    }

    if (!connected || !publicKey) { return; }
    
    const listener = connection.onAccountChange(publicKey, (info) => {
      setUserAccount(info);
    });

    return () => {
      connection.removeAccountChangeListener(listener);
    }

  },[
    connected, 
    connection, 
    publicKey
  ]);

  // Get Tx fees
  useEffect(() => {

    if (!connection) {
      return;
    }

    const timeout = setTimeout(() => {

      const action = isWrap() || isUnwrap()
        ? MSP_ACTIONS.wrap 
        : MSP_ACTIONS.swap;
      
      const success = (fees: TransactionFees) => {
        setTxFees(fees);
      };

      const error = (_error: any) => {
        console.error(_error);
        throw(_error);
      };

      calculateActionFees(connection, action)
        .then((fees: TransactionFees) => success(fees))
        .catch((_error: any) => error(_error));
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    isWrap, 
    isUnwrap
  ]);

  // Token map for quick lookup.
  useEffect(() => {

    if (!TOKENS) { return; }

    const timeout = setTimeout(() => {

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

    });

    return () => {
      clearTimeout(timeout);
    }

  }, []);

  // Updates the amounts when is wrap or unwrap
  useEffect(() => { 

    if ((!isWrap() && !isUnwrap()) || !txFees) { return; }

    const timeout = setTimeout(() => {

      const exchange = {
        amountIn: fromSwapAmount,
        amountOut: fromSwapAmount,
        minAmountOut: fromSwapAmount,
        outPrice: 1,
        priceImpact: 0.00,
        networkFees: txFees.blockchainFee,
        protocolFees: 0

      } as ExchangeInfo;

      consoleOut('exchange', exchange);

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
      return;
    }

    if (!fromMint || !toMint || !txFees || !swapClient || isWrap() || isUnwrap()) { 
      return; 
    }
    
    const timeout = setTimeout(() => {

      const aggregatorFees = getTxPercentFeeAmount(txFees, fromSwapAmount);
      let amount = fromSwapAmount - aggregatorFees;

      if (amount < 0) {
        amount = 0;
      }

      const success = (info: ExchangeInfo) => {
        setExchangeInfo(info);
      };

      const error = (_error: any) => {
        console.error(_error);
        throw(_error);
      };

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
    mintList,
    txFees
  ]);

  // Automatically updates the fees info
  useEffect(() => {

    if (!connection) {
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
        total: isWrap() || isUnwrap() ? aggregatorFees : aggregatorFees + exchangeInfo.protocolFees

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
      return;
    }

    if (!fromMint || !toMint || isWrap() || isUnwrap()) {
      return;
    }

    const timeout = setTimeout(() => {

      setRefreshing(true);

      const tokensPools = getTokensPools(fromMint, toMint);
      const consoleMsg = tokensPools.length ? 'Liquidity Pool' : 'Serum Market';

      const error = (_error: any) => {
        consoleOut(_error);
        setRefreshing(false); 
      };

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

      let client: any;

      if (tokensPools.length) {

        const optimalPool = getOptimalPool(tokensPools);
        client = getClient(connection, optimalPool.protocolAddress) as LPClient;

        if (!client) {
          error(new Error('Exchange client not found'));
          return;
        }

        client
          .getPoolInfo(optimalPool.address)
          .then((info: any) => success(info))
          .catch((_error: any) => error(_error));

      } else {

        client = getClient(connection, SERUM.toBase58()) as SerumClient;

        if (!client) {
          error(new Error('Exchange client not found'));
          return;
        }

        client
          .getMarketInfo(fromMint, toMint)
          .then((info: any) => success(info))
          .catch((_error: any) => error(_error));
      }
    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    toMint
  ]);

  // Automatically update all tokens balance
  useEffect(() => {

    if (!connection) {
      return;
    }
    
    if (!connected || !publicKey || !mintList) {
      return;
    }

    const timeout = setTimeout(() => {
      
      const balancesMap: any = {};

      balancesMap[NATIVE_SOL_MINT.toBase58()] = userAccount ? (userAccount.lamports / LAMPORTS_PER_SOL) : 0;

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
    connected, 
    connection, 
    mintList, 
    publicKey, 
    userAccount
  ]);

  // Automatically update from token balance once
  useEffect(() => {

    if (!connection) {
      return;
    }
    
    if (!connected || !userAccount || !fromMint || !userBalances) {
      setFromBalance('0');
      return;
    }

    const timeout = setTimeout(() => {

      let balance = 0;

      if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        balance = userAccount.lamports / LAMPORTS_PER_SOL;
      } else {
        balance = userBalances[fromMint] ? userBalances[fromMint] : 0;
      }

      setFromBalance(balance.toString());

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
      return;
    }
    
    if (!connected || !userAccount || !userBalances || !toMint) {
      setToBalance('0');
      return;
    }

    const timeout = setTimeout(() => {

      let balance = 0;

      if (toMint === NATIVE_SOL_MINT.toBase58()) {
        balance = userAccount.lamports / LAMPORTS_PER_SOL;
      } else {
        balance = userBalances[toMint] ? userBalances[toMint] : 0;
      }

      setToBalance(balance.toString());

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
      return;
    }

    if (!connected || !fromMint || !feesInfo || !userBalances) {
      setIsValidBalance(false);
      return;
    }

    const timeout = setTimeout(() => {

      let balance = userBalances[NATIVE_SOL_MINT.toBase58()];

      if (isWrap()) {
        setIsValidBalance(balance >= feesInfo.network);
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

      const btcMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC')[0];
 
      if (!btcMintInfo) { return; }

      if (fromMint === btcMintInfo.address) {

        const usdxList: any = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'USDT');

        let usdxMints: any = {};

        for (let item of usdxList) {
          usdxMints[item.address] = item;
        }
    
        setShowToMintList(usdxMints);
        
        if (toMint && toMint !== USDC_MINT.toBase58() && toMint !== USDT_MINT.toBase58()) {
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
    toMint,
    mintList
  ]);

  // Updates the allowed from mints to select 
  useEffect(() => {

    if (!toMint || !mintList) { return; }

    const timeout = setTimeout(() => {

      if (toMint === WRAPPED_SOL_MINT.toBase58()) {

        const solList: any[] = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'SOL');

        setShowFromMintList(solList);
        setFromMint(NATIVE_SOL_MINT.toBase58());

        return;
      }

      const btcMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC')[0];

      if (!btcMintInfo) { return; }

      if (toMint && (toMint === btcMintInfo.address)) {

        const usdxList: any[] = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'USDT');
    
        setShowFromMintList(usdxList);
        
        if (fromMint && fromMint !== USDC_MINT.toBase58() && fromMint !== USDT_MINT.toBase58()) {
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
    toMint,
    mintList
  ]);

  // Updates the label of the Swap button
  useEffect(() => {

    if (!connection) {
      return;
    }

    const timeout = setTimeout(() => {

      let label = t("transactions.validation.not-connected");

      if (!connected) {
        label = t("transactions.validation.not-connected");
      } else if (!fromMint || !toMint || !feesInfo) {
        label = t("transactions.validation.invalid-exchange");
      } else if(!isValidBalance || (!isValidBalance && fromMint === NATIVE_SOL_MINT.toBase58())) {

        let needed = 0;

        if (isWrap()) {
          needed = feesInfo.aggregator + feesInfo.network;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = feesInfo.total + feesInfo.network;
        } else {
          needed = feesInfo.network;
        }

        needed = parseFloat(needed.toFixed(4));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(6));
        }

        label = t("transactions.validation.insufficient-balance-needed", { balance: needed.toString() });

      } else if (fromSwapAmount === 0) {
        label = t("transactions.validation.no-amount");
      } else if (!isValidSwapAmount) {

        let needed = 0;
        const symbol = mintList[fromMint].symbol;

        if (isWrap()) {
          needed = fromSwapAmount + feesInfo.network;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = fromSwapAmount + feesInfo.total + feesInfo.network;
        } else if (isUnwrap()) {
          needed = fromSwapAmount;
        } else {
          needed = fromSwapAmount + feesInfo.total;
        }

        needed = parseFloat(needed.toFixed(4));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(mintList[fromMint].decimals));
        }

        if (needed === 0) {
          label = t("transactions.validation.amount-low");
        } else {
          label = t("transactions.validation.insufficient-amount-needed", { amount: needed.toString(), symbol });
        }

      } else if (ddcaOption?.dcaInterval !== DcaInterval.OneTimeExchange) {
        label = t("transactions.validation.valid-ddca-review");
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
    ddcaOption?.dcaInterval,
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
    mintList,
    userBalances
  ]);

  // Set toMint appropriately
  useEffect(() => {
    if (props.queryToMint) {
      setToMint(props.queryToMint);
    }
  }, [props.queryToMint]);

  // Updates the token list everytime is filtered
  const updateTokenListByFilter = useCallback(() => {

    if (!connection) {
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
    
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromAmount('');
      setFromSwapAmount(0);
    } else if (isValidNumber(newValue)) {
      setFromAmount(newValue);
      setFromSwapAmount(parseFloat(newValue));
    }

  },[]);

  const onTokenSearchInputChange = useCallback((e: any) => {

    const input = e.target;

    if (!input) { return; }

    const newValue = input.value;
    setTokenFilter(newValue.trim());
    updateTokenListByFilter();
    
  },[
    updateTokenListByFilter
  ]);

  const flipMintsCallback = useCallback(() => {
    
    const timeout = setTimeout(() => {
      const oldFrom = fromMint;
      const oldTo = toMint;
      const oldFromBalance = fromBalance;
      const oldToBalance = toBalance;
      setFromMint(oldTo);
      setToMint(oldFrom);
      setFromBalance(oldToBalance);
      setToBalance(oldFromBalance);
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

    try {

      if (!fromMint || !toMint || !mintList[fromMint] || !mintList[toMint] || !wallet || !feesInfo || !exchangeInfo || !exchangeInfo.amountIn || !exchangeInfo.amountOut) {
        throw new Error("Error executing transaction");
      }
  
      if (isWrap() || isUnwrap()) {
  
        if (isWrap()) {
  
          return wrap(
            connection,
            wallet,
            Keypair.generate(),
            exchangeInfo.amountIn
          );
    
        }
        
        if (isUnwrap()) {
    
          return unwrap(
            connection,
            wallet,
            Keypair.generate(),
            exchangeInfo.amountIn
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
          MSP_OPS.toBase58(),
          feesInfo.aggregator
        );
      }

    } catch (_error) {
      console.error(_error);
      throw(_error);
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

  const updateRenderCount = useCallback(() => {

    setRenderCount(renderCount + 1);

  },[
    renderCount
  ]);

  const onAfterTransactionModalClosed = useCallback(() => {

    if (isBusy) {
      setTransactionCancelled(true);
    }

    if (isSuccess()) {
      setFromAmount("");
      setFromSwapAmount(0);
      updateRenderCount();
      hideSwapTransactionModal();
      hideDdcaTransactionModal();
    }
    
  }, [
    isBusy, 
    isSuccess, 
    updateRenderCount, 
    hideSwapTransactionModal,
    hideDdcaTransactionModal
  ]);

  const createTx = useCallback(async () => {
    setTransactionLog([]);
   
    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.TransactionStart,
        currentOperation: TransactionStatus.InitTransaction,
      });

      // Log input data
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
        result: '' // TODO: Discrete info converted to string (not objects)
      }]);

      const swapTx = await getSwap();

      if (!swapTx) {
        throw new Error('Cannot create the transaction');
      }

      console.info("SWAP returned transaction:", swapTx);

      setTransactionStatus({
        lastOperation: TransactionStatus.InitTransactionSuccess,
        currentOperation: TransactionStatus.SignTransaction,
      });

      // Log success
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
        result: '' // TODO: Discrete info converted to string (not objects)
      }]);

      return swapTx;

    } catch (_error) {
      console.error(_error);
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.InitTransactionFailure,
      });
      // Log error
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
        result: `${_error}`
      }]);
      customLogger.logError('Swap transaction failed', { transcript: transactionLog });
      throw(_error);
    }

  },[
    getSwap, 
    setTransactionStatus,
    transactionLog,
    transactionStatus.currentOperation,
    connection
  ]);

  const signTx = useCallback(async (currentTx: Transaction) => {

    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      if (!wallet) {
        throw new Error('Cannot sign transaction. Wallet not found'); 
      }
  
      consoleOut("Signing transaction...");
      const signedTx = await wallet.signTransaction(currentTx);

      if (!signedTx) {
        throw new Error('Signing transaction failed!');
      }

      console.info("signTransaction returned a signed transaction:", signedTx);

      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.SendTransaction,
      });

      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
        result: '' // TODO: Discrete info converted to string (not objects)
      }]);

      return signedTx;

    } catch (_error) {
      console.error(_error);
      setTransactionStatus({
        lastOperation: TransactionStatus.SignTransaction,
        currentOperation: TransactionStatus.SignTransactionFailure,
      });
      // Log error
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
        result: `${_error}`
      }]);
      customLogger.logError('Swap transaction failed', { transcript: transactionLog });
      throw(_error);
    }

  }, [
    setTransactionStatus,
    transactionLog,
    transactionStatus.currentOperation,
    wallet,
    connection
  ]);

  const sendTx = useCallback(async (currentTx: Transaction) => {

    const encodedTx = currentTx.serialize().toString('base64');
    consoleOut('tx encoded => ', encodedTx);

    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      const sentTx = await connection.sendEncodedTransaction(encodedTx, { 
        preflightCommitment: 'confirmed'
      });

      if (!sentTx) {
        throw new Error('Cannot send the transaction');   
      }
  
      setTransactionStatus({
        lastOperation: transactionStatus.currentOperation,
        currentOperation: TransactionStatus.SendTransactionSuccess
      });

      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
        result: `signature: ${sentTx}`
      }]);

      return sentTx;

    } catch (_error) {
      console.error(_error);
      setTransactionStatus({
        lastOperation: TransactionStatus.SendTransaction,
        currentOperation: TransactionStatus.SendTransactionFailure
      });
      // Log error
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
        result: { _error, encodedTx }
      }]);
      customLogger.logError('Swap transaction failed', { transcript: transactionLog });
      throw(_error);
    }

  },[
    connection,
    transactionLog,
    setTransactionStatus,
    transactionStatus.currentOperation
  ]);

  const confirmTx = useCallback(async (signature: string) => {

    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      const response = await connection.confirmTransaction(signature, 'confirmed');

      if(!response || !response.value || response.value.err) {
        const err = response && response.value && response.value.err 
          ? response.value.err 
          : new Error('Cannot confirm transaction');

        throw(err);
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.ConfirmTransactionSuccess,
        currentOperation: TransactionStatus.TransactionFinished
      });

      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
        result: response.value  // TODO: Log this perhaps?
      }]);

      return response;

    } catch (_error) {
      console.error(_error);
      setTransactionStatus({
        lastOperation: TransactionStatus.ConfirmTransaction,
        currentOperation: TransactionStatus.ConfirmTransactionFailure
      });
      // Log error
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
        result: `${_error}`
      }]);
      customLogger.logError('Swap transaction failed', { transcript: transactionLog });
      throw(_error);
    }

  },[
    connection,
    transactionLog,
    setTransactionStatus
  ]);

  const onTransactionStart = useCallback(async () => {

    try {

      console.info("Starting exchange");
      setTransactionCancelled(false);
      setRefreshTime(30);
      setIsBusy(true);
      showSwapTransactionModal();

      const swapTxs = await createTx();
      consoleOut("initialized:", swapTxs);

      if (!swapTxs || transactionCancelled) {
        setIsBusy(false);
        return;
      }

      const signedTx = await signTx(swapTxs);
      consoleOut("signed:", signedTx);

      if (!signedTx || transactionCancelled) {
        setIsBusy(false);
        return;
      }

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

      console.info("confirmed:", signature); // put this in a link in the UI
      setFromAmount('');
      setFromSwapAmount(0);
      updateRenderCount();
      setIsBusy(false);

    } catch (_error) {
      console.error(_error);
      setIsBusy(false);
    }

  }, [
    confirmTx, 
    createTx, 
    sendTx, 
    showSwapTransactionModal, 
    signTx,
    updateRenderCount,
    transactionCancelled
  ]);

  // YAF - DDCA Transaction
  const onDdcaTransactionStart = async (payload: any) => {
    let transaction: Transaction;
    let transaction2: Transaction;
    let signedTransaction: Transaction;
    let signature: any;
    let ddcaAccountPda: PublicKey;
    const transactionLog: any[] = [];

    const saberAmmAddress = new PublicKey("VeNkoB1HvSP6bSeGybQDnx9wTWFsQb2NBCemeCDSuKL");
    const saberPoolTokenAddress = new PublicKey("YakofBo4X3zMxa823THQJwZ8QeoU8pxPdFdxJs7JW57");
    const sabarUsdcReservesAddress = new PublicKey("6aFutFMWR7PbWdBQhdfrcKrAor9WYa2twtSinTMb9tXv");
    const saberUsdtReservesAddress = new PublicKey("HXbhpnLTxSDDkTg6deDpsXzJRBf8j7T6Dc3GidwrLWeo");
    const saberProtocolProgramAddress = new PublicKey("SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ");
    const hlaAmmAccounts: Array<AccountMeta> = [
      { pubkey: saberProtocolProgramAddress, isWritable: false, isSigner: false},
      { pubkey: saberAmmAddress, isWritable: false, isSigner: false},
      { pubkey: saberPoolTokenAddress, isWritable: false, isSigner: false},
      { pubkey: sabarUsdcReservesAddress, isWritable: true, isSigner: false},
      { pubkey: saberUsdtReservesAddress, isWritable: true, isSigner: false},
    ];

    setTransactionCancelled(false);
    setIsBusy(true);

    const ddcaClient = new DdcaClient(connectionConfig.endpoint, wallet, { commitment: "confirmed" })

    const createTx = async (): Promise<boolean> => {
      if (wallet) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        consoleOut('ddca params:', payload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: payload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Create a transaction
        return await ddcaClient.createDdcaTx(
          payload.ownerAccountAddress,
          payload.fromMint,
          payload.toMint,
          payload.depositAmount,
          payload.amountPerSwap,
          payload.intervalinSeconds)
        .then((value: [PublicKey, Transaction]) => {
          consoleOut('createDdca returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: ''
          });
          ddcaAccountPda = value[0];
          transaction = value[1];
          return true;
        })
        .catch(error => {
          console.error('createDdca error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const signTx = async (): Promise<boolean> => {
      if (wallet) {
        consoleOut('Signing transaction...');
        return await wallet.signTransaction(transaction)
        .then((signed: Transaction) => {
          consoleOut('signTransaction returned a signed transaction:', signed);
          signedTransaction = signed;
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransactionSuccess,
            currentOperation: TransactionStatus.SendTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionSuccess),
            result: `Signer: ${wallet.publicKey.toBase58()}`
          });
          return true;
        })
        .catch(error => {
          console.error('Signing transaction failed!');
          setTransactionStatus({
            lastOperation: TransactionStatus.SignTransaction,
            currentOperation: TransactionStatus.SignTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
            result: `Signer: ${wallet.publicKey.toBase58()}\n${error}`
          });
          customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        console.error('Cannot sign transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SignTransaction,
          currentOperation: TransactionStatus.SignTransactionFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SignTransactionFailure),
          result: 'Cannot sign transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendTx = async (): Promise<boolean> => {
      const encodedTx = signedTransaction.serialize().toString('base64');
      if (wallet) {
        return await connection
          .sendEncodedTransaction(encodedTx, { preflightCommitment: "confirmed" })
          .then(sig => {
            consoleOut('sendSignedTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: { error, encodedTx }
            });
            customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const confirmTx = async (): Promise<boolean> => {

      return await connection
        .confirmTransaction(signature, "confirmed")
        .then(result => {
          consoleOut('confirmTransaction result:', result);
          if (result && result.value && !result.value.err) {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransactionSuccess
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionSuccess),
              result: result.value
            });
            return true;
          } else {
            setTransactionStatus({
              lastOperation: TransactionStatus.ConfirmTransaction,
              currentOperation: TransactionStatus.ConfirmTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
              result: signature
            });
            customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
            return false;
          }
        })
        .catch(e => {
          setTransactionStatus({
            lastOperation: TransactionStatus.ConfirmTransaction,
            currentOperation: TransactionStatus.ConfirmTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
            result: signature
          });
          customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
          return false;
        });
    }

    // Create second Tx
    const createSwapTx = async (): Promise<boolean> => {
      if (wallet) {

        setTransactionStatus({
          lastOperation: TransactionStatus.TransactionStart,
          currentOperation: TransactionStatus.InitTransaction
        });

        const swapPayload = {
          ddcaAccountPda: ddcaAccountPda,
          fromMint: payload.fromMint,
          toMint: payload.toMint,
          hlaAmmAccounts: hlaAmmAccounts,
          swapMinimumOutAmount: payload.swapMinimumOutAmount,
          swapSlippage: slippage
        };

        consoleOut('ddca swap params:', swapPayload, 'brown');

        // Log input data
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStart),
          inputs: swapPayload
        });

        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.InitTransaction),
          result: ''
        });

        // Create a transaction
        return await ddcaClient.createWakeAndSwapTx(
          ddcaAccountPda,
          payload.fromMint,
          payload.toMint,
          hlaAmmAccounts,
          payload.swapMinimumOutAmount,
          slippage)
        .then(value => {
          consoleOut('createDdca returned transaction:', value);
          setTransactionStatus({
            lastOperation: TransactionStatus.InitTransactionSuccess,
            currentOperation: TransactionStatus.SignTransaction
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionSuccess),
            result: ''
          });
          transaction2 = value;
          return true;
        })
        .catch(error => {
          console.error('createDdca error:', error);
          setTransactionStatus({
            lastOperation: transactionStatus.currentOperation,
            currentOperation: TransactionStatus.InitTransactionFailure
          });
          transactionLog.push({
            action: getTransactionStatusForLogs(TransactionStatus.InitTransactionFailure),
            result: `${error}`
          });
          customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
          return false;
        });
      } else {
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.TransactionStartFailure),
          result: 'Cannot start transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    const sendSwapTx = async (): Promise<boolean> => {
      if (wallet) {
        return await sendSignedTransaction(connection, transaction2)
          .then(sig => {
            consoleOut('sendTransaction returned a signature:', sig);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransactionSuccess,
              currentOperation: TransactionStatus.ConfirmTransaction
            });
            signature = sig;
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionSuccess),
              result: `signature: ${signature}`
            });
            return true;
          })
          .catch(error => {
            console.error(error);
            setTransactionStatus({
              lastOperation: TransactionStatus.SendTransaction,
              currentOperation: TransactionStatus.SendTransactionFailure
            });
            transactionLog.push({
              action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
              result: `${error}`
            });
            customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
            return false;
          });
      } else {
        console.error('Cannot send transaction! Wallet not found!');
        setTransactionStatus({
          lastOperation: TransactionStatus.SendTransaction,
          currentOperation: TransactionStatus.SendTransactionFailure
        });
        transactionLog.push({
          action: getTransactionStatusForLogs(TransactionStatus.SendTransactionFailure),
          result: 'Cannot send transaction! Wallet not found!'
        });
        customLogger.logError('Recurring scheduled exchange transaction failed', { transcript: transactionLog });
        return false;
      }
    }

    if (wallet) {
      showDdcaTransactionModal();
      const create = await createTx();
      consoleOut('create:', create);
      if (create && !transactionCancelled) {
        const sign = await signTx();
        consoleOut('sign:', sign);
        if (sign && !transactionCancelled) {
          const sent = await sendTx();
          consoleOut('sent:', sent);
          if (sent && !transactionCancelled) {
            const confirmed = await confirmTx();
            consoleOut('confirmed:', confirmed);
            if (confirmed) {
              const createSwap = await createSwapTx();
              if (createSwap && !transactionCancelled) {
                const sent = await sendSwapTx();
                consoleOut('sent:', sent);
                if (sent && !transactionCancelled) {
                  const confirmed = await confirmTx();
                  consoleOut('confirmed:', confirmed);
                  if (confirmed) {
                    setIsBusy(false);
                  }
                } else { setIsBusy(false); }
              } else { setIsBusy(false); }
            } else { setIsBusy(false); }
          } else { setIsBusy(false); }
        } else { setIsBusy(false); }
      } else { setIsBusy(false); }
    }

  };

  const areSameTokens = (source: TokenInfo, destination: TokenInfo): boolean => {
    return (
      source &&
      destination &&
      source.name === destination.name &&
      source.address === destination.address
    ) ? true : false;
  }

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }

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

  const renderSourceTokenList = (
    <>
      {Object.values(showFromMintList).length ? (
        Object.values(showFromMintList).map((token: any, index) => {
          const onClick = () => {
            if (!fromMint || fromMint !== token.address) {
              setExchangeInfo(undefined);
              setSwapClient(undefined);
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

  const renderDestinationTokenList = (
    <>
      {Object.values(showToMintList).length ? (
        Object.values(showToMintList).map((token: any, index) => {
          const onClick = () => {
            if (!toMint || toMint !== token.address) {
              setExchangeInfo(undefined);
              setSwapClient(undefined);
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

  // TESTING BLOCK FOR STYLING THE UI
  const [inputPosition, setInputPosition] = useState<"left" | "right">("right");
  const toggleInputPosition = () => {
    if (inputPosition === "left") {
      setInputPosition("right");
    } else {
      setInputPosition("left");
    }
  }
  // END OF TESTING BLOCK

  return (
    <Spin spinning={isBusy || refreshing}>
      <div className="swap-wrapper">

        {/* Title bar with settings */}
        <div className="swap-title-and-settings flexible-left flex-column-xs">
          <div className="left title">
            <span>{t('ui-menus.main-menu.swap')}</span>
            {/* TESTING BLOCK FOR STYLING THE UI */}
            {environment === 'local' && (
              <span className="primary-link font-regular font-size-80 ml-3" onClick={toggleInputPosition}>Toggle input position</span>
            )}
            {/* END OF TESTING BLOCK */}
          </div>
          <div className="right"><SwapSettings currentValue={slippage} onValueSelected={onSlippageChanged}/></div>
        </div>

        {/* Source token / amount */}
        <CoinInput
          token={fromMint && mintList[fromMint]}
          tokenBalance={
            (fromMint && fromBalance && mintList[fromMint] && parseFloat(fromBalance) > 0
              ? parseFloat(fromBalance).toFixed(mintList[fromMint].decimals)
              : '')
          }
          tokenAmount={fromAmount}
          onInputChange={handleSwapFromAmountChange}
          onMaxAmount={
            () => {
              if (fromMint && toMint && mintList[fromMint] && maxFromAmount && maxFromAmount > 0) {
                setFromSwapAmount(maxFromAmount);
                const formattedAmount = maxFromAmount.toFixed(mintList[fromMint].decimals);                
                setFromAmount(formattedAmount);
              }
            }
          }
          onSelectToken={() => {
            setSubjectTokenSelection("source");
            showTokenSelector();
          }}
          inputPosition={inputPosition}
          translationId="source"
          inputLabel={
            fromMint && mintList[fromMint]
              ? `~$${fromAmount
                ? formatAmount(parseFloat(fromAmount) * getPricePerToken(mintList[fromMint] as TokenInfo), 2)
                : '0.00' }`
              : ''
          }
        />

        <div className="flip-button-container">
          {/* Flip button */}
          <div className="flip-button" onClick={flipMintsCallback}>
            <IconSwapFlip className="mean-svg-icons" />
          </div>
          {/* Info */}
          <div className="info-line">
            {
              fromMint && toMint && exchangeInfo && exchangeInfo.outPrice && (
                <>
                {!refreshing && (
                  <>
                    <div className="left">
                      {
                        (`1 ${mintList[fromMint].symbol} ≈ ${parseFloat(exchangeInfo.outPrice.toFixed(mintList[toMint].decimals))} ${mintList[toMint].symbol}`)
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
              )        
            }
          </div>
        </div>

        {/* Destination token / amount */}
        <CoinInput
          token={toMint && mintList[toMint]}
          tokenBalance={
            (toMint && toBalance && mintList[toMint] && parseFloat(toBalance)
              ? parseFloat(toBalance).toFixed(mintList[toMint].decimals)
              : '')
          }
          tokenAmount={
            (toMint && mintList[toMint] && exchangeInfo && exchangeInfo.amountIn && exchangeInfo.amountOut 
              ? exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)
              : '')
          }
          readonly={true}
          onInputChange={() => {}}
          onMaxAmount={() => {}}
          onSelectToken={() => {
            setSubjectTokenSelection("destination");
            showTokenSelector();
          }}
          inputPosition={inputPosition}
          translationId="destination"
          inputLabel={
            toMint && mintList[toMint]
              ? `~$${
                exchangeInfo && exchangeInfo.amountIn && exchangeInfo.amountOut
                ? formatAmount(parseFloat(exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)) * getPricePerToken(mintList[toMint] as TokenInfo), 2)
                : '0.00'}`
              : ''
          }
        />

        {/* DDCA Option selector */}
        <div className="text-center mt-3 mb-3">
          {ddcaOption && (
            <Button
              type="default"
              shape="round"
              size="middle"
              className={`dropdown-like-button ${ddcaOption?.dcaInterval !== DcaInterval.OneTimeExchange ? 'active' : ''}`}
              onClick={showDdcaOptionSelector}>
              <span className="mr-2">{t(`ddca-selector.${ddcaOption?.translationId}.name`)}</span>
              <IconCaretDown className="mean-svg-icons" />
            </Button>
          )}
        </div>

        {/* Action button */}
        <Button
          className="main-cta"
          block
          type="primary"
          shape="round"
          size="large"
          onClick={() => {
            if (ddcaOption?.dcaInterval !== DcaInterval.OneTimeExchange) {
              showDdcaSetup();
            } else {
              onTransactionStart();
            }
          }}
          // disabled={!isValidBalance || !isValidSwapAmount}
          >
          {transactionStartButtonLabel}
        </Button>

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

        {/* DDCA Option selector modal */}
        <DdcaFrequencySelectorModal
          isVisible={isDdcaOptionSelectorModalVisible}
          handleClose={onCloseDdcaOptionSelector}
          handleOk={onCloseDdcaOptionSelector}
        />

        {/* DDCA Setup modal */}
        {isDdcaSetupModalVisible && (
          <DdcaSetupModal
            isVisible={isDdcaSetupModalVisible}
            handleClose={onCloseDdcaSetup}
            handleOk={onDdcaTransactionStart}
            fromToken={fromMint && mintList[fromMint]}
            fromTokenBalance={fromMint && fromBalance && mintList[fromMint] ? parseFloat(fromBalance) : 0}
            fromTokenAmount={parseFloat(fromAmount) || 0}
            toToken={toMint && mintList[toMint]}
          />
        )}

        {/* SWAP Transaction execution modal */}
        <Modal
          className="mean-modal"
          maskClosable={false}
          visible={isSwapTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideSwapTransactionModal}
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
                  onClick={hideSwapTransactionModal}>
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
                    { getTransactionOperationDescription(transactionStatus, t) }
                  </h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideSwapTransactionModal}>
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

        {/* DDCA Transaction execution modal */}
        <Modal
          className="mean-modal"
          maskClosable={false}
          visible={isDdcaTransactionModalVisible}
          title={getTransactionModalTitle(transactionStatus, isBusy, t)}
          onCancel={hideDdcaTransactionModal}
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
                {/* TODO: Show stuff related to the DDCA operation to be started/scheduled */}
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
                {/* TODO: Set the right completion plus resume message */}
                <p className="operation">
                  {t("transactions.status.tx-swap-operation-success")}.
                </p>
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideDdcaTransactionModal}>
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
                    { getTransactionOperationDescription(transactionStatus, t) }
                  </h4>
                )}
                <Button
                  block
                  type="primary"
                  shape="round"
                  size="middle"
                  onClick={hideDdcaTransactionModal}>
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
