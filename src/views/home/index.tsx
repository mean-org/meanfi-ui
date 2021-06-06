import React, { useCallback, useContext, useEffect, useState } from "react";
import { ContractSelectorModal } from "../../components/ContractSelectorModal";
import { AppStateContext } from "../../contexts/appstate";
import { IconCaretDown } from "../../Icons";
import { OneTimePayment, RepeatingPayment, PayrollPayment, Streams } from "../screens";

export const HomeView = () => {
  const {
    currentScreen,
    contract,
    setCurrentScreen
  } = useContext(AppStateContext);

  // Contract switcher modal
  const [isContractSelectorModalVisible, setIsContractSelectorModalVisibility] = useState(false);
  const showContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(true), []);
  const closeContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(false), []);
  const onAcceptContractSelector = () => {
    // Do something and close the modal
    closeContractSelectorModal();
  };

  // Effect to set a default tab if none selected already
  useEffect(() => {
    if (!currentScreen) {
      setCurrentScreen('streams');
    }

    return () => {};
  }, [currentScreen, setCurrentScreen]);

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
      <div className="container">
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
      <div className="container">
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
      <div className="container">
        <div className="interaction-area px-4 py-4 text-center">
          <p>Loading...</p>
        </div>
      </div>
      {renderPreFooter}
      </>
    );
  }

};
