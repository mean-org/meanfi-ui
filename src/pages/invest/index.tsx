import { useCallback, useContext, useEffect, useState } from "react";
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
import { useConnection } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { cutNumber, formatAmount, formatThousands, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
import { IconRefresh, IconStats } from "../../Icons";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";
import useWindowSize from '../../hooks/useWindowResize';
import { consoleOut } from "../../utils/ui";

type SwapOption = "stake" | "unstake";

export const InvestView = () => {
  const {
    selectedToken,
    unstakeAmount,
    unstakeStartDate,
    stakingMultiplier,
    detailsPanelOpen,
    userTokens,
    setSelectedToken,
    setFromCoinAmount,
    setIsVerifiedRecipient,
    setDtailsPanelOpen
  } = useContext(AppStateContext);
  const connection = useConnection();
  const { connected } = useWallet();
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

  const investItems = [
    {
      id: 0,
      name: "MEAN",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg",
      symbol2: "",
      title: "Stake MEAN",
      rateAmount: "52.09",
      interval: "APR"
    },
    {
      id: 1,
      name: "Test",
      symbol1: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png",
      symbol2: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png",
      title: "MEAN Liquidity Pools and Farms",
      rateAmount: `Up to ${maxRadiumAprValue}`,
      interval: "APR/APY 7D"
    }
  ];

  const stakingStats = [
    {
      label: t("invest.panel-right.stats.staking-apr"),
      value: "52.09%"
    },
    {
      label: t("invest.panel-right.stats.total-value-locked"),
      value: "$7.64M"
    },
    {
      label: t("invest.panel-right.stats.total-mean-rewards"),
      value: "$108,730"
    }
  ];

  const stakingData = [
    {
      label: "My Staked MEAN",
      value: unstakeAmount ? cutNumber(parseFloat(unstakeAmount), 6) : 0
    },
    // {
    //   label: "Avg. Locked Yield",
    //   value: `${annualPercentageYield}%`
    // },
    // {
    //   label: "Staking Lock Boost",
    //   value: `${stakingMultiplier}x boost`
    // },
    // {
    //   label: "My Locked eMEAN",
    //   value: "1,000"
    // },
    // {
    //   label: "My xMEAN Balance",
    //   value: "20,805.1232"
    // },
  ];

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

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
    setFromCoinAmount('');
    setIsVerifiedRecipient(false);
  }

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

  // Get MEAN token info
  useEffect(() => {
    if (!connection) { return; }

    (async () => {
      const token = userTokens.find(t => t.symbol === 'MEAN');
      if (!token) { return; }

      setSelectedToken(token);
    })();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    connection,
    userTokens
  ]);

  useEffect(() => {
    setStakingRewards(parseFloat(unstakeAmount) * annualPercentageYield / 100);
  }, [unstakeAmount]);  

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
                          {stakingStats.map((stat, index) => (
                            <Col key={index} span={8}>
                              <div className="info-label">
                                {stat.label}
                              </div>
                              <div className="transaction-detail-row">{stat.value}</div>
                            </Col>
                          ))}
                        </Row>
                      </div>
                    </div>

                    <Row gutter={[8, 8]} className="d-flex justify-content-center">
                      {/* Tabset */}
                      <Col xs={24} sm={12} md={24} lg={12} className="column-width">
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
                            <StakeTabView />
                          )}

                          {/* Tab unstake */}
                          {currentTab === "unstake" && (
                            <UnstakeTabView />
                          )}
                        </div>
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
                            <span className="mt-2">{t("invest.panel-right.staking-data.text-one", {unstakeStartDate: unstakeStartDate})}</span>

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
                        ">Platform</div>
                        <div className="std-table-cell responsive-cell pr-1 text-left">LP Pair</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">Liquidity</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">Vol (24hrs)</div>
                        <div className="std-table-cell responsive-cell pr-2 text-right">APR/APY 7D</div>
                        <div className="std-table-cell responsive-cell pl-1 text-center invest-col">Invest</div>
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

