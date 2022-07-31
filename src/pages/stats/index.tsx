import { ParsedAccountData, PublicKey } from '@solana/web3.js';
import { TokenInfo } from '@solana/spl-token-registry';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Col, Row } from 'antd';
import { BN } from 'bn.js';

import "./style.scss";
import { IconStats } from '../../Icons';
import { PreFooter } from "../../components/PreFooter";
import { useConnection } from '../../contexts/connection';
import { TokenStats } from './TokenStats';
import { toUiAmount } from '../../utils/utils';
import { SMEAN_TOKEN } from '../../constants/token-list';
import { getMeanStats } from '../../utils/api';
import { MeanFiStatsModel } from '../../models/meanfi-stats';

//const tabs = ["Mean Token", "MeanFi", "Mean DAO"];

export const StatsView = () => {
  const { t } = useTranslation('common');
  const connection = useConnection();

  const [totalVolume, setTotalVolume] = useState<number>();
  const [meanfiStats, setMeanfiStats] = useState<MeanFiStatsModel | null>(null);
  const [sMeanTotalSupply, setSMeanTotalSupply] = useState<number | undefined>(undefined);

  // Getters

  // Data handling / fetching

  // Get MEAN and sMEAN token info
  useEffect(() => {
    if (!connection) { return; }

    (async () => {
      const meanStats = await getMeanStats();
      console.log('****************** meanStats:', meanStats, '********************');      
      if(meanStats){
        setMeanfiStats(meanStats);
      }

      setTotalVolume(0);
      
      // use getParsedAccountInfo
      const sMeanInfo = await connection.getParsedAccountInfo(new PublicKey(SMEAN_TOKEN.address));
      if (sMeanInfo) {
        const totalSupply = (sMeanInfo.value?.data as ParsedAccountData).parsed["info"]["supply"];
        setSMeanTotalSupply(toUiAmount(new BN(totalSupply), SMEAN_TOKEN.decimals));
      }
    })();
  }, [
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
          <TokenStats
            meanfiStats={meanfiStats}
            totalVolume={totalVolume}
            smeanSupply={sMeanTotalSupply}
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