import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Col, Row, Timeline } from "antd";
import { PreFooter } from "../../components/PreFooter";
import { IDO_END_DATE, IDO_RESTRICTED_COUNTRIES, IDO_START_DATE, MEAN_FINANCE_DISCORD_URL, MEAN_FINANCE_TWITTER_URL } from "../../constants";
import { useTranslation } from 'react-i18next';
import { consoleOut } from '../../utils/ui';
import "./style.less";
import { IdoDeposit } from '../../views';
import { IdoWithdraw } from '../../views/IdoWithdraw';
import Countdown from 'react-countdown';
import useScript from '../../hooks/useScript';
import { useNativeAccount } from '../../contexts/accounts';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';

type IdoTabOption = "deposit" | "withdraw";
declare const geoip2: any;

export const IdoView = () => {
  const { t } = useTranslation('common');
  const { publicKey, connected } = useWallet();
  const { library, status } = useScript('https://geoip-js.com/js/apis/geoip2/v2.1/geoip2.js', 'geoip2');
  const [regionLimitationAcknowledged, setRegionLimitationAcknowledged] = useState(false);
  const [currentTab, setCurrentTab] = useState<IdoTabOption>("deposit");
  const [userCountryCode, setUserCountryCode] = useState();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const {
    previousWalletConnectState,
    refreshTokenBalance,
    setSelectedTokenBalance
  } = useContext(AppStateContext);

  // Date related
  const today = new Date();
  const idoStartUtc = useMemo(() => new Date(Date.UTC(
    IDO_START_DATE.year,
    IDO_START_DATE.month,
    IDO_START_DATE.day,
    IDO_START_DATE.hour,
    IDO_START_DATE.minute,
    IDO_START_DATE.second
  )), []);
  const idoEndUtc = useMemo(() => new Date(Date.UTC(
    IDO_END_DATE.year,
    IDO_END_DATE.month,
    IDO_END_DATE.day,
    IDO_END_DATE.hour,
    IDO_END_DATE.minute,
    IDO_END_DATE.second
  )), []);

  // Keep track of account changes and updates token balance
  useEffect(() => {

    const getAccountBalance = (): number => {
      return (account?.lamports || 0) / LAMPORTS_PER_SOL;
    }

    if (account?.lamports !== previousBalance || !nativeBalance) {
      // Refresh token balance
      refreshTokenBalance();
      setNativeBalance(getAccountBalance());
      // Update previous balance
      setPreviousBalance(account?.lamports);
    }
  }, [
    account,
    nativeBalance,
    previousBalance,
    refreshTokenBalance
  ]);

  // Gets user countryCode
  useEffect(() => {
    const onSuccess = function(geoipResponse: any) {
      setUserCountryCode(geoipResponse.country.iso_code);
      consoleOut('countryCode:', geoipResponse.country.iso_code, 'blue');
    };
  
    const onError = function(error: any) {
      console.error(error);
    };
  
    if (status === 'ready' && library) {
      geoip2.city(onSuccess, onError);
    }
  }, [
    status,
    library
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Nothing to do yet...', '', 'blue');
        setTimeout(() => {
          refreshTokenBalance();
        }, 10);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setSelectedTokenBalance(0);
      }
    }

  }, [
    connected,
    publicKey,
    previousWalletConnectState,
    setSelectedTokenBalance,
    refreshTokenBalance
  ]);

  const onAcknowledgeRegionLimitations = () => {
    consoleOut('Clicked on Acknowledge');
    setRegionLimitationAcknowledged(true);
  }

  const onTabChange = (option: IdoTabOption) => {
    setCurrentTab(option);
  }

  const getRandombgImg = () => {
    var random= Math.floor(Math.random() * 6) + 0;
    var bigSize = ["http://placehold.it/300&text=banner1",
                   "http://placehold.it/300&text=banner2",
                   "http://placehold.it/300&text=banner3",
                   "http://placehold.it/300&text=banner4",
                   "http://placehold.it/300&text=banner5",
                   "http://placehold.it/300&text=banner6"];
    return bigSize[random];
  }

  const isUserBlocked = () => {
    return userCountryCode ? IDO_RESTRICTED_COUNTRIES.some(c => c.isoCode === userCountryCode) : false;
  }

  const renderRegionAcknowledgement = (
    <>
      <div className="ant-image" style={{width: '320px', height: 'auto', maxHeight: '280px'}}>
        <img className="ant-image-img" alt="IDO Launch" src="/assets/launch.png" />
      </div>
      <div className="text-center px-5 mt-3">
        <h2 className="subheading ido-subheading">The Mean IDO can only be accessed from select countries.</h2>
      </div>
      <p className="text-center">By clicking acknowledge below, I certify that I am not a resident of Afghanistan, Ivory Coast, Cuba, Iraq, Iran, Liberia, North Korea, Syria, Sudan, South Sudan, Zimbabwe, Antigua, United States, American Samoa, Guam, Northern Mariana Islands, Puerto Rico, United States Minor Outlying Islands, US Virgin Islands, Ukraine, Belarus, Albania, Burma, Central African Republic, Democratic Republic of Congo, Lybia, Somalia, Yemen, United Kingdom, Thailand.</p>
      <p className="text-center">If you have any questions, please contact us via <a className="secondary-link" href={MEAN_FINANCE_TWITTER_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.twitter')}</a>, or <a className="secondary-link" href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.discord')}</a>.</p>
      <Button
        className="main-cta"
        type="primary"
        shape="round"
        size="large"
        onClick={() => onAcknowledgeRegionLimitations()}>
        Acknowledge
      </Button>
    </>
  );

  const renderForm = () => {
    if (currentTab === "deposit") {
      return <IdoDeposit disabled={isUserBlocked()} />;
    } else {
      return <IdoWithdraw disabled={isUserBlocked()} />;
    }
  }

  const renderTabset = (
    <>
      <div className="ido-form-wrapper">
        {/* Countdown timer */}
        <div className="countdown-timer">
          {today < idoStartUtc ? (
            <>
            <p className="font-size-90 font-bold text-center">Sale period starts in <Countdown date={idoStartUtc} daysInHours={true} /></p>
            </>
          ) : today > idoStartUtc && today < idoEndUtc ? (
            <p className="font-size-90 font-bold text-center">Sale period starts in <Countdown date={idoEndUtc} daysInHours={true} /></p>
          ) : null}
        </div>
        {/* Form */}
        <div className="deposits-and-withdrawals">
          <div className="button-tabset-container">
            <div className={`tab-button ${currentTab === "deposit" ? 'active' : ''}`} onClick={() => onTabChange("deposit")}>
              Deposit
            </div>
            <div className={`tab-button ${currentTab === "withdraw" ? 'active' : ''}`} onClick={() => onTabChange("withdraw")}>
              Withdraw
            </div>
          </div>
          {renderForm()}
        </div>
      </div>
    </>
  );

  return (
    <div className="solid-bg">

      <section className="content contrast-section no-padding">
        <div className="container">
          <Row gutter={[0, 24]}>
            <Col xs={24} md={12}>
              <div className="padded-content">
                <h1 className="heading ido-heading">Welcome to the<br/>Mean <span className="fg-primary-highlight">IDO</span></h1>
                <div className="boxed-area">
                  <h2 className="subheading ido-subheading">How it works</h2>
                  <p>The IDO consists of two consecutive 24 hour phases:</p>
                  <ul className="vertical-list dash-bullet">
                    <li><em className="text-underline">Sale period:</em> USDC may be deposited or withdrawn from the pool. MEAN price will fluctuate based on the size of the pool.</li>
                    <li><em className="text-underline">Grace period:</em> USDC may only be withdrawn from the pool. MEAN price will only go down in this phase.</li>
                  </ul>
                  <div>Afterwards, depositors can redeem an amount of MEAN tokens proportional to their share of the pool.</div>
                </div>
                <div className="text-center px-5 mt-3">
                  <h2 className="subheading ido-subheading">Timeline</h2>
                </div>
                <div className="position-relative">
                  <Timeline mode="left">
                    <Timeline.Item label="2015-09-01">Create a services</Timeline.Item>
                    <Timeline.Item label="2015-09-01 09:12:11">Solve initial network problems</Timeline.Item>
                    <Timeline.Item>Technical testing</Timeline.Item>
                    <Timeline.Item label="2015-09-01 09:12:11">Network problems being solved</Timeline.Item>
                  </Timeline>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="padded-content flex-column flex-center">
                {!regionLimitationAcknowledged
                  ? renderRegionAcknowledgement
                  : renderTabset
                }
              </div>
            </Col>
          </Row>
        </div>
      </section>

      <section className="content">
        <div className="container">
          <h1 className="heading ido-heading text-center">Investors</h1>
          <Row gutter={[32, 32]} justify="center">
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
            <Col className="partner flex-center"><img className="partner-logo" src={getRandombgImg()} alt="" /></Col>
          </Row>
        </div>
      </section>

      <PreFooter />
    </div>
  );

};
