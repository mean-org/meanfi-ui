import { PublicKey } from "@solana/web3.js";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppStateContext } from "../../contexts/appstate";
import { PreFooter } from '../../components/PreFooter';
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { listStreams } from "money-streaming/src/utils";
import { notify } from "../../utils/notifications";
import { consoleOut } from "../../utils/ui";
import { Streams } from "../screens";
import { Redirect } from "react-router-dom";

export const StreamsView = () => {
  const {
    streamList,
    streamProgramAddress,
    previousWalletConnectState,
    setStreamList,
    setStreamDetail,
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
  const [redirect, setRedirect] = useState<string | null>(null);

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
              if (!streams || streams.length === 0) {
                setRedirect('/transfers');
              }
            });
        }
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setPreviousWalletConnectState(false);
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
    connection,
    publicKey,
    connected,
    streamList,
    streamProgramAddress,
    previousWalletConnectState,
    t,
    setStreamList,
    setStreamDetail,
    setSelectedStream,
    setLoadingStreams,
    refreshTokenBalance,
    setPreviousWalletConnectState
  ]);

  return (
    <>
    {redirect && (<Redirect to={redirect} />)}
    <div className="container main-container">
      <div className="interaction-area">
        <Streams />
      </div>
    </div>
    <PreFooter />
    </>
  );

};
