import { Row, Col, Spin, Modal, Button } from "antd";
import { SwapSettings } from "../../components/SwapSettings";
import { ExchangeInput } from "../../components/ExchangeInput";
import { TextInput } from "../../components/TextInput";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatAmount, getComputedFees, getTokenAmountAndSymbolByTokenAddress, getTxIxResume, isValidNumber, shortenAddress } from "../../utils/utils";
import { Identicon } from "../../components/Identicon";
import { CheckOutlined, InfoCircleOutlined, LoadingOutlined, WarningFilled } from "@ant-design/icons";
import { consoleOut, getTransactionModalTitle, getTransactionOperationDescription, getTransactionStatusForLogs, getTxPercentFeeAmount } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useTranslation } from "react-i18next";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from "@solana/web3.js";
import { TransactionStatus } from "../../models/enums";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InfoIcon } from "../../components/InfoIcon";
import { IconSwapFlip } from "../../Icons";
import { environment } from "../../environments/environment";
import { appConfig, customLogger } from "../..";
import { DEFAULT_SLIPPAGE_PERCENT, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import useLocalStorage from "../../hooks/useLocalStorage";
import "./style.less";

import {
  getClients,
  unwrapSol,
  wrapSol,
  Client,
  LPClient,
  ExchangeInfo,
  SERUM,
  TokenInfo,
  FeesInfo,
  TOKENS,
  NATIVE_SOL_MINT,
  USDC_MINT,
  WRAPPED_SOL_MINT,
  ACCOUNT_LAYOUT

} from "@mean-dao/hybrid-liquidity-ag";

import { SerumClient } from "@mean-dao/hybrid-liquidity-ag/lib/serum/types";
import { MSP_OPS } from "@mean-dao/hybrid-liquidity-ag/lib/types";
import { ExchangeOutput } from "../../components/ExchangeOutput";

const bigLoadingIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

export const OneTimeExchange = (props: {
  queryFromMint: string | null;
  queryToMint: string | null;
  connection: Connection
}) => {

  const { t } = useTranslation("common");
  const { publicKey, wallet, connected } = useWallet();
  const {
    coinPrices,
    loadingPrices,
    transactionStatus,
    previousWalletConnectState,
    refreshPrices,
    setTransactionStatus,
    setPreviousWalletConnectState

  } = useContext(AppStateContext);

  const connection = useMemo(() => props.connection, [props.connection]);

  const [refreshing, setRefreshing] = useState(false);
  // Get them from the localStorage and set defaults if they are not already stored
  const [lastSwapFromMint, setLastSwapFromMint] = useLocalStorage('lastSwapFromMint', USDC_MINT.toBase58());
  // Continue normal flow
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useLocalStorage('slippage', DEFAULT_SLIPPAGE_PERCENT);
  const [tokenFilter, setTokenFilter] = useState("");
  const [isTokenSelectorModalVisible, setTokenSelectorModalVisibility] = useState(false);
  // SWAP Transaction execution modal
  const showSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(true), []);
  const hideSwapTransactionModal = useCallback(() => setSwapTransactionModalVisibility(false), []);
  const [isBusy, setIsBusy] = useState(false);
  const [transactionLog, setTransactionLog] = useState<Array<any>>([]);
  const [transactionCancelled, setTransactionCancelled] = useState(false);
  const [isSwapTransactionModalVisible, setSwapTransactionModalVisibility] = useState(false);
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  // FEES
  const [txFees, setTxFees] = useState<TransactionFees>();
  // AGGREGATOR
  const [currentTxSignature, setCurrentTxSignature] = useState("");
  const [lastFromMint, setLastFromMint] = useLocalStorage('lastFromToken', NATIVE_SOL_MINT.toBase58());
  const [fromMint, setFromMint] = useState<string | undefined>(props.queryFromMint ? props.queryFromMint : lastFromMint);
  const [toMint, setToMint] = useState<string | undefined>(undefined);
  const [fromSwapAmount, setFromSwapAmount] = useState(0);
  const [fromBalance, setFromBalance] = useState('');
  const [toBalance, setToBalance] = useState('');
  const [userAccount, setUserAccount] = useState<any | undefined>();
  const [userBalances, setUserBalances] = useState<any>();
  const [mintList, setMintList] = useState<any>({});
  const [showFromMintList, setShowFromMintList] = useState<any>({});
  const [showToMintList, setShowToMintList] = useState<any>({});  
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>();
  const [exchangeInfo, setExchangeInfo] = useState<ExchangeInfo>();
  const [refreshTime, setRefreshTime] = useState(0);
  const [feesInfo, setFeesInfo] = useState<FeesInfo>();
  const [transactionStartButtonLabel, setTransactionStartButtonLabel] = useState('');
  const [renderCount, setRenderCount] = useState(0);
  const [showLpList, setShowLpList] = useState(false);

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

  // Calculates the max allowed amount to swap
  const getMaxAllowedSwapAmount = useCallback(() => {

    if (!fromMint || !toMint || !fromBalance || !userBalances || !exchangeInfo || !feesInfo) {
      return 0;
    }

    let maxAmount = 0;
    let balance = parseFloat(fromBalance);

    if (fromMint === NATIVE_SOL_MINT.toBase58()) {
      maxAmount = balance - feesInfo.network;
    } else {
      maxAmount = balance;
    }

    const isFromSol = fromMint === NATIVE_SOL_MINT.toBase58() || fromMint === WRAPPED_SOL_MINT.toBase58();
    const isToSol = toMint === NATIVE_SOL_MINT.toBase58() || fromMint === WRAPPED_SOL_MINT.toBase58();

    if (selectedClient && selectedClient.market && selectedClient.protocol.equals(SERUM)) {
      if (isFromSol) {
        maxAmount = balance - balance / (exchangeInfo.outPrice || 1) - feesInfo.network;
      } else if (isToSol) {
        maxAmount = balance - balance * (exchangeInfo.outPrice || 1) - feesInfo.network;
      }
    }

    return maxAmount < 0 ? 0 : maxAmount;
    
  }, [
    feesInfo, 
    fromBalance, 
    fromMint, 
    toMint, 
    userBalances,
    selectedClient,
    exchangeInfo
  ]);

  // Automatically updates if the balance is valid
  const isValidBalance = useCallback(() => {

    if (!connection || !connected || !fromMint || !feesInfo || !userBalances) {
      return false;
    }

    let valid = false;
    let balance = userBalances[NATIVE_SOL_MINT.toBase58()];

    if (isWrap() || fromMint !== NATIVE_SOL_MINT.toBase58()) {
      valid = balance >= feesInfo.network;
    } else {
      valid = balance >= (feesInfo.total + feesInfo.network);
    }

    return valid;

  }, [
    connected, 
    connection, 
    feesInfo, 
    fromMint, 
    isWrap, 
    userBalances
  ]);

  // Automatically updates if the swap amount is valid
  const isSwapAmountValid = useCallback(() => {

    if (!connection || !connected || !exchangeInfo) {
      return false;
    }

    const from = fromMint === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT.toBase58() : fromMint;
    const maxFromAmount = getMaxAllowedSwapAmount();
    let minFromAmount = 0;

    if (selectedClient && selectedClient.market && selectedClient.protocol.equals(SERUM)) {
      if (selectedClient.market.baseMintAddress.toBase58() === from) {
        minFromAmount = selectedClient.market.minOrderSize + exchangeInfo.protocolFees;
      } else {
        minFromAmount = 
          selectedClient.market.minOrderSize / 
          (exchangeInfo.outPrice || 1) + 
          exchangeInfo.protocolFees;
      }
    }
    
    return fromSwapAmount > minFromAmount && fromSwapAmount <= maxFromAmount;

  }, [
    connected, 
    connection, 
    exchangeInfo, 
    fromMint, 
    fromSwapAmount, 
    selectedClient,
    getMaxAllowedSwapAmount
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
        let mint = JSON.parse(JSON.stringify(info));
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

    if (!connection || !fromMint || !toMint || !txFees || !selectedClient || !selectedClient.exchange || isWrap() || isUnwrap()) { 
      return; 
    }
    
    const timeout = setTimeout(() => {

      const aggregatorFees = getTxPercentFeeAmount(txFees, fromSwapAmount);
      let amount = fromSwapAmount - aggregatorFees;

      if (amount < 0) {
        amount = 0;
      }

      const price = selectedClient.exchange.outPrice || 0;
      const outAmount = (price * amount);
      const minOutAmount = outAmount * (100 - slippage) / 100;

      setExchangeInfo({
        fromAmm: selectedClient.exchange.fromAmm,
        amountIn: amount,
        amountOut: outAmount,
        minAmountOut: minOutAmount,
        outPrice: price,
        priceImpact: selectedClient.exchange.priceImpact,
        networkFees: selectedClient.exchange.networkFees,
        protocolFees: selectedClient.exchange.protocolFees

      } as ExchangeInfo);

    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection, 
    fromMint,
    fromBalance,
    fromSwapAmount, 
    isUnwrap, 
    isWrap, 
    slippage, 
    toMint,
    mintList,
    txFees,
    selectedClient
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
        network: exchangeInfo.networkFees,
        total: isWrap() || isUnwrap() ? 0: aggregatorFees + exchangeInfo.protocolFees

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
  
  // Updates clients
  useEffect(() => {

    let timeout: any;

    if (!connection || !fromMint || !toMint || isWrap() || isUnwrap() || refreshTime) {
      timeout = setTimeout(() => setRefreshing(false));

    } else {

      timeout = setTimeout(() => {

        const error = (_error: any) => {
          console.error(_error);
          setSelectedClient(undefined);
          setExchangeInfo(undefined);
          setRefreshing(false); 
        };
  
        const success = (clients: Client[] | null) => {
  
          if (!clients || clients.length === 0) {
            setSelectedClient(undefined);
            setExchangeInfo(undefined);
            error(new Error("Client not found"));
            return;
          }

          const btcMintInfo: any = Object
            .values(mintList)
            .filter((m: any) => m.symbol === 'BTC')[0];

          const btcSwap = 
            fromMint === btcMintInfo.address || 
            toMint === btcMintInfo.address;

          if (btcSwap) {
            clients = clients.filter(c => !c.protocol.equals(SERUM));
          }
  
          // clients = clients.filter(c => c.protocol.equals(ORCA));
          setClients(clients);
          consoleOut('clients', clients, 'blue');
          const client = clients[0].protocol.equals(SERUM) 
            ? clients[0] as SerumClient 
            : clients[0] as LPClient;
  
          setSelectedClient(client);
          setRefreshing(false);
          setRefreshTime(30);
        };
  
        getClients(
          connection, 
          fromMint, 
          toMint
        )
        .then((clients: Client[] | null) => success(clients))
        .catch((_error: any) => error(_error));
  
      });
    }

    return () => {
      clearTimeout(timeout);
    }

  },[
    connection, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    toMint,
    refreshTime,
    fromBalance
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
    
    if (!connected || !fromMint || !userBalances) {
      setFromBalance('0');
      return;
    }

    const timeout = setTimeout(() => {

      let balance = 0;

      if (fromMint === NATIVE_SOL_MINT.toBase58()) {
        balance = !userAccount ? 0 : userAccount.lamports / LAMPORTS_PER_SOL;
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

  // Updates the allowed to mints to select 
  useEffect(() => {

    if (!fromMint || !mintList) { return; }

    const timeout = setTimeout(() => {
      setShowToMintList(mintList);
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
      setShowFromMintList(mintList);
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
      } else if (!fromMint || !toMint) {
        label = t("transactions.validation.invalid-exchange");
      } else if ((!selectedClient || !exchangeInfo || !feesInfo) && !isWrap() && !isUnwrap()) {
        label = t("transactions.validation.exchange-unavailable");
      } else if(!isValidBalance()) {

        let needed = 0;

        if (isWrap()) {
          needed = feesInfo?.network || 0;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = fromSwapAmount + (!feesInfo ? 0 : feesInfo.total + feesInfo.network);
        } else {
          needed = feesInfo?.network || 0;
        }

        needed = parseFloat(needed.toFixed(6));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(9));
        }

        label = t("transactions.validation.insufficient-balance-needed", { balance: needed.toString() });

      } else if (fromSwapAmount === 0) {
        label = t("transactions.validation.no-amount");
      } else if (!isSwapAmountValid()) {

        let needed = 0;
        const fromSymbol = mintList[fromMint].symbol;
        const isFromSerum = selectedClient && selectedClient.protocol.equals(SERUM);
        const exchange = !exchangeInfo ? selectedClient.exchange : exchangeInfo;

        if (isFromSerum) {
          const from = fromMint === NATIVE_SOL_MINT.toBase58() ? WRAPPED_SOL_MINT.toBase58() : fromMint;
          if (selectedClient.market.baseMintAddress.toBase58() === from) {
            needed = selectedClient.market.minOrderSize + (feesInfo?.protocol || 0);
          } else {
            needed = selectedClient.market.minOrderSize / (exchange.outPrice || 1) + (feesInfo?.protocol || 0);
          }
        } else {
          if (isWrap()) {
            needed = fromSwapAmount + (feesInfo?.network || 0);
          } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
            needed = fromSwapAmount + (!feesInfo ? 0 : feesInfo.total + feesInfo.network);
          } else {
            needed = fromSwapAmount + (feesInfo?.total || 0);
          }
        }

        needed = parseFloat(needed.toFixed(6));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(mintList[fromMint].decimals));
        }

        if (needed === 0) {
          label = t("transactions.validation.amount-low");
        } else if (!isFromSerum) {
          label = t("transactions.validation.insufficient-amount-needed", { 
            amount: needed.toString(), 
            symbol: fromSymbol 
          });
        } else {
          const balance = parseFloat(fromBalance);
          if (fromSwapAmount > (balance - (feesInfo?.network || 0))) {
            label = t("transactions.validation.insufficient-amount-needed", { 
              amount: fromSwapAmount.toString(), 
              symbol: fromSymbol 
            });
          } else {
            label = t("transactions.validation.minimum-swap-amount", { 
              mintAmount: needed.toString(),
              fromMint: fromSymbol
            });
          }
        }

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
    selectedClient,
    exchangeInfo,
    connected, 
    connection, 
    feesInfo, 
    fromBalance,
    fromSwapAmount, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    mintList, 
    toMint, 
    isValidBalance, 
    isSwapAmountValid
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
    } else if (newValue === '.') {
      setFromAmount('.');
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
      setRefreshing(true);
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

  const getSwapInfo = useCallback((toJson = true) => {

    if (
      !fromMint ||
      !toMint ||
      !mintList[fromMint] ||
      !mintList[toMint] ||
      !wallet ||
      !feesInfo
    ) {
      return 'Essential data not ready for logs "fromMint, toMint, wallet and feesInfo".';
    }
    const logStack = [];

    logStack.push({wallet: wallet.publicKey.toBase58()});
    logStack.push({fromMint: fromMint});
    logStack.push({toMint: toMint});
    logStack.push({feesInfo_Network: `${parseFloat(feesInfo.network.toFixed(mintList[fromMint].decimals))} SOL`});
    logStack.push({feesInfo_Protocol: `${parseFloat(feesInfo.protocol.toFixed(mintList[fromMint].decimals))} ${mintList[fromMint].symbol}`});
    logStack.push({slippage: `${slippage.toFixed(2)}%`});
    if (exchangeInfo) {
      logStack.push({recipientReceives: `${exchangeInfo.minAmountOut?.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`});
      logStack.push({priceImpact: `${parseFloat((exchangeInfo.priceImpact || 0).toFixed(4))}%`});
      logStack.push({exchangeClient: `${exchangeInfo.fromAmm}`});
    }

    if (toJson) {
      const flattenInfo = Object.assign({}, ...logStack);
      return flattenInfo;
    }

    return logStack;

  }, [
    exchangeInfo,
    feesInfo,
    fromMint,
    mintList,
    slippage,
    toMint,
    wallet
  ]);

  const getSwap = useCallback(async () => {

    try {

      if (
        !fromMint || 
        !toMint || 
        !mintList[fromMint] || 
        !mintList[toMint] || 
        !wallet || 
        !feesInfo || 
        !exchangeInfo ||
        !exchangeInfo.amountIn ||
        !exchangeInfo.amountOut

      ) {
        throw new Error("Error executing transaction");
      }
  
      if (isWrap() || isUnwrap()) {
  
        if (isWrap()) {
  
          return wrapSol(
            connection,
            wallet,
            Keypair.generate(),
            exchangeInfo.amountIn
          );
    
        }
        
        if (isUnwrap()) {
    
          return unwrapSol(
            connection,
            wallet,
            Keypair.generate(),
            exchangeInfo.amountIn
          );
    
        }
  
      } else {
  
        if (!selectedClient) {
          throw new Error("Error: Unknown AMM client");
        }
  
        return selectedClient.swapTx(
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
    feesInfo, 
    fromMint, 
    isUnwrap, 
    isWrap, 
    mintList, 
    slippage, 
    exchangeInfo,
    selectedClient,
    toMint, 
    wallet
  ]);

  const resetTransactionStatus = useCallback(() => {
    setTransactionStatus({
      lastOperation: TransactionStatus.Iddle,
      currentOperation: TransactionStatus.Iddle
    });
  },[setTransactionStatus])

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
    }
    resetTransactionStatus();

  }, [
    isBusy,
    isSuccess,
    updateRenderCount,
    resetTransactionStatus,
    hideSwapTransactionModal
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
        result: getSwapInfo()
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
        result: getTxIxResume(swapTx)
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
    getSwapInfo,
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
        result: {signer: wallet.publicKey.toBase58()}
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
        result: {signer: `${wallet?.publicKey.toBase58() || '-'}`, error: `${_error}`}
      }]);
      customLogger.logWarning('Swap transaction failed', { transcript: transactionLog });
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
    consoleOut('encodedTx:', encodedTx, 'orange');

    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      const sentTx = await connection.sendEncodedTransaction(encodedTx);

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

  const tryGetTxStatus = useCallback(async (signature: string) => {

    try {

      if (!connection) {
        throw new Error('Not connected');
      }

      const response = await connection.getSignatureStatus(signature);

      if(!response || !response.value || response.value.err) {

        const err = response && response.value && response.value.err 
          ? response.value.err 
          : new Error('Cannot confirm transaction');

        // Log error
        setTransactionLog(current => [...current, {
          action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
          result: `${err}`
        }]);

        customLogger.logError('Swap transaction failed', { transcript: transactionLog });

        return false;
      }

      if (!response.value.confirmationStatus) {
        return false;
      }

      return response.value.confirmationStatus

    } catch (_error) {
      // Log error
      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
        result: `${_error}`
      }]);

      customLogger.logError('Swap transaction failed', { transcript: transactionLog });

      return false;
    }

  }, [
    connection, 
    transactionLog
  ])

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

        // Log error
        setTransactionLog(current => [...current, {
          action: getTransactionStatusForLogs(TransactionStatus.ConfirmTransactionFailure),
          result: `${err}`
        }]);

        customLogger.logError('Swap transaction failed', { transcript: transactionLog });

        return await tryGetTxStatus(signature);
      }

      setTransactionStatus({
        lastOperation: TransactionStatus.ConfirmTransactionSuccess,
        currentOperation: TransactionStatus.TransactionFinished
      });

      setTransactionLog(current => [...current, {
        action: getTransactionStatusForLogs(TransactionStatus.TransactionFinished),
        result: response.value
      }]);

      return response.value;

    } catch (_error) {
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
      // throw(_error);
      return tryGetTxStatus(signature);
    }

  },[
    connection, 
    setTransactionStatus, 
    transactionLog, 
    tryGetTxStatus
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

      setCurrentTxSignature(signature);
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

  const refreshPage = () => {
    hideSwapTransactionModal();
    window.location.reload();
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
        !refreshing && fromAmount && feesInfo &&
        infoRow(
          t("transactions.transaction-info.network-transaction-fee"),
          `${parseFloat(feesInfo.network.toFixed(mintList[fromMint].decimals))} SOL`
        )
      }
      {
        !refreshing && fromAmount && feesInfo && !isWrap() && !isUnwrap() &&
        infoRow(
          t("transactions.transaction-info.protocol-transaction-fee", { protocol: exchangeInfo.fromAmm }),
          `${parseFloat(feesInfo.protocol.toFixed(mintList[fromMint].decimals))} ${mintList[fromMint].symbol}`
        )
      }
      {
        !refreshing && fromAmount && slippage &&
        infoRow(
          t("transactions.transaction-info.slippage"),
          `${slippage.toFixed(2)}%`
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
          `${parseFloat((exchangeInfo.priceImpact || 0).toFixed(4))}%`
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

  const onShowLpListToggled = (value: boolean) => {
    setShowLpList(value);
  };

  const renderSourceTokenList = (
    <>
      {Object.values(showFromMintList).length ? (
        Object.values(showFromMintList).map((token: any, index) => {
          const onClick = () => {
            if (!fromMint || fromMint !== token.address) {
              setFromMint(token.address);
              setLastFromMint(token.address);
              setExchangeInfo(undefined);
              setRefreshTime(0);
              setRefreshing(true);
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
              setToMint(token.address);
              setExchangeInfo(undefined);
              setRefreshTime(0);
              setRefreshing(true);
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

  // TODO: Convert the input field class "transaction-field" to the new general purpose class "well"
  // Kept for compatibility but it must be removed after conversion
  const inputPosition = "right";

  return (
    <>
      <Spin spinning={isBusy || refreshing}>
        <div className="swap-wrapper">

          {/* Source token / amount */}
          <ExchangeInput
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
                const maxFromAmount = getMaxAllowedSwapAmount();
                console.log('maxFromAmount', maxFromAmount);
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
            onPriceClick={() => refreshPrices()}
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
            {/* Settings icon */}
            <span className="settings-wrapper pr-3">
              <SwapSettings
                currentValue={slippage}
                showLpList={showLpList}
                onToggleShowLpList={onShowLpListToggled}
                onValueSelected={onSlippageChanged}/>
            </span>
          </div>

          {/* Destination token / amount */}
          {
            <ExchangeOutput
              fromToken={fromMint && mintList[fromMint]}
              fromTokenAmount={fromAmount}
              toToken={toMint && mintList[toMint]}
              toTokenBalance={
                (toMint && toBalance && mintList[toMint] && parseFloat(toBalance)
                  ? parseFloat(toBalance).toFixed(mintList[toMint].decimals)
                  : '')
              }
              toTokenAmount={
                (toMint && mintList[toMint] && exchangeInfo && exchangeInfo.amountIn && exchangeInfo.amountOut 
                  ? exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)
                  : '')
              }
              onSelectToken={() => {
                setSubjectTokenSelection("destination");
                showTokenSelector();
              }}
              inputLabel={
                toMint && mintList[toMint]
                  ? `~$${
                    exchangeInfo && exchangeInfo.amountIn && exchangeInfo.amountOut
                    ? formatAmount(parseFloat(exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)) * getPricePerToken(mintList[toMint] as TokenInfo), 2)
                    : '0.00'}`
                  : ''
              }
              clients={clients}
              onSelectedClient={(client: Client) => {
                consoleOut('onSelectedClient:', client, 'blue');
                setSelectedClient(client);
              }}
              showLpList={showLpList && !isWrap() && !isUnwrap()}
            />
          }

          {/* Title bar with settings */}
          <div className="info-line-and-settings flexible-left">
            <div className="left">
              <span>&nbsp;</span>
            </div>
            {/* Info */}
            <div className="right info-line">
              {
                fromMint && toMint && exchangeInfo && exchangeInfo.outPrice ? (
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
                ) : (<span>-</span>)
              }
            </div>
          </div>

          {/* Action button */}
          <Button
            className="main-cta"
            block
            type="primary"
            shape="round"
            size="large"
            onClick={onTransactionStart}
            disabled={!isValidBalance() || !isSwapAmountValid() || !exchangeInfo || !exchangeInfo?.amountOut} >
            {transactionStartButtonLabel}
          </Button>

          {/* Warning */}
          {environment !== 'production' && (
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

          {/* SWAP Transaction execution modal */}
          <Modal
            className="mean-modal no-full-screen"
            maskClosable={false}
            visible={isSwapTransactionModalVisible}
            title={getTransactionModalTitle(transactionStatus, isBusy, t)}
            onCancel={hideSwapTransactionModal}
            afterClose={onAfterTransactionModalClosed}
            width={360}
            footer={null}>
            <div className="transaction-progress">
              {isBusy ? (
                <>
                  <Spin indicator={bigLoadingIcon} className="icon" />
                  <h4 className="font-bold mb-1">
                    {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                  </h4>
                  {(fromMint && toMint && fromAmount && exchangeInfo && exchangeInfo.amountOut) && (
                    <p className="operation">
                      {
                        t("transactions.status.tx-swap-operation", {
                          fromAmount: `${fromAmount} ${mintList[fromMint].symbol}`,
                          toAmount: `${exchangeInfo.amountOut.toFixed(mintList[toMint].decimals)} ${mintList[toMint].symbol}`
                        })
                      }
                    </p>
                  )}
                  {transactionStatus.currentOperation === TransactionStatus.SignTransaction && (
                    <div className="indication">{t('transactions.status.instructions')}</div>
                  )}
                </>
              ) : isSuccess() ? (
                <>
                  <CheckOutlined style={{ fontSize: 48 }} className="icon" />
                  <h4 className="font-bold mb-1">
                    {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
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
                  <InfoCircleOutlined style={{ fontSize: 48 }} className="icon" />
                  {txFees && transactionStatus.currentOperation === TransactionStatus.TransactionStartFailure ? (
                    <h4 className="mb-4">
                      {t("transactions.status.tx-start-failure", {
                        accountBalance: getTokenAmountAndSymbolByTokenAddress(
                          parseFloat(fromBalance),
                          NATIVE_SOL_MINT.toBase58()
                        ),
                        feeAmount: getTokenAmountAndSymbolByTokenAddress(
                          getComputedFees(txFees),
                          NATIVE_SOL_MINT.toBase58()
                        )
                      })}
                    </h4>
                  ) : (
                    <>
                      <h4 className="font-bold mb-3">
                        {getTransactionOperationDescription(transactionStatus.currentOperation, t)}
                      </h4>
                      {txFees && transactionStatus.currentOperation === TransactionStatus.ConfirmTransactionFailure ? (
                        <>
                          <p className="operation">
                            {t("transactions.status.tx-confirm-failure-check")}
                          </p>
                          <p className="operation">
                            <a className="secondary-link" 
                              href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${currentTxSignature}`} 
                              target="_blank" 
                              rel="noopener noreferrer">
                              {shortenAddress(currentTxSignature, 8)}
                            </a>
                          </p>
                        </>
                      ) : transactionStatus.currentOperation === TransactionStatus.SendTransactionFailure ? (
                        <div className="row two-col-ctas mt-3">
                          <div className="col-6">
                            <Button
                              block
                              type="text"
                              shape="round"
                              size="middle"
                              onClick={onTransactionStart}>
                              {t('general.retry')}
                            </Button>
                          </div>
                          <div className="col-6">
                            <Button
                              block
                              type="primary"
                              shape="round"
                              size="middle"
                              onClick={() => refreshPage()}>
                              {t('general.refresh')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          block
                          type="primary"
                          shape="round"
                          size="middle"
                          onClick={hideSwapTransactionModal}>
                          {t('general.cta-close')}
                        </Button>
                      )}
                    </>
                  )}
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
    </>
  );
};