export const StakeTabView = () => {
  const {
    selectedToken,
    tokenBalance,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    isVerifiedRecipient,
    paymentStartDate,
    unstakeAmount,
    unstakeStartDate,
    refreshPrices,
    setFromCoinAmount,
    setIsVerifiedRecipient,
    setUnstakeAmount,
    setUnstakeStartDate,
    setStakingMultiplier
  } = useContext(AppStateContext);
  const { connected } = useWallet();
  const { t } = useTranslation('common');
  const periods = [
    {
      value: 7,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1
    },
    {
      value: 30,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.1
    },
    {
      value: 90,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: 1.2
    },
    {
      value: 1,
      time: t("invest.panel-right.tabset.stake.year"),
      multiplier: 2.0
    },
    {
      value: 4,
      time: t("invest.panel-right.tabset.stake.years"),
      multiplier: 4.0
    },
  ];

  const [periodValue, setPeriodValue] = useState<number>(periods[0].value);
  const [periodTime, setPeriodTime] = useState<string>(periods[0].time);

  // Transaction execution modal
  const [isTransactionModalVisible, setTransactionModalVisible] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisible(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisible(false), []);

  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  const isSendAmountValid = (): boolean => {
    return  connected &&
            selectedToken &&
            tokenBalance &&
            fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= tokenBalance
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }  

  const onIsVerifiedRecipientChange = (e: any) => {
    setIsVerifiedRecipient(e.target.checked);
  }

  const onAfterTransactionModalClosed = () => {
    const unstakeAmountAfterTransaction = !unstakeAmount ? fromCoinAmount : `${parseFloat(unstakeAmount) + parseFloat(fromCoinAmount)}`;

    setUnstakeAmount(unstakeAmountAfterTransaction);
    setFromCoinAmount("");
    setIsVerifiedRecipient(false);
    closeTransactionModal();
  }

  const onTransactionStart = useCallback(async () => {
    showTransactionModal();
  }, [
    showTransactionModal
  ]);

  const onChangeValue = (value: number, time: string, rate: number) => {
    setPeriodValue(value);
    setPeriodTime(time);
    setStakingMultiplier(rate);
  }

  useEffect(() => {
    const unstakeStartDateUpdate = moment().add(periodValue, periodValue === 1 ? "year" : periodValue === 4 ? "years" : "days").format("LL")

    setUnstakeStartDate(unstakeStartDateUpdate);
  }, [periodTime, periodValue, setUnstakeStartDate]);
  
  return (
    <>
      <div className="form-label">{t("invest.panel-right.tabset.stake.amount-label")}</div>
      <div className="well">
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on simplelink">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                />
              )}
            </span>
          </div>
          <div className="right">
            <input
              className="general-text-input text-right"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleFromCoinAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('transactions.send-amount.label-right')}:</span>
            <span>
              {`${tokenBalance && selectedToken
                  ? getAmountWithSymbol(tokenBalance, selectedToken?.address, true)
                  : "0"
              }`}
            </span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>
    
      {/* Periods */}
      <span className="info-label">{t("invest.panel-right.tabset.stake.period-label")}</span>
      <div className="flexible-left mb-1 mt-2">
        <div className="left token-group">
          {periods.map((period, index) => (
            <div key={index} className="mb-1 d-flex flex-column align-items-center">
              <div className={`token-max simplelink ${period.value === 7 ? "active" : "disabled"}`} onClick={() => onChangeValue(period.value, period.time, period.multiplier)}>{period.value} {period.time}</div>
              <span>{`${period.multiplier}x`}</span>
            </div>
          ))}
        </div>
      </div>
      <span className="info-label">{t("invest.panel-right.tabset.stake.notification-label", { periodValue: periodValue, periodTime: periodTime, unstakeStartDate: unstakeStartDate })}</span>

      {/* Confirm that have read the terms and conditions */}
      <div className="mt-2 d-flex confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.stake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.stake.terms-and-conditions-tooltip")}>
          <span>
            <IconHelpCircle className="mean-svg-icons" />
          </span>
        </Tooltip>
      </div>

      {/* Action button */}
      <Button
        className="main-cta mt-2"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={onTransactionStart}
        disabled={
          !areSendAmountSettingsValid() ||
          !isVerifiedRecipient}
      >
        {t("invest.panel-right.tabset.stake.stake-button")} {selectedToken && selectedToken.name}
      </Button>

      {/* Transaction execution modal */}
      <Modal
        className="mean-modal no-full-screen"
        maskClosable={false}
        visible={isTransactionModalVisible}
        onCancel={closeTransactionModal}
        afterClose={onAfterTransactionModalClosed}
        width={330}
        footer={null}>
        <div className="transaction-progress"> 
          <CheckOutlined style={{ fontSize: 48 }} className="icon" />
          <h4 className="font-bold mb-1 text-uppercase">
            Operation completed
          </h4>
          <p className="operation">
            {fromCoinAmount} {selectedToken && selectedToken.name} has been stake successfully
          </p>
          <Button
            block
            type="primary"
            shape="round"
            size="middle"
            onClick={closeTransactionModal}>
            {t('general.cta-close')}
          </Button>
        </div>
      </Modal>
    </>
  )
}

