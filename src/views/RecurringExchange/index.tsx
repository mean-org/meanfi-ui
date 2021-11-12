import { Row, Col, Spin, Modal, Button } from "antd";
import { SwapSettings } from "../../components/SwapSettings";
import { ExchangeInput } from "../../components/ExchangeInput";
import { TextInput } from "../../components/TextInput";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { formatAmount, isValidNumber } from "../../utils/utils";
import { Identicon } from "../../components/Identicon";
import { InfoCircleOutlined, WarningFilled } from "@ant-design/icons";
import { consoleOut, getTxPercentFeeAmount, isProd } from "../../utils/ui";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { MSP_ACTIONS, TransactionFees } from '@mean-dao/money-streaming/lib/types';
import { calculateActionFees } from '@mean-dao/money-streaming/lib/utils';
import { useTranslation } from "react-i18next";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { InfoIcon } from "../../components/InfoIcon";
import { DdcaFrequencySelectorModal } from "../../components/DdcaFrequencySelectorModal";
import { IconCaretDown, IconSwapFlip } from "../../Icons";
import { environment } from "../../environments/environment";
import { appConfig } from "../..";
import { DcaInterval } from "../../models/ddca-models";
import { DdcaSetupModal } from "../../components/DdcaSetupModal";
import { calculateActionFees as calculateDdcaActionFees, TransactionFees as DdcaTxFees, DDCA_ACTIONS } from '@mean-dao/ddca';
import { Redirect } from "react-router-dom";
import { DEFAULT_SLIPPAGE_PERCENT } from "../../constants";
import useLocalStorage from "../../hooks/useLocalStorage";
import "./style.less";

import {
  getClients,
  LPClient,
  ExchangeInfo,
  SERUM,
  TokenInfo,
  FeesInfo,
  TOKENS,
  NATIVE_SOL_MINT, 
  USDC_MINT, 
  USDT_MINT, 
  WRAPPED_SOL_MINT,
  ACCOUNT_LAYOUT,
  HlaInfo,
  Client,
  SRM_MINT,
  ORCA,
  RAYDIUM

} from "@mean-dao/hybrid-liquidity-ag";

import { SerumClient } from "@mean-dao/hybrid-liquidity-ag/lib/serum/types";
import { ExchangeOutput } from "../../components/ExchangeOutput";

