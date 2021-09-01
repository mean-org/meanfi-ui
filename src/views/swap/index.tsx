import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";
// import { TokenListContextProvider } from "../../contexts/tokenList";
// import { TokenContextProvider } from "../../contexts/token";
// import { MarketContextProvider } from "../../contexts/market"
// import { SwapContextProvider } from "../../contexts/swap";

export const SwapView = () => {

  return (
    <>
    <div className="container main-container">
      <div className="interaction-area">
        <div className="place-transaction-box">
          {/* <TokenListContextProvider> */}
            {/* <TokenContextProvider> */}
              {/* <MarketContextProvider> */}
                {/* <SwapContextProvider> */}
                  <SwapUi />
                {/* </SwapContextProvider> */}
              {/* </MarketContextProvider> */}
            {/* </TokenContextProvider> */}
          {/* </TokenListContextProvider> */}
        </div>
      </div>
    </div>
    <PreFooter />
    </>
  );
}
