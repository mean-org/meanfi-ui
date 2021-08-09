import React, { useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./../../App.less";
import { Layout } from "antd";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";
import { PublicKey } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { listStreams } from "money-streaming/src/utils";
import { notify } from "../../utils/notifications";
import { consoleOut } from "../../utils/ui";

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
  const { connected, publicKey } = useWallet();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const [previousChain, setChain] = useState("");

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

  // Effect to go to streams on wallet connect if there are streams available
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        consoleOut('User is connecting...', '', 'blue');
        if (publicKey) {
          const programId = new PublicKey(streamProgramAddress);
          setLoadingStreams(true);
          listStreams(connection, programId, publicKey, publicKey, 'confirmed', true)
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
        refreshTokenBalance();
        if (location.pathname === '/transfers') {
          setCurrentScreen('contract');
        }
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
    setPreviousWalletConnectState
  ]);

  return (
    <>
    <div className="App wormhole-bg">
      <Layout>
        <Header className="App-Bar">
          <BackButton />
          <Link to="/">
            <div className="app-title simplelink">
              <img className="app-logo" src={theme === 'dark' ? 'assets/mean-pay-logo-color-light.svg' : 'assets/mean-pay-logo-color-dark.svg'} alt="Mean Finance" />
            </div>
          </Link>
          <AppBar />
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
