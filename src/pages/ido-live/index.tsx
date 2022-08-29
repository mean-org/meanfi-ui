import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Button, Col, Divider, Row } from "antd";
import { PreFooter } from "../../components/PreFooter";
import {
  IDO_FETCH_FREQUENCY,
  MEAN_FINANCE_DISCORD_URL,
  MEAN_FINANCE_TWITTER_URL,
  UTC_DATE_TIME_FORMAT,
  UTC_DATE_TIME_FORMAT2
} from "../../constants";
import { useTranslation } from 'react-i18next';
import { consoleOut, isLocal, isProd, isValidAddress, percentual, toUsCurrency } from '../../middleware/ui';
import "./style.scss";
import { IdoDeposit, IdoRedeem } from '../../views';
import { IdoWithdraw } from '../../views/IdoWithdraw';
import Countdown from 'react-countdown';
import dateFormat from "dateformat";
import { useNativeAccount } from '../../contexts/accounts';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import YoutubeEmbed from '../../components/YoutubeEmbed';
import { useNavigate } from 'react-router';
import { useLocation } from 'react-router-dom';
import { useConnectionConfig } from '../../contexts/connection';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { appConfig } from '../..';
import { formatThousands, getTokenAmountAndSymbolByTokenAddress } from '../../middleware/utils';
import { CUSTOM_USDC_TEST_IDO_DEVNET, MEAN_TOKEN_LIST } from '../../constants/token-list';
import { PartnerImage } from '../../models/common-types';
import { TxConfirmationContext } from '../../contexts/transaction-status';
import { ClockCircleFilled, DoubleRightOutlined } from '@ant-design/icons';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import { openNotification } from '../../components/Notifications';

type IdoTabOption = "deposit" | "withdraw";
type ClaimsTabOption = "ido-claims" | "solanium" | "airdrop";
type IdoInitStatus = "uninitialized" | "initializing" | "started" | "stopped" | "error";

