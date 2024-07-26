import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { type AccountInfo, type ParsedAccountData, PublicKey } from '@solana/web3.js';
import { IconStats } from 'Icons';
import { Col, Row } from 'antd';
import { MEAN_TOKEN } from 'app-constants/tokens';
import { PreFooter } from 'components/PreFooter';
import { useConnection } from 'contexts/connection';
import { appConfig } from 'main';
import { getCoingeckoMarketChart, getMeanStats } from 'middleware/api';
import { consoleOut } from 'middleware/ui';
import type { MeanFiStatsModel } from 'models/meanfi-stats';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TokenStats } from './TokenStats';
import type { PromoCards } from './types';
import './style.scss';

//const tabs = ["Mean Token", "MeanFi", "Mean DAO"];

export const StatsView = () => {
  const { t } = useTranslation('common');
  const connection = useConnection();
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
    consoleOut('Calling getCoingeckoMarketChart from StatsView...', '', 'blue');
    getCoingeckoMarketChart(MEAN_TOKEN.extensions.coingeckoId, MEAN_TOKEN.decimals, 1, 'daily')
      .then(dataset => {
        if (dataset[1] && dataset[1].length > 0) {
          const dataPoint = dataset[1][dataset[1].length - 1];
          console.log('volume:', +dataPoint.priceData);
          setTotalVolume24h(Number(dataPoint.priceData));
        }
      })
      .catch(error => console.error(error));
  }, []);

  useEffect(() => {
    const getHolders = async (mint: string) => {
      const accountInfos = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [
          {
            dataSize: 165,
          },
          {
            memcmp: {
              offset: 0,
              bytes: mint,
            },
          },
        ],
      });
      const results = accountInfos.filter(i => (i.account as AccountInfo<ParsedAccountData>).data.parsed.info.tokenAmount.uiAmount > 0);
      return results.length;
    };

    (async () => {
      const meanStats = await getMeanStats();
      console.log('getMeanStats() response:', meanStats);
      if (meanStats) {
        if (!meanStats.holders) {
          setMeanfiStats(meanStats);
          // After publishing the value like it is, fetch the holders and re-publish the value
          const holders = await getHolders(MEAN_TOKEN.address);
          console.log('getHolders() response:', holders);
          setMeanfiStats(
            Object.assign({}, meanStats, {
              holders,
            }),
          );
        } else {
          setMeanfiStats(meanStats);
        }
      }
    })();
  }, [connection]);

  // Get sMEAN token info
  useEffect(() => {
    if (!connection) {
      return;
    }
    (async () => {
      const tokenAccount = new PublicKey(meanStakingVault);
      const tokenAmount = await connection.getTokenAccountBalance(tokenAccount);
      if (tokenAmount?.value) {
        setSMeanTotalSupply(tokenAmount.value.uiAmount || 0);
      }
    })();
  }, [connection, meanStakingVault]);

  if (!meanfiStats || sMeanTotalSupply === 0) {
    return <p>{t('general.loading')}...</p>;
  }

  return (
    <>
      <div className='container main-container'>
        <div className='interaction-area'>
          <div className='title-and-subtitle'>
            <div className='title'>
              <IconStats className='mean-svg-icons' />
              <div>{t('stats.title')}</div>
            </div>
            <div className='subtitle'>{t('stats.subtitle')}</div>
          </div>

          <TokenStats meanStats={meanfiStats} sMeanTotalSupply={sMeanTotalSupply ?? 0} totalVolume24h={totalVolume24h} />
        </div>
      </div>
      <PreFooter />
    </>
  );
};

/*********************** PROMO SPACE *************************/
export const PromoSpace = () => {
  const promoCards: PromoCards[] = [
    {
      imgUrl: 'https://cdn.pixabay.com/photo/2018/01/16/01/02/cryptocurrency-3085139_1280.jpg',
      ctaUrl: 'https://cdn.pixabay.com/photo/2018/01/16/01/02/cryptocurrency-3085139_1280.jpg',
    },
    {
      imgUrl: 'https://cdn.pixabay.com/photo/2018/10/15/22/11/blockchain-3750157_1280.jpg',
      ctaUrl: 'https://cdn.pixabay.com/photo/2018/10/15/22/11/blockchain-3750157_1280.jpg',
    },
    {
      imgUrl: 'https://cdn.pixabay.com/photo/2018/05/23/04/32/cryptocurrency-3423264_1280.jpg',
      ctaUrl: 'https://cdn.pixabay.com/photo/2018/05/23/04/32/cryptocurrency-3423264_1280.jpg',
    },
    {
      imgUrl: 'https://cdn.pixabay.com/photo/2022/01/10/11/28/ethereum-6928106_1280.jpg',
      ctaUrl: 'https://cdn.pixabay.com/photo/2022/01/10/11/28/ethereum-6928106_1280.jpg',
    },
    {
      imgUrl: 'https://cdn.pixabay.com/photo/2021/11/02/14/33/shiba-6763358_1280.jpg',
      ctaUrl: 'https://cdn.pixabay.com/photo/2021/11/02/14/33/shiba-6763358_1280.jpg',
    },
  ];

  // Use the function to shuffle the array of promos and get a random result each time
  const shuffle = (array: PromoCards[]) => {
    let currentIndex = array.length;
    let temporaryValue: PromoCards;
    let randomIndex = 0;

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
        <Row gutter={[8, 8]} className='mb-1 promo-space'>
          {randomPromoCards.map((card, index) => (
            <Col xs={24} sm={12} md={8} lg={8} key={index}>
              <a href={card.ctaUrl} target='_blank' rel='noreferrer' className='promo-space_link'>
                <img src={card.imgUrl} alt='' width='100%' height='150' />
              </a>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
};
