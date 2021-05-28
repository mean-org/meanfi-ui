import { Button, Tooltip } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import { useCallback, useContext, useEffect, useState } from "react";
import { ContractSelectorModal } from "../../components/ContractSelectorModal";
import { AppStateContext } from "../../contexts/appstate";
import { OneTimePayment, RepeatingPayment } from "../screens";

export const HomeView = () => {
  const { currentScreen, contract, setCurrentScreen } = useContext(AppStateContext);

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
      // TODO: Condition this to go to streams in case we have streams
      // otherwise go to create contract.
      setCurrentScreen('contract');
    }

    return () => {};
  }, [currentScreen, setCurrentScreen]);

  if (currentScreen === 'contract') {

    const renderContract = () => {
      switch(contract?.id) {
        case 1:   return <OneTimePayment />;
        case 2:   return <RepeatingPayment />;
        default:  return <h4>Not implemented</h4>
      }
    }

    // CONTRACT SETUP SCREEN
    return (
      <div className="container">
        <div className="interaction-area">
          <div className="place-transaction-box">
            <div className="position-relative mb-2">
              {contract && (
                <>
                  <h2 className="contract-heading">{contract.name}</h2>
                  <p>{contract.description}</p>
                </>
              )}
              <span className="contract-switch-button">
                <Tooltip title="Change money streming contract">
                  <Button shape="circle" icon={<SwapOutlined className="fg-red"/>} onClick={showContractSelectorModal}/>
                </Tooltip>
              </span>
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
    );
  } else if (currentScreen === 'streams') {

    // STREAMS SCREEN
    return (
      <div className="container">
        <div className="interaction-area">
          <div className="streams-heading">My Money Streams</div>
          <div className="streams-layout">
            {/* Left / top panel*/}
            <div className="streams-container">
              <div className="cta-row">
                <div>Create new</div>
                <div>Open Stream</div>
              </div>
              <div className="inner-container">
                Left view, list of money streams
              </div>
            </div>
            {/* Right / down panel */}
            <div className="stream-details-container">
              <div className="inner-container">
                Right view, details of the money stream
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  } else {

    // LOADING SCREEN
    return (
      <div className="container">
        <div className="interaction-area px-4 py-4 text-center">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

};
