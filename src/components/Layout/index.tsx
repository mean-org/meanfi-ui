import React, { useContext } from "react";
import "./../../App.less";
import { Layout } from "antd";
import { Link } from "react-router-dom";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const { setCurrentScreen } = useContext(AppStateContext);

  const onGoToHomeClick = () => {
    setCurrentScreen("contract");
  };

  return (
    <div className="App wormhole-bg">
      <Layout>
        <Header className="App-Bar container">
          <Link to="/">
            <div className="app-title simplelink" onClick={onGoToHomeClick}>
              <img className="app-logo" src="mean-pay-logo-color-dark.svg" alt="Mean Pay" />
            </div>
          </Link>
          <AppBar />
        </Header>
        <Content>{props.children}</Content>
        <Footer>
          <FooterBar/>
        </Footer>
      </Layout>
    </div>
  );
});
