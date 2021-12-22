import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PreFooter } from "../../components/PreFooter";
import {
  IDO_FETCH_FREQUENCY,
} from "../../constants";
import { consoleOut, isLocal, isProd, isValidAddress } from '../../utils/ui';
import "./style.less";
import { IdoLpDeposit } from '../../views';
import Countdown from 'react-countdown';
import { useNativeAccount } from '../../contexts/accounts';
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { AppStateContext } from '../../contexts/appstate';
import { useWallet } from '../../contexts/wallet';
import { useNavigate } from 'react-router';
import { useLocation } from 'react-router-dom';
import { notify } from '../../utils/notifications';
import { useConnectionConfig } from '../../contexts/connection';
import { IdoClient, IdoDetails, IdoStatus } from '../../integrations/ido/ido-client';
import { appConfig } from '../..';
import { CUSTOM_USDC, MEAN_TOKEN_LIST } from '../../constants/token-list';
import { TransactionStatusContext } from '../../contexts/transaction-status';
import { ClockCircleFilled } from '@ant-design/icons';

type IdoInitStatus = "uninitialized" | "initializing" | "started" | "stopped" | "error";

export const IdoLpView = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const { account } = useNativeAccount();
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);
  const [nativeBalance, setNativeBalance] = useState(0);
  const {
    theme,
    tokenBalance,
    selectedToken,
    previousWalletConnectState,
    setTheme,
    setSelectedToken,
    setSelectedTokenBalance,
    refreshTokenBalance,
  } = useContext(AppStateContext);
  const {
    fetchTxInfoStatus,
    lastSentTxSignature,
  } = useContext(TransactionStatusContext);
  const [currentTheme] = useState(theme);
  const [idoAccountAddress, setIdoAccountAddress] = useState('');
  const [idoStatus, setIdoStatus] = useState<IdoStatus | undefined>(undefined);
  const [idoDetails, setIdoDetails] = useState<IdoDetails | undefined>(undefined);
  const [idoEngineInitStatus, setIdoEngineInitStatus] = useState<IdoInitStatus>("uninitialized");
  const [idoEndUtc, setIdoEndUtc] = useState<Date | undefined>();
  const [idoStartUtc, setIdoStartUtc] = useState<Date | undefined>();
  const [redeemStartUtc, setRedeemStartUtc] = useState<Date | undefined>();
  const [idoClient, setIdoClient] = useState<IdoClient | undefined>(undefined);
  const [forceRefreshIdoStatus, setForceRefreshIdoStatus] = useState(false);
  const [loadingIdoStatus, setLoadingIdoStatus] = useState(false);
  const [idoStarted, setIdoStarted] = useState(false);

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

  // Use USDC or custom USDC based on environment
  useEffect(() => {
    if (isProd()) {
      const usdc = MEAN_TOKEN_LIST.filter(t => t.symbol === 'USDC' && t.chainId === 101)[0];
      if (!selectedToken || selectedToken.address !== usdc.address) {
        consoleOut('Selecting USDC');
        setSelectedToken(usdc);
      }
    } else {
      if (!selectedToken || selectedToken.address !== CUSTOM_USDC.address) {
        consoleOut('Selecting custom USDC');
        setSelectedToken(CUSTOM_USDC);
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

      parsedDate = Date.parse(details.idoEndUtc);
      fromParsedDate = new Date(parsedDate);
      consoleOut('idoEndUtc:', fromParsedDate.toUTCString(), 'crimson');
      setIdoEndUtc(fromParsedDate);
  
      parsedDate = Date.parse(details.redeemStartUtc);
      fromParsedDate = new Date(parsedDate);
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

  // Set IDO started flag
  useEffect(() => {
    if (!idoStartUtc || today < idoStartUtc || idoStarted) {
      return;
    }

    // Turn OFF video if IDO started
    if (today >= idoStartUtc) {
      setIdoStarted(true);
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
        setSelectedToken(CUSTOM_USDC);
        setIdoEngineInitStatus("uninitialized");
        setForceRefreshIdoStatus(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setSelectedTokenBalance(0);
        setIdoEngineInitStatus("uninitialized");
        setForceRefreshIdoStatus(true);
      }
    }

  }, [
    connected,
    publicKey,
    idoClient,
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

  const isIdoActive = () => {
    return idoStartUtc && idoEndUtc && today > idoStartUtc && today < idoEndUtc
      ? true
      : false;
  }

  const renderIdoForms = (
    <>
      <div className="ido-form-wrapper">
        {(idoStartUtc && idoEndUtc && redeemStartUtc && idoDetails && idoStatus) && (
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
            </div>

            {/* Show forms based on timeline */}
            <div className="shadowed-box max-width">
              <IdoLpDeposit
                connection={connection}
                idoClient={idoClient}
                idoDetails={idoDetails}
                idoStatus={idoStatus}
                disabled={!isIdoActive() || fetchTxInfoStatus === "fetching"}
                selectedToken={selectedToken}
                tokenBalance={tokenBalance}
              />
            </div>

            {/* Data refresh CTA */}
            <div className="mt-2 text-center">
              <span className={`simplelink ${loadingIdoStatus ? 'fg-orange-red pulsate click-disabled' : 'underline-on-hover'}`} onClick={() => {
                setLoadingIdoStatus(true);
                refreshIdoData();
              }}>Refresh data</span>
            </div>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      <div className="solid-bg">

        <section className="content contrast-section pt-5 pb-5">
          <div className="container">

            {(idoStartUtc && idoEndUtc && idoDetails) && (
              <div className="flex-column flex-center ido-column">
                {renderIdoForms}
              </div>
            )}

          </div>
        </section>

        <PreFooter />
      </div>
    </>
  );

};
