import { useEffect, useState } from "react";
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";
import { TokenListContextProvider } from "../../contexts/tokenList";
import { TokenContextProvider } from "../../contexts/token";
import { MarketContextProvider } from "../../contexts/market"
import { SwapContextProvider } from "../../contexts/swap";
import { TokenListContainer, TokenListProvider } from "@solana/spl-token-registry";

export const SwapView = () => {

  const [tokenListContainer, setTokenList] = useState<TokenListContainer>();

  useEffect(() => {
    new TokenListProvider()
      .resolve()
      .then(setTokenList);
    
  }, [setTokenList]);

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box">
          {
            tokenListContainer &&
            <TokenListContextProvider container={tokenListContainer}>
              <TokenContextProvider>
                <MarketContextProvider>
                  <SwapContextProvider>
                    <SwapUi />
                  </SwapContextProvider>
                </MarketContextProvider>
              </TokenContextProvider>
            </TokenListContextProvider>
          }
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );
}
