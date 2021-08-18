import { useContext, useEffect, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { AppStateContext } from "../../contexts/appstate";
import { PreFooter } from "../../components/PreFooter";
import { Swap } from "@project-serum/swap";
import { SwapUi } from "../../components/SwapUi";
import { TokenListContainer, TokenListProvider } from "@solana/spl-token-registry";
import { Provider } from "@project-serum/anchor";
import { useConnection } from "../../contexts/connection";
import { WalletAdapter } from "money-streaming/lib/wallet-adapter";
import { TokenListContextProvider } from "../../contexts/tokenList";
import { TokenContextProvider } from "../../contexts/token";
import { MarketContextProvider } from "../../contexts/market"
import { SwapContextProvider } from "../../contexts/swap";

export const SwapView = () => {
  const { connected, wallet } = useWallet();
  const { setSelectedTokenBalance, setSwapToTokenBalance } = useContext(AppStateContext);
  const [previousWalletConnectState, setPreviousWalletConnectState] = useState(connected);
  const [tokenListContainer, setTokenList] = useState<TokenListContainer>();
  const connection = useConnection();
  const tokenProvider = new Provider(connection, wallet as WalletAdapter, {
    commitment: 'recent',
    preflightCommitment: 'recent'
  });

  useEffect(() => {
    new TokenListProvider()
      .resolve()
      .then(setTokenList);
    
  }, [setTokenList]);

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

  const swapClient = new Swap(tokenProvider, tokenListContainer as TokenListContainer);

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box">
          {
            tokenListContainer &&
            <TokenListContextProvider tokenList={tokenListContainer}>
              <div>
                {
                  tokenProvider &&
                  <TokenContextProvider provider={tokenProvider}>
                    <MarketContextProvider swapClient={swapClient}>
                      <SwapContextProvider>
                          <SwapUi />
                      </SwapContextProvider>
                    </MarketContextProvider>
                  </TokenContextProvider>
                }
              </div>
            </TokenListContextProvider>
          }
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );
}
