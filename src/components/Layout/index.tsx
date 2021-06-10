import React, { useContext } from "react";
import "./../../App.less";
import { Layout } from "antd";
import { Link } from "react-router-dom";
import { AppBar } from "../AppBar";
import { FooterBar } from "../FooterBar";
import { AppStateContext } from "../../contexts/appstate";
import { BackButton } from "../BackButton";

const { Header, Content, Footer } = Layout;

export const AppLayout = React.memo((props: any) => {
  const { theme, setCurrentScreen } = useContext(AppStateContext);

  const onGoToHomeClick = () => {
    setCurrentScreen("streams");
  };

  return (
    <div className="App wormhole-bg">
      <Layout>
        <Header className="App-Bar">
          <BackButton />
          <Link to="/">
            <div className="app-title simplelink" onClick={onGoToHomeClick}>
              <img className="app-logo" src={theme === 'dark' ? 'mean-pay-logo-color-light.svg' : 'mean-pay-logo-color-dark.svg'} alt="Mean Pay" />
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
