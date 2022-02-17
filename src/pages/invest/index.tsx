import { useState } from "react";
import './style.less';
import { ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col } from "antd";
import { PreFooter } from "../../components/PreFooter";
import { IconStats } from "../../Icons";
import { useTranslation } from 'react-i18next';
import Checkbox from "antd/lib/checkbox/Checkbox";

type SwapOption = "stake" | "unstake";

export const InvestView = () => {
  const { t } = useTranslation('common');
  const [currentTab, setCurrentTab] = useState<SwapOption>("stake");

  const onTabChange = (option: SwapOption) => {
    setCurrentTab(option);
  }

  const renderInvestOptions = (
    <div className="transaction-list-row money-streams-summary">
      <div className="icon-cell">
        <div className="token-icon">
          <img alt="MEAN" width="30" height="30" src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/MEANeD3XDdUmNMsRGjASkSWdC8prLYsoRJ61pPeHctD/logo.svg" />
        </div>
      </div>
      <div className="description-cell">
        <div className="title">Stake MEAN</div>
      </div>
      <div className="rate-cell">
        <div className="rate-amount">52.09%</div>
        <div className="interval">APR</div>
      </div>
    </div>
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
                  <div className="transaction-stats user-address">
                    <span className="incoming-transactions-amout">(7)</span>
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
                <p>MEAN staking rewards include emission incentives plus 30% of the protocol revenues (calculated weekly), and can be boosted using locking periods.</p>
                <p>Your staking rewards will be streamed over time and they can be withdrawn at any time. </p>
                <div className="pinned-token-separator"></div>
                <div className="stream-fields-container">
                  <div className="mb-3">
                    <Row>
                      <Col span={8}>
                        <div className="info-label">
                          {"Staking APR"}
                        </div>
                        <div className="transaction-detail-row">52.09%</div>
                      </Col>
                      <Col span={8}>
                        <div className="info-label">
                          {"Total Value Locked"}
                        </div>
                        <div className="transaction-detail-row">$7.64M</div>
                      </Col>
                      <Col span={8}>
                        <div className="info-label">
                          {"Next Week Payout"}
                        </div>
                        <div className="transaction-detail-row">$108,730</div>
                      </Col>
                    </Row>
                  </div>
                </div>
                <Row>
                  <Col span={12}>
                    <div className="place-transaction-box mb-3">
                      <div className="button-tabset-container">
                        <div className={`tab-button ${currentTab === "stake" ? 'active' : ''}`} onClick={() => onTabChange("stake")}>
                          {t('invest.tabset.stake')}
                        </div>
                        <div className={`tab-button ${currentTab === "unstake" ? 'active' : ''}`} onClick={() => onTabChange("unstake")}>
                          {t('invest.tabset.unstake')}
                        </div>
                      </div>
                      {/* STAKE */}
                      {
                        currentTab === "stake" && (
                          <>
                          <div className="form-label">Amount to stake</div>
                          <div className="well">
                            <div className="flex-fixed-left">
                              <div className="left">
                                <span className="add-on simplelink">
                                </span>
                              </div>
                              <div className="right">
                                <input
                                  className="general-text-input text-right"
                                  inputMode="decimal"
                                  autoComplete="off"
                                  autoCorrect="off"
                                  type="text"
                                  pattern="^[0-9]*[.,]?[0-9]*$"
                                  placeholder="0.0"
                                  minLength={1}
                                  maxLength={79}
                                  spellCheck="false"
                                />
                              </div>
                            </div>
                            <div className="flex-fixed-right">
                              <div className="left inner-label">

                              </div>
                              <div className="right inner-label">

                              </div>
                            </div>
                          </div>
                          <span className="info-label">How long do you want to stake for?</span>
                          <div className="flexible-left mb-1 mt-2">
                            <div className="left token-group">
                              <div className="token-max simplelink mb-1">7 days
                              </div> 
                              <div className="token-max simplelink mb-1">30 days</div> 
                              <div className="token-max simplelink mb-1">90 days</div> 
                              <div className="token-max simplelink mb-1">1 year</div> 
                              <div className="token-max simplelink mb-1">4 years</div> 
                            </div>
                          </div>
                          <span className="info-label">Staking period of 7 days will lock your Tokens until February 21, 2022 with estimated rewards of up to 100 MEAN</span>

                          {/* Confirm that have read the terms and conditions */}
                          <div className="mb-2 mt-2">
                            <Checkbox>{"I agree to the Terms & Conditions"}</Checkbox>
                          </div>

                            {/* Action button */}
                            <Button
                              className="main-cta"
                              block
                              type="primary"
                              shape="round"
                              size="large"
                            >
                              Stake MEAN
                            </Button>
                          </>
                        )
                      }
                      {/* UNSTAKE */}
                      {
                        currentTab === "unstake" && (
                          <div>Unstake</div>
                        )
                      }
                    </div>
                  </Col>
                  <Col span={12}>
                    
                  </Col>
                </Row>
              </div>
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};