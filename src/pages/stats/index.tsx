import React, { useContext, useEffect, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import "./style.less";
import { data } from "./data";
import { IconInfoCircle, IconStats } from '../../Icons';
import { Button, Card, Col, Divider, Row, Tooltip } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { notify } from '../../utils/notifications';
import { copyText } from '../../utils/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PriceGraph } from './PriceGraph';
import { useConnection } from '../../contexts/connection';
import { PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { UserTokenAccount } from '../../models/transactions';
import { TokenInfo } from '@solana/spl-token-registry';

export const StatsView = () => { 
  const { t } = useTranslation('common');
  const connection = useConnection();
  const {
    userTokens,
  } = useContext(AppStateContext);
  const [meanTotalSupply, setMeanTotalSupply] = useState<number | undefined>(undefined);
  const [meanDecimals, setMeanDecimals] = useState<number | undefined>(undefined);
  const [meanMintAuth, setMeanMintAuth] = useState<string>('');
  const [meanToken, setMeanToken] = useState<TokenInfo | UserTokenAccount | undefined>(undefined);

  // Getters

  // Data handling / fetching

  // Get MEAN token info
  useEffect(() => {
    if (!connection) { return; }

    (async () => {
      const token = userTokens.find(t => t.symbol === 'MEAN');
      if (!token) { return; }

      const mint = new PublicKey(token.address);
      setMeanToken(token);

      // use getParsedAccountInfo
      let accountInfo = await connection.getParsedAccountInfo(mint);
      if (accountInfo) {   
        setMeanTotalSupply((accountInfo as any).value.data["parsed"]["info"]["supply"]);
        setMeanDecimals((accountInfo as any).value.data["parsed"]["info"]["decimals"]);
        setMeanMintAuth((accountInfo as any).value.data["parsed"]["info"]["mintAuthority"]);
      }
    })();

  }, [
    meanToken,
    userTokens,
    connection,
  ]);

  return (
    <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="title-and-subtitle">
            <div className="title">
              <IconStats className="mean-svg-icons" />
              <div>{t('stats.title')}</div>
            </div>
            <div className="subtitle">
              {t('stats.subtitle')}
            </div>
          </div>
          <PromoSpace />
          <FirstCardsLayout meanDecimals={meanDecimals} />
          <Divider />
          <SecondCardsLayout meanTotalSupply={meanTotalSupply} />
          <Divider />
          <ThirdCardsLayout />
        </div>
      </div>
      <PreFooter />
    </>
  );
}

/*********************** PROMO SPACE *************************/
export const PromoSpace = () => {
  const promoCards = [
    {
      imgUrl: "https://cdn.pixabay.com/photo/2018/01/16/01/02/cryptocurrency-3085139_1280.jpg",
      ctaUrl: "https://cdn.pixabay.com/photo/2018/01/16/01/02/cryptocurrency-3085139_1280.jpg"
    },
    {
      imgUrl: "https://cdn.pixabay.com/photo/2018/10/15/22/11/blockchain-3750157_1280.jpg",
      ctaUrl: "https://cdn.pixabay.com/photo/2018/10/15/22/11/blockchain-3750157_1280.jpg"
    },
    {
      imgUrl: "https://cdn.pixabay.com/photo/2018/05/23/04/32/cryptocurrency-3423264_1280.jpg",
      ctaUrl: "https://cdn.pixabay.com/photo/2018/05/23/04/32/cryptocurrency-3423264_1280.jpg"
    },
    {
      imgUrl: "https://cdn.pixabay.com/photo/2022/01/10/11/28/ethereum-6928106_1280.jpg",
      ctaUrl: "https://cdn.pixabay.com/photo/2022/01/10/11/28/ethereum-6928106_1280.jpg"
    },
    {
      imgUrl: "https://cdn.pixabay.com/photo/2021/11/02/14/33/shiba-6763358_1280.jpg",
      ctaUrl: "https://cdn.pixabay.com/photo/2021/11/02/14/33/shiba-6763358_1280.jpg"
    },
  ];

  // Use the function to shuffle the array of promos and get a random result each time
  const shuffle = (array: any) => {
    let currentIndex = array.length, temporaryValue, randomIndex;

    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
  };

  let randomPromoCards = shuffle(promoCards).slice(0, 3);  

  
  return (
    <>
      {randomPromoCards && (
        <Row gutter={[8, 8]} className="mb-1 promo-space">
          {randomPromoCards.map((card: any, index: string) => (
            <Col xs={24} sm={12} md={8} lg={8} key={index}>
              <a href={card.ctaUrl} target="_blank" rel="noreferrer" className="promo-space_link">
                <img src={card.imgUrl} alt="" width="100%" height="150"/>
              </a>
            </Col>
          ))}
        </Row> 
      )}
    </>
  )
}

/*********************** FIRST TYPE OF CARDS *************************/
export const FirstCardsLayout = ({ meanDecimals }: any) => {
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
      value: data.authority,
      tooltip: "stats.summary.token-authority-copy"
    },
    {
      label: t('stats.summary.token-decimals'),
      value: meanDecimals
    }
  ];
  
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
      <span>$ {data.price}</span>
    </div>
  );

  const renderBodyPrice = (
    <PriceGraph />
  );

  const cards = [
    {
      head: renderHeadSummary,
      body: renderBodySummary
    },
    {
      head: renderHeadPrice,
      body: renderBodyPrice
    }
  ];

  return (
    <Row gutter={[8, 8]}>
      {cards.map((card, index) => (
        <Col xs={24} sm={24} md={12} lg={12} key={index}>
          <Card className="ant-card card summary-card">
            <div className="ant-card-head">
              <div className="ant-card-head-wrapper">
                {card.head}
              </div>
            </div>
            <div className="ant-card-body">
              {card.body}
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  )
}

/*********************** SECOND TYPE OF CARDS *************************/
export const SecondCardsLayout = ({ meanTotalSupply }: any) => {
  const { t } = useTranslation('common');

  const cards = [
    {
      label: t('stats.market.market-cap-title'),
      value: `$ ${data.fully_dilluted_market_cap}`,
      description: "stats.market.token-fully_dilluted_market_cap"
    },
    {
      label: t('stats.market.holders-title'),
      value: data.holders,
      description: "stats.market.token-holders"
    },
    {
      label: t('stats.market.volume-title'),
      value: `$ ${data.total_volume}`,
      description: "stats.market.token-total-volume"
    },
    {
      label: t('stats.market.total-supply-title'),
      value: meanTotalSupply,
      description: "stats.market.token-total-supply"
    },
    {
      label: t('stats.market.circulating-supply-title'),
      value: `$ ${data.circulating_supply}`,
      description: "stats.market.token-circulating-suppply"
    },
    {
      label: t('stats.market.total-money-streams-title'),
      value: data.total_money_streams,
      description: "stats.market.token-total-money-streams"
    },
    {
      label: t('stats.market.total-value-locked-title'),
      value: `$ ${data.total_value_locked}`,
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
                      <span>${pair.total_liquidity}</span>
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