import React from 'react';
import { PreFooter } from "../../components/PreFooter";
import {Helmet} from "react-helmet";

export const HomeView = () => {

  return (
    <>
    <Helmet>
      <title>Home - Mean Finance</title>
      <link rel="canonical" href="https://app.meanfi.com/accounts" />
      <meta name="description" content="Water flows, and now, money does too. Welcome to Mean Finance, your money unleashed!" />
      <meta name="google-site-verification" content="u-gc96PrpV7y_DAaA0uoo4tc2ffcgi_1r6hqSViM-F8" />
    </Helmet>
    <div className="container main-container">
      <div className="interaction-area">
        <h1 className="mandatory-h1">Welcome to Mean Finance</h1>
        <p>Water flows, and now, money does too. Welcome to Mean Finance, your money unleashed!</p>
      </div>
    </div>
    <PreFooter />
    </>
  );

};
