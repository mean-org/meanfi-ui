import { useCallback, useContext, useEffect, useState } from "react";
import './style.less';
import { ArrowDownOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col, Space, Empty, Spin } from "antd";
import Checkbox from "antd/lib/checkbox/Checkbox";
import { useTranslation } from 'react-i18next';
import { IconStats } from "../../Icons";
import { TokenDisplay } from "../../components/TokenDisplay";
import { PreFooter } from "../../components/PreFooter";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { formatAmount, formatThousands, getAmountWithSymbol, isValidNumber } from "../../utils/utils";
import moment from 'moment';
import Modal from "antd/lib/modal/Modal";
import { IconHelpCircle } from "../../Icons/IconHelpCircle";

type SwapOption = "stake" | "unstake";

export const InvestView = () => {
  const {
    selectedToken,
    unstakeAmount,
    unstakeStartDate,
    setFromCoinAmount,
    setIsVerifiedRecipient
  } = useContext(AppStateContext);
  const { connected } = useWallet();
  const { t } = useTranslation('common');

  const [currentTab, setCurrentTab] = useState<SwapOption>("stake");
  const [stakingRewards, setStakingRewards] = useState<number>(0);
  const annualPercentageYield = 5;

  const investItems = [
    {
      id: "0",
      name: "MEAN",
      mintAddress: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg",
      title: `Stake MEAN`,
      rateAmount: "52.09",
      interval: "APR"
    },
    {
      id: "1",
      name: "Test",
      mintAddress: "https://www.orca.so/static/media/usdc.3b5972c1.svg",
      title: `Test`,
      rateAmount: "10",
      interval: "ROI"
    }
  ];

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
    setFromCoinAmount('');
    setIsVerifiedRecipient(false);
  }

  const [activeTab, setActiveTab] = useState(investItems[0].title);

  const onInvestClick = (e: any) => {
    if (e.target.innerHTML !== activeTab) {
      setActiveTab(e.target.innerHTML);
    }
  };

  // Withdraw funds modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(true), []);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);

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
    setStakingRewards(parseFloat(unstakeAmount) * annualPercentageYield / 100);
  }, [unstakeAmount]);  

  const renderInvestOptions = (
    <>
      {investItems && investItems.length ? (
        investItems.map((item, index) => {

          return (
            <div key={index} onClick={onInvestClick} className={`transaction-list-row ${activeTab === item.title ? "selected" : ''}`}>
              <div className="icon-cell">
                <div className="token-icon">
                  <img alt={item.name} width="30" height="30" src={item.mintAddress} />
                </div>
              </div>
              <div className="description-cell">
                <div className="title">{item.title}</div>
              </div>
              <div className="rate-cell">
                <div className="rate-amount">{item.rateAmount}%</div>
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
            <div className="subtitle">
            {t('invest.subtitle')}
            </div>
          </div>
          <div className="meanfi-two-panel-layout invest-layout">
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

                {activeTab === "Stake MEAN" && (
                  <>
                    {/* Background animation */}
                    {stakingRewards > 0 && (
                      <div className="staking-background">
                        <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
                      </div>
                    )}

                    {/* Staking paragraphs */}
                    <p>{t("invest.panel-right.first-text")}</p>
                    <p>{t("invest.panel-right.second-text")}</p>
                    <div className="pinned-token-separator"></div>

                    {/* Staking Stats */}
                    <div className="stream-fields-container">
                      <div className="mb-3">
                        <Row>
                          <Col span={8}>
                            <div className="info-label">
                              {t("invest.panel-right.stats.staking-apr")}
                            </div>
                            <div className="transaction-detail-row">52.09%</div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label">
                              {t("invest.panel-right.stats.total-value-locked")}
                            </div>
                            <div className="transaction-detail-row">$7.64M</div>
                          </Col>
                          <Col span={8}>
                            <div className="info-label">
                              {t("invest.panel-right.stats.next-week-payout")}
                            </div>
                            <div className="transaction-detail-row">$108,730</div>
                          </Col>
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
                          <Row>
                            <Col span={12}>
                              <span>{"Your Current Stake:"}</span>
                            </Col>
                            <Col span={12}>
                              <span className="staking-number">3.78x boost</span>
                            </Col>
                            <Col span={12}>
                              <span>{"My Staked MEAN"}</span>
                            </Col>
                            <Col span={12}>
                              <span className="staking-number">{unstakeAmount ? unstakeAmount : 0}</span>
                            </Col>
                            <Col span={12}>
                              <span>{"Avg. Locked Yield"}</span>
                            </Col>
                            <Col span={12}>
                              <span className="staking-number">{annualPercentageYield}%</span>
                            </Col>
                            {/* <Col span={12}>
                              <span>{"My Locked eMEAN"}</span>
                            </Col>
                            <Col span={12}>
                              <span className="staking-number">1,000</span>
                            </Col> */}
                            {/* <Col span={12}>
                              <span>{"My xMEAN Balance"}</span>
                            </Col>
                            <Col span={12}>
                              <span className="staking-number">20,805.1232</span>
                            </Col> */}
                            <span className="info-label mt-1">{t("invest.panel-right.staking-data.text-one", {unstakeStartDate: unstakeStartDate})}</span>
                            <span className="info-label">{t("invest.panel-right.staking-data.text-two")}</span>
                            <Col span={24} className="d-flex flex-column justify-content-end align-items-end mt-1">
                              <div className="transaction-detail-row">
                                <span className="info-icon">
                                  {stakingRewards > 0 && (
                                    <span role="img" aria-label="arrow-down" className="anticon anticon-arrow-down mean-svg-icons success bounce">
                                    <ArrowDownOutlined className="mean-svg-icons" />
                                    </span>
                                  )}
                                  <span className="staking-value mb-2 mt-1">{!stakingRewards ? 0 : stakingRewards} {selectedToken && selectedToken.name}</span>
                                </span>
                              </div>
                            </Col>

                            {/* Withdraw button */}
                            <Col span={24} className="d-flex flex-column justify-content-end align-items-end mt-1">
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
                            </Col>

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

                {activeTab === "Test" && (
                  <h2>Test</h2>
                )}

                {activeTab === undefined && (
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
    setUnstakeStartDate
  } = useContext(AppStateContext);
  const { connected } = useWallet();
  const { t } = useTranslation('common');
  const periods = [
    {
      value: 7,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: "1x"
    },
    {
      value: 30,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: "1.1x"
    },
    {
      value: 90,
      time: t("invest.panel-right.tabset.stake.days"),
      multiplier: "1.2x"
    },
    {
      value: 1,
      time: t("invest.panel-right.tabset.stake.year"),
      multiplier: "2.0x"
    },
    {
      value: 4,
      time: t("invest.panel-right.tabset.stake.years"),
      multiplier: "4.0x"
    },
  ];

  const [periodValue, setPeriodValue] = useState<number>(periods[0].value);
  const [periodTime, setPeriodTime] = useState<string>(periods[0].time);

  // Transaction execution modal
  const [isTransactionModalVisible, setTransactionModalVisibility] = useState(false);
  const showTransactionModal = useCallback(() => setTransactionModalVisibility(true), []);
  const closeTransactionModal = useCallback(() => setTransactionModalVisibility(false), []);

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
    setUnstakeAmount(!unstakeAmount ? fromCoinAmount : `${parseFloat(unstakeAmount) + parseFloat(fromCoinAmount)}`);
    setFromCoinAmount("");
    setIsVerifiedRecipient(false);
    closeTransactionModal();
  }

  const onTransactionStart = useCallback(async () => {
    showTransactionModal();
  }, [
    showTransactionModal
  ]);

  const onChangeValue = (value: number, time: string) => {
    setPeriodValue(value);
    setPeriodTime(time);
  }

  useEffect(() => {
    setUnstakeStartDate(moment().add(periodValue, periodValue === 1 ? "year" : periodValue === 4 ? "years" : "days").format("LL"));
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
              <div className={`token-max simplelink ${period.value === 7 ? "active" : "disabled"}`} onClick={() => onChangeValue(period.value, period.time)}>{period.value} {period.time}</div>
              <span>{period.multiplier}</span>
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
    isVerifiedRecipient,
    paymentStartDate,
    unstakeStartDate,
    unstakeAmount,
    refreshPrices,
    setFromCoinAmount,
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

  useEffect(() => {
    setFromCoinAmount(parseFloat(unstakeAmount) > 0 ? `${parseFloat(unstakeAmount)*percentageValue/100}` : '');
  }, [percentageValue]);

  useEffect(() => {
    parseFloat(unstakeAmount) > 0 && currentDate === unstakeStartDate ?
      setAvailableUnstake(parseFloat(unstakeAmount))
    :
      setAvailableUnstake(0)
  }, [currentDate, unstakeAmount, unstakeStartDate]);

  return (
    <>
      <span className="info-label">{unstakeAmount ? t("invest.panel-right.tabset.unstake.notification-label-one", {unstakeAmount: unstakeAmount, unstakeStartDate: unstakeStartDate}) : t("invest.panel-right.tabset.unstake.notification-label-one-error")}</span>
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
            <span>{availableUnstake}</span>
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
        disabled={
          !areSendAmountSettingsValid() ||
          !isVerifiedRecipient ||
          availableUnstake <= 0
        }
      >
        {availableUnstake <= 0 ? t("invest.panel-right.tabset.unstake.unstake-button-unavailable") : t("invest.panel-right.tabset.unstake.unstake-button-available")} {selectedToken && selectedToken.name}
      </Button>
    </>
  )
}