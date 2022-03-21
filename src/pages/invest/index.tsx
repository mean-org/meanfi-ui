import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import './style.less';
import { ArrowDownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space, Empty, Spin } from "antd";
import moment from 'moment';
import Checkbox from "antd/lib/checkbox/Checkbox";
import Modal from "antd/lib/modal/Modal";
import { useTranslation } from 'react-i18next';
import { isDesktop } from "react-device-detect";
import { TokenDisplay } from "../../components/TokenDisplay";
import { PreFooter } from "../../components/PreFooter";
import { useConnection, useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
import { IconRefresh, IconStats } from "../../Icons";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";
import useWindowSize from '../../hooks/useWindowResize';
import { consoleOut, isLocal, isProd } from "../../utils/ui";
import { useNavigate } from "react-router-dom";
import { ConfirmOptions } from "@solana/web3.js";
import { Provider } from "@project-serum/anchor";
import { EnvMintAddresses, StakePoolInfo, StakingClient } from "@mean-dao/staking";
import { StakeTabView } from "../../views/StakeTabView";
import { UnstakeTabView } from "../../views/UnstakeTabView";
import { MEAN_TOKEN_LIST } from "../../constants/token-list";

type SwapOption = "stake" | "unstake";

export const InvestView = () => {
  const {
    selectedToken,
    stakedAmount,
    unstakedAmount,
    isWhitelisted,
    unstakeStartDate,
    detailsPanelOpen,
    stakingMultiplier,
    fromCoinAmount,
    setIsVerifiedRecipient,
    setDtailsPanelOpen,
    setFromCoinAmount,
    setSelectedToken,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const connection = useConnection();
  const { cluster, endpoint } = useConnectionConfig();
  const { connected, publicKey } = useWallet();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const [isSmallUpScreen, setIsSmallUpScreen] = useState(isDesktop);

  const [currentTab, setCurrentTab] = useState<SwapOption>("stake");
  const [stakingRewards, setStakingRewards] = useState<number>(0);
  // const [selectedInvest, setSelectedInvest] = useState<any>(undefined);
  const annualPercentageYield = 5;
  const [raydiumInfo, setRaydiumInfo] = useState<any>([]);
  const [orcaInfo, setOrcaInfo] = useState<any>([]);
  const [maxRadiumAprValue, setMaxRadiumAprValue] = useState<number>(0);
  const [meanAddresses, setMeanAddresses] = useState<EnvMintAddresses>();
  const [pageInitialized, setPageInitialized] = useState<boolean>(false);
  const [stakePoolInfo, setStakePoolInfo] = useState<StakePoolInfo>();

  // If there is no connected wallet or the connected wallet is not whitelisted
  // when the App is run NOT in local mode then redirect user to /accounts
  useEffect(() => {
    if (!isLocal() && (!publicKey || !isWhitelisted)) {
      navigate('/accounts');
    }
  }, [
    publicKey,
    isWhitelisted,
    navigate
  ]);

  const investItems = [
    {
      id: 0,
      name: "Stake",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg",
      symbol2: "",
      title: t("invest.panel-left.invest-stake-tab-title"),
      rateAmount: "52.09",
      interval: "APY"
    },
    {
      id: 1,
      name: "Liquidity",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      symbol2: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
      title: t("invest.panel-left.invest-liquidity-tab-title"),
      rateAmount: `${t("invest.panel-left.liquidity-value-label")} ${maxRadiumAprValue}`,
      interval: "APR/APY"
    }
  ];

  const stakingData = [
    {
      label: t("invest.panel-right.staking-data.label-my-staked"),
      value: stakedAmount ? cutNumber(parseFloat(stakedAmount), 6) : 0
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
  ];

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

  // Get tokens from staking client
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    if (!pageInitialized) {
      const meanAddress = stakeClient.getMintAddresses();

      setMeanAddresses(meanAddress);

      if (currentTab === "stake") {
        const token = MEAN_TOKEN_LIST.find(t => t.address === meanAddress.mean.toBase58());

        if (token) {
          consoleOut("MEAN token", token);
          setSelectedToken(token);
        } else {
          consoleOut("MEAN not available in the token list, please add");
        }

      } else {
        const token = MEAN_TOKEN_LIST.find(t => t.address === meanAddress.sMean.toBase58());

        if (token) {
          consoleOut("sMEAN token", token);
          setSelectedToken(token);
        } else {
          consoleOut("sMEAN not available in the token list, please add");
        }
      }
    }
  }, [
    stakeClient,
    pageInitialized,
    currentTab,
    fromCoinAmount,
    setSelectedToken
  ]);

  // Get staking pool info from staking client
  useEffect(() => {
    if (!stakeClient) {
      return;
    }

    stakeClient.getStakePoolInfo().then((value) => {
      setStakePoolInfo(value);
    }).catch((error) => {
      console.error(error);
    });

  }, [
    stakeClient,
    pageInitialized,
    currentTab,
    fromCoinAmount,
    setSelectedToken
  ]);

  useEffect(() => {
    if (!connection) { return; }

    (async () => {
      fetch('https://api.orca.so/pools')
        .then((res) => res.json())
        .then((data) => {
          const orcaData = data.find((item: any) => item.name2 === "MEAN/USDC");

          if (!Array.isArray(orcaData)) {
            setOrcaInfo([orcaData]);
          } else {
            setOrcaInfo(orcaData);
          }
        })
        .catch((error) => {
          consoleOut(error);
        })
    })();

    (async () => {
      // fetch('https://api.raydium.io/pairs') - old version
      fetch('https://api.raydium.io/v2/main/pairs')
        .then((res) => res.json())
        .then((data) => {
          const raydiumData = data.filter((item: any) => item.name.substr(0, 4) === "MEAN");

          let maxRadiumApr = raydiumData.map((item: any) => {
            let properties = item.apr7d;

            return properties;
          });

          setMaxRadiumAprValue(Math.max(...maxRadiumApr));

          setRaydiumInfo(raydiumData);
        })
        .catch((error) => {
          consoleOut(error);
        })
      })();

  }, [connection]);

  const [selectedInvest, setSelectedInvest] = useState<any>(investItems[0]);

  const onTabChange = useCallback((option: SwapOption) => {
    if (meanAddresses) {
      if (option === "stake") {
        const token = MEAN_TOKEN_LIST.find(t => t.address === meanAddresses.mean.toBase58());

        if (token) {
          consoleOut("MEAN token", token);
          setSelectedToken(token);
        } else {
          consoleOut("MEAN not available in the token list, please add");
        }

      } else {
        const token = MEAN_TOKEN_LIST.find(t => t.address === meanAddresses.sMean.toBase58());

        if (token) {
          consoleOut("sMEAN token", token);
          setSelectedToken(token);
        } else {
          consoleOut("sMEAN not available in the token list, please add");
        }
      }

      setCurrentTab(option);
      setFromCoinAmount('');
      setIsVerifiedRecipient(false);
    }

  }, [
    meanAddresses,
    setFromCoinAmount,
    setIsVerifiedRecipient,
    setSelectedToken
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
      setPageInitialized(true);
    }
  }, [
    pageInitialized,
    stakeClient
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
                    {/* Background animation */}
                    {/* {stakingRewards > 0 && (
                      <div className="staking-background">
                        <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
                      </div>
                    )} */}

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
                              {stakePoolInfo ? (stakePoolInfo.apy * 100).toFixed(2) : "0"}%
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
                              <StakeTabView stakeClient={stakeClient} />
                            )}

                            {/* Tab unstake */}
                            {currentTab === "unstake" && (
                              <UnstakeTabView stakeClient={stakeClient} />
                            )}
                          </div>
                        )}
                      </Col>

                      {/* Staking data */}
                      <Col xs={24} sm={12} md={24} lg={12} className="column-width">
                        <div className="staking-data">
                          <h3>{t("invest.panel-right.staking-data.title")}</h3>
                          <Row>
                            {stakingData.map((data, index) => (
                              <>
                                <Col key={index} span={12}>
                                  <span>{data.label}</span>
                                </Col>
                                <Col span={12}>
                                  <span className="staking-number">{data.value}</span>
                                </Col>
                              </>
                            ))}
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

                            {/* Withdraw funds transaction execution modal */}
                            <Modal
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
                            </Modal>
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

                    <p>{t("invest.panel-right.liquidity-pool.text-two")}</p>

                    <div className="float-top-right">
                      <span className="icon-button-container secondary-button">
                        <Tooltip placement="bottom" title={t("invest.panel-right.liquidity-pool.refresh-tooltip")}>
                          <Button
                            type="default"
                            shape="circle"
                            size="middle"
                            icon={<IconRefresh className="mean-svg-icons" />}
                            onClick={() => {}}
                          />
                        </Tooltip>
                      </span>
                    </div>

                    <div className="stats-row">
                      <div className="item-list-header compact"><div className="header-row">
                        <div className="std-table-cell responsive-cell text-left
                        ">{t("invest.panel-right.liquidity-pool.column-platform")}</div>
                        <div className="std-table-cell responsive-cell pr-1 text-left">{t("invest.panel-right.liquidity-pool.column-lppair")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.liquidity-pool.column-liquidity")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.liquidity-pool.column-volume")}</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">{t("invest.panel-right.liquidity-pool.column-apr/apy")}</div>
                        <div className="std-table-cell responsive-cell pl-1 text-center invest-col">{t("invest.panel-right.liquidity-pool.column-invest")}</div>
                        </div>
                      </div>

                      <div className="transaction-list-data-wrapper vertical-scroll">
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
                                <span>{raydium.apr7d > 0 ? `${cutNumber(raydium.apr7d, 2)}%` : "--"}</span>
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
                                    <img alt="Raydium" width="20" height="20" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png" />
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
                                <span>{orca.apy_7d > 0 ? `${cutNumber(orca.apy_7d * 100, 2)}% APY` : "--"}</span>
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
      <PreFooter />
    </>
  );
};