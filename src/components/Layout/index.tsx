import React from "react";
import "./../../App.less";
import { Layout } from "antd";
import { Link } from "react-router-dom";

import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import ContractProvider from "../../contexts/contract";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  return (
    <div className="App wormhole-bg">
      <ContractProvider>
        <Layout>
          <Header className="App-Bar container">
            <Link to="/">
              <div className="app-title">
                <img className="app-logo" src="mean-pay-logo-color-dark.svg" alt="Mean Pay" />
              </div>
            </Link>
            <AppBar />
          </Header>
          <Content>{props.children}</Content>
          <Footer>
            <div className="container">
              <div className="pre-footer-notice">
                <div className="footer-left">
                  This product is in beta. Do not deposit or swap large amounts of funds.
                </div>
                <div className="footer-right">
                    Powered by the Solana Network
                </div>
              </div>
            </div>
            <FooterBar/>
          </Footer>
        </Layout>
      </ContractProvider>
    </div>
  );
});
