import { useContext, useEffect, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";

export const SwapView = () => {
  const { connected } = useWallet();
  const { setSelectedTokenBalance, setSwapToTokenBalance } = useContext(AppStateContext);
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);

  // Effect auto-select token on wallet connect and clear balance on disconnect
  useEffect(() => {
    if (previousWalletConnectState !== connected) {
      // User is connecting
      if (!previousWalletConnectState && connected) {
        setSelectedTokenBalance(0);
        setSwapToTokenBalance(0);
      }
      setPreviousWalletConnectState(connected);
    } else if (!connected) {
      setSelectedTokenBalance(0);
      setSwapToTokenBalance(0);
    }

    return () => {
      clearTimeout();
    };
  }, [
    connected,
    previousWalletConnectState,
    setSwapToTokenBalance,
    setSelectedTokenBalance,
    setPreviousWalletConnectState,
  ]);

  // Validation

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box">

          <SwapUi />

        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );

};