export const UnstakeTabView = () => {
  const {
    selectedToken,
    effectiveRate,
    loadingPrices,
    fromCoinAmount,
    // isVerifiedRecipient,
    paymentStartDate,
    unstakeStartDate,
    unstakeAmount,
    refreshPrices,
    setFromCoinAmount,
    setUnstakeAmount
    // setIsVerifiedRecipient
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const percentages = [25, 50, 75, 100];
  const [percentageValue, setPercentageValue] = useState<number>(0);
  const [availableUnstake, setAvailableUnstake] = useState<number>(0);

  const currentDate = moment().format("LL");

  const onChangeValue = (value: number) => {
    setPercentageValue(value);
  };
  
  const handleFromCoinAmountChange = (e: any) => {
    const newValue = e.target.value;
    if (newValue === null || newValue === undefined || newValue === "") {
      setFromCoinAmount("");
    } else if (newValue === '.') {
      setFromCoinAmount(".");
    } else if (isValidNumber(newValue)) {
      setFromCoinAmount(newValue);
    }
  };

  // const onIsVerifiedRecipientChange = (e: any) => {
  //   setIsVerifiedRecipient(e.target.checked);
  // }

  const isSendAmountValid = (): boolean => {
    return  fromCoinAmount &&
            parseFloat(fromCoinAmount) > 0 &&
            parseFloat(fromCoinAmount) <= parseFloat(unstakeAmount)
      ? true
      : false;
  }

  const areSendAmountSettingsValid = (): boolean => {
    return paymentStartDate && isSendAmountValid() ? true : false;
  }

  const handleUnstake = () => {
    const newUnstakeAmount = (parseFloat(unstakeAmount) - parseFloat(fromCoinAmount)).toString();

    setUnstakeAmount(newUnstakeAmount);
    setFromCoinAmount('');
  }

  useEffect(() => {
    const percentageFromCoinAmount = parseFloat(unstakeAmount) > 0 ? `${(parseFloat(unstakeAmount)*percentageValue/100)}` : '';

    setFromCoinAmount(percentageFromCoinAmount);
    // setFromCoinAmount(formatAmount(parseFloat(percentageFromCoinAmount), 6).toString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [percentageValue]);

  useEffect(() => {
    parseFloat(unstakeAmount) > 0 && currentDate === unstakeStartDate ?
      setAvailableUnstake(parseFloat(unstakeAmount))
    :
      setAvailableUnstake(0)
  }, [currentDate, unstakeAmount, unstakeStartDate]);

  return (
    <>
      <span className="info-label">{unstakeAmount ? t("invest.panel-right.tabset.unstake.notification-label-one", {unstakeAmount: cutNumber(parseFloat(unstakeAmount), 6), unstakeStartDate: unstakeStartDate}) : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span>
      <div className="form-label mt-2">{t("invest.panel-right.tabset.unstake.amount-label")}</div>
      <div className="well">
        <div className="flexible-right mb-1">
          <div className="token-group">
            {percentages.map((percentage, index) => (
              <div key={index} className="mb-1 d-flex flex-column align-items-center">
                <div className={`token-max simplelink ${availableUnstake !== 0 ? "active" : "disabled"}`} onClick={() => onChangeValue(percentage)}>{percentage}%</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-fixed-left">
          <div className="left">
            <span className="add-on simplelink">
              {selectedToken && (
                <TokenDisplay onClick={() => {}}
                  mintAddress={selectedToken.address}
                  name={selectedToken.name}
                />
              )}
            </span>
          </div>
          <div className="right">
            <input
              className="general-text-input text-right"
              inputMode="decimal"
              autoComplete="off"
              autoCorrect="off"
              type="text"
              onChange={handleFromCoinAmountChange}
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.0"
              minLength={1}
              maxLength={79}
              spellCheck="false"
              value={fromCoinAmount}
            />
          </div>
        </div>
        <div className="flex-fixed-right">
          <div className="left inner-label">
            <span>{t('invest.panel-right.tabset.unstake.send-amount.label-right')}:</span>
            <span>{formatAmount(availableUnstake, 6)}</span>
          </div>
          <div className="right inner-label">
            <span className={loadingPrices ? 'click-disabled fg-orange-red pulsate' : 'simplelink'} onClick={() => refreshPrices()}>
              ~${fromCoinAmount && effectiveRate
                ? formatAmount(parseFloat(fromCoinAmount) * effectiveRate, 2)
                : "0.00"}
            </span>
          </div>
        </div>
      </div>
      <span className="info-label">{t("invest.panel-right.tabset.unstake.notification-label-two")}</span>
      
      {/* Confirm that have read the terms and conditions */}
      {/* <div className="mt-2 confirm-terms">
        <Checkbox checked={isVerifiedRecipient} onChange={onIsVerifiedRecipientChange}>{t("invest.panel-right.tabset.unstake.verified-label")}</Checkbox>
        <Tooltip placement="top" title={t("invest.panel-right.tabset.unstake.terms-and-conditions-tooltip")}>
          <span>
            <IconHelpCircle className="mean-svg-icons" />
          </span>
        </Tooltip>
      </div> */}

      {/* Action button */}
      <Button
        className="main-cta mt-2"
        block
        type="primary"
        shape="round"
        size="large"
        onClick={handleUnstake}
        disabled={
          !areSendAmountSettingsValid() ||
          // !isVerifiedRecipient ||
          availableUnstake <= 0
        }
      >
        {availableUnstake <= 0 ? t("invest.panel-right.tabset.unstake.unstake-button-unavailable") : t("invest.panel-right.tabset.unstake.unstake-button-available")} {selectedToken && selectedToken.name}
      </Button>
    </>
  )
}