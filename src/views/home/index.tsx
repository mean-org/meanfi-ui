import { PublicKey } from "@solana/web3.js";
import { useCallback, useContext, useEffect, useState } from "react";
import { ContractSelectorModal } from "../../components/ContractSelectorModal";
import { useNativeAccount } from "../../contexts/accounts";
import { AppStateContext } from "../../contexts/appstate";
import { useConnection, useConnectionConfig } from "../../contexts/connection";
import { useWallet } from "../../contexts/wallet";
import { IconCaretDown } from "../../Icons";
import { listStreams } from "../../money-streaming/utils";
import { consoleOut } from "../../utils/ui";
import { OneTimePayment, RepeatingPayment, PayrollPayment, Streams } from "../screens";

export const HomeView = () => {
  const {
    currentScreen,
    contract,
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

  const { connected, publicKey } = useWallet();
  const connection = useConnection();
  const connectionConfig = useConnectionConfig();
  const { account } = useNativeAccount();
  const [previousChain, setChain] = useState("");
  const [previousBalance, setPreviousBalance] = useState(account?.lamports);

  // Contract switcher modal
  const [isContractSelectorModalVisible, setIsContractSelectorModalVisibility] = useState(false);
  const showContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(true), []);
  const closeContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(false), []);
  const onAcceptContractSelector = () => {
    // Do something and close the modal
    closeContractSelectorModal();
  };

  // Effect Network change
  useEffect(() => {
    if (previousChain !== connectionConfig.env) {
      setChain(connectionConfig.env);
      console.log(`cluster:`, connectionConfig.env);
    }

    return () => {};
  }, [
    previousChain,
    connectionConfig
  ]);

  useEffect(() => {
    if (account?.lamports !== previousBalance) {
      // Refresh token balance
      refreshTokenBalance();
      // Update previous balance
      setPreviousBalance(account.lamports);
    }
  }, [account, previousBalance, refreshTokenBalance]);

  // Effect to set a default tab if none selected already
  useEffect(() => {
    if (!currentScreen) {
      setCurrentScreen('streams');
    }

    return () => {};
  }, [currentScreen, setCurrentScreen]);

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
              if (streams && streams.length > 0) {
                consoleOut('streams are available, opening streams...', '', 'blue');
                setCurrentScreen("streams");
              } else {
                setCurrentScreen("contract");
              }
            });
        }
        setPreviousWalletConnectState(true);
      } else if (previousWalletConnectState && !connected) {
        consoleOut('User is disconnecting...', '', 'blue');
        setPreviousWalletConnectState(false);
        refreshTokenBalance();
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
    setStreamList,
    setStreamDetail,
    setCurrentScreen,
    setSelectedStream,
    setLoadingStreams,
    refreshTokenBalance,
    setPreviousWalletConnectState
  ]);

  const renderPreFooter = (
    <div className="pre-footer-notice">
      <div className="footer-left">
        This product is in beta. Do not deposit or swap large amounts of funds.
      </div>
      <div className="footer-right">
        Powered by the Solana Network
      </div>
    </div>
  );

  if (currentScreen === 'streams') {

    // STREAMS SCREEN
    return (
      <>
      <div className="container main-container">
        <div className="interaction-area">
          <Streams />
        </div>
      </div>
      {renderPreFooter}
      </>
    );

  } else if (currentScreen === 'contract') {

    const renderContract = () => {
      switch(contract?.id) {
        case 1:   return <OneTimePayment />;
        case 2:   return <RepeatingPayment />;
        case 3:   return <PayrollPayment />;
        default:  return <h4>Not implemented</h4>
      }
    }

    // CONTRACT SETUP SCREEN
    return (
      <>
      <div className="container main-container">
        <div className="interaction-area">
          <div className="place-transaction-box">
            <div className="position-relative mb-2">
              {contract && (
                <>
                  <h2 className="contract-heading simplelink" onClick={showContractSelectorModal}>{contract.name}<IconCaretDown className="mean-svg-icons" /></h2>
                  <p>{contract.description}</p>
                </>
              )}
            </div>
            <ContractSelectorModal
              isVisible={isContractSelectorModalVisible}
              handleOk={onAcceptContractSelector}
              handleClose={closeContractSelectorModal}/>
            {/* Display apropriate contract setup screen */}
            {renderContract()}
          </div>
        </div>
      </div>
      {renderPreFooter}
      </>
    );

  } else {

    // LOADING SCREEN
    return (
      <>
      <div className="container main-container">
        <div className="interaction-area px-4 py-4 text-center">
          <p>Loading...</p>
        </div>
      </div>
      {renderPreFooter}
      </>
    );
  }

};