export const IdoLiveView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const [regionLimitationAcknowledged, setRegionLimitationAcknowledged] = useState(false);
  const [currentTab, setCurrentTab] = useState<IdoTabOption>("deposit");
  const [currentClaimsTab, setCurrentClaimsTab] = useState<ClaimsTabOption>("ido-claims");
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const {
    theme,
    tokenBalance,
    selectedToken,
    streamProgramAddress,
    previousWalletConnectState,
    setTheme,
    setSelectedToken,
    setSelectedTokenBalance,
    refreshTokenBalance,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
  } = useContext(TxConfirmationContext);
  const [currentTheme] = useState(theme);
  const [xPosPercent, setXPosPercent] = useState(0);
  const [currentDateDisplay, setCurrentDateDisplay] = useState('');
  const [idoAccountAddress, setIdoAccountAddress] = useState('');
  // const [idoList, setIdoList] = useState<IdoDetails[] | undefined>(undefined);
  const [idoStatus, setIdoStatus] = useState<IdoStatus | undefined>(undefined);
  const [idoDetails, setIdoDetails] = useState<IdoDetails | undefined>(undefined);
  const [idoEngineInitStatus, setIdoEngineInitStatus] = useState<IdoInitStatus>("uninitialized");
  const [idoEndUtc, setIdoEndUtc] = useState<Date | undefined>();
  const [idoStartUtc, setIdoStartUtc] = useState<Date | undefined>();
  const [redeemStartUtc, setRedeemStartUtc] = useState<Date | undefined>();
  // const [idoFinishedFireworks, setIdoFinishedFireworks] = useState(false);
  const [idoClient, setIdoClient] = useState<IdoClient | undefined>(undefined);
  const [forceRefreshIdoStatus, setForceRefreshIdoStatus] = useState(false);
  const [loadingIdoStatus, setLoadingIdoStatus] = useState(false);
  const [isVideoVisible, setIsVideoVisible] = useState(false);
  const [idoStarted, setIdoStarted] = useState(false);
  const [redeemStarted, setRedeemStarted] = useState(false);
  const [idoFinished, setIdoFinished] = useState(false);

  // Cool-off management
  const [isUserInCoolOffPeriod, setIsUserInCoolOffPeriod] = useState(true);
  const [idleTimeInSeconds, setIdleTimeInSeconds] = useState(0);
  const [coolOffPeriodCountdown, setCoolOffPeriodCountdown] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = new Date();

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
        openNotification({
          title: 'Error',
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

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    connectionConfig.endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    connectionConfig.endpoint,
    streamProgramAddress
  ]);

  useEffect(() => {
    if (isProd()) {
      const usdc = MEAN_TOKEN_LIST.filter(t => t.symbol === 'USDC' && t.chainId === 101)[0];
      if (!selectedToken || selectedToken.address !== usdc.address) {
        consoleOut('Selecting USDC');
        setSelectedToken(usdc);
      }
    } else {
      if (!selectedToken || selectedToken.address !== CUSTOM_USDC_TEST_IDO_DEVNET.address) {
        consoleOut('Selecting custom USDC');
        setSelectedToken(CUSTOM_USDC_TEST_IDO_DEVNET);
      }
    }
  },[
    selectedToken,
    setSelectedToken
  ]);

  // Create the IDO client
  useEffect(() => {
    if (!connection || !connectionConfig.endpoint || !idoAccountAddress || idoEngineInitStatus !== "uninitialized") {
      return;
    }

    setIdoEngineInitStatus("initializing");

    const startIdo = async (client: IdoClient) => {

      consoleOut('client:', client.toString(), 'brown');
  
      const idoAddressPubKey = new PublicKey(idoAccountAddress);
      const details = await client.getIdo(idoAddressPubKey);
  
      consoleOut('idoDetails:', details, 'blue');
  
      if(details === null)
      {
        setIdoEngineInitStatus("error");
        return;
      }
  
      setIdoDetails(details);
      let parsedDate = Date.parse(details.idoStartUtc);
      let fromParsedDate = new Date(parsedDate);
      consoleOut('idoStartUtc:', fromParsedDate.toUTCString(), 'crimson');
      setIdoStartUtc(fromParsedDate);

      // Turn ON video if IDO hasn't started
      if (today < fromParsedDate) {
        setIsVideoVisible(true);
      } else {
        setIsVideoVisible(false);
      }

      parsedDate = Date.parse(details.idoEndUtc);
      fromParsedDate = new Date(parsedDate);
      consoleOut('idoEndUtc:', fromParsedDate.toUTCString(), 'crimson');
      setIdoEndUtc(fromParsedDate);

      parsedDate = Date.parse(details.redeemStartUtc);
      fromParsedDate = new Date("Tue, 28 Dec 2021 19:00:00 GMT");
      // fromParsedDate = new Date(parsedDate);
      consoleOut('redeemStartUtc:', fromParsedDate.toUTCString(), 'crimson');
      setRedeemStartUtc(fromParsedDate);

      setIdoEngineInitStatus("started");
    }

    const client = new IdoClient(
      connectionConfig.endpoint,
      publicKey || undefined,
      { commitment: "confirmed" },
      isLocal() ? true : false
    );
    consoleOut('client:', client ? client.toString() : 'none', 'brown');
    setIdoClient(client);
    startIdo(client);

  }, [
    today,
    publicKey,
    connection,
    idoAccountAddress,
    connectionConfig.endpoint,
    idoEngineInitStatus
  ]);

  // Get list of idos
  /*
  useEffect(() => {

    if (!idoClient) { return; }

    const getIdos = async () => {
      try {
        const idos = await idoClient.listIdos();
        if (idos && idos.length > 0) {
          setIdoList(idos);
        } else {
          setIdoList(undefined);
        }
      } catch (error) {
        console.error(error);
      }
    }

    if (!idoList) {
      getIdos();
    }
  }, [
    publicKey,
    idoClient,
    idoList
  ]);
  */

  // Fetches the IDO status
  const refreshIdoData = useCallback(async () => {
    if (!idoClient || !idoAccountAddress || idoEngineInitStatus !== "started") {
      return;
    }

    const getIdoState = async () => {
      const idoPk = new PublicKey(idoAccountAddress);
      try {
        const idoState = await idoClient.getIdoStatus(idoPk);
        consoleOut('idoStatus:', idoState, 'blue');
        setIdoStatus(idoState);
      } catch (error: any) {
        console.error(error);
        setIdoEngineInitStatus("error");
      } finally {
        setLoadingIdoStatus(false);
      }
    }

    getIdoState();
  }, [
    idoClient,
    idoAccountAddress,
    idoEngineInitStatus,
  ]);

  // IDO fetch status timeout
  useEffect(() => {
    let timer: any;

    if (idoEngineInitStatus === "started" && (!idoStatus || forceRefreshIdoStatus)) {
      if (forceRefreshIdoStatus) {
        setForceRefreshIdoStatus(false);
      }
      setLoadingIdoStatus(true);
      refreshIdoData();
    }

    if (idoEngineInitStatus === "started") {
      timer = setInterval(() => {
        consoleOut(`Fetching IDO status past ${IDO_FETCH_FREQUENCY / 60 / 1000} min`);
        setLoadingIdoStatus(true);
        refreshIdoData();
      }, IDO_FETCH_FREQUENCY);
    }

    return () => clearInterval(timer);
  }, [
    idoStatus,
    idoEngineInitStatus,
    forceRefreshIdoStatus,
    refreshIdoData
  ]);

  const isIdoActive = useCallback(() => {
    return idoStartUtc && idoEndUtc && today > idoStartUtc && today < idoEndUtc
      ? true
      : false;
  }, [
    today,
    idoEndUtc,
    idoStartUtc,
  ]);

  const isUserInGa = useCallback(() => {
    return publicKey && idoStatus && idoStatus.userIsInGa
      ? true
      : false;
  }, [
    idoStatus,
    publicKey
  ]);

  // Perform every second calculations ("You are here" chart data tooltip position)
  useEffect(() => {

    if (!idoDetails || !idoStartUtc || !idoEndUtc) { return; }

    const timeout = setTimeout(() => {
      const totalTime = idoDetails.idoDurationInSeconds * 1000;
      const elapsed = today.getTime() - idoStartUtc.getTime();
      const percent = percentual(elapsed, totalTime);
      if (today >= idoEndUtc) {
        setXPosPercent(100);
        setCurrentDateDisplay(dateFormat(idoEndUtc, UTC_DATE_TIME_FORMAT));
      } else {
        setXPosPercent(percent);
        setCurrentDateDisplay(dateFormat(today, UTC_DATE_TIME_FORMAT));
      }
      if (coolOffPeriodCountdown) {
        setCoolOffPeriodCountdown(value => value - 1);
      }
    }, 1000);

    return () => {
      clearTimeout(timeout);
    }

  }, [
    today,
    idoEndUtc,
    idoDetails,
    idoStartUtc,
    coolOffPeriodCountdown,
  ]);

  // Turn ON fireworks when needed
  // useEffect(() => {

  //   const forceRefreshData = () => {
  //     const refreshCtaElement = document.getElementById("refresh-data-cta");
  //     if (refreshCtaElement) {
  //       refreshCtaElement.click();
  //     }
  //   }

  //   if (!redeemStarted) {
  //     setRedeemStarted(true);
  //   }

  //   if (!idoFinished && regionLimitationAcknowledged) {
  //     setIdoFinished(true);
  //     consoleOut('Setting fireworks ON...', '', 'blue');
  //     setIdoFinishedFireworks(true);
  //     forceRefreshData();
  //   }

  // }, [
  //   idoEndUtc,
  //   idoFinished,
  //   redeemStarted,
  //   regionLimitationAcknowledged,
  // ]);

  // Turn OFF fireworks
  // useEffect(() => {
  //   let timeout: any;

  //   if (idoFinishedFireworks) {
  //     timeout = setTimeout(() => {
  //       consoleOut('Setting fireworks OFF...', '', 'blue');
  //       setIdoFinishedFireworks(false);
  //     }, 7000);
  //   }

  //   return () => {
  //     clearTimeout(timeout);
  //   }

  // }, [idoFinishedFireworks]);

  // Set coolOff flag
  useEffect(() => {

    let inCoolOff = false;

    if (idoDetails && idoStatus && idoStartUtc && idoDetails.coolOffPeriodInSeconds) {
      const now = today.getTime();
      let lastActivityTs = 0;
      if (idoStatus.userContributionUpdatedTs) {
        // Use user's last contribution TS
        lastActivityTs = new Date(idoStatus.userContributionUpdatedTs * 1000).getTime();
      } else if (idoStatus.userHasContributed) {
        // If user hasn contributed but there is no last contribution TS (when they retire from IDO), use now.
        lastActivityTs = now;
      } else {
        // When IDO just started shift by coolOffPeriodInSeconds to avoid an initial cool-off
        let startSeconds = idoStartUtc.getTime() / 1000;
        startSeconds += idoDetails.coolOffPeriodInSeconds;
        lastActivityTs = new Date(startSeconds * 1000).getTime();
      }
      const diff = Math.floor(now / 1000) - Math.floor(lastActivityTs / 1000);
      const elapsed = diff > 0 ? diff : 0;
      setIdleTimeInSeconds(elapsed);
      if (elapsed > 0 && elapsed <= idoDetails.coolOffPeriodInSeconds) {
        inCoolOff = true;
        if (coolOffPeriodCountdown <= 1) {
          setCoolOffPeriodCountdown(elapsed);
        }
      }
    }
    setIsUserInCoolOffPeriod(inCoolOff);

  }, [
    today,
    idoStatus,
    idoDetails,
    idoStartUtc,
    coolOffPeriodCountdown
  ]);

  // Set IDO started flag
  useEffect(() => {
    if (!idoStartUtc || today < idoStartUtc || idoStarted) {
      return;
    }

    // Turn OFF video if IDO started
    if (today >= idoStartUtc) {
      setIdoStarted(true);
      setIsVideoVisible(false);
      consoleOut('IDO started!', '', 'purple');
    }

  }, [
    today,
    idoStarted,
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
        if (isProd()) {
          const usdc = MEAN_TOKEN_LIST.filter(t => t.symbol === 'USDC' && t.chainId === 101)[0];
          if (!selectedToken || selectedToken.address !== usdc.address) {
            consoleOut('Selecting USDC');
            setSelectedToken(usdc);
          }
        } else {
          if (!selectedToken || selectedToken.address !== CUSTOM_USDC_TEST_IDO_DEVNET.address) {
            consoleOut('Selecting custom USDC');
            setSelectedToken(CUSTOM_USDC_TEST_IDO_DEVNET);
          }
        }
        setIdoEngineInitStatus("uninitialized");
        setForceRefreshIdoStatus(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setIsUserInCoolOffPeriod(false);
        setCoolOffPeriodCountdown(0);
        setSelectedTokenBalance(0);
        setIdoEngineInitStatus("uninitialized");
        setForceRefreshIdoStatus(true);
      }
    }

  }, [
    connected,
    publicKey,
    idoClient,
    selectedToken,
    previousWalletConnectState,
    setSelectedTokenBalance,
    refreshTokenBalance,
    setSelectedToken,
  ]);

  // Handle what to do when pending Tx confirmation reaches finality or on error
  useEffect(() => {
    if (!publicKey) { return; }

    if (lastSentTxSignature && (fetchTxInfoStatus === "fetched" || fetchTxInfoStatus === "error")) {
      setTimeout(() => {
        consoleOut('Refreshing IDO status...', '', 'blue');
        setLoadingIdoStatus(true);
        refreshIdoData();
      }, 800);
    }
  }, [
    publicKey,
    fetchTxInfoStatus,
    lastSentTxSignature,
    refreshIdoData
  ]);

  // Refresh IDO status when starting
  useEffect(() => {
    if (today === idoStartUtc) {
      refreshIdoData();
    }
  },[
    today,
    idoStartUtc,
    refreshIdoData
  ]);

  const onAcknowledgeRegionLimitations = () => {
    consoleOut('Clicked on Acknowledge');
    setRegionLimitationAcknowledged(true);
  }

  const onTabChange = (option: IdoTabOption) => {
    setCurrentTab(option);
  }

  const onClaimsTabChange = (option: ClaimsTabOption) => {
    setCurrentClaimsTab(option);
  }

  const partnerImages = useMemo((): PartnerImage[] => {
    return [
      {fileName: "three-arrows.png", size: "small"},
      {fileName: "defiance.png", size: "small"},
      {fileName: "softbank.png", size: "tiny"},
      {fileName: "svc.png", size: "tiny"},
      {fileName: "solar-eco-fund.png", size: "small"},
      {fileName: "sesterce.png", size: "tiny"},
      {fileName: "bigbrainholdings.png", size: "small"},
      {fileName: "gerstenbrot.png", size: "small"},
      {fileName: "bts-capital.png", size: "small"},
      {fileName: "a41.png", size: "small"},
      {fileName: "gateio-labs.png", size: "small"},
      {fileName: "MEXC.png", size: "small"},
      {fileName: "pet-rock.png", size: "normal"},
      {fileName: "prime-block.png", size: "small"},
      {fileName: "r8-capital.png", size: "small"},
      {fileName: "solanium.png", size: "small"},
    ];
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

  const renderRegionAcknowledgement = (showCta = true) => {
    return (
      <>
        <div className="text-center px-5 mt-3">
          <h2 className="subheading ido-subheading">The Mean IDO can only be accessed from select countries.</h2>
        </div>
        <p className="text-center">By clicking acknowledge below, I certify that I am not a resident of Afghanistan, Ivory Coast, Cuba, Iraq, Iran, Liberia, North Korea, Syria, Sudan, South Sudan, Zimbabwe, Antigua, United States, American Samoa, Guam, Northern Mariana Islands, Puerto Rico, United States Minor Outlying Islands, US Virgin Islands, Ukraine, Belarus, Albania, Burma, Central African Republic, Democratic Republic of Congo, Lybia, Somalia, Yemen, United Kingdom, Thailand.</p>
        <p className="text-center">If you have any questions, please contact us via <a className="secondary-link" href={MEAN_FINANCE_TWITTER_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.twitter')}</a>, or <a className="secondary-link" href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.discord')}</a>.</p>
        {showCta && (
          <Button
            className="main-cta"
            type="primary"
            shape="round"
            size="large"
            onClick={() => onAcknowledgeRegionLimitations()}>
            Acknowledge
          </Button>
        )}
      </>
    );
  }

  const renderForm = () => {
    if (!idoStatus || !idoDetails) { return null; }
    if (currentTab === "deposit") {
      return <IdoDeposit
        connection={connection}
        idoClient={idoClient}
        idoDetails={idoDetails}
        idoStatus={idoStatus}
        disabled={!isIdoActive() || fetchTxInfoStatus === "fetching"}
        selectedToken={selectedToken}
        tokenBalance={tokenBalance}
      />;
    } else {
      return <IdoWithdraw
        connection={connection}
        idoClient={idoClient}
        idoDetails={idoDetails}
        idoStatus={idoStatus}
        isUserInCoolOffPeriod={isUserInCoolOffPeriod}
        coolOffPeriodCountdown={coolOffPeriodCountdown}
        disabled={!isIdoActive() || fetchTxInfoStatus === "fetching" || coolOffPeriodCountdown > 0 || !idoStatus.userUsdcContributedAmount}
        selectedToken={selectedToken}
      />;
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

  const renderClaimsForms = () => {
    if (!idoStatus || !idoDetails || !idoEndUtc || !redeemStartUtc) { return null; }
    switch (currentClaimsTab) {
      case "ido-claims":
        return (
          <IdoRedeem
            connection={connection}
            idoClient={idoClient}
            idoDetails={idoDetails}
            idoStatus={idoStatus}
            moneyStreamingClient={ms}
            idoFinished={today > idoEndUtc}
            redeemStarted={today > redeemStartUtc}
            disabled={today < idoEndUtc || fetchTxInfoStatus === "fetching"}
            selectedToken={selectedToken}
          />
        );
      // case "airdrop":
      //   return (
      //     <AirdropRedeem
      //       connection={connection}
      //       idoClient={idoClient}
      //       idoDetails={idoDetails}
      //       idoStatus={idoStatus}
      //       redeemStarted={today > redeemStartUtc}
      //       disabled={today < redeemStartUtc || fetchTxInfoStatus === "fetching"}
      //       nativeBalance={nativeBalance}
      //       selectedToken={selectedToken}
      //     />
      //   );
      default:
        return null;
    }
  }

  const renderClaimsTabset = (
    <>
      <div className="button-tabset-container">
        <div className="tab-button" onClick={() => onClaimsTabChange("ido-claims")}>
          IDO
        </div>
        {/* <div className={`tab-button ${currentClaimsTab === "airdrop" ? 'active' : ''}`} onClick={() => onClaimsTabChange("airdrop")}>
          Airdrop
        </div> */}
      </div>
      <div className="redeem-inner-area">
        {renderClaimsForms()}
      </div>
    </>
  );

  const renderIdoForms = (
    <>
      <div className="ido-form-wrapper">
        {(idoStartUtc && idoEndUtc && redeemStartUtc) && (
          <>
            {/* Countdown timer */}
            <div className="countdown-timer">
              <div className={`text-center ${today < idoEndUtc ? 'panel1 show' : 'panel1 hide'}`}>
                <p className={`font-size-100 font-regular ${today < idoStartUtc ? 'd-block' : 'hidden'}`}>
                  <ClockCircleFilled className="fg-warning font-size-130 align-middle pulsate-fast mr-1" />
                  <span className="align-middle">Sale period starts in&nbsp;</span>
                  <Countdown className="align-middle" date={idoStartUtc} daysInHours={true} />
                </p>
                <p className={`font-size-100 font-regular ${today > idoStartUtc && today < idoEndUtc ? 'd-block' : 'hidden'}`}>
                  <ClockCircleFilled className="fg-warning font-size-130 align-middle pulsate-fast mr-1" />
                  <span className="align-middle">Sale period ends in&nbsp;</span>
                  <Countdown className="align-middle" date={idoEndUtc} daysInHours={false} />
                </p>
              </div>
              <div className={`text-center ${today > idoEndUtc && today < redeemStartUtc ? 'panel2 show' : 'panel2 hide'}`}>
                <p className={`font-size-100 font-regular`}>
                  <span className="align-middle">Claims period starts in&nbsp;</span>
                  <Countdown className="align-middle" date={redeemStartUtc} daysInHours={true} />
                </p>
              </div>
            </div>

            {/* Show forms based on timeline */}
            <div className="shadowed-box max-width">
              <div className={`vertical-panel-gradient-overlay ${publicKey && idoStatus && regionLimitationAcknowledged && (isIdoActive() || (redeemStarted && idoStatus.userIsInGa)) ? 'wave' : ''}`}>
              </div>
              {
                /**
                 * If previous to the IDO start and during the IDO, show [DEPOSIT] | [WITHDRAW] tabset
                 * if past beyond the IDO end time, show the [IDO] | [Solanium] | [Airdrop] tabset
                 */
                today <= idoEndUtc
                  ? renderDepositAndWithdrawTabset
                  : renderClaimsTabset
              }
            </div>

            {/* Data refresh CTA */}
            <div className="mt-2 text-center">
              <span id="refresh-data-cta" className={`simplelink ${loadingIdoStatus ? 'fg-orange-red pulsate click-disabled' : 'underline-on-hover'}`} onClick={() => {
                setLoadingIdoStatus(true);
                refreshIdoData();
              }}>Refresh data</span>
            </div>
          </>
        )}
      </div>
    </>
  );

  const renderYouAreHere = () => {
    return (
      <>
      {idoStartUtc && idoEndUtc && idoStatus && (
        <div className="ido-stats-marker-wrapper">
          <div className="ido-stats-marker-inner-container">
            <span className="ido-stats-marker-start">{dateFormat(idoStartUtc, UTC_DATE_TIME_FORMAT2)}</span>
            <span className="ido-stats-marker-end">{dateFormat(idoEndUtc, UTC_DATE_TIME_FORMAT2)}</span>
            <span className="ido-stats-marker" style={{left: `${xPosPercent}%`}}></span>
            <div className="ido-stats-tooltip" style={{left: `${xPosPercent}%`}}>
              <div className="text-center">
                <div>{currentDateDisplay}{(today > idoStartUtc && today < idoEndUtc) && (<span className="ml-1"><DoubleRightOutlined className="bounce-right" /></span>)}</div>
              </div>
              <Divider />
              {idoStatus && (
                <>
                  <div className="flex-fixed-right">
                    <div className="left">Bonded Price</div>
                    <div className="right">{toUsCurrency(idoStatus.currentMeanPrice)}</div>
                  </div>
                  <div className="flex-fixed-right">
                    <div className="left">Max Contrib. Allowed</div>
                    <div className="right">{toUsCurrency(idoStatus.currentMaxUsdcContribution)}</div>
                  </div>
                  <div className="flex-fixed-right">
                    <div className="left">Total Participants</div>
                    <div className="right">{formatThousands(idoStatus.totalContributors)}</div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  const renderVideo = (
    <>
      <div className="boxed-area container-max-width-640 mb-4 mt-4">
        <YoutubeEmbed embedId="yBiaK0pdOHw" />
      </div>
    </>
  );

  // const idoItemsMenu = (
  //   <>
  //     {idoList && idoList.length > 0 ? (
  //       <Menu>
  //         {idoList.map((item: IdoDetails, index: number) => {
  //           return (
  //             <Menu.Item
  //               key={`${index}`}
  //               onClick={() => {
  //                 consoleOut('Selected IDO address:', item.idoAddress, 'blue');
  //               }}>
  //               {item.idoAddress}
  //             </Menu.Item>
  //           );
  //         })}
  //       </Menu>
  //     ) : null}
  //   </>
  // );

  return (
    <>
      {/* <div className={`ido-overlay ${regionLimitationAcknowledged && idoFinishedFireworks ? 'active' : '' }`}>
        {idoFinishedFireworks && (
          <div id="pyro">
            <div className="before"></div>
            <div className="after"></div>
            <h1 className="heading ido-heading text-center mb-0">Yay! 🥳🥳🥳 We made it!<br/><br/>The Mean IDO has concluded ✅<br/>The Mean Life has just begun 😎</h1>
          </div>
        )}
      </div> */}
      <div className={`solid-bg position-relative`}>

        {/* {isLocal() && (
          <>
            <div className="debug-bar">
              <Button
                type="default"
                shape="circle"
                size="small"
                icon={<SettingOutlined style={{ fontSize: 14 }} />}
                onClick={() => {
                  consoleOut('Setting fireworks ON...', '', 'blue');
                  setIdoFinishedFireworks(true);
                }}
              />
              <span className="ml-1">idleTimeInSeconds:</span><span className="ml-1 font-bold fg-dark-active">{idleTimeInSeconds || '-'}</span>
              <span className="ml-1">coolOffPeriodInSeconds:</span><span className="ml-1 font-bold fg-dark-active">{idoDetails ? idoDetails.coolOffPeriodInSeconds : '-'}</span>
              <span className="ml-1">coolOffPeriodCountdown:</span><span className="ml-1 font-bold fg-dark-active">{coolOffPeriodCountdown || '-'}</span>
              <span className="ml-1">redeemStarted:</span><span className="ml-1 font-bold fg-dark-active">{redeemStarted ? 'true' : 'false'}</span>
              <span className="ml-1">idoFinishedFireworks:</span><span className="ml-1 font-bold fg-dark-active">{idoFinishedFireworks ? 'true' : 'false'}</span>
            </div>
          </>
        )} */}

        {/* Page title */}
        <section className="content contrast-section no-padding">
          <div className="container">
            <div className="heading-section">
              {idoStartUtc && idoEndUtc && today > idoEndUtc ? (
                <h1 className="heading ido-heading text-center mb-0">The Mean <span className="fg-primary-highlight">IDO</span> already finished</h1>
              ) : (
                <h1 className="heading ido-heading text-center mb-0">Welcome to the Mean <span className="fg-primary-highlight">IDO</span></h1>
              )}
            </div>
          </div>
        </section>

        <section className="content contrast-section pt-5 pb-5">
          <div className="container">

            {(idoStartUtc && idoEndUtc) ? (
              <Row>
                <Col xs={24} lg={today > idoEndUtc ? 12 : 16}>
                  <div className="flex-column flex-center ido-column">
                    {today < idoStartUtc
                      ? renderVideo
                      : today > idoEndUtc ? (
                        <>
                        {(idoStatus && selectedToken) && (
                          <div className="left-column-summary">
                            {infoRow(
                              'Ended on',
                              dateFormat(idoEndUtc, UTC_DATE_TIME_FORMAT)
                            )}
                            {infoRow(
                              'USDC Contributed',
                              getTokenAmountAndSymbolByTokenAddress(
                                idoStatus.gaTotalUsdcContributed,
                                selectedToken.address,
                                true
                              )
                            )}
                            {infoRow(
                              'MEAN tokens sold',
                              getTokenAmountAndSymbolByTokenAddress(
                                idoStatus.finalMeanPurchasedAmount,
                                '',
                                true
                              )
                            )}
                            {infoRow(
                              'Final token price',
                              idoStatus.finalMeanPrice
                                ? getTokenAmountAndSymbolByTokenAddress(
                                    idoStatus.finalMeanPrice,
                                    selectedToken.address
                                  )
                                : '-'
                            )}
                            {infoRow(
                              'Number of participants',
                              idoStatus ? formatThousands(idoStatus.totalContributors) : '0'
                            )}
                          </div>
                        )}
                        </>
                      ) : (
                      <>
                        <div className="text-center">
                          {isVideoVisible ? (
                            <span className="simplelink underline" onClick={() => setIsVideoVisible(false)}>See the real-time state of the IDO</span>
                            ) : (
                            <span className="simplelink underline" onClick={() => setIsVideoVisible(true)}>Watch a video explaining how it works</span>
                          )}
                        </div>
                        {isVideoVisible ? renderVideo : (
                          <div className="ido-stats-container">
                            {idoStatus && (
                              <>
                                <img className={`ido-stats-image ${idoStatus.gaIsOpen ? 'd-inline' : 'd-none'}`} src="/assets/mean-bonding-curves-ga-open.png" alt="IDO Stats - GA open" />
                                <img className={`ido-stats-image ${idoStatus.gaIsOpen ? 'd-none' : 'd-inline'}`} src="/assets/mean-bonding-curves-ga-closed.png" alt="IDO Stats -  GA closed" />
                              </>
                            )}
                            {(today > idoStartUtc) && renderYouAreHere()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </Col>
                <Col xs={24} lg={today > idoEndUtc ? 12 : 8}>
                  <div className="flex-column flex-center ido-column">
                    {idoDetails && !regionLimitationAcknowledged
                      ? renderRegionAcknowledgement(true)
                      : !idoDetails
                        ? renderRegionAcknowledgement(false)
                        : renderIdoForms
                    }
                  </div>
                </Col>
              </Row>
            ) : (
              <Row>
                <Col xs={24} lg={15}>
                  <div className="flex-column flex-center ido-column">{renderVideo}</div>
                </Col>
                <Col xs={24} lg={9}>
                  <div className="flex-column flex-center ido-column">
                    {renderRegionAcknowledgement(false)}
                  </div>
                </Col>
              </Row>
            )}

          </div>
        </section>

        <section className="content">
          <div className="container">
            <h1 className="heading ido-heading text-center">Investors</h1>
            <Row gutter={[32, 32]} justify="center" align="middle">
              {partnerImages.map((image: PartnerImage, index: number) => {
                return (
                  <Col key={`${index}`} className="partner flex-center">
                    <img
                      className={`partner-logo ${image.size} grayscale`}
                      src={`/assets/investors/${image.fileName}`}
                      alt={image.fileName} />
                  </Col>
                );
              })}
            </Row>
          </div>
        </section>

        <PreFooter />
      </div>
    </>
  );

};
