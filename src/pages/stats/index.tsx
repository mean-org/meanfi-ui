import { useContext, useEffect, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import "./style.scss";
import { IconStats } from '../../Icons';
import { Col, Row, Space } from 'antd';
import { useTranslation } from 'react-i18next';
import { useConnection } from '../../contexts/connection';
import { Connection, ParsedAccountData, PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { UserTokenAccount } from '../../models/transactions';
import { TokenInfo } from '@solana/spl-token-registry';
import { TokenStats } from './TokenStats';
import { AccountLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from 'bn.js';
import { toUiAmount } from '../../utils/utils';
import { MEANFI_TOKENS } from '../../constants'

//const tabs = ["Mean Token", "MeanFi", "Mean DAO"];

export const StatsView = () => {
  const { t } = useTranslation('common');
  const connection = useConnection();
  const {
    userTokens
  } = useContext(AppStateContext);

  const [meanTotalSupply, setMeanTotalSupply] = useState<number | undefined>(undefined);
  const [meanDecimals, setMeanDecimals] = useState<number | undefined>(undefined);
  const [meanSymbol, setMeanSymbol] = useState<string>('');
  const [meanToken, setMeanToken] = useState<TokenInfo | UserTokenAccount | undefined>(undefined);
  const [meanHolders, setMeanHolders] = useState<number | undefined>(undefined);
  const [sMeanTotalSupply, setSMeanTotalSupply] = useState<number | undefined>(undefined);

  // Getters

  // Data handling / fetching

  // Get MEAN and sMEAN token info
  useEffect(() => {
    if (!connection) { return; }

    (async () => {
      const meanSymbol = 'MEAN';
      const token = userTokens.find(t => t.symbol === meanSymbol);
      if (!token) { return; }

      setMeanToken(token);

      const meanPubKey = new PublicKey(MEANFI_TOKENS.MEAN);
      const sMeanPubKey = new PublicKey(MEANFI_TOKENS.sMEAN);

      // use getParsedAccountInfo
      const meanInfo = await connection.getParsedAccountInfo(meanPubKey);
      if (meanInfo) {
        const meanValue = (meanInfo.value?.data as ParsedAccountData);
        const totalSupply = meanValue.parsed["info"]["supply"];
        const decimals = Number(meanValue.parsed["info"]["decimals"] || '6');
        setMeanDecimals(decimals);
        setMeanSymbol(meanSymbol);
        setMeanTotalSupply(toUiAmount(new BN(totalSupply), decimals));
      }

      const sMeanInfo = await connection.getParsedAccountInfo(sMeanPubKey);
      if (sMeanInfo) {
        const sMeanValue = (sMeanInfo.value?.data as ParsedAccountData);
        const totalSupply = sMeanValue.parsed["info"]["supply"];
        const decimals = Number(sMeanValue.parsed["info"]["decimals"] || '6');
        setSMeanTotalSupply(toUiAmount(new BN(totalSupply), decimals));
      }
    })();
  }, [
    meanToken,
    userTokens,
    connection,
  ]);

  useEffect(() => {
    const getAccounts = async (connection: Connection) => {
      if (!meanToken) {
        return [];
      }

      const accountInfos = await connection.getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
        filters: [
          {
            memcmp: { offset: 0, bytes: MEANFI_TOKENS.MEAN },
          },
          {
            dataSize: AccountLayout.span
          }
        ],
      });

      const results = accountInfos
        .filter(i => (i.account.data as ParsedAccountData).parsed.info.tokenAmount.uiAmount > 0);

      return results;
    }

    if (connection) {
      getAccounts(connection)
        .then(values => {
          setMeanHolders(values.length);
        });
    }
  }, [connection, meanToken]);


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
            meanTotalSupply={meanTotalSupply}
            meanDecimals={meanDecimals}
            meanSymbol={meanSymbol}
            meanHolders={meanHolders}
            meanToken={meanToken}
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