export const RecurringExchange = (props: {
  queryFromMint: string | null;
  queryToMint: string | null;
  connection: Connection;
  endpoint: string;
}) => {

  const { t } = useTranslation("common");
  const [redirect, setRedirect] = useState<string | null>(null);
  const { publicKey, connected } = useWallet();
  const {
    coinPrices,
    ddcaOption,
    previousWalletConnectState,
    setPreviousWalletConnectState,
    setDdcaOption

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
  const [subjectTokenSelection, setSubjectTokenSelection] = useState("source");
  // FEES
  const [txFees, setTxFees] = useState<TransactionFees>();
  const [ddcaTxFees, setdDcaTxFees] = useState<DdcaTxFees>({
    flatFee: 0, maxBlockchainFee: 0, maxFeePerSwap: 0, percentFee: 0, totalScheduledSwapsFees: 0
  });
  // AGGREGATOR
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
  const [hlaInfo, setHlaInfo] = useState<HlaInfo>();
  const [defaultDdcaOption] = useState("Repeat weekly");

  // DDCA Option selector modal
  const [isDdcaOptionSelectorModalVisible, setDdcaOptionSelectorModalVisibility] = useState(false);
  const showDdcaOptionSelector = useCallback(() => setDdcaOptionSelectorModalVisibility(true), []);
  const onCloseDdcaOptionSelector = useCallback(() => setDdcaOptionSelectorModalVisibility(false), []);

  // DDCA Setup modal
  const hideDdcaSetupModal = useCallback(() => setDdcaSetupModalVisibility(false), []);
  const [isDdcaSetupModalVisible, setDdcaSetupModalVisibility] = useState(false);

  const showDdcaSetup = useCallback(() => {

    if (!selectedClient || !exchangeInfo) { return; }

    const hlaInfo: HlaInfo = {
      exchangeRate: exchangeInfo.outPrice as number || 0,
      protocolFees: exchangeInfo.protocolFees as number || 0,
      aggregatorPercentFees: 0.05,
      remainingAccounts: selectedClient.accounts
    };

    setHlaInfo(hlaInfo);
    setDdcaSetupModalVisibility(true);
    
  }, [
    selectedClient, 
    exchangeInfo
  ]);

  const onFinishedDdca = useCallback(() => {
    setFromAmount("");
    setFromSwapAmount(0);
    setDdcaSetupModalVisibility(false);
    setRedirect('/exchange-dcas');
  }, []);

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

  const isStableSwap = (
    from: string | undefined,
    to: string | undefined

  ) => {

    if (!from || !to) { return false; }

    const usdStables = [
      USDC_MINT.toBase58(), 
      USDT_MINT.toBase58()
    ];

    if (usdStables.includes(from) && usdStables.includes(to)) {
      return true;
    }

    const solStables = [
      NATIVE_SOL_MINT.toBase58(), 
      WRAPPED_SOL_MINT.toBase58()
    ];

    if (solStables.includes(from) && solStables.includes(to)) {
      return true;
    }

    return false;
  }

  // Calculates the max allowed amount to swap
  const getMaxAllowedSwapAmount = useCallback(() => {

    if (!fromMint || !toMint || !fromBalance || !userBalances || !feesInfo) {
      return 0;
    }

    let maxAmount = 0;
    let balance = parseFloat(fromBalance);

    if (fromMint === NATIVE_SOL_MINT.toBase58()) {
      maxAmount = balance - feesInfo.network;
    } else {
      maxAmount = balance;
    }

    return maxAmount;
    
  }, [
    feesInfo, 
    fromBalance, 
    fromMint, 
    toMint, 
    userBalances
  ]);

  const updateRenderCount = useCallback(() => {

    setRenderCount(renderCount + 1);

  },[
    renderCount
  ]);

  useEffect(() => {

    if (!ddcaOption || ddcaOption.name !== defaultDdcaOption) {
      return;
    }

    const timeout = setTimeout(() => {

      setDdcaOption(ddcaOption.name);

    });

    return () => {
      clearTimeout(timeout);
    }

  },[
    ddcaOption,
    defaultDdcaOption,
    setDdcaOption
  ]);

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

  // Get DDCA Tx fees
  useEffect(() => {

    if (!connection) {
      return;
    }

    const timeout = setTimeout(() => {
      calculateDdcaActionFees(connection, DDCA_ACTIONS.create, 1)
        .then((fees: DdcaTxFees) => {
          setdDcaTxFees(fees);
          consoleOut('ddcaTxFees:', fees, 'blue');
        })
        .catch((_error: any) => {
          console.error(_error);
          throw(_error);
        });
    });

    return () => {
      clearTimeout(timeout);
    }

  }, [
    connection
  ]);

  // Token map for quick lookup.
  useEffect(() => {

    if (!TOKENS) { return; }

    const timeout = setTimeout(() => {

      const list: any = { };

      //TODO: Remove token filtering when HLA program implementation covers all tokens
      for (let info of TOKENS.filter(t => {
        if (
          t.symbol === "SOL" || 
          t.symbol === "wSOL" || 
          t.symbol === "USDC" || 
          t.symbol === "USDT" ||
          t.symbol === "ETH" || 
          t.symbol === "BTC" ||
          t.symbol === "RAY" ||
          t.symbol === "SRM" ||
          t.symbol === "ORCA"
        ) {
          return true;
        }
        return false;
      })) {
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
          setRefreshing(false); 
        };
  
        const success = (clients: Client[] | null) => {
  
          if (!clients || clients.length === 0) {
            error(new Error("Client not found"));
            return;
          }
  
          //TODO: Remove clients filtering when HLA program implementation covers every client
          const allowedClients = clients.filter(c => c.protocol.equals(ORCA) || c.protocol.equals(RAYDIUM));
          setClients(allowedClients);
          console.log(allowedClients);
          const client = allowedClients[0].protocol.equals(SERUM)
            ? clients[0] as SerumClient 
            : clients[0] as LPClient;
  
          setSelectedClient(client);
          setExchangeInfo(client.exchange);
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
    fromSwapAmount
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

  // Automatically updates if the balance is valid
  const isValidBalance = useCallback(() => {

    if (!connection || !connected || !fromMint || !feesInfo || !userBalances) {
      return false;
    }

    let valid = false;
    let balance = userBalances[NATIVE_SOL_MINT.toBase58()];

    if (isWrap()) {
      valid = balance >= feesInfo.network;
    } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
      valid = balance >= (feesInfo.total + feesInfo.network);
    } else {
      valid = balance >= feesInfo.network;
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

    if (!connection || !connected) {
      return false;
    }

    const maxFromAmount = getMaxAllowedSwapAmount();
    
    return fromSwapAmount > 0 && fromSwapAmount <= maxFromAmount;

  }, [
    connected, 
    connection, 
    fromSwapAmount, 
    getMaxAllowedSwapAmount
  ])

  // Updates the allowed to mints to select 
  useEffect(() => {

    if (!fromMint || !mintList) { return; }

    const timeout = setTimeout(() => {

      const orcaMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'ORCA')[0];

      if (orcaMintInfo && fromMint === orcaMintInfo.address) {

        const orcaList: any = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'SOL');

        let allowedMints: any = {};

        for (let item of orcaList) {
          allowedMints[item.address] = item;
        }
    
        setShowToMintList(allowedMints);

        if (toMint && toMint !== USDC_MINT.toBase58() && toMint !== NATIVE_SOL_MINT.toBase58() && toMint !== WRAPPED_SOL_MINT.toBase58()) {
          setToMint(USDC_MINT.toBase58());
        }

        return;
      }

      const btcMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC')[0];
 
      if (btcMintInfo && fromMint === btcMintInfo.address) {

        const btcList: any = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'USDT' || m.symbol === 'SRM');

        let usdxMints: any = {};

        for (let item of btcList) {
          usdxMints[item.address] = item;
        }
    
        setShowToMintList(usdxMints);
        
        if (toMint && toMint !== USDC_MINT.toBase58() && toMint !== USDT_MINT.toBase58() && toMint !== SRM_MINT.toBase58()) {
          setToMint(USDC_MINT.toBase58());
        }

        return;
      }

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

      const orcaMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'ORCA')[0];

      if (orcaMintInfo && toMint === orcaMintInfo.address) {

        const orcaList: any = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'SOL');

        let allowedMints: any = {};

        for (let item of orcaList) {
          allowedMints[item.address] = item;
        }
    
        setShowFromMintList(allowedMints);

        if (fromMint && fromMint !== USDC_MINT.toBase58() && fromMint !== NATIVE_SOL_MINT.toBase58() && fromMint !== WRAPPED_SOL_MINT.toBase58()) {
          setFromMint(USDC_MINT.toBase58());
        }

        return;
      }

      const btcMintInfo: any = Object
        .values(mintList)
        .filter((m: any) => m.symbol === 'BTC')[0];

      if (!btcMintInfo) { return; }

      if (toMint && (toMint === btcMintInfo.address)) {

        const btcList: any = Object
          .values(mintList)
          .filter((m: any) => m.symbol === 'USDC' || m.symbol === 'USDT' || m.symbol === 'SRM');
    
        setShowFromMintList(btcList);
        
        if (fromMint && fromMint !== USDC_MINT.toBase58() && fromMint !== USDT_MINT.toBase58() && fromMint !== SRM_MINT.toBase58()) {
          setFromMint(USDC_MINT.toBase58());
        }

        return;
      }

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
      } else if (!fromMint || !toMint || !feesInfo) {
        label = t("transactions.validation.invalid-exchange");
      } else if (fromSwapAmount === 0 && isValidBalance()) {
        label = t("transactions.validation.no-amount");
      } else if(!isValidBalance()) {

        let needed = 0;

        if (isWrap()) {
          needed = feesInfo.aggregator + feesInfo.network;
        } else if (fromMint === NATIVE_SOL_MINT.toBase58()) {
          needed = feesInfo.total + feesInfo.network;
        } else {
          needed = feesInfo.network;
        }

        needed = parseFloat(needed.toFixed(6));

        if (needed === 0) {
          needed = parseFloat(needed.toFixed(9));
        }

        label = t("transactions.validation.insufficient-balance-needed", { balance: needed.toString() });

      } else if (!isSwapAmountValid()) {
        console.log('fromSwapAmount', fromSwapAmount);

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
    isWrap, 
    getMaxAllowedSwapAmount, 
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

  const onAfterTransactionModalClosed = useCallback(() => {

    setFromAmount("");
    setFromSwapAmount(0);
    updateRenderCount();
    
  }, [
    updateRenderCount
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
        !refreshing && fromAmount && feesInfo &&
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
          `${parseFloat((exchangeInfo.priceImpact || 0).toFixed(2))}%`
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
                  : areSameTokens(token, (toMint ? showFromMintList[toMint] : undefined)) || isStableSwap(token.address, toMint)
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
                  : areSameTokens(token, (fromMint ? showToMintList[fromMint] : undefined)) || isStableSwap(fromMint, token.address)
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
      {redirect && <Redirect to={redirect} />}
      <Spin spinning={refreshing}>
        <div className="swap-wrapper">

          {/* DDCA Option selector */}
          <div className="ddca-option-select-row">
            <span className="label">{t('swap.frequency-label')}</span>
            {ddcaOption && (
              <Button
                type="default"
                size="middle"
                className="dropdown-like-button"
                onClick={showDdcaOptionSelector}>
                <span className="mr-2">{t(`ddca-selector.${ddcaOption.translationId}.name`)}</span>
                <IconCaretDown className="mean-svg-icons" />
              </Button>
            )}
          </div>

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
          {isProd() ? (
            <ExchangeInput
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
          ) : (
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
              showLpList={showLpList}
            />
          )}

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
            onClick={showDdcaSetup}
            disabled={!isValidBalance() || !isSwapAmountValid() || (environment !== 'production' && ddcaOption?.dcaInterval === DcaInterval.OneTimeExchange) }
            >
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

          {/* DDCA Option selector modal */}
          <DdcaFrequencySelectorModal
            isVisible={isDdcaOptionSelectorModalVisible}
            handleClose={onCloseDdcaOptionSelector}
            handleOk={onCloseDdcaOptionSelector}
          />

          {/* DDCA Setup modal */}
          {isDdcaSetupModalVisible && (
            <DdcaSetupModal
              endpoint={props.endpoint}
              connection={connection}
              isVisible={isDdcaSetupModalVisible}
              handleClose={hideDdcaSetupModal}
              handleOk={onFinishedDdca}
              onAfterClose={onAfterTransactionModalClosed}
              fromToken={fromMint && mintList[fromMint]}
              fromTokenBalance={fromMint && fromBalance && mintList[fromMint] ? parseFloat(fromBalance) : 0}
              fromTokenAmount={parseFloat(fromAmount) || 0}
              toToken={toMint && mintList[toMint]}
              userBalance={userBalances[NATIVE_SOL_MINT.toBase58()]}
              ddcaTxFees={ddcaTxFees}
              slippage={slippage}
              hlaInfo={hlaInfo as HlaInfo}
            />
          )}
        </div>
      </Spin>
    </>
  );
};
