import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";
import { useConnection, useConnectionConfig } from '../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { MEANFI_METRICS_URL, SOLANA_WALLET_GUIDE } from '../../constants';
import { IconExternalLink } from '../../Icons';
import { DepositOptions } from '../DepositOptions';
import { AppConfigService, environment } from '../../environments/environment';
import { PublicKey } from '@solana/web3.js';
import { listStreams } from 'money-streaming/lib/utils';
import { consoleOut } from '../../utils/ui';

const { SubMenu } = Menu;

export const AppBar = (props: { menuType: string }) => {
  const location = useLocation();
  const connectionConfig = useConnectionConfig();
  const connection = useConnection();
  const { publicKey, connected } = useWallet();
  const { t } = useTranslation("common");
  const {
    streamProgramAddress,
    isDepositOptionsModalVisible,
    setStreamList,
    setStreamDetail,
    setCurrentScreen,
    setLoadingStreams,
    setSelectedStream,
    setCustomStreamDocked,
    showDepositOptionsModal,
    hideDepositOptionsModal,
  } = useContext(AppStateContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const onGoToTransfersClick = () => {
    setCustomStreamDocked(false);
    const programId = new PublicKey(streamProgramAddress);
    setLoadingStreams(true);
    listStreams(connection, programId, publicKey, publicKey)
      .then(async streams => {
        setStreamList(streams);
        setLoadingStreams(false);
        console.log('Layout -> streamList:', streams);
        setSelectedStream(streams[0]);
        setStreamDetail(streams[0]);
        if (streams && streams.length > 0) {
          consoleOut('streams are available, opening streams...', '', 'blue');
          setCurrentScreen('streams');
        }
      });
  };

  const dismissMenu = () => {
    const mobileMenuTrigger = document.getElementById("overlay-input");
    if (mobileMenuTrigger) {
      mobileMenuTrigger?.click();
    }
  }

  const getChartsLink = (): string => {
    const config = new AppConfigService();
    const bucket = config.getConfig().influxDbBucket;
    return `${MEANFI_METRICS_URL}&var-meanfi_env=${bucket}&refresh=5m&kiosk=tv`;
  }

  useEffect(() => {
    const mobileMenuTriggerClickListener = () => {
      if (!isMenuOpen) {
        document.body.classList.add("menu-open");
        setIsMenuOpen(true);
      } else {
        document.body.classList.remove("menu-open");
        setIsMenuOpen(false);
      }
    }

    const resizeListener = () => {
      const mobileMenuTrigger = document.querySelector("#overlay-input");
      if (mobileMenuTrigger) {
        mobileMenuTrigger?.addEventListener('click', mobileMenuTriggerClickListener);
      }
    };

    // Call it a first time
    resizeListener();

    // set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      const mobileMenuTrigger = document.querySelector("#overlay-input");
      if (mobileMenuTrigger) {
        mobileMenuTrigger.removeEventListener('click', mobileMenuTriggerClickListener);
      }
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    }
  }, [isMenuOpen]);

  const mainNav = (
    <Menu selectedKeys={[location.pathname]} mode="horizontal">
      <Menu.Item key="/accounts">
        <Link to="/accounts">{t('ui-menus.main-menu.accounts')}</Link>
      </Menu.Item>
      <Menu.Item key="/swap">
        <Link to="/swap">{t('ui-menus.main-menu.swap')}</Link>
      </Menu.Item>
      <Menu.Item key="/transfers" onClick={() => onGoToTransfersClick()}>
        <Link to="/transfers">{t('ui-menus.main-menu.transfers')}</Link>
      </Menu.Item>
      <Menu.Item key="deposits" onClick={showDepositOptionsModal} id="deposits-menu-item">
        <span className="menu-item-text">{t('ui-menus.main-menu.deposits')}</span>
      </Menu.Item>
      <SubMenu key="services" title={t('ui-menus.main-menu.services.submenu-title')}>
        <Menu.Item key="/payroll">
          <Link to="/payroll">{t('ui-menus.main-menu.services.payroll')}</Link>
        </Menu.Item>
        <Menu.Item key="/custody">
          <Link to="/custody">{t('ui-menus.main-menu.services.custody')}</Link>
        </Menu.Item>
        <Menu.Item key="wallet-guide">
          <a href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('ui-menus.main-menu.services.wallet-guide')}</span>
          </a>
        </Menu.Item>
        {connectionConfig.env !== 'mainnet-beta' && (
          <Menu.Item key="/faucet">
            <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
          </Menu.Item>
        )}
        {connectionConfig.env !== 'mainnet-beta' && (
          <Menu.Item key="/wrap">
            <Link to="/wrap">{t('ui-menus.main-menu.services.wrap')}</Link>
          </Menu.Item>
        )}
      </SubMenu>
      {/* <Menu.Item key="charts">
        <a href={getChartsLink()} target="_blank" rel="noopener noreferrer">
          <span className="menu-item-text">{t('ui-menus.main-menu.charts')}</span>
          &nbsp;<IconExternalLink className="mean-svg-icons link" />
        </a>
      </Menu.Item> */}
    </Menu>
  );

  if (props.menuType === 'desktop' ) {
    return (
      <>
        <div className="App-Bar-left">{mainNav}</div>
        <div className="App-Bar-right">
          {connected ? (
            <>
            {connectionConfig.env !== 'mainnet-beta' && (
              <div className="cluster-indicator">
                <ThunderboltOutlined />
                <span className="network-name">{connectionConfig.env}</span>
              </div>
            )}
            <div className="connection-and-account-bar">
              <CurrentNetwork />
              <CurrentUserBadge />
            </div>
            </>
          ) : (
            <ConnectButton />
          )}
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
        <DepositOptions
          isVisible={isDepositOptionsModalVisible && props.menuType === 'desktop'}
          key="deposit-modal1"
          handleClose={hideDepositOptionsModal} />
      </>
    );
  } else {
    return (
      <div className="mobile-menu">
        <input type="checkbox" id="overlay-input" />
        <label htmlFor="overlay-input" id="overlay-button"><span></span></label>
        <div id="overlay">
          <ul onClick={dismissMenu}>
            <li key="/accounts" className={location.pathname === '/accounts' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
              <Link to="/accounts">{t('ui-menus.main-menu.accounts')}</Link>
            </li>
            <li key="/swap" className={location.pathname === '/swap' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
              <Link to="/swap">{t('ui-menus.main-menu.swap')}</Link>
            </li>
            <li key="/transfers"
                className={location.pathname === '/transfers' ? 'mobile-menu-item active' : 'mobile-menu-item'}
                onClick={() => onGoToTransfersClick()}>
              <Link to="/transfers">{t('ui-menus.main-menu.transfers')}</Link>
            </li>
            <li key="deposits" className="mobile-menu-item" onClick={showDepositOptionsModal}>
              <span className="menu-item-text">{t('ui-menus.main-menu.deposits')}</span>
            </li>
            <li key="services">
              <div className="mobile-submenu-title">{t('ui-menus.main-menu.services.submenu-title')}</div>
              <ul className="mobile-submenu">
                <li key="/payroll" className={location.pathname === '/payroll' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                  <Link to="/payroll">{t('ui-menus.main-menu.services.payroll')}</Link>
                </li>
                <li key="/custody" className={location.pathname === '/custody' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                  <Link to="/custody">{t('ui-menus.main-menu.services.custody')}</Link>
                </li>
                {connectionConfig.env !== 'mainnet-beta' && (
                  <li key="/faucet" className={location.pathname === '/faucet' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                    <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
                  </li>
                )}
                {connectionConfig.env !== 'mainnet-beta' && (
                  <li key="/wrap" className={location.pathname === '/wrap' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                    <Link to="/wrap">{t('ui-menus.main-menu.services.wrap')}</Link>
                  </li>
                )}
                <li key="wallet-guide" className="mobile-menu-item">
                  <a href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.main-menu.services.wallet-guide')}</span>
                    &nbsp;<IconExternalLink className="mean-svg-icons link" />
                  </a>
                </li>
              </ul>
            </li>
            {/* Charts */}
            {/* <li key="charts" className="mobile-menu-item">
              <a href={getChartsLink()} target="_blank" rel="noopener noreferrer">
                <span className="menu-item-text">{t('ui-menus.main-menu.charts')}</span>
                &nbsp;<IconExternalLink className="mean-svg-icons link" />
              </a>
            </li> */}
          </ul>
        </div>
        <DepositOptions
          isVisible={isDepositOptionsModalVisible && props.menuType !== 'desktop'}
          key="deposit-modal2"
          handleClose={hideDepositOptionsModal} />
      </div>
    );
  }
};
