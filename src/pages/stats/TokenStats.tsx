import { useContext } from "react";
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Card, Col, Divider, Row, Tooltip } from 'antd';
import "./style.scss";
import { data } from "./data";
import { copyText } from '../../utils/ui';
import { PriceGraph } from './PriceGraph';
import CardStats from './components/CardStats';
import { formatThousands, openLinkInNewTab } from "../../utils/utils";
import { MEAN_TOKEN } from "../../constants/token-list";
import { AppStateContext } from "../../contexts/appstate";
import { openNotification } from "../../components/Notifications";
import { InfoIcon } from "../../components/InfoIcon";

export const TokenStats = ({meanStats, smeanSupply, totalVolume24h}: any) => {
  return (
    <>
      <FirstCardsLayout />
      <Divider />
      <SecondCardsLayout
        meanStats={meanStats}
        sMeanTotalSupply={smeanSupply}
        totalVolume24h={totalVolume24h}
      />
      <Divider />
      <ThirdCardsLayout />
    </>
  );
};

/*********************** FIRST TYPE OF CARDS *************************/
export const FirstCardsLayout = () => {
  const { t } = useTranslation('common');
  const summaries = [
    {
      label: t('stats.summary.token-name'),
      value: `${MEAN_TOKEN.name} (${MEAN_TOKEN.symbol})`
    },
    {
      label: t('stats.summary.token-address'),
      value: MEAN_TOKEN.address,
      tooltip: "stats.summary.token-address-copy"
    },
    {
      label: t('stats.summary.token-decimals'),
      value: MEAN_TOKEN.decimals
    },
    {
      label: t('stats.summary.token-audits'),
      value: <span>
        <a href="https://docs.meanfi.com/products/safety-and-security#audits"
            target="_blank" title="CetriK" rel="noreferrer" className="audit-links">
          <img src="https://www.certik.com/certik-logotype-h-w.svg" alt="CetriK" />
        </a>
        <a href="https://docs.meanfi.com/products/safety-and-security#audits"
            target="_blank" title="Sec3" rel="noreferrer" className="audit-links">          
          <img src="https://uploads-ssl.webflow.com/6273ba6b55681ae927cb4388/629579f67991f16aefaea6b5_logo.svg" alt="Sec3" />
        </a>
        </span>
    },
  ];

  const { getTokenPriceBySymbol } = useContext(AppStateContext);

  // Returns an information or error notification each time the copy icon is clicked
  const onCopyText = (event: any) => {
    if (event.currentTarget.name && copyText(event.currentTarget.name)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    }
  };

  const renderHeadSummary = (
    <div className="ant-card-head-title">
      <span>{t("stats.summary.summary-title")}</span>
        <Link to={"/exchange"}>
          <button
            className="stats-buy-btn">
            <span>{t('stats.buy-btn')}</span>
          </button>
        </Link>
    </div>
  );

  const renderBodySummary = (
    <>
      {summaries.map((summary, index) => (
        <div className="summary-content" key={index}>
          <span className="inner-label">{summary.label}</span>
          <div className="summary-content_text">
            <span className="ant-typography">{summary.value}</span>
            {summary.tooltip && (
              <span className="icon-button-container">
                <Tooltip placement="bottom" title={t(summary.tooltip)}>
                  <Button
                    type="default"
                    shape="circle"
                    size="middle"
                    icon={<CopyOutlined className="mean-svg-icons" />}
                    onClick={onCopyText}
                    name={summary.value}
                  />
                </Tooltip>
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  )

  const renderHeadPrice = (
    <div className="ant-card-head-title">
      <span>{t("stats.price.price-title")}</span>
      {
        <span>$ {getTokenPriceBySymbol(MEAN_TOKEN.symbol)}</span>
      }
    </div>
  );

  const renderBodyPrice = (
    <PriceGraph />
  );

  const cards = [
    {
      header: renderHeadSummary,
      body: renderBodySummary
    },
    {
      header: renderHeadPrice,
      body: renderBodyPrice
    }
  ];

  return (
    <Row gutter={[8, 8]}>
      {cards.map((card, index) => (
        <CardStats
          key={index}
          xs={24} 
          sm={24} 
          md={12} 
          lg={12}
          header={card.header}
          body={card.body}
          className="summary-card"
        />
      ))}
    </Row>
  )
}

/*********************** SECOND TYPE OF CARDS *************************/
export const SecondCardsLayout = ({ 
  meanStats,
  sMeanTotalSupply,
  totalVolume24h
}: any) => {
  const { t } = useTranslation('common');
  const cards = [
    {
      label: 'stats.market.market-cap-title',
      value: `$ ${formatThousands(meanStats.marketCapFD)}`,
      description: "stats.market.token-fully_dilluted_market_cap"
    },
    {
      label: 'stats.market.holders-title',
      value: formatThousands(meanStats.holders),
      description: "stats.market.token-holders"
    },
    {
      label: 'stats.market.volume-title',
      value: `$ ${formatThousands(totalVolume24h)}`,
      description: "stats.market.token-total-volume"
    },
    {
      label: 'stats.market.total-supply-title',
      value: formatThousands(meanStats.totalSupply),
      description: "stats.market.token-total-supply"
    },
    {
      label: 'stats.market.circulating-supply-title',
      value: formatThousands(meanStats.circulatingSupply),
      description: "stats.market.token-circulating-suppply"
    },
    {
      label: 'stats.market.total-money-streams-title',
      value: formatThousands(meanStats.tvl.totalStreams),
      description: "stats.market.token-total-money-streams"
    },
    {
      label: 'stats.market.total-value-locked-title',
      value: `$ ${formatThousands(meanStats.tvl.total)}`,
      description: "stats.market.token-total-value-locked"
    },
    {
      label: 'staking.panel-right.stats.total-mean-rewards',
      value: `${formatThousands(sMeanTotalSupply)}`,
      description: "stats.market.token-smean-supply"
    },
  ];

  return (
    <Row gutter={[8, 8]}>
      {cards.map((card, index) => (
        <Col xs={24} sm={12} md={8} lg={6} key={index}>
          <Card className="ant-card card info-cards">
            <div className="card-body">
              <div className="card-content justify-content-start">
                <span className="fg-secondary-50 align-middle">{t(card.label)}</span>
                <span className="fg-secondary-50 font-size-70 align-middle">
                  <InfoIcon content={<span>{t(card.description)}</span>} placement="top">
                    <InfoCircleOutlined />
                  </InfoIcon>
                </span>
              </div>
              <span className="card-info">{card.value}</span>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  )
}

/*********************** THIRD TYPE OF CARDS *************************/
export const ThirdCardsLayout = () => {
  const { t } = useTranslation('common');

  return (
    <Row gutter={[8, 8]} className="slider-row">
      <div className="row flex-nowrap slide horizontal-scroll">
        {data.pairs.map((pair, index) => (
          <Col xs={12} sm={8} md={6} lg={4} key={index}>
            <Card className="ant-card card slide-card">
              <div className="ant-card-body card-body slide-content">
                  <div className="slide-content_avatar">
                    <div className="avatar-coin">
                      <div className="avatar-coin__content row">
                        <img src={pair.img1} alt={`${pair.base}/${pair.target}`} />
                      </div>
                    </div>
                    <div className="avatar-coin">
                      <div className="avatar-coin__content row">
                        <img src={pair.img2} alt={`${pair.base}/${pair.target}`} />
                      </div>
                    </div>
                  </div>
                  <div className="slide-content_info">
                    <span className="info-pair">{pair.base}/{pair.target}</span>
                    <span className="info-name mb-2">{pair.name}</span>
                    {/* <div className="info-liquidity mb-3">
                      <span>{t('stats.pairs.total-liquidity')}:</span>
                      <span>${formatThousands(pair.total_liquidity)}</span>
                  </div> */}
                </div>
                <div className="slide-content_buttons">
                  <Button
                    type="default"
                    shape="round"
                    size="small"
                    onClick={() => openLinkInNewTab(pair.buy)}>
                    {pair.type === "DEX" ? t('stats.total-liquidity-btn'): t('stats.buy-btn')}
                  </Button>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </div>
    </Row>
  )
}