import React, { useCallback, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./../../App.less";
import { AppConfig } from "../..";
import { Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";
import { PublicKey } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { listStreams } from "money-streaming/lib/utils";
import { notify } from "../../utils/notifications";
import { consoleOut } from "../../utils/ui";
import { InfluxDB, Point } from '@influxdata/influxdb-client';
import { isMobile, isDesktop, isTablet, browserName } from "react-device-detect";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const location = useLocation();
  const {
    theme,
    streamList,
    streamProgramAddress,
    previousWalletConnectState,
    setStreamList,
    setStreamDetail,
    setCurrentScreen,
    setLoadingStreams,
    setSelectedStream,
    refreshTokenBalance,
    setPreviousWalletConnectState
  } = useContext(AppStateContext);

  const { t } = useTranslation('common');
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { provider, connected, publicKey } = useWallet();
  const [previousChain, setChain] = useState("");

  const getPlatform = (): string => {
    return isDesktop ? 'Desktop' : isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Other';
  }

  const sendConnectionMetric = useCallback((address: string) => {
    const url = AppConfig.getConfig().influxDbUrl;
    const token = AppConfig.getConfig().influxDbToken;
    const org = AppConfig.getConfig().influxDbOrg;
    const bucket = AppConfig.getConfig().influxDbBucket;
    const writeApi = new InfluxDB({url, token}).getWriteApi(org, bucket);
    const data = {
      platform: getPlatform(),
      browser: browserName,
      'wallet_address': address,
      'wallet_type': provider?.name || 'Other'
    };
    writeApi.useDefaultTags({
      platform: getPlatform(),
      browser: browserName
    });

    const point1 = new Point('wallet_account_connections')
      .tag('wallet_address', address)
      .tag('wallet_type', provider?.name || 'Other')
      .intField('value', 1);

    writeApi.writePoint(point1);

    // flush pending writes and close writeApi
    writeApi
      .close()
      .then(() => {
        consoleOut('InfluxDB write API - WRITE FINISHED', data, 'green');
      })
      .catch(e => {
        consoleOut('InfluxDB write API - WRITE FAILED', e, 'red');
      })
  }, [provider]);

  // Effect Network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      console.log(`%cCluster:`, 'color:brown', connectionConfig.env);
    }

    return () => {};
  }, [
    previousChain,
    connectionConfig
  ]);

  // Hook on the wallet connect/disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('User is connecting...', '', 'blue');
        if (publicKey) {
          sendConnectionMetric(publicKey.toBase58());
          const programId = new PublicKey(streamProgramAddress);
          setLoadingStreams(true);
          listStreams(connection, programId, publicKey, publicKey)
            .then(async streams => {
              setStreamList(streams);
              setLoadingStreams(false);
              console.log('Home -> streamList:', streams);
              setSelectedStream(streams[0]);
              setStreamDetail(streams[0]);
              if (streams && streams.length > 0 && location.pathname === '/transfers') {
                consoleOut('streams are available, opening streams...', '', 'blue');
                setCurrentScreen('streams');
              }
            });
        }
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setPreviousWalletConnectState(false);
        setStreamList([]);
        if (location.pathname === '/transfers') {
          setCurrentScreen('contract');
        }
        refreshTokenBalance();
        notify({
          message: t('notifications.wallet-connection-event-title'),
          description: t('notifications.wallet-disconnect-message'),
          type: 'info'
        });
      }
    }

    return () => {};
  }, [
    location,
    connection,
    publicKey,
    connected,
    streamList,
    streamProgramAddress,
    previousWalletConnectState,
    t,
    setStreamList,
    setStreamDetail,
    setCurrentScreen,
    setSelectedStream,
    setLoadingStreams,
    refreshTokenBalance,
    sendConnectionMetric,
    setPreviousWalletConnectState
  ]);

  return (
    <>
    <div className="App wormhole-bg">
      <Layout>
        <Header className="App-Bar">
          <BackButton />
          <div className="app-bar-inner">
            <Link to="/">
              <div className="app-title simplelink">
                <img className="app-logo" src={theme === 'dark' ? 'assets/mean-pay-logo-color-light.svg' : 'assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
              </div>
            </Link>
            <AppBar menuType="desktop" />
          </div>
          <AppBar menuType="mobile" />
        </Header>
        <Content>{props.children}</Content>
        <Footer>
          <FooterBar/>
        </Footer>
      </Layout>
    </div>
    </>
  );
});
