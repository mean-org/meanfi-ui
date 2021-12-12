import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Button, Col, Divider, Row } from "antd";
import { PreFooter } from "../../components/PreFooter";
import {
  IDO_CAP_VALUATION,
  IDO_RESTRICTED_COUNTRIES,
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
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { appConfig } from '../..';
import { getTokenAmountAndSymbolByTokenAddress } from '../../utils/utils';
import { CUSTOM_USDC } from '../../constants/token-list';

type IdoTabOption = "deposit" | "withdraw";
type IdoInitStatus = "uninitialized" | "initializing" | "started" | "stopped" | "error";
declare const geoip2: any;

export const IdoLiveView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const { library, status } = useScript('https://geoip-js.com/js/apis/geoip2/v2.1/geoip2.js', 'geoip2');
  const [regionLimitationAcknowledged, setRegionLimitationAcknowledged] = useState(false);
  const [currentTab, setCurrentTab] = useState<IdoTabOption>("deposit");
  const [userCountryCode, setUserCountryCode] = useState();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const {
    theme,
    tokenBalance,
    selectedToken,
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
  const [idoStatus, setIdoStatus] = useState<IdoStatus | undefined>(undefined);
  const [idoDetails, setIdoDetails] = useState<IdoDetails | undefined>(undefined);
  const [idoEngineInitStatus, setIdoEngineInitStatus] = useState<IdoInitStatus>("uninitialized");
  const [idosLoaded, setIdosLoaded] = useState(false);
  const [idoEndUtc, setIdoEndUtc] = useState<Date | undefined>();
  const [idoStartUtc, setIdoStartUtc] = useState<Date | undefined>();
  const [redeemStartUtc, setRedeemStartUtc] = useState<Date | undefined>();
  const [isUserBlocked, setIsUserBlocked] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = new Date();

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

  useEffect(() => {
    if (userCountryCode) {
      consoleOut('Detected countryCode:', userCountryCode, 'blue');
      const matched = userCountryCode ? IDO_RESTRICTED_COUNTRIES.some(c => c.isoCode === userCountryCode) : false;
      setIsUserBlocked(matched);
    } else {
      consoleOut('No countryCode detected!', '', 'blue');
    }
  }, [userCountryCode]);

  // TODO: Remove whitelist filter when releasing to the public
  useEffect(() => {
    if (isUserBlocked) {
      navigate('/ido-blocked');
    } else if (!isWhitelisted && !isLocal()) {
      navigate('/');
    }
  }, [
    isWhitelisted,
    isUserBlocked,
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
  // Fallback to appSettings config or error out
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('idoAddress')) {
      const address = params.get('idoAddress');
      if (address && isValidAddress(address)) {
        consoleOut('Passed IDO address:', address, 'green');
        setTimeout(() => {
          setIdoAccountAddress(address);
        });
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
    } else {
      consoleOut('No IDO address provided, using config...');
      const idoAccountAddressFromConfig = appConfig.getConfig().idoAccountAddress;
      consoleOut('Using IDO address:', idoAccountAddressFromConfig, 'blue');
      if (idoAccountAddressFromConfig) {
        setIdoAccountAddress(idoAccountAddressFromConfig);
      } else {
        consoleOut('No IDO address in config!', 'This is odd.', 'red');
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

  // Create and cache the IDO client
  const idoClient = useMemo(() => {
    if (!connection || !connectionConfig.endpoint) {
      consoleOut('This is odd. No connection!', '', 'red');
      return;
    }

    return new IdoClient(
      connectionConfig.endpoint,
      publicKey || undefined,
      { commitment: "confirmed" },
      isLocal() ? true : false
    );
  }, [
    publicKey,
    connection,
    connectionConfig.endpoint,
  ]);

  // Get a list of available IDOs for reference
  useEffect(() => {

    if (!idoClient || !publicKey || idosLoaded) { return; }

    setIdosLoaded(true);

    idoClient.listIdos(true, true)
      .then(myIdos => {
        consoleOut('myIdos:', myIdos, 'blue');
        const idosTable: any[] = [];
        myIdos.forEach((item: IdoDetails, index: number) => idosTable.push({
          address: item.idoAddress,
          startUtc: new Date(item.idoStartUtc).toLocaleDateString(),
          endUtc: new Date(item.idoEndUtc).toLocaleDateString()
          })
        );
        console.table(idosTable);
      })
      .catch(error => {
        console.error(error);
      })

    return () => {};

  }, [
    publicKey,
    idoClient,
    idosLoaded,
  ]);

  // Init IDO client and store tracked data
  useEffect(() => {

    if (!idoClient || !idoAccountAddress) {
      return;
    }

    const initIdo = async () => {

      const idoAddressPubKey = new PublicKey(idoAccountAddress);
      const details = await idoClient.getIdo(idoAddressPubKey);

      consoleOut('idoDetails:', details, 'blue');

      if(details === null)
      {
        setIdoEngineInitStatus("error");
        return;
      }

      setIdoDetails(details);
      let parsedDate = Date.parse(details.idoStartUtc);
      let fromParsedDate = new Date(parsedDate);
      consoleOut('idoStartUtc.toUTCString()', fromParsedDate.toUTCString(), 'crimson');
      setIdoStartUtc(fromParsedDate);

      parsedDate = Date.parse(details.idoEndUtc);
      fromParsedDate = new Date(parsedDate);
      consoleOut('idoEndUtc.toUTCString()', fromParsedDate.toUTCString(), 'crimson');
      setIdoEndUtc(fromParsedDate);

      parsedDate = Date.parse(details.redeemStartUtc);
      fromParsedDate = new Date(parsedDate);
      consoleOut('redeemStartUtc.toUTCString()', fromParsedDate.toUTCString(), 'crimson');
      setRedeemStartUtc(fromParsedDate);

      try {
        await idoClient.startTracking(
          idoAddressPubKey,
          (idoStatus) => {
            setIdoStatus(idoStatus);
            setIdoEngineInitStatus("started");
          }
        );
      } catch (error: any) {
        console.error(error);
        setIdoEngineInitStatus("error");
      }

    }

    if (!idoStatus && (idoEngineInitStatus === "uninitialized" || idoEngineInitStatus === "error")) {
      consoleOut('idoAccountAddress:', idoAccountAddress, 'blue');
      consoleOut('client:', idoClient ? idoClient.toString() : 'none', 'brown');
      consoleOut('Calling initIdo()...', '', 'blue');
      setIdoEngineInitStatus("initializing");
      initIdo();
    }

    return () => {};

  }, [
    idoClient,
    idoStatus,
    idoAccountAddress,
    idoEngineInitStatus,
  ]);

  /*
  Abajo de los formularios

  Barrita horizontal
  - maximum raise
    label at the end

  if fulfilled -> warn: The guaranteed allocation is fully booked, but you can still deposit to save a spot on the waitlist.
  */

  useEffect(() => {

    if (!idoDetails || !idoStartUtc || !idoEndUtc) {
      return;
    }

    const timeout = setTimeout(() => {
      const totalTime = idoDetails.idoDurationInSeconds * 1000;
      // const totalTime = idoEndUtc.getTime() - idoStartUtc.getTime();
      const elapsed = today.getTime() - idoStartUtc.getTime();
      const percent = percentual(elapsed, totalTime);
      if (today >= idoEndUtc) {
        setXPosPercent(100);
        setCurrentDateDisplay(dateFormat(idoEndUtc, SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS));
      } else {
        setXPosPercent(percent);
        setCurrentDateDisplay(dateFormat(today, SIMPLE_DATE_TIME_FORMAT_WITH_SECONDS));
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    idoDetails,
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

  // Hook on the wallet connect/disconnect
  useEffect(() => {

    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected && publicKey) {
        consoleOut('Nothing to do yet...', '', 'blue');
        setSelectedToken(CUSTOM_USDC);
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
    refreshTokenBalance,
    setSelectedToken,
  ]);

  const isIdoActive = () => {
    return idoStartUtc && idoEndUtc && today > idoStartUtc && today < idoEndUtc
      ? true
      : false;
  }

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

  const infoRow = (caption: string, value: string) => {
    return (
      <div className="flex-fixed-right line-height-180">
        <div className="left inner-label">
          <span>{caption}</span>
        </div>
        <div className="right value-display">
          <span>{value}</span>
        </div>
      </div>
    );
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
    if (!idoStatus || !idoDetails) { return null; }
    if (currentTab === "deposit") {
      return <IdoDeposit
        disabled={!isIdoActive()}
        contributedAmount={idoStatus.totalUsdcContributed}
        totalMeanForSale={idoDetails.usdcTotalCurrent}
        tokenPrice={idoStatus.currentImpliedMeanPrice}
        selectedToken={selectedToken}
        tokenBalance={tokenBalance}
        maxFullyDilutedMarketCapAllowed={IDO_CAP_VALUATION}
        min={idoDetails.usdcPerUserMin}
        max={idoStatus.currentMaxUsdcContribution}
      />;
    } else {
      return <IdoWithdraw disabled={!isIdoActive()} />;
    }
  }

  const renderDepositAndWithdrawTabset = (
    <>
      <div className="button-tabset-container">
        <div className={`tab-button ${currentTab === "deposit" ? 'active' : ''}`} onClick={() => onTabChange("deposit")}>
          Deposit
        </div>
        <div className={`tab-button ${currentTab === "withdraw" ? 'active' : ''}`} onClick={() => onTabChange("withdraw")}>
          Withdraw
        </div>
      </div>
      {renderForm()}
    </>
  );

  const renderClaimsTabset = (
    <>
      <div className="button-tabset-container">
        <div className="tab-button active">Redeem</div>
      </div>
      {(idoStatus && selectedToken) && (
        <div className="px-1 mb-2">
          {infoRow(
            'USDC Contributed',
            getTokenAmountAndSymbolByTokenAddress(
              idoStatus.totalUsdcContributed,
              selectedToken.address,
              true
            )
          )}
          {infoRow(
            'Total MEAN sold',
            getTokenAmountAndSymbolByTokenAddress(
              idoStatus.totalMeanAllocated,
              '',
              true
            )
          )}
          {infoRow(
            'Implied token price',
            getTokenAmountAndSymbolByTokenAddress(
              idoStatus.currentMeanPrice,
              selectedToken.address
            )
          )}
        </div>
      )}

      <Button
        className="main-cta mb-2"
        block
        type="primary"
        shape="round"
        size="large"
        disabled={!redeemStartUtc || today < redeemStartUtc}
        onClick={() => {}}>
        Redeem &amp; Start Vesting
      </Button>

      {/* Bind redeemable MEAN tokens */}
      <div className="flex-row justify-content-start align-items-start">
        <div className="flex-auto align-items-start inner-label line-height-150" style={{minWidth: 85}}>Vesting Now:</div>
        <div className="flex-fill align-items-start value-display line-height-150 text-left pl-2">
          <span className="fg-orange-red pulsate mr-1">100</span>
          <span>MEAN tokens (10%)</span>
        </div>
      </div>

      {/* Bind streamable MEAN tokens */}
      <div className="flex-row justify-content-start align-items-start">
        <div className="flex-auto align-items-start inner-label line-height-150" style={{minWidth: 85}}>Money Stream:</div>
        <div className="flex-fill align-items-start value-display line-height-150 text-left pl-2">
          <span className="fg-orange-red pulsate mr-1">900</span>
          <span>MEAN tokens (90%) over 12 months</span>
        </div>
      </div>
    </>
  );

  const renderIdoForms = (
    <>
      <div className="ido-form-wrapper">
        {/* Countdown timer */}
        {(idoStartUtc && idoEndUtc && redeemStartUtc) && (
          <>
            <div className="countdown-timer">
              <div className={`text-center ${today < idoEndUtc ? 'panel1 show' : 'panel1 hide'}`}>
                <p className={`font-size-90 font-bold ${today < idoStartUtc ? 'd-block' : 'hidden'}`}>Sale period starts in <Countdown date={idoStartUtc} daysInHours={true} /></p>
                <p className={`font-size-90 font-bold ${today > idoStartUtc && today < idoEndUtc ? 'd-block' : 'hidden'}`}>Sale period ends in <Countdown date={idoEndUtc} daysInHours={false} /></p>
              </div>
              <div className={`text-center ${today > idoEndUtc && today < redeemStartUtc ? 'panel2 show' : 'panel2 hide'}`}>
                <p className={`font-size-90 font-bold`}>Claims period starts in <Countdown date={redeemStartUtc} daysInHours={true} /></p>
              </div>
            </div>
            {/* Form */}
            <div className="shadowed-box max-width">
              {
                today <= idoEndUtc
                  ? renderDepositAndWithdrawTabset
                  : renderClaimsTabset
              }
            </div>
          </>
        )}
      </div>
    </>
  );

  const renderYouAreHere = () => {
    return (
      <>
      <div className="ido-stats-marker-wrapper">
        <div className="ido-stats-marker-inner-container">
          <span className="ido-stats-marker-start">{idoStartUtc?.toUTCString()}</span>
          <span className="ido-stats-marker-end">{idoEndUtc?.toUTCString()}</span>
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

      {isLocal() && (
        <div className="debug-bar">
          <span className="ml-1">idoEngineInitStatus:</span><span className="ml-1 font-bold fg-dark-active">{idoEngineInitStatus || '-'}</span>
        </div>
      )}

      {/* Page title */}
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
                {(idoStartUtc && idoEndUtc) && (
                  <>
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
                        {(today > idoStartUtc) && renderYouAreHere()}
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
                  </>
                )}
              </div>
            </Col>

            <Col xs={24} md={8}>
              <div className="flex-column flex-center h-100 px-5 pb-5">
                {!regionLimitationAcknowledged
                  ? renderRegionAcknowledgement
                  : renderIdoForms
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
