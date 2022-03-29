import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.less';
import { LoadingOutlined, ReloadOutlined, WarningFilled } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Empty, Spin } from "antd";
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, findATokenAddress, formatThousands } from "../../utils/utils";
import { IconRefresh, IconStats } from "../../Icons";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";
import useWindowSize from '../../hooks/useWindowResize';
import { consoleOut, isDev, isLocal, isProd } from "../../utils/ui";
import { useNavigate } from "react-router-dom";
import { ConfirmOptions, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Env, StakePoolInfo, StakingClient } from "@mean-dao/staking";
import { StakeTabView } from "../../views/StakeTabView";
import { UnstakeTabView } from "../../views/UnstakeTabView";
import { useAccountsContext, useNativeAccount } from "../../contexts/accounts";
import { TokenInfo } from "@solana/spl-token-registry";
import { MEAN_TOKEN_LIST } from "../../constants/token-list";

const antIcon = <LoadingOutlined style={{ fontSize: 48 }} spin />;

type SwapOption = "stake" | "unstake";

type StakingPair = {
  unstakedToken: TokenInfo | undefined;
  stakedToken: TokenInfo | undefined;
}

export const InvestView = () => {
  const {
    coinPrices,
    stakedAmount,
    isWhitelisted,
    fromCoinAmount,
    detailsPanelOpen,
    isInBetaTestingProgram,
    setIsVerifiedRecipient,
    setDtailsPanelOpen,
    setFromCoinAmount,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
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
  const [maxAprValue, setMaxAprValue] = useState<number>(0);
  const [maxStakeSolApyValue, setMaxStakeSolApyValue] = useState<number>(0);
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [stakePoolInfo, setStakePoolInfo] = useState<StakePoolInfo>();
  const [shouldRefreshLpData, setShouldRefreshLpData] = useState(true);
  const [refreshingPoolInfo, setRefreshingPoolInfo] = useState(false);

  // Tokens and balances
  const [meanAddresses, setMeanAddresses] = useState<Env>();
  const [stakingPair, setStakingPair] = useState<StakingPair | undefined>(undefined);
  const [sMeanBalance, setSmeanBalance] = useState<number>(0);
  const [meanBalance, setMeanBalance] = useState<number>(0);

  const userHasAccess = useMemo(() => {

    // return isWhitelisted || isInBetaTestingProgram
    //   ? true
    //   : false;
    return isLocal() || (isDev() && (isWhitelisted || isInBetaTestingProgram))
      ? true
      : false;

  }, [isInBetaTestingProgram, isWhitelisted]);

  // TODO: Make it NOT available in prod. Remove when releasing
  useEffect(() => {
    if (isProd()) {
      navigate('/accounts');
    }
  }, [navigate]);

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

  const getTokenAccountBalanceByAddress = useCallback(async (tokenMintAddress: PublicKey | undefined | null): Promise<number> => {
    if (!connection || !tokenMintAddress) return 0;
    try {
      const tokenAmount = (await connection.getTokenAccountBalance(tokenMintAddress)).value;
      return tokenAmount.uiAmount || 0;
    } catch (error) {
      console.error(error);
      throw(error);
    }
  }, [connection]);

  const refreshMeanBalance = useCallback(async () => {

    if (!connection || !publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
      return;
    }

    let balance = 0;

    if (!stakingPair || !stakingPair.unstakedToken) {
      setMeanBalance(balance);
      return;
    }

    const meanTokenPk = new PublicKey(stakingPair.unstakedToken.address);
    const meanTokenAddress = await findATokenAddress(publicKey, meanTokenPk);
    balance = await getTokenAccountBalanceByAddress(meanTokenAddress);
    setMeanBalance(balance);

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
    setSmeanBalance(balance);

  }, [
    accounts,
    publicKey,
    connection,
    stakingPair,
    getTokenAccountBalanceByAddress
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

  // Keep MEAN price updated
  useEffect(() => {

    if (coinPrices && stakingPair && stakingPair.unstakedToken) {
      const symbol = stakingPair.unstakedToken.symbol.toUpperCase();
      const price = coinPrices && coinPrices[symbol] ? coinPrices[symbol] : 0;
      setMeanPrice(price);
    } else {
      setMeanPrice(0);
    }

  }, [coinPrices, stakingPair]);

  // Keep MEAN balance updated
  useEffect(() => {
    if (!publicKey || !accounts || !accounts.tokenAccounts || !accounts.tokenAccounts.length) {
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

  const investItems = useMemo(() => [
    {
      id: 0,
      name: "Stake",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg",
      symbol2: "",
      title: t("invest.panel-left.invest-stake-tab-title"),
      rateAmount: `${stakePoolInfo ? (stakePoolInfo.apr * 100).toFixed(2) : "0"}`,
      interval: "APR"
    },
    {
      id: 1,
      name: "Liquidity",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      symbol2: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
      title: t("invest.panel-left.invest-liquidity-tab-title"),
      rateAmount: `${t("invest.panel-left.up-to-value-label")} ${maxAprValue ? maxAprValue.toFixed(2) : "0"}`,
      interval: "APR/APY"
    },
    {
      id: 2,
      name: "Stake Sol",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      symbol2: "",
      title: t("invest.panel-left.invest-stake-sol-tab-title"),
      rateAmount: `${t("invest.panel-left.up-to-value-label")} ${maxStakeSolApyValue ? maxStakeSolApyValue.toFixed(2) : "0"}`,
      interval: "APR/APY"
    }
  ], [
    t,
    maxAprValue,
    stakePoolInfo,
    maxStakeSolApyValue
  ]);

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

  // Get staking pool info from staking client
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    stakeClient.getStakePoolInfo(meanPrice).then((value) => {
      setStakePoolInfo(value);
    }).catch((error) => {
      console.error(error);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentTab,
    stakeClient,
    fromCoinAmount,
    pageInitialized,
  ]);

  // Get raydium pool info
  const getRaydiumPoolInfo = useCallback(async () => {

    consoleOut('fetch Raydium Pool info', 'STARTED', 'orange');
    try {
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
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Raydium Pool info', 'FINISHED', 'orange');
    }

  }, []);

  // Get Orca pool info
  const getOrcaPoolInfo = useCallback(async () => {

    consoleOut('fetch Orca Pool info', 'STARTED', 'orange');
    try {
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
            consoleOut('maxOrcaAprValue:', maxApr, 'info');
            consoleOut('orcaInfo:', orcaData, 'info');

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
              consoleOut('maxOrcaAprValue:', maxApr_1, 'info');
              consoleOut('orcaInfo:', orcaData_1, 'info');
            }
          }
        }
      } catch (error) {
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Orca Pool info', 'FINISHED', 'orange');
    }

  }, []);

  // Get Marinade apy info
  const getMarinadeApyInfo = useCallback(async () => {

    consoleOut('fetch Marinade Apy info', 'STARTED', 'orange');
    try {
      try {
        const res = await fetch('https://api.marinade.finance/msol/apy/7d');
        const data = await res.json();
        // Should update if got data
        if (data) {
            const marinadeApy = data.value * 100;

            setMarinadeApyValue(marinadeApy);
            consoleOut('marinadeApy:', marinadeApy, 'info');
        }
      } catch (error) {
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Marinade Apy info', 'FINISHED', 'orange');
    }

  }, []);

  // Get Marinade Total Staked info
  const getMarinadeTotalStakedInfo = useCallback(async () => {

    consoleOut('fetch Marinade Total Staked info', 'STARTED', 'orange');
    try {
      try {
        const res = await fetch('https://api.marinade.finance/tlv');
        const data = await res.json();
        // Should update if got data
        if (data) {
            const marinadeTotalStaked = data.staked_sol;

            setMarinadeTotalStakedValue(marinadeTotalStaked);
            consoleOut('marinadeTotalStaked:', marinadeTotalStaked, 'info');
        }
      } catch (error) {
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Marinade Total Staked info', 'FINISHED', 'orange');
    }

  }, []);

  // Get Socean apy info
  const getSoceanApyInfo = useCallback(async () => {

    consoleOut('fetch Socean Apy info', 'STARTED', 'orange');
    try {
      try {
        const res = await fetch('https://www.socean.fi/api/apy');
        const data = await res.json();
        // Should update if got data
        if (data) {
            const soceanApy = data;

            setSoceanApyValue(soceanApy);
            consoleOut('soceanApy:', soceanApy, 'info');
        }
      } catch (error) {
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Socean Apy info', 'FINISHED', 'orange');
    }

  }, []);

  // Get Socean Total Staked info
  const getSoceanTotalStakedInfo = useCallback(async () => {

    consoleOut('fetch Socean Total Staked info', 'STARTED', 'orange');
    try {
      try {
        const res = await fetch('https://www.socean.fi/api/tvl');
        const data = await res.json();
        // Should update if got data
        if (data) {
            const soceanTotalStaked = data;

            setSoceanTotalStakedValue(soceanTotalStaked);
            consoleOut('soceanTotalStaked:', soceanTotalStaked, 'info');
        }
      } catch (error) {
        consoleOut(error);
      }
    } finally {
      return consoleOut('fetch Socean Total Staked info', 'FINISHED', 'orange');
    }

  }, []);

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
        getSoceanTotalStakedInfo()
      ])
      .then(() => setRefreshingPoolInfo(false));
    })();

  }, [
    connection,
    shouldRefreshLpData,
    getRaydiumPoolInfo,
    getOrcaPoolInfo,
    getMarinadeApyInfo,
    getMarinadeTotalStakedInfo,
    getSoceanApyInfo,
    getSoceanTotalStakedInfo
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

  // Withdraw funds modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);
  const showWithdrawModal = useCallback(() => setIsWithdrawModalVisible(true), []);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisible(false), []);

  const onWithdrawModalStart = useCallback(async () => {
    showWithdrawModal();
  }, [
    showWithdrawModal
  ]);

  const onAfterWithdrawModalClosed = () => {
    setStakingRewards(0);
    closeWithdrawModal();
  }

  // Keep staking rewards updated
  useEffect(() => {
    setStakingRewards(parseFloat(stakedAmount) * annualPercentageYield / 100);
  }, [stakedAmount]);  

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

  // Set when a page is initialized
  useEffect(() => {
    if (!pageInitialized && stakeClient) {
      refreshStakedMeanBalance();
      setPageInitialized(true);
    }
  }, [
    stakeClient,
    pageInitialized,
    refreshStakedMeanBalance
  ]);

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
                <div className="rate-amount" style={{minWidth: "fit-content !important"}}>{item.rateAmount}%</div>
                <div className="interval">{item.interval}</div>
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

  if (!userHasAccess) {
    return (
      <>
        <div className="container main-container">
          <div className="interaction-area">
            <div className="title-and-subtitle w-75 h-100">
              <div className="title">
                <IconStats className="mean-svg-icons" />
                <div>{t('invest.title')}</div>
              </div>
              <div className="subtitle text-center">
                {t('invest.subtitle')}
              </div>
              <div className="w-50 h-100 p-5 text-center flex-column flex-center">
                <div className="text-center mb-2">
                  <WarningFilled style={{ fontSize: 48 }} className="icon fg-warning" />
                </div>
                <h3>The content you are accessing is not available at this time or you don't have access permission</h3>
              </div>
            </div>
          </div>
        </div>
        <PreFooter />
      </>
    );
  }

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
                          onClick={() => {}}
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
                    <div className="pinned-token-separator"></div>

                    {/* Staking Stats */}
                    <div className="invest-fields-container pt-2">
                      <div className="mb-3">
                        <Row>
                          <Col span={8}>
                            <div className="info-label icon-label justify-content-center">
                              {t("invest.panel-right.stats.staking-apy")}
                              <Tooltip placement="top" title={t("invest.panel-right.stats.staking-apy-tooltip")}>
                                <span>
                                  <IconHelpCircle className="mean-svg-icons" />
                                </span>
                              </Tooltip>
                            </div>
                            <div className="transaction-detail-row">
                              {stakePoolInfo ? (stakePoolInfo.apr * 100).toFixed(2) : "0"}%
                            </div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label">
                              {t("invest.panel-right.stats.total-value-locked")}
                            </div>
                            <div className="transaction-detail-row">
                              ${stakePoolInfo ? formatThousands(stakePoolInfo.tvl, 2) : "0"}
                            </div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label">
                              {t("invest.panel-right.stats.total-mean-rewards")}
                            </div>
                            <div className="transaction-detail-row">
                              ${stakePoolInfo ? formatThousands(stakePoolInfo.totalMeanRewards, 2) : "0"}
                            </div>
                          </Col>
                        </Row>
                      </div>
                    </div>

                    <Row gutter={[8, 8]} className="d-flex justify-content-center">
                      {/* Tabset */}
                      <Col xs={24} sm={12} md={24} lg={12} className="column-width">
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
                                tokenBalance={meanBalance}
                              />
                            )}

                            {/* Tab unstake */}
                            {currentTab === "unstake" && (
                              <UnstakeTabView
                                stakeClient={stakeClient}
                                selectedToken={stakingPair?.stakedToken}
                                tokenBalance={sMeanBalance}
                              />
                            )}
                          </div>
                        )}
                      </Col>

                      {/* Staking data */}
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
                            {/* <span className="mt-2">{t("invest.panel-right.staking-data.text-one", {unstakeStartDate: unstakeStartDate})}</span> */}
                            <span className="mt-1"><i>{t("invest.panel-right.staking-data.text-two")}</i></span>
                            {/* <Col span={24} className="d-flex flex-column justify-content-end align-items-end mt-1">
                              <div className="transaction-detail-row">
                                <span className="info-icon">
                                  {stakingRewards > 0 && (
                                    <span role="img" aria-label="arrow-down" className="anticon anticon-arrow-down mean-svg-icons success bounce">
                                    <ArrowDownOutlined className="mean-svg-icons" />
                                    </span>
                                  )}
                                  <span className="staking-value mb-2 mt-1">{!stakingRewards ? 0 : cutNumber(stakingRewards, 6)} {selectedToken && selectedToken.name}</span>
                                </span>
                              </div>
                            </Col> */}
                            {/* Withdraw button */}
                            {/* <Col span={24} className="d-flex flex-column justify-content-end align-items-end mt-1">
                              <Space size="middle">
                                <Button
                                  type="default"
                                  shape="round"
                                  size="small"
                                  className="thin-stroke"
                                  onClick={onWithdrawModalStart}
                                  disabled={!stakingRewards || stakingRewards === 0}
                                >
                                  {t("invest.panel-right.staking-data.withdraw-button")}
                                </Button>
                              </Space>
                            </Col> */}
                          </Row>
                        </div>
                      </Col>
                    </Row>
                  </>
                )}
                
                {/* Mean Liquidity Pools & Farms */}
                {selectedInvest.id === 1 && (
                  <>
                    <h2>{t("invest.panel-right.liquidity-pool.title")}</h2>

                    <p>{t("invest.panel-right.liquidity-pool.text-one")}</p>

                    <p>{t("invest.panel-right.liquidity-pool.text-two")} <a href="https://raydium.gitbook.io/raydium/exchange-trade-and-swap/liquidity-pools" target="_blank" rel="noreferrer"> Raydium </a> {t("invest.panel-right.liquidity-pool.text-two-divider")} <a href="https://docs.orca.so/how-to-provide-liquidity-on-orca" target="_blank" rel="noreferrer"> Orca </a>.</p>

                    <p>{t("invest.panel-right.liquidity-pool.text-three")}</p>

                    <div className="float-top-right">
                      <span className="icon-button-container secondary-button">
                        <Tooltip placement="bottom" title={t("invest.panel-right.liquidity-pool.refresh-tooltip")}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconRefresh className="mean-svg-icons" />}
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
                            icon={<IconRefresh className="mean-svg-icons" />}
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

                              {/* Socean */}
                              <div>
                                <a className="item-list-row" target="_blank" rel="noopener noreferrer" href="https://www.socean.fi/app/stake">
                                  <div className="std-table-cell responsive-cell pl-0">
                                    <div className="icon-cell pr-1 d-inline-block">
                                      <div className="token-icon">
                                        <img alt="Socean" width="20" height="20" src="https://www.socean.fi/static/media/scnSOL_blackCircle.14ca2915.png" />
                                      </div>
                                    </div>
                                    <span>Socean</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1">
                                    <span>scnSOL</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-left">
                                    <span>{soceanTotalStakedValue > 0 ? `${formatThousands(soceanTotalStakedValue)} SOL` : "--"}</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-center">
                                    <span>{soceanApyValue > 0 ? `${(soceanApyValue).toFixed(2)}%` : "--"}</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                    <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                      <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                    </span>
                                  </div>
                                </a>
                              </div>

                              {/* Marinade */}
                              <div>
                                <a className="item-list-row" target="_blank" rel="noopener noreferrer" href="https://marinade.finance/app/staking">
                                  <div className="std-table-cell responsive-cell pl-0">
                                    <div className="icon-cell pr-1 d-inline-block">
                                      <div className="token-icon">
                                        <img alt="Marinade" width="20" height="20" src="https://s2.coinmarketcap.com/static/img/coins/64x64/11461.png" />
                                      </div>
                                    </div>
                                    <span>Marinade</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1">
                                    <span>mSOL</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-left">
                                    <span>{marinadeTotalStakedValue > 0 ? `${formatThousands(marinadeTotalStakedValue)} SOL` : "--"}</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-center">
                                    <span>{marinadeApyValue > 0 ? `${marinadeApyValue.toFixed(2)}%` : "--"}</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                    <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                      <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                    </span>
                                  </div>
                                </a>
                              </div>

                              {/* Lido */}
                              <div>
                                <a className="item-list-row" target="_blank" rel="noopener noreferrer" href="https://solana.lido.fi/">
                                  <div className="std-table-cell responsive-cell pl-0">
                                    <div className="icon-cell pr-1 d-inline-block">
                                      <div className="token-icon">
                                        <img alt="Lido" width="20" height="20" src="https://www.orca.so/static/media/stSOL.9fd59818.png" />
                                      </div>
                                    </div>
                                    <span>Lido</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1">
                                    <span>stSOL</span>
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-left">
                                    {/* <span>{orca.volume_24h > 0 ? `$${formatThousands(orca.volume_24h)}` : "--"}</span> */}
                                  </div>
                                  <div className="std-table-cell responsive-cell pr-1 text-left">
                                    {/* <span>{orca.apy_7d > 0 ? `${(orca.apy_7d * 100).toFixed(2)}% APY` : "--"}</span> */}
                                  </div>
                                  <div className="std-table-cell responsive-cell pl-1 text-center invest-col">
                                    <span role="img" aria-label="arrow-up" className="anticon anticon-arrow-up mean-svg-icons outgoing upright">
                                      <svg viewBox="64 64 896 896" focusable="false" data-icon="arrow-up" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M868 545.5L536.1 163a31.96 31.96 0 00-48.3 0L156 545.5a7.97 7.97 0 006 13.2h81c4.6 0 9-2 12.1-5.5L474 300.9V864c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V300.9l218.9 252.3c3 3.5 7.4 5.5 12.1 5.5h81c6.8 0 10.5-8 6-13.2z"></path></svg>
                                    </span>
                                  </div>
                                </a>
                              </div>
                
                            </div>
                          </div>
                        </Spin>
                      </div>
                    </div>
                  </>
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
      {/* Withdraw funds transaction execution modal */}
      {/* <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isWithdrawModalVisible}
        onCancel={closeWithdrawModal}
        afterClose={onAfterWithdrawModalClosed}
        width={330}
        footer={null}>
        <div className="transaction-progress">
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">Withdraw Funds</h4>
          <p className="operation">{t('transactions.status.tx-withdraw-operation-success')}</p>
          <Button
            block
            type="primary"
            shape="round"
            size="middle"
            onClick={closeWithdrawModal}>
            {t('general.cta-close')}
          </Button>
        </div>
      </Modal> */}
      <PreFooter />
    </>
  );
};