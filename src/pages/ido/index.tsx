import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Col, Divider, Row } from "antd";
import { PreFooter } from "../../components/PreFooter";
import {
  IDO_CAP_VALUATION,
  IDO_END_DATE,
  IDO_MIN_CONTRIBUTION,
  IDO_RESTRICTED_COUNTRIES,
  IDO_START_DATE,
  MEAN_FINANCE_DISCORD_URL,
  MEAN_FINANCE_TWITTER_URL,
  SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS
} from "../../constants";
import { useTranslation } from 'react-i18next';
import { consoleOut, isLocal, isValidAddress, percentual } from '../../utils/ui';
import "./style.less";
import { IdoDeposit } from '../../views';
import { IdoWithdraw } from '../../views/IdoWithdraw';
import Countdown from 'react-countdown';
import useScript from '../../hooks/useScript';
import dateFormat from "dateformat";
import { useNativeAccount } from '../../contexts/accounts';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import YoutubeEmbed from '../../components/YoutubeEmbed';
import { useNavigate } from 'react-router';
import { useLocation } from 'react-router-dom';
import { notify } from '../../utils/notifications';
import { useConnectionConfig } from '../../contexts/connection';
import { IdoClient, IdoStatus, IdoTracker, MeanIdoDetails } from '../../integrations/ido/ido-client';

type IdoTabOption = "deposit" | "withdraw";
declare const geoip2: any;

