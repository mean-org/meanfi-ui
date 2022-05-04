import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.scss';
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Empty, Spin, Divider, Steps } from "antd";
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, findATokenAddress, formatThousands, isValidNumber } from "../../utils/utils";
import { IconLoading, IconStats } from "../../Icons";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";
import useWindowSize from '../../hooks/useWindowResize';
import { consoleOut, isProd, toUsCurrency } from "../../utils/ui";
import { ConfirmOptions, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Env, StakePoolInfo, StakingClient } from "@mean-dao/staking";
import { StakeTabView } from "../../views/StakeTabView";
import { UnstakeTabView } from "../../views/UnstakeTabView";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST, SOCN_USD } from "../../constants/token-list";
import { confirmationEvents } from "../../contexts/transaction-status";
import { EventType } from "../../models/enums";
import { InfoIcon } from "../../components/InfoIcon";
import { ONE_MINUTE_REFRESH_TIMEOUT } from "../../constants";

type SwapOption = "stake" | "unstake";
const { Step } = Steps;

type StakingPair = {
  unstakedToken: TokenInfo | undefined;
  stakedToken: TokenInfo | undefined;
}

export const InvestView = () => {
  const {
    coinPrices,
    stakedAmount,
    loadingPrices,
    detailsPanelOpen,
    setIsVerifiedRecipient,
    setDtailsPanelOpen,
    setFromCoinAmount,
    refreshPrices,
  } = useContext(AppStateContext);
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { cluster, endpoint } = useConnectionConfig();
  const { connected, publicKey } = useWallet();
  const { account } = useNativeAccount();
  const accounts = useAccountsContext();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);
  const [nativeBalance, setNativeBalance] = useState(0);
  const [meanPrice, setMeanPrice] = useState<number>(0);
  const [socnUsdTokenPrice, setSocnUsdTokenPrice] = useState<number>(0);
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [currentTab, setCurrentTab] = useState<SwapOption>("stake");
  const [stakingRewards, setStakingRewards] = useState<number>(0);
  const annualPercentageYield = 5;
  const [raydiumInfo, setRaydiumInfo] = useState<any>([]);
  const [orcaInfo, setOrcaInfo] = useState<any>([]);
  const [maxRadiumAprValue, setMaxRadiumAprValue] = useState<number>(0);
  const [maxOrcaAprValue, setMaxOrcaAprValue] = useState<number>(0);
  const [marinadeApyValue, setMarinadeApyValue] = useState<number>(0);
  const [marinadeTotalStakedValue, setMarinadeTotalStakedValue] = useState<number>(0);
  const [soceanApyValue, setSoceanApyValue] = useState<number>(0);
  const [soceanTotalStakedValue, setSoceanTotalStakedValue] = useState<number>(0);
  const [lidoAprValue, setLidoAprValue] = useState<number>(0);
  const [lidoTotalStakedValue, setLidoTotalStakedValue] = useState<number>(0);
  const [maxAprValue, setMaxAprValue] = useState<number>(0);
  const [maxStakeSolApyValue, setMaxStakeSolApyValue] = useState<number>(0);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [stakePoolInfo, setStakePoolInfo] = useState<StakePoolInfo>();
  const [shouldRefreshStakePoolInfo, setShouldRefreshStakePoolInfo] = useState(true);
  const [refreshingStakePoolInfo, setRefreshingStakePoolInfo] = useState(false);
  const [bondsAmount, setBondsAmount] = useState<string>('');

  const [shouldRefreshLpData, setShouldRefreshLpData] = useState(true);
  const [refreshingPoolInfo, setRefreshingPoolInfo] = useState(false);
  const [canSubscribe, setCanSubscribe] = useState(true);

  // Tokens and balances
  const [meanAddresses, setMeanAddresses] = useState<Env>();
  const [stakingPair, setStakingPair] = useState<StakingPair | undefined>(undefined);
  const [sMeanBalance, setSmeanBalance] = useState<number>(0);
  const [meanBalance, setMeanBalance] = useState<number>(0);
  const [lastTimestamp, setLastTimestamp] = useState(Date.now());
  const [socnUsdBalance, setSocnUsdBalance] = useState<number>(0);

  // Create and cache Staking client instance
  const stakeClient = useMemo(() => {

    const opts: ConfirmOptions = {
      preflightCommitment: "confirmed",
      commitment: "confirmed",
    };

    return new StakingClient(
      cluster,
      endpoint,
      publicKey,
      opts,
      isProd() ? false : true
    )

  }, [
    cluster,
    endpoint,
    publicKey
  ]);

  const socnUsdToken = useMemo(() => {
    return SOCN_USD as TokenInfo;
  }, []);

  const getPricePerToken = useCallback((token: TokenInfo): number => {
    if (!token || !coinPrices) { return 0; }

    return coinPrices && coinPrices[token.address]
      ? coinPrices[token.address]
      : 0;
  }, [coinPrices])

  // Keep MEAN price updated
  useEffect(() => {

    if (coinPrices && stakingPair && stakingPair.unstakedToken) {
      const price = getPricePerToken(stakingPair.unstakedToken);
      consoleOut('meanPrice:', price, 'crimson');
      console.log('coinPrices:', coinPrices);
      setMeanPrice(price);
    }

  }, [coinPrices, getPricePerToken, stakingPair]);

  // Keep SOCN/USDC price updated
  useEffect(() => {

    if (coinPrices) {
      const price = getPricePerToken(socnUsdToken);
      consoleOut('SOCN/USDC Price:', price, 'crimson');
      setSocnUsdTokenPrice(price);
    }

  }, [coinPrices, getPricePerToken, socnUsdToken, stakingPair]);

  /////////////////
  //  Callbacks  //
  /////////////////

  const getTokenAccountBalanceByAddress = useCallback(async (tokenAddress: PublicKey | undefined | null): Promise<number> => {
    if (!connection || !tokenAddress) return 0;
    try {
      const tokenAmount = (await connection.getTokenAccountBalance(tokenAddress)).value;
      return tokenAmount.uiAmount || 0;
    } catch (error) {
      consoleOut('getTokenAccountBalance failed for:', tokenAddress.toBase58(), 'red');
      return 0;
    }
  }, [connection]);

  const refresSocnUsdcBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    try {
      const socnUsdTokenPk = new PublicKey(socnUsdToken.address);
      const tokenAddress = await findATokenAddress(publicKey, socnUsdTokenPk);
      balance = await getTokenAccountBalanceByAddress(tokenAddress);
      consoleOut('SOCN/USDC balance:', balance, 'blue');
      setSocnUsdBalance(balance);
    } catch (error) {
      setSocnUsdBalance(balance);
    }

  }, [
    accounts,
    publicKey,
    connection,
    socnUsdToken.address,
    getTokenAccountBalanceByAddress
  ]);

  const refreshMeanBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!stakingPair || !stakingPair.unstakedToken) {
      setMeanBalance(balance);
      return;
    }

    try {
      const meanTokenPk = new PublicKey(stakingPair.unstakedToken.address);
      const meanTokenAddress = await findATokenAddress(publicKey, meanTokenPk);
      balance = await getTokenAccountBalanceByAddress(meanTokenAddress);
      consoleOut('MEAN balance:', balance, 'blue');
      setMeanBalance(balance);
    } catch (error) {
      setMeanBalance(balance);
    }

  }, [
    accounts,
    publicKey,
    connection,
    stakingPair,
    getTokenAccountBalanceByAddress
  ]);

  const refreshStakedMeanBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!stakingPair || !stakingPair.stakedToken) {
      setSmeanBalance(balance);
      return;
    }

    const sMeanTokenPk = new PublicKey(stakingPair.stakedToken.address);
    const smeanTokenAddress = await findATokenAddress(publicKey, sMeanTokenPk);
    balance = await getTokenAccountBalanceByAddress(smeanTokenAddress);
    consoleOut('sMEAN balance:', balance, 'blue');
    setSmeanBalance(balance);

  }, [
    accounts,
    publicKey,
    connection,
    stakingPair,
    getTokenAccountBalanceByAddress
  ]);

  const investItems = useMemo(() => [
    {
      id: 0,
      name: "Stake",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg",
      symbol2: "",
      title: t("invest.panel-left.invest-stake-tab-title"),
      rateAmount: `${stakePoolInfo ? (stakePoolInfo.apr * 100).toFixed(2) : "0"}%`,
      interval: "APR"
    },
    {
      id: 1,
      name: "Liquidity",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      symbol2: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
      title: t("invest.panel-left.invest-liquidity-tab-title"),
      rateAmount: `${t("invest.panel-left.up-to-value-label")} ${maxAprValue ? maxAprValue.toFixed(2) : "0"}%`,
      interval: "APR/APY"
    },
    {
      id: 2,
      name: "Stake Sol",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      symbol2: "",
      title: t("invest.panel-left.invest-stake-sol-tab-title"),
      rateAmount: `${t("invest.panel-left.up-to-value-label")} ${maxStakeSolApyValue ? cutNumber(maxStakeSolApyValue, 2) : "0"}%`,
      interval: "APR/APY"
    },
    {
      id: 3,
      name: "Discounted sMEAN",
      symbol1: "/assets/smean-token.svg",
      symbol2: "",
      title: "Get discounted sMEAN",
      rateAmount: soceanTotalStakedValue > 0 ? `${toUsCurrency(soceanTotalStakedValue)}` : "--",
      interval: "Balance TVL"
    }
  ], [
    t,
    maxAprValue,
    stakePoolInfo,
    maxStakeSolApyValue,
    soceanTotalStakedValue,
  ]);

  /*
  const stakingData = useMemo(() => [
    {
      label: t("invest.panel-right.staking-data.label-my-staked"),
      value: stakingPair && stakingPair.stakedToken && sMeanBalance
        ? formatThousands(sMeanBalance, stakingPair.stakedToken.decimals) : "0"
    },
    // {
    //   label: t("invest.panel-right.staking-data.label-avg"),
    //   value: `${annualPercentageYield}%`
    // },
    // {
    //   label: t("invest.panel-right.staking-data.label-boost"),
    //   value: `${stakingMultiplier}x boost`
    // },
    // {
    //   label: t("invest.panel-right.staking-data.label-locked"),
    //   value: "1,000"
    // },
    // {
    //   label: t("invest.panel-right.staking-data.label-balance"),
    //   value: "20,805.1232"
    // },
  ], [sMeanBalance, stakingPair, t]);
  */

  const stakingSOLData = useMemo(() => [
    {
      name: "Socean",
      token: "scnSOL",
      href: "https://www.socean.fi/app/stake",
      img: "https://www.socean.fi/static/media/scnSOL_blackCircle.14ca2915.png",
      totalStaked: soceanTotalStakedValue > 0 ? `${formatThousands(soceanTotalStakedValue)} SOL` : "--",
      apy: soceanApyValue > 0 ? `${cutNumber(soceanApyValue, 2)}%` : "--"
    },
    {
      name: "Marinade",
      token: "mSOL",
      href: "https://marinade.finance/app/staking",
      img: "https://s2.coinmarketcap.com/static/img/coins/64x64/11461.png",
      totalStaked: marinadeTotalStakedValue > 0 ? `${formatThousands(marinadeTotalStakedValue)} SOL` : "--",
      apy: marinadeApyValue > 0 ? `${cutNumber(marinadeApyValue, 2)}%` : "--"
    },
    {
      name: "Lido",
      token: "stSOL",
      href: "https://solana.lido.fi/",
      img: "https://www.orca.so/static/media/stSOL.9fd59818.png",
      totalStaked: lidoTotalStakedValue > 0 ? `${formatThousands(lidoTotalStakedValue)} SOL` : "--",
      apy: lidoAprValue > 0 ? `${cutNumber(lidoAprValue, 2)}%` : "--"
    }
  ], [
    lidoAprValue,
    soceanApyValue,
    marinadeApyValue,
    lidoTotalStakedValue,
    soceanTotalStakedValue,
    marinadeTotalStakedValue
  ]);

  const refreshStakePoolInfo = useCallback((price: number) => {

    if (stakeClient && price) {
      setTimeout(() => {
        setRefreshingStakePoolInfo(true);
      });
      consoleOut('calling getStakePoolInfo...', '', 'blue');
      stakeClient.getStakePoolInfo(price)
      .then((value) => {
        consoleOut('stakePoolInfo:', value, 'crimson');
        setStakePoolInfo(value);
      })
      .catch((error) => {
        console.error('getStakePoolInfo error:', error);
      })
      .finally(() => setRefreshingStakePoolInfo(false));
    }

  }, [stakeClient]);

  // If any Stake/Unstake Tx finished and confirmed refresh the StakePoolInfo
  const onStakeTxConfirmed = useCallback((value: any) => {
    consoleOut("onStakeTxConfirmed event executed:", value, 'crimson');
    if (stakeClient && meanPrice) {
      consoleOut('calling getStakePoolInfo...', '', 'orange');
      refreshStakePoolInfo(meanPrice);
      consoleOut('After calling refreshStakePoolInfo()', '', 'orange');
    }
  }, [meanPrice, refreshStakePoolInfo, stakeClient]);

  // Get raydium pool info
  const getRaydiumPoolInfo = useCallback(async () => {

    try {
      const res = await fetch('https://api.raydium.io/v2/main/pairs');
      const data = await res.json();
      if (!data || data.msg) {
        setRaydiumInfo([]);
        setMaxRadiumAprValue(0);
      } else {
        const raydiumData = data.filter((item: any) => item.name.substr(0, 4) === "MEAN");

        let maxRadiumApr = raydiumData.map((item_1: any) => {
          let properties = item_1.apr7d;

          return properties;
        });

        setMaxRadiumAprValue(Math.max(...maxRadiumApr));
        setRaydiumInfo(raydiumData);
      }
    } catch (error) {
      console.error('getRaydiumPoolInfo error:', error);
    }

  }, []);

  // Get Orca pool info
  const getOrcaPoolInfo = useCallback(async () => {

    try {
      const res = await fetch('https://api.orca.so/pools');
      const data = await res.json();
      // Should update if got data
      if (data) {
        if (!Array.isArray(data)) {
          // Treat data as a single element
          const orcaData = [data];

          let maxOrcaApr = orcaData.map((item: any) => {
            let properties = item.apy_7d;
            return properties;
          });
          const maxApr = Math.max(...maxOrcaApr) * 100;

          setOrcaInfo(orcaData);
          setMaxOrcaAprValue(maxApr);

        } else {
          // Treat data as an array and update if pair data found
          const orcaData_1 = data.filter((item_1: any) => item_1.name2 === "MEAN/USDC");
          if (orcaData_1 && orcaData_1.length > 0) {
            setOrcaInfo(orcaData_1);
            let maxOrcaApr_1 = orcaData_1.map((item_2: any) => {
              let properties_1 = item_2.apy_7d;
              return properties_1;
            });
            const maxApr_1 = Math.max(...maxOrcaApr_1) * 100;
            setMaxOrcaAprValue(maxApr_1);
          }
        }
      }
    } catch (error) {
      console.error('getOrcaPoolInfo error:', error);
    }

  }, []);

  // Get Marinade apy info
  const getMarinadeApyInfo = useCallback(async () => {

    try {
      const res = await fetch('https://api.marinade.finance/msol/apy/1y');
      const data = await res.json();
      // Should update if got data
      if (data) {
          const marinadeApy = data.value * 100;
          setMarinadeApyValue(marinadeApy);
      }
    } catch (error) {
      console.error('getMarinadeApyInfo error:', error);
    }

  }, []);

  // Get Marinade Total Staked info
  const getMarinadeTotalStakedInfo = useCallback(async () => {

    try {
      const res = await fetch('https://api.marinade.finance/tlv');
      const data = await res.json();
      // Should update if got data
      if (data) {
          const marinadeTotalStaked = data.staked_sol;

          setMarinadeTotalStakedValue(marinadeTotalStaked);
      }
    } catch (error) {
      console.error('getMarinadeTotalStakedInfo error:', error);
    }

  }, []);

  // Get Socean apy info
  const getSoceanApyInfo = useCallback(async () => {

    try {
      const res = await fetch('https://www.socean.fi/api/apy');
      const data = await res.json();
      // Should update if got data
      if (data) {
          const soceanApy = data;

          setSoceanApyValue(soceanApy);
      }
    } catch (error) {
      console.error('getSoceanApyInfo error:', error);
    }

  }, []);

  // Get Socean Total Staked info
  const getSoceanTotalStakedInfo = useCallback(async () => {

    try {
      const res = await fetch('https://api.socean.fi/v2/stake/tvl_sol');
      const data = await res.json();
      // Should update if got data
      if (data) {
          const soceanTotalStaked = data;

          setSoceanTotalStakedValue(soceanTotalStaked);
      }
    } catch (error) {
      console.error('getSoceanTotalStakedInfo error:', error);
    }

  }, []);

  // Get Lido APR and Total Staked info
  const getLidoInfo = useCallback(async () => {

    try {
      const res = await fetch('https://solana.lido.fi/api/stats');
      const data = await res.json();
      // Should update if got data
      if (data) {
          const lidoInfo = data;

          const lidoApr = lidoInfo.apr;
          const lidoTotalStaked = lidoInfo.totalStaked.sol;          
          
          setLidoAprValue(lidoApr);
          setLidoTotalStakedValue(lidoTotalStaked);
      }
    } catch (error) {
      console.error('getLidoInfo error:', error);
    }

  }, []);

  // Log all pool info in one place
  const logAllPoolInfo = useCallback(() => {

    consoleOut('maxOrcaAprValue:', maxOrcaAprValue, 'info');
    consoleOut('orcaInfo:', orcaInfo, 'info');

    consoleOut('maxRadiumAprValue:', maxRadiumAprValue, 'info');
    consoleOut('raydiumInfo:', raydiumInfo, 'info');

    consoleOut('marinadeApyValue:', marinadeApyValue, 'info');
    consoleOut('marinadeTotalStakedValue:', marinadeTotalStakedValue, 'info');

    consoleOut('soceanApyValue:', soceanApyValue, 'info');
    consoleOut('soceanTotalStakedValue:', soceanTotalStakedValue, 'info');

  }, [marinadeApyValue, marinadeTotalStakedValue, maxOrcaAprValue, maxRadiumAprValue, orcaInfo, raydiumInfo, soceanApyValue, soceanTotalStakedValue]);


  /////////////////
  //   Effects   //
  /////////////////

  // Get token addresses from staking client and save tokens
  useEffect(() => {
    if (!stakeClient) { return; }

    if (!pageInitialized) {
      const meanAddress = stakeClient.getMintAddresses();

      setMeanAddresses(meanAddress);

      const tokenList = MEAN_TOKEN_LIST.filter(t => t.chainId === getNetworkIdByCluster(connectionConfig.cluster))
      const unstakedToken = tokenList.find(t => t.address === meanAddress.mean.toBase58());
      const stakedToken = tokenList.find(t => t.address === meanAddress.sMean.toBase58());

      consoleOut('unstakedToken', unstakedToken, 'blue');
      consoleOut('stakedToken', stakedToken, 'blue');

      setStakingPair({
        unstakedToken,
        stakedToken
      });

    }
  }, [
    stakeClient,
    pageInitialized,
    connectionConfig.cluster
  ]);

  // Keep account balance updated
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balances
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
  ]);

  // Keep MEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      setMeanBalance(0);
      return;
    }

    if (stakingPair && stakingPair.unstakedToken) {
      refreshMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    stakingPair,
    refreshMeanBalance,
  ]);

  // Keep sMEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    if (stakingPair && stakingPair.stakedToken) {
      refreshStakedMeanBalance();
    }

  }, [
    accounts,
    publicKey,
    stakingPair,
    refreshStakedMeanBalance,
  ]);

  // Keep SOCN/USDC balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      setMeanBalance(0);
      return;
    }

    refresSocnUsdcBalance();

  }, [
    accounts,
    publicKey,
    refresSocnUsdcBalance,
  ]);

  // Refresh pools info
  useEffect(() => {
    if (!connection || !shouldRefreshLpData) { return; }

    setTimeout(() => {
      setShouldRefreshLpData(false);
      setRefreshingPoolInfo(true);
    });

    consoleOut('Updating pools info...', '', 'blue');
    (async () => {
      await Promise.all([
        getRaydiumPoolInfo(),
        getOrcaPoolInfo(),
        getMarinadeApyInfo(),
        getMarinadeTotalStakedInfo(),
        getSoceanApyInfo(),
        getSoceanTotalStakedInfo(),
        getLidoInfo()
      ])
      .then(() => {
        setRefreshingPoolInfo(false);
        setTimeout(() => {
          logAllPoolInfo();
        }, 100);
      });
    })();

  }, [
    connection,
    shouldRefreshLpData,
    getMarinadeTotalStakedInfo,
    getSoceanTotalStakedInfo,
    getRaydiumPoolInfo,
    getMarinadeApyInfo,
    getSoceanApyInfo,
    getOrcaPoolInfo,
    getLidoInfo,
    logAllPoolInfo
  ]);

  // Timeout to refresh Pools info
  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldRefreshLpData(true);
    }, 30000);

    return () => {
      clearTimeout(timer);
    }

  });

  // Keep the list of stake sol platforms sorted in descending order by apy
  useEffect(() => {
    stakingSOLData.sort((a, b) => (a.apy < b.apy) ? 1 : -1);
  }, [stakingSOLData])

  // Get staking pool info from staking client
  useEffect(() => {

    if (!stakeClient) { return; }

    if (shouldRefreshStakePoolInfo && meanPrice) {
      setTimeout(() => {
        setShouldRefreshStakePoolInfo(false);
      });
      refreshStakePoolInfo(meanPrice);
    }

  }, [stakeClient, refreshStakePoolInfo, meanPrice, shouldRefreshStakePoolInfo]);

  useEffect(() => {
    const maxApr = Math.max(maxOrcaAprValue, maxRadiumAprValue);
    consoleOut('maxAprValue:', maxApr, 'blue');
    setMaxAprValue(maxApr);
  }, [
    maxOrcaAprValue,
    maxRadiumAprValue
  ]);

  useEffect(() => {
    const maxStakeSolApy = Math.max(soceanApyValue, marinadeApyValue);
    consoleOut('maxAprValue:', maxStakeSolApy, 'blue');
    setMaxStakeSolApyValue(maxStakeSolApy);
  }, [
    marinadeApyValue,
    soceanApyValue
  ]);

  const [selectedInvest, setSelectedInvest] = useState<any>(investItems[0]);

  const onTabChange = useCallback((option: SwapOption) => {
    setCurrentTab(option);
    setFromCoinAmount('');
    setIsVerifiedRecipient(false);

  }, [
    setFromCoinAmount,
    setIsVerifiedRecipient,
  ]);

  const handleBondsAmountChange = (e: any) => {

    let newValue = e.target.value;

    const decimals = socnUsdToken.decimals;
    const splitted = newValue.toString().split('.');
    const left = splitted[0];

    if (decimals && splitted[1]) {
      if (splitted[1].length > decimals) {
        splitted[1] = splitted[1].slice(0, -1);
        newValue = splitted.join('.');
      }
    } else if (left.length > 1) {
      const number = splitted[0] - 0;
      splitted[0] = `${number}`;
      newValue = splitted.join('.');
    }

    if (newValue === null || newValue === undefined || newValue === "") {
      setBondsAmount("");
    } else if (newValue === '.') {
      setBondsAmount(".");
    } else if (isValidNumber(newValue)) {
      setBondsAmount(newValue);
      // setFetchingStakeQuote(true);
      // Debouncing
      // fetchQuoteFromInput(newValue);
    }
  };

  // Keep staking rewards updated
  useEffect(() => {
    setStakingRewards(parseFloat(stakedAmount) * annualPercentageYield / 100);
  }, [stakedAmount]);

  useEffect(() => {

    const interval = setInterval(() => {
      const now = Date.now();
      setLastTimestamp(now);
      setShouldRefreshStakePoolInfo(true);
      consoleOut('Autorefresh stake pool info after:', `${(now - lastTimestamp) / 1000}s`);
    }, ONE_MINUTE_REFRESH_TIMEOUT);

    return () => {
      clearInterval(interval);
    };
  }, [lastTimestamp]);

  // Detect when entering small screen mode
  useEffect(() => {
    if (isSmallUpScreen && width < 576) {
      setIsSmallUpScreen(false);
    }
  }, [
    width,
    isSmallUpScreen,
    detailsPanelOpen,
  ]);

  // Setup event listeners
  useEffect(() => {
    if (pageInitialized && canSubscribe) {
      setCanSubscribe(false);
      confirmationEvents.on(EventType.TxConfirmSuccess, onStakeTxConfirmed);
      consoleOut('Subscribed to event txConfirmed with:', 'onStakeTxConfirmed', 'blue');
    }
  }, [
    canSubscribe,
    pageInitialized,
    onStakeTxConfirmed
  ]);

  // Set when a page is initialized
  useEffect(() => {
    if (!pageInitialized && stakeClient) {
      setPageInitialized(true);
    }
  }, [
    stakeClient,
    pageInitialized,
  ]);

  const renderMeanBonds = (
    <>
      <h2>Get discounted sMEAN</h2>
      <p>By acquiring MEAN-USDC LP into the Mean DAO Treasury, we guarantee we eat our own dog food by securing MEAN token liquidity for market makers, traders, buyers and sellers forever regardless being in a bull or bear market. This, in turn, increases market confidence in the long term health of Mean DAO and our governance token.</p>
      <p>Acquiring MEAN LP tokens also helps us diversify our Treasury, and offer community members with a long term view on Mean DAO an opportunity to extend their support while benefiting from a discount. It's a win-win-win for the DAO, our community, and the market.</p>

      <h3 className="mb-2">This is how you can get discounted Staked MEAN:</h3>
      <Steps direction="vertical" current={1}>
        <Step title="Step 1" disabled={false} status="process" active={true} description={
          <>
            <div>Provide liquidity in the MEAN/USDC Raydium Pool.</div>
            <p>Go to <a className="simplelink fg-orange-red underline-on-hover" href="https://raydium.io/liquidity/add/?coin0=MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD&coin1=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&fixed=coin0&ammId=5jcGFqXyB3xUrdS7LGmJ3R5a4pYaPPFs3mjFnqgwgo4x" target="_blank" rel="noopener noreferrer">Raydium liquidity Pool</a></p>
          </>
        } />
        <Step title="Step 2" disabled={false} status="process" active={true} description={
          <>
            <div>Bond your newly acquired LP tokens for discounted MEAN.</div>
            <p>Go to <a className="simplelink fg-orange-red underline-on-hover" href="https://www.socean.fi/app/streams" target="_blank" rel="noopener noreferrer">Socean Streams</a></p>
          </>
        } />
      </Steps>

      {/* <Divider /> */}

      {/* <div className="invest-fields-container pt-2">
        <div className="mb-3 px-4">
          <Row justify="center">
            <Col span={10}>
              <div className="info-label icon-label justify-content-center align-items-center">
                <span>Current price</span>
              </div>
              <div className="transaction-detail-row">
                {refreshingPoolInfo ? (
                  <IconLoading className="mean-svg-icons"/>
                ) : (
                  <span>{toUsCurrency(meanPrice)}</span>
                )}
                <span className="ml-1 font-size-60">
                  <span className="badge rounded fg-white bg-green px-2 font-size-70">25.6% ROI</span>
                </span>
              </div>
            </Col>
            <Col span={10}>
              <div className="info-label icon-label justify-content-center align-items-center">
                {t("invest.panel-right.stats.total-value-locked")}
              </div>
              <div className="transaction-detail-row">
                {refreshingPoolInfo ? (
                  <IconLoading className="mean-svg-icons"/>
                ) : (
                  <span>{toUsCurrency(soceanTotalStakedValue)}</span>
                )}
              </div>
            </Col>
          </Row>
        </div>
      </div>

      <div className="flex flex-center">
        {meanAddresses && (
          <div className="place-transaction-box mb-3">

            <div className="flex-fixed-right mb-2 p-1">
              <div className="left">
                <span className="font-medium font-size-110">Buy b14sMEAN</span>
              </div>
              <div className="right">
                <span className="font-bold font-size-110">{toUsCurrency(meanPrice)}</span>
              </div>
            </div>

            <div className="form-label">You buy</div>
            <div className="well mb-1">
              <div className="flex-fixed-left">
                <div className="left">
                  <span className="add-on">
                    <TokenDisplay onClick={() => {}}
                      mintAddress={socnUsdToken.address}
                      name={socnUsdToken.name}
                      symbol={socnUsdToken.symbol}
                      className="click-disabled"
                      icon={<img alt={`${socnUsdToken.name}`} width={20} height={20} src={socnUsdToken.logoURI} />}
                      showCaretDown={false}
                    />
                    {socnUsdTokenPrice ? (
                      <div className="token-max simplelink" onClick={() => {
                        const newAmount = socnUsdTokenPrice.toFixed(socnUsdToken.decimals);
                        setBondsAmount(newAmount);
                        // Debouncing
                        // fetchQuoteFromInput(newAmount);
                      }}>
                        MAX
                      </div>
                    ) : null}

                  </span>
                </div>
                <div className="right">
                  <input
                    className="general-text-input text-right"
                    inputMode="decimal"
                    autoComplete="off"
                    autoCorrect="off"
                    type="text"
                    onChange={handleBondsAmountChange}
                    pattern="^[0-9]*[.,]?[0-9]*$"
                    placeholder="0.0"
                    minLength={1}
                    maxLength={79}
                    spellCheck="false"
                    value={bondsAmount}
                  />
                </div>
              </div>
              <div className="flex-fixed-right">
                <div className="left inner-label">
                  <span>{t('transactions.send-amount.label-right')}:</span>
                  <span>
                    {`${socnUsdBalance
                        ? getAmountWithSymbol(socnUsdBalance, socnUsdToken.address, true)
                        : "0"
                    }`}
                  </span>
                </div>
                <div className="right inner-label">
                  <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
                    ~{bondsAmount
                      ? toUsCurrency(parseFloat(bondsAmount) * socnUsdTokenPrice)
                      : "$0.00"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}
      </div> */}

    </>
  );

  const renderInvestOptions = (
    <>
      {investItems && investItems.length ? (
        investItems.map((item, index) => {
          const onInvestClick = () => {
            setDtailsPanelOpen(true);
            setSelectedInvest(item);
          };

          return(
            <div key={index} onClick={onInvestClick} className={`transaction-list-row ${selectedInvest.id === item.id ? "selected" : ''}`}>
              <div className="icon-cell">
                <div className="contain-icons">
                  <div className="token-icon">
                    <img alt={item.name} width="30" height="30" src={item.symbol1} />
                  </div>
                  {item.symbol2 !== "" && (
                    <div className="token-icon">
                      <img alt={item.name} width="30" height="30" src={item.symbol2} />
                    </div>
                  )}
                </div>
              </div>
              <div className="description-cell pr-4">
                <div className="title">{item.title}</div>
              </div>
              <div className="rate-cell w-50">
                <div className="rate-amount" style={{minWidth: "fit-content !important"}}>
                  {
                    item.name === 'Discounted sMEAN'
                      ? '-'
                      :item.name === 'Stake' && (refreshingStakePoolInfo || item.rateAmount === '0%')
                        ? <IconLoading className="mean-svg-icons"/>
                        : item.rateAmount
                  }
                </div>
                {item.name !== 'Discounted sMEAN' && (
                  <div className="interval">{item.interval}</div>
                )}
              </div>
            </div>
          )
        })
      ) : (
        <div className="h-100 flex-center">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<p>{!connected
          ? t('invest.panel-left.no-invest-options')
          : t('invest.panel-left.not-connected')}</p>} />
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>{t('invest.title')}</div>
            </div>
            <div className="subtitle text-center">
              {t('invest.subtitle')}
            </div>
          </div>
          <div className={`meanfi-two-panel-layout invest-layout ${detailsPanelOpen ? 'details-open' : ''}`}>
            <div className="meanfi-two-panel-left">
              <div className="meanfi-panel-heading">
                <span className="title">{t('invest.screen-title')}</span>
                <Tooltip placement="bottom" title={t('invest.refresh-tooltip')}>
                  <div className="transaction-stats">
                    <Spin size="small" />
                    <span className="incoming-transactions-amout">({formatThousands(investItems.length)})</span>
                    <span className="transaction-legend">
                      <span className="icon-button-container">
                        <Button
                          type="default"
                          shape="circle"
                          size="small"
                          icon={<ReloadOutlined />}
                          onClick={() => {
                            refreshStakePoolInfo(meanPrice);
                          }}
                        />
                      </span>
                    </span>
                  </div>
                </Tooltip>
              </div>
              <div className="inner-container">
                <div className="item-block vertical-scroll">
                  {renderInvestOptions}
                </div>
              </div>
            </div>

            <div className="meanfi-two-panel-right">
              <div className="inner-container">
                {selectedInvest.id === 0 && (
                  <>
                    {/* Staking paragraphs */}
                    <h2>{t("invest.panel-right.title")}</h2>
                    <p>{t("invest.panel-right.first-text")}</p>
                    <p className="pb-1">{t("invest.panel-right.second-text")}</p>
                    {/* <div className="pinned-token-separator"></div> */}
                    <Divider />

                    {/* Staking Stats */}
                    <div className="invest-fields-container pt-2">
                      <div className="mb-3">
                        <Row>
                          <Col span={8}>
                            <div className="info-label icon-label justify-content-center align-items-center">
                              <span>{t("invest.panel-right.stats.staking-apy")}</span>
                              <InfoIcon content={t("invest.panel-right.stats.staking-apy-tooltip")} placement="top">
                                <IconHelpCircle className="mean-svg-icons" />
                              </InfoIcon>
                            </div>
                            <div className="transaction-detail-row">
                              {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.apr === 0) ? (
                                <IconLoading className="mean-svg-icons"/>
                              ) : (
                                <span>{(stakePoolInfo.apr * 100).toFixed(2)}%</span>
                              )}
                            </div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label icon-label justify-content-center align-items-center">
                              {t("invest.panel-right.stats.total-value-locked")}
                            </div>
                            <div className="transaction-detail-row">
                              {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.tvl === 0) ? (
                                <IconLoading className="mean-svg-icons"/>
                              ) : (
                                <span>${formatThousands(stakePoolInfo.tvl, 2)}</span>
                              )}
                            </div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label icon-label justify-content-center align-items-center">
                              {t("invest.panel-right.stats.total-mean-rewards")}
                            </div>
                            <div className="transaction-detail-row">
                              {refreshingStakePoolInfo || (!stakePoolInfo || stakePoolInfo.totalMeanAmount.uiAmount === 0) ? (
                                <IconLoading className="mean-svg-icons"/>
                              ) : (
                                <span>{formatThousands(stakePoolInfo.totalMeanAmount.uiAmount || 0, 0)}</span>
                              )}
                            </div>
                          </Col>
                        </Row>
                      </div>
                    </div>

                    <div className="flex flex-center">
                      {meanAddresses && (
                        <div className="place-transaction-box mb-3">
                          <div className="button-tabset-container">
                            <div className={`tab-button ${currentTab === "stake" ? 'active' : ''}`} onClick={() => onTabChange("stake")}>
                              {t('invest.panel-right.tabset.stake.name')}
                            </div>
                            <div className={`tab-button ${currentTab === "unstake" ? 'active' : ''}`} onClick={() => onTabChange("unstake")}>
                              {t('invest.panel-right.tabset.unstake.name')}
                            </div>
                          </div>

                          {/* Tab Stake */}
                          {currentTab === "stake" && (
                            <StakeTabView
                              stakeClient={stakeClient}
                              selectedToken={stakingPair?.unstakedToken}
                              meanBalance={meanBalance}
                              smeanBalance={sMeanBalance}
                            />
                          )}

                          {/* Tab unstake */}
                          {currentTab === "unstake" && (
                            <UnstakeTabView
                              stakeClient={stakeClient}
                              selectedToken={stakingPair?.stakedToken}
                              unstakedToken={stakingPair?.unstakedToken}
                              tokenBalance={sMeanBalance}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* <Row gutter={[8, 8]} className="d-flex justify-content-center">
                      <Col xs={24} sm={12} md={24} lg={12} className="column-width">
                      </Col>
                      <Col xs={24} sm={12} md={24} lg={12} className="column-width">
                        <div className="staking-data">
                          <h3>{t("invest.panel-right.staking-data.title")}</h3>
                          {stakingData.map((data, index) => (
                            <Row key={`${index}`}>
                              <Col span={12}>
                                <span>{data.label}</span>
                              </Col>
                              <Col span={12}>
                                <span className="staking-number">{data.value}</span>
                              </Col>
                            </Row>
                          ))}
                          <Row>
                            <span className="mt-1"><i>{t("invest.panel-right.staking-data.text-two")}</i></span>
                          </Row>
                        </div>
                      </Col>
                    </Row> */}
                  </>
                )}

                {/* Mean Liquidity Pools & Farms */}
                {selectedInvest.id === 1 && (
                  <>
                    <h2>{t("invest.panel-right.liquidity-pool.title")}</h2>

                    <p>{t("invest.panel-right.liquidity-pool.text-one")}</p>

                    <p>{t("invest.panel-right.liquidity-pool.text-two")} <a href="https://raydium.gitbook.io/raydium/exchange-trade-and-swap/liquidity-pools" target="_blank" rel="noreferrer" className="fg-orange-red">Raydium</a> {t("invest.panel-right.liquidity-pool.text-two-divider")} <a href="https://docs.orca.so/how-to-provide-liquidity-on-orca" target="_blank" rel="noreferrer" className="fg-orange-red">Orca</a></p>

                    <p>{t("invest.panel-right.liquidity-pool.text-three")}</p>

                    <div className="float-top-right">
                      <span className="icon-button-container secondary-button">
                        <Tooltip placement="bottom" title={t("invest.panel-right.liquidity-pool.refresh-tooltip")}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<ReloadOutlined className="mean-svg-icons" />}
                            onClick={() => setShouldRefreshLpData(true)}
                          />
                        </Tooltip>
                      </span>
                    </div>

                    <div className="stats-row">
                      <div className="item-list-header compact"><div className="header-row">
                        <div className="std-table-cell responsive-cell text-left
                        ">{t("invest.panel-right.table-data.column-platform")}</div>
                        <div className="std-table-cell responsive-cell pr-1 text-left">{t("invest.panel-right.table-data.column-lppair")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.table-data.column-liquidity")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.table-data.column-volume")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.table-data.column-apr/apy")}</div>
                        <div className="std-table-cell responsive-cell pl-1 text-center invest-col">{t("invest.panel-right.table-data.column-invest")}</div>
                        </div>
                      </div>

                      <div className="transaction-list-data-wrapper vertical-scroll">
                        <Spin spinning={refreshingPoolInfo}>
                          <div className="activity-list h-100">
                            <div className="item-list-body compact">
                              {raydiumInfo.map((raydium: any) => (
                                <a key={raydium.ammId} className="item-list-row" target="_blank" rel="noopener noreferrer" 
                                href={`https://raydium.io/liquidity/add/?coin0=MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD&coin1=${raydium.name.slice(5) === "SOL" ? "sol&fixed" : raydium.name.slice(5) === "RAY" ? "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R&fixed" : "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&fixed"}=coin0&ammId=${raydium.ammId}`}>
                                <div className="std-table-cell responsive-cell pl-0">
                                  <div className="icon-cell pr-1 d-inline-block">
                                    <div className="token-icon">
                                      <img alt="Raydium" width="20" height="20" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png" />
                                    </div>
                                  </div>
                                  <span>Raydium</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1">
                                  <span>{raydium.name.replace(/-/g, "/")}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{raydium.liquidity > 0 ? `$${formatThousands(raydium.liquidity)}` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{raydium.volume24h > 0 ? `$${formatThousands(raydium.volume24h)}` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{raydium.apr7d > 0 ? `${raydium.apr7d.toFixed(2)}%` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                  <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                    <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                  </span>
                                </div>
                                </a>
                              ))}
                              {orcaInfo.map((orca: any) => (
                                <a key={orca.name2} className="item-list-row" target="_blank" rel="noopener noreferrer" href="https://www.orca.so/pools">
                                <div className="std-table-cell responsive-cell pl-0">
                                  <div className="icon-cell pr-1 d-inline-block">
                                    <div className="token-icon">
                                      <img alt="Orca" width="20" height="20" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png" />
                                    </div>
                                  </div>
                                  <span>Orca</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1">
                                  <span>{orca.name2}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{orca.liquidity > 0 ? `$${formatThousands(orca.liquidity)}` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{orca.volume_24h > 0 ? `$${formatThousands(orca.volume_24h)}` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pr-1 text-right">
                                  <span>{orca.apy_7d > 0 ? `${(orca.apy_7d * 100).toFixed(2)}% APY` : "--"}</span>
                                </div>
                                <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                  <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                    <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                  </span>
                                </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        </Spin>
                      </div>
                    </div>
                  </>
                )}

                {/* Staking SOL */}
                {selectedInvest.id === 2 && (
                  <>
                    <h2>{t("invest.panel-right.staking-sol.title")}</h2>

                    <p>{t("invest.panel-right.staking-sol.text-one")}</p>

                    <p>{t("invest.panel-right.staking-sol.text-two")}</p>

                    <div className="float-top-right">
                      <span className="icon-button-container secondary-button">
                        <Tooltip placement="bottom" title={t("invest.panel-right.staking-sol.refresh-tooltip")}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<ReloadOutlined className="mean-svg-icons" />}
                            onClick={() => setShouldRefreshLpData(true)}
                          />
                        </Tooltip>
                      </span>
                    </div>

                    <div className="stats-row">
                      <div className="item-list-header compact"><div className="header-row">
                        <div className="std-table-cell responsive-cell text-left
                        ">{t("invest.panel-right.table-data.column-platform")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-left">{t("invest.panel-right.table-data.column-token")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-left">{t("invest.panel-right.table-data.column-total-staked")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-center">{t("invest.panel-right.table-data.column-apr/apy")}</div>
                        <div className="std-table-cell responsive-cell pl-1 text-center invest-col">{t("invest.panel-right.table-data.column-stake")}</div>
                        </div>
                      </div>

                      <div className="transaction-list-data-wrapper vertical-scroll">
                        <Spin spinning={refreshingPoolInfo}>
                          <div className="activity-list h-100">
                            <div className="item-list-body compact">
                              {stakingSOLData.map((solData: any, index) => (
                                <div key={index}>
                                  <a className="item-list-row" target="_blank" rel="noopener noreferrer" href={solData.href}>
                                    <div className="std-table-cell responsive-cell pl-0">
                                      <div className="icon-cell pr-1 d-inline-block">
                                        <div className="token-icon">
                                          <img alt={solData.name} width="20" height="20" src={solData.img} />
                                        </div>
                                      </div>
                                      <span>{solData.name}</span>
                                    </div>
                                    <div className="std-table-cell responsive-cell pr-1">
                                      <span>{solData.token}</span>
                                    </div>
                                    <div className="std-table-cell responsive-cell pr-1 text-left">
                                      <span>{solData.totalStaked}</span>
                                    </div>
                                    <div className="std-table-cell responsive-cell pr-1 text-center">
                                      <span>{solData.apy}</span>
                                    </div>
                                    <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                      <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                        <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                      </span>
                                    </div>
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        </Spin>
                      </div>
                    </div>
                  </>
                )}

                {/* MEAN Bonds */}
                {selectedInvest.id === 3 && (
                  renderMeanBonds
                )}

                {selectedInvest.id === undefined && (
                  <div className="h-100 flex-center">
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};
