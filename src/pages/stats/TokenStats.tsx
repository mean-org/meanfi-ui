import "./style.less";
import { data } from "./data";
import { IconInfoCircle } from '../../Icons';
import { Button, Card, Col, Divider, Row, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { notify } from '../../utils/notifications';
import { copyText } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PriceGraph } from './PriceGraph';
import CardStats from './components/CardStats';
import { AppStateContext } from "../../contexts/appstate";
import { useContext } from "react";
import { TokenInfo } from '@solana/spl-token-registry';
import { formatThousands, getFormattedRateAmount } from "../../utils/utils";

export const TokenStats = ({ 
  meanDecimals, 
  meanMintAuth,
  meanTotalSupply,
  meanHolders,
  meanToken
}: any) => {
  return (
    <>
      <FirstCardsLayout 
        meanDecimals={meanDecimals} 
        meanMintAuth={meanMintAuth} 
        meanToken={meanToken}
      />
      <Divider />
      <SecondCardsLayout 
        meanTotalSupply={meanTotalSupply} 
        meanHolders={meanHolders}
      />
      <Divider />
      <ThirdCardsLayout />
    </>
  );
};

/*********************** FIRST TYPE OF CARDS *************************/
export const FirstCardsLayout = ({ 
  meanDecimals,
  meanMintAuth,
  meanToken
}: any) => {
  const { t } = useTranslation('common');

  const summaries = [
    {
      label: t('stats.summary.token-name'),
      value: data.token_name
    },
    {
      label: t('stats.summary.token-address'),
      value: data.token_address,
      tooltip: "stats.summary.token-address-copy"
    },
    {
      label: t('stats.summary.token-authority'),
      value: meanMintAuth,
      tooltip: "stats.summary.token-authority-copy"
    },
    {
      label: t('stats.summary.token-decimals'),
      value: meanDecimals
    }
  ];

  const {
    coinPrices,
  } = useContext(AppStateContext);

  const getPricePerToken = (token: TokenInfo): number => {
    const tokenSymbol = token.symbol.toUpperCase();
    const symbol = tokenSymbol[0] === 'W' ? tokenSymbol.slice(1) : tokenSymbol;

    return coinPrices && coinPrices[symbol]
      ? coinPrices[symbol]
      : 0;
  }
  
  // Returns an information or error notification each time the copy icon is clicked
  const onCopyText = (event: any) => { 
    if (event.currentTarget.name === "Address") {
      if (data.token_address && copyText(data.token_address)) {
        notify({
          description: t('notifications.token-address-copied-message'),
          type: "info"
        });
      } else {
        notify({
          description: t('notifications.token-address-not-copied-message'),
          type: "error"
        });
      }
    } else if (event.currentTarget.name === "Authority") {
      if (data.authority && copyText(data.authority)) {
        notify({
          description: t('notifications.token-authority-copied-message'),
          type: "info"
        });
      } else {
        notify({
          description: t('notifications.token-authority-not-copied-message'),
          type: "error"
        });
      }
    }
  };

  const renderHeadSummary = (
    <div className="ant-card-head-title">
      <span>{t("stats.summary.summary-title")}</span>
      <button type="button" className="ant-btn ant-btn-primary ant-btn-round ant-btn-sm thin-stroke">
        <Link to={"/exchange"}>
          <span>{t('stats.buy-btn')}</span>
        </Link>
      </button>
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
                    name={summary.label}
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
        coinPrices && meanToken ? (
          <span>$ {getPricePerToken(meanToken as TokenInfo)}</span>
          ) : (
          <span>0</span>
        )
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
  meanTotalSupply, 
  meanHolders 
}: any) => {
  const { t } = useTranslation('common');

  const cards = [
    {
      label: t('stats.market.market-cap-title'),
      value: `$ ${formatThousands(data.fully_dilluted_market_cap)}`,
      description: "stats.market.token-fully_dilluted_market_cap"
    },
    {
      label: t('stats.market.holders-title'),
      value: formatThousands(meanHolders),
      description: "stats.market.token-holders"
    },
    {
      label: t('stats.market.volume-title'),
      value: `$ ${formatThousands(data.total_volume)}`,
      description: "stats.market.token-total-volume"
    },
    {
      label: t('stats.market.total-supply-title'),
      value: formatThousands(meanTotalSupply),
      description: "stats.market.token-total-supply"
    },
    {
      label: t('stats.market.circulating-supply-title'),
      value: formatThousands(data.circulating_supply),
      description: "stats.market.token-circulating-suppply"
    },
    {
      label: t('stats.market.total-money-streams-title'),
      value: formatThousands(data.total_money_streams),
      description: "stats.market.token-total-money-streams"
    },
    {
      label: t('stats.market.total-value-locked-title'),
      value: `$ ${formatThousands(data.total_value_locked)}`,
      description: "stats.market.token-total-value-locked"
    },
  ];

  return (
    <Row gutter={[8, 8]}>
      {cards.map((card, index) => (
        <Col xs={24} sm={12} md={8} lg={6} key={index}>
          <Card className="ant-card card info-cards">
            <div className="ant-card-body card-body">
              <div className="card-content">
                <span className="info-label">{card.label}</span>
                <Tooltip placement="top" title={t(card.description)}>
                  <span>
                    <IconInfoCircle className="mean-svg-icons" />
                  </span>
                </Tooltip>
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
      <div className="row flex-nowrap slide">
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
                    <div className="info-liquidity mb-3">
                      <span>{t('stats.pairs.total-liquidity')}:</span>
                      <span>${getFormattedRateAmount(pair.total_liquidity)}</span>
                  </div>
                </div>
                <div className="slide-content_buttons">
                  {pair.type === "DEX" && (
                    <Button type="ghost"   shape="round" size="small" className="thin-stroke mb-1">
                      <a href={pair.buy} target="_blank" rel="noreferrer">
                        {t('stats.total-liquidity-btn')}
                      </a>
                    </Button>
                  )}
                  <Button type="primary" shape="round" size="small" className="thin-stroke">
                    <a href={pair.buy} target="_blank" rel="noreferrer">
                      {t('stats.buy-btn')}
                    </a>
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