export const IdoView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected, wallet } = useWallet();
  const { library, status } = useScript('https://geoip-js.com/js/apis/geoip2/v2.1/geoip2.js', 'geoip2');
  const [regionLimitationAcknowledged, setRegionLimitationAcknowledged] = useState(false);
  const [currentTab, setCurrentTab] = useState<IdoTabOption>("deposit");
  const [userCountryCode, setUserCountryCode] = useState();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const {
    theme,
    tokenList,
    isWhitelisted,
    previousWalletConnectState,
    setTheme,
    setSelectedToken,
    setSelectedTokenBalance,
    refreshTokenBalance,
  } = useContext(AppStateContext);
  const [currentTheme] = useState(theme);
  const [xPosPercent, setXPosPercent] = useState(0);
  const [currentDateDisplay, setCurrentDateDisplay] = useState('');
  const [idoAccountAddress, setIdoAccountAddress] = useState('');
  const [idoDetails, setIdoDetails] = useState<MeanIdoDetails | null>(null);
  const [idoTracker, setIdoTracker] = useState<IdoTracker | undefined>(undefined);
  const [idoStatus, setIdoStatus] = useState<IdoStatus | undefined>(undefined);

  // TODO: Remove when releasing to the public
  useEffect(() => {
    if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    navigate
  ]);

  // Force dark theme
  useEffect(() => {

    if (theme !== 'dark') {
      setTheme('dark');
    }

    return () => setTheme(currentTheme || 'dark');
  }, [
    theme,
    setTheme,
    currentTheme
  ]);

  // Get IDO address from query string params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('idoAddress')) {
      const address = params.get('idoAddress');
      if (address && isValidAddress(address)) {
        consoleOut('Passed IDO address:', address, 'green');
        setIdoAccountAddress(address);
      } else {
        setIdoAccountAddress('');
        consoleOut('Invalid IDO address', address, 'red');
        notify({
          message: 'Error',
          description: 'The supplied IDO address is not a valid solana address',
          type: "error"
        });
        if (!isLocal()) {
          navigate('/');
        }
      }
    }
  }, [
    location.search,
    navigate,
  ]);

  const connection = useMemo(() => new Connection(connectionConfig.endpoint, {
    commitment: "confirmed",
    disableRetryOnRateLimit: true
  }), [
    connectionConfig.endpoint
  ]);

  // // Create and cache the IDO client
  const idoClient = useMemo(() => {
    if (connection && wallet && publicKey && connectionConfig.endpoint) {
      return new IdoClient(connectionConfig.endpoint, wallet, { commitment: "confirmed" }, isLocal() ? true : false);
    } else {
      return undefined;
    }
  }, [
    wallet,
    connectionConfig.endpoint,
    publicKey,
    connection
  ]);

  useEffect(() => {

    const initIdo = async () => {
      if (!idoClient || !idoAccountAddress) {
        return;
      }

      const idoAddressPubKey = new PublicKey(idoAccountAddress);
      const idoDetails = await idoClient.getIdo(idoAddressPubKey);
      if(idoDetails === null)
        return;

      setIdoDetails(idoDetails);

      const idoTracker = await idoClient.getIdoTracker(idoAddressPubKey);
      try {

        await idoTracker.startTracking();
        setIdoTracker(idoTracker);
        const idoStatus = idoTracker.getIdoStatus();
        // console.log("idoStatus:", idoStatus);
        setIdoStatus(idoStatus);
        idoTracker.addIdoUpdateListener((idoStatus) => setIdoStatus(idoStatus));
      } catch (error: any) {
        console.log(error);
      }
    }

    if (idoClient && idoAccountAddress) {
      initIdo();
    }

  }, [
    idoClient,
    idoAccountAddress,
  ]);

  // Date related
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = new Date();

  /*
  Abajo de los formularios

  Barrita horizontal
  - maximum raise
    label at the end

  if fulfilled -> warn: The guaranteed allocation is fully booked, but you can still deposit to save a spot on the waitlist.
  */

  useEffect(() => {

    const timeout = setTimeout(() => {
      const totalTime = idoEndUtc.getTime() - idoStartUtc.getTime();
      const elapsed = today.getTime() - idoStartUtc.getTime();
      const percent = percentual(elapsed, totalTime);
      setCurrentDateDisplay(dateFormat(today, SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS));
      if (today >= idoEndUtc) {
        setXPosPercent(100);
      } else {
        setXPosPercent(percent);
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    today,
    idoEndUtc,
    idoStartUtc,
  ]);

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
        const usdc = tokenList.filter(t => t.symbol === 'USDC');
        if (usdc && usdc.length) {
          setSelectedToken(usdc[0]);
        }
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setSelectedTokenBalance(0);
      }
    }

  }, [
    connected,
    publicKey,
    tokenList,
    previousWalletConnectState,
    setSelectedTokenBalance,
    refreshTokenBalance,
    setSelectedToken,
  ]);

  const onAcknowledgeRegionLimitations = () => {
    consoleOut('Clicked on Acknowledge');
    setRegionLimitationAcknowledged(true);
  }

  const onTabChange = (option: IdoTabOption) => {
    setCurrentTab(option);
  }

  const partnerImages = useMemo(() => {
    return ["http://placehold.it/300&text=banner1",
            "http://placehold.it/300&text=banner2",
            "http://placehold.it/300&text=banner3",
            "http://placehold.it/300&text=banner4",
            "http://placehold.it/300&text=banner5",
            "http://placehold.it/300&text=banner6"];
  }, []);

  const isUserBlocked = () => {
    return userCountryCode ? IDO_RESTRICTED_COUNTRIES.some(c => c.isoCode === userCountryCode) : false;
  }

  const renderRegionAcknowledgement = (
    <>
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
      return <IdoDeposit
        disabled={isUserBlocked()}
        contributedAmount={90381439.9773}
        totalMeanForSale={4000000}
        tokenPrice={22.5953}
        maxFullyDilutedMarketCapAllowed={IDO_CAP_VALUATION}
        min={IDO_MIN_CONTRIBUTION}
        max={21000}
      />;
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
            <p className="font-size-90 font-bold text-center">Sale period ends in <Countdown date={idoEndUtc} daysInHours={false} /></p>
          ) : null}
        </div>
        {/* Form */}
        <div className="shadowed-box max-width">
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

  const renderYouAreHere = () => {
    return (
      <>
      <div className="ido-stats-marker-wrapper">
        <div className="ido-stats-marker-inner-container">
          <span className="ido-stats-marker-start">{idoStartUtc.toUTCString()}</span>
          <span className="ido-stats-marker-end">{idoEndUtc.toUTCString()}</span>
          <span className="ido-stats-marker" style={{left: `${xPosPercent}%`}}></span>
          <div className="ido-stats-tooltip" style={{left: `${xPosPercent}%`}}>
            <div className="text-center">
              <div>{currentDateDisplay}</div>
            </div>
            <Divider />
            <div className="flex-fixed-right">
              <div className="left">Cosita</div>
              <div className="right">$1,540.00</div>
            </div>
          </div>
        </div>
      </div>
      </>
    );
  }

  return (
    <div className="solid-bg">

      {/* {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">idoAccountAddress:</span><span className="ml-1 font-bold fg-dark-active">{idoAccountAddress || '-'}</span>
        </div>
      )} */}

      <section className="content contrast-section no-padding">
        <div className="container">
          <div className="heading-section">
            <h1 className="heading ido-heading text-center mb-0">Welcome to the Mean <span className="fg-primary-highlight">IDO</span></h1>
          </div>
        </div>
      </section>

      <section className="content contrast-section pt-5 pb-5">
        <div className="container">
          <Row>
            <Col xs={24} md={16}>
              <div className="flex-column flex-center h-100 px-4">
                {today < idoStartUtc ? (
                  <div className="boxed-area mb-4 mt-4">
                    <h2 className="subheading ido-subheading text-center">How it works</h2>
                    <YoutubeEmbed embedId="rokGy0huYEA" />
                    <div className="text-center mt-2 mb-3">
                      <a className="secondary-link" target="_blank" rel="noopener noreferrer" title="How Mean IDO works"
                          href="https://docs.google.com/document/d/1uNeHnLdNDcPltk98CasslQfMV8R9CzC9uNqCbrlo8fY">
                        Read deatails about Mean IDO
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="ido-stats-container">
                    <img className="ido-stats-image" src="/assets/mean-bonding-curves.png" alt="IDO Stats" />
                    {(today > idoStartUtc && today < idoEndUtc) && renderYouAreHere()}
                    {/* <Timeline mode="left">
                      <Timeline.Item label={idoStartUtc.toUTCString()}>Sale period starts</Timeline.Item>
                      {today > idoStartUtc && today < idoEndUtc ? (
                        <Timeline.Item label={renderTimeLeft} dot={<ClockCircleOutlined style={{ fontSize: '16px', backgroundColor: 'var(--color-darken)' }} />}>Deposit and withdrawals</Timeline.Item>
                      ) : (
                        <Timeline.Item dot={<ClockCircleOutlined style={{ fontSize: '16px', backgroundColor: 'var(--color-darken)' }} />}>Deposit and withdrawals</Timeline.Item>
                      )}
                      <Timeline.Item label={idoEndUtc.toUTCString()}>IDO ends</Timeline.Item>
                      <Timeline.Item>Tokens redeemable</Timeline.Item>
                    </Timeline> */}
                  </div>
                )}
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div className="flex-column flex-center h-100 px-5 pb-5">
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
            {partnerImages.map((image: string, index: number) => {
              return (
                <Col key={`${index}`} className="partner flex-center"><img className="partner-logo" src={image} alt="" /></Col>
              );
            })}
          </Row>
        </div>
      </section>

      <PreFooter />
    </div>
  );

};
