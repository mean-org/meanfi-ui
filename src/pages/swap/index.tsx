import React from 'react';
import { PreFooter } from "../../components/PreFooter";
import { SwapUi } from "../../components/SwapUi";

export const SwapView = () => {

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
}
