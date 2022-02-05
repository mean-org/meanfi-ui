import React, { useContext, useEffect, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import "./style.less";
import { IconStats } from '../../Icons';
import { Col, Row } from 'antd';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../contexts/connection';
import { PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { UserTokenAccount } from '../../models/transactions';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokenStats } from './TokenStats';

const tabs = ["Mean Token", "MeanFi", "Mean DAO"];

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

  const [activeTab, setActiveTab] = useState(tabs[0]);

  const onClickHandler = (event: any) => {
    if (event.target.innerHTML !== activeTab) {
      setActiveTab(event.target.innerHTML);
    }
  };

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
          <ul className="tabs ant-menu-overflow ant-menu-horizontal">
            {tabs.map((tab, index) => (
              <li 
                key={index} 
                className={`ant-menu-item ${activeTab === tab ? "active ant-menu-item-selected" : ""}`} 
                tabIndex={0} 
                onClick={onClickHandler}
              >
                <span className="ant-menu-title-content">{tab}</span>
              </li>
            ))}
          </ul>
          <PromoSpace />
          {activeTab === "Mean Token" &&           
            <TokenStats 
              meanTotalSupply={meanTotalSupply} 
              meanDecimals={meanDecimals} 
              meanMintAuth={meanMintAuth} 
            />
          }
          {activeTab === "MeanFi" && "MeanFi"}
          {activeTab === "Mean DAO" && "Mean DAO"}
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