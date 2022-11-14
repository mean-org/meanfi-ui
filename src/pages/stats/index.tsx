import { PublicKey } from '@solana/web3.js';
import { useTranslation } from 'react-i18next';
import { useEffect, useState, useMemo } from 'react';
import { Col, Row } from 'antd';

import "./style.scss";
import { IconStats } from '../../Icons';
import { PreFooter } from "../../components/PreFooter";
import { getNetworkIdByCluster, useConnection, useConnectionConfig } from '../../contexts/connection';
import { TokenStats } from './TokenStats';
import { MEAN_TOKEN, MEAN_TOKEN_LIST, SMEAN_TOKEN } from '../../constants/tokens';
import { getCoingeckoMarketChart, getMeanStats } from '../../middleware/api';
import { MeanFiStatsModel } from '../../models/meanfi-stats';
import { appConfig } from "../..";

//const tabs = ["Mean Token", "MeanFi", "Mean DAO"];

export const StatsView = () => {
  const { t } = useTranslation('common');
  const connection = useConnection();

  const { cluster } = useConnectionConfig();
  const [totalVolume24h, setTotalVolume24h] = useState<number>(0);
  const [sMeanTotalSupply, setSMeanTotalSupply] = useState<number | null>(0);
  const [meanfiStats, setMeanfiStats] = useState<MeanFiStatsModel | undefined>(undefined);

  // Getters
  
  // MEAN Staking Vault address
  const meanStakingVault = useMemo(() => {
    return appConfig.getConfig().meanStakingVault;
  }, []);

  // Data handling / fetching
  useEffect(() => {
    (async () => {
      const meanStats = await getMeanStats();
      if (meanStats) {
        setMeanfiStats(meanStats);
      }
      //TODO: pull this info
      const [, marketVolumeData] = await getCoingeckoMarketChart(MEAN_TOKEN.extensions.coingeckoId, MEAN_TOKEN.decimals, 1, 'daily');
      if (marketVolumeData && marketVolumeData.length > 0) {
        setTotalVolume24h(Number(marketVolumeData[marketVolumeData.length - 1].priceData));
      }
    })();
  }, [getMeanStats, getCoingeckoMarketChart]);

  // Get sMEAN token info
  useEffect(() => {
    if (!connection) { return; }
    (async () => {
        const tokenAccount = new PublicKey(meanStakingVault);
        const tokenAmount = await connection.getTokenAccountBalance(tokenAccount);
        if (tokenAmount && tokenAmount.value) {
          setSMeanTotalSupply(tokenAmount.value.uiAmount || 0);
        }
    })();
  }, [connection, meanStakingVault]);

  if (!meanfiStats || sMeanTotalSupply === 0) { return <p>{t('general.loading')}...</p>; }

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
          
          <TokenStats
            meanStats={meanfiStats}
            smeanSupply={sMeanTotalSupply}
            totalVolume24h={totalVolume24h}
          />
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

  const randomPromoCards = shuffle(promoCards).slice(0, 3);


  return (
    <>
      {randomPromoCards && (
        <Row gutter={[8, 8]} className="mb-1 promo-space">
          {randomPromoCards.map((card: any, index: string) => (
            <Col xs={24} sm={12} md={8} lg={8} key={index}>
              <a href={card.ctaUrl} target="_blank" rel="noreferrer" className="promo-space_link">
                <img src={card.imgUrl} alt="" width="100%" height="150" />
              </a>
            </Col>
          ))}
        </Row>
      )}
    </>
  )
}