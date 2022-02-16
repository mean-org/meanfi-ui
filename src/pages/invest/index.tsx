import { ReloadOutlined } from "@ant-design/icons";
import { Button, Tooltip, Row, Col } from "antd";
import { PreFooter } from "../../components/PreFooter";
import { IconStats } from "../../Icons";
import { useTranslation } from 'react-i18next';
import './style.less';

export const InvestView = () => {
  const { t } = useTranslation('common');

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
          <div className="meanfi-two-panel-layout">
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
              </div>
            </div>
          </div>
        </div>
      </div>
      <PreFooter />
    </>
  );
};