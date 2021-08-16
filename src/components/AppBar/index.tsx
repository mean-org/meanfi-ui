import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";
import { useConnectionConfig } from '../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { useContext, useEffect, useState } from 'react';
import { AppStateContext } from '../../contexts/appstate';

const { SubMenu } = Menu;

export const AppBar = (props: { menuType: string }) => {
  const location = useLocation();
  const connection = useConnectionConfig();
  const { connected } = useWallet();
  const { t } = useTranslation("common");
  const { setCustomStreamDocked, refreshStreamList } = useContext(AppStateContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const onGoToTransfersClick = () => {
    refreshStreamList(true);
    setCustomStreamDocked(false);
  };

  const dismissMenu = () => {
    const mobileMenuTrigger = document.getElementById("overlay-input");
    if (mobileMenuTrigger) {
      mobileMenuTrigger?.click();
    }
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
    <Menu selectedKeys={[location.pathname]} mode={props.menuType === 'desktop' ? 'horizontal' : 'vertical'} className="w-100" >
      <Menu.Item key="/swap">
        <Link to="/swap">{t('ui-menus.main-menu.swap')}</Link>
      </Menu.Item>
      <Menu.Item key="/transfers" onClick={() => onGoToTransfersClick()}>
        <Link to="/transfers">{t('ui-menus.main-menu.transfers')}</Link>
      </Menu.Item>
      <SubMenu key="services" title={t('ui-menus.main-menu.pro-services.submenu-title')}>
        <Menu.Item key="/payroll">
          <Link to="/payroll">{t('ui-menus.main-menu.pro-services.payroll')}</Link>
        </Menu.Item>
        <Menu.Item key="/custody">
          <Link to="/custody">{t('ui-menus.main-menu.pro-services.custody')}</Link>
        </Menu.Item>
      </SubMenu>
      <SubMenu key="tools" title={t('ui-menus.main-menu.tools.submenu-title')}>
        {connection.env !== 'mainnet-beta' && (
          <Menu.Item key="/faucet">
            <Link to="/faucet">{t('ui-menus.main-menu.tools.faucet')}</Link>
          </Menu.Item>
        )}
        <Menu.Item key="/wrap">
          <Link to="/wrap">{t('ui-menus.main-menu.tools.wrapper')}</Link>
        </Menu.Item>
      </SubMenu>
    </Menu>
  );

  if (props.menuType === 'desktop' ) {
    return (
      <>
        <div className="App-Bar-left">{mainNav}</div>
        <div className="App-Bar-right">
          {connected ? (
            <>
            {connection.env !== 'mainnet-beta' && (
              <div className="cluster-indicator">
                <ThunderboltOutlined />
                <span className="network-name">{connection.env}</span>
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
      </>
    );
  }

  return (
    <div className="mobile-menu">
      <input type="checkbox" id="overlay-input" />
      <label htmlFor="overlay-input" id="overlay-button"><span></span></label>
      <div id="overlay">
        <ul onClick={dismissMenu}>
          <li key="/swap" className={location.pathname === '/swap' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
            <Link to="/swap">{t('ui-menus.main-menu.swap')}</Link>
          </li>
          <li key="/transfers"
              className={location.pathname === '/transfers' ? 'mobile-menu-item active' : 'mobile-menu-item'}
              onClick={() => onGoToTransfersClick()}>
            <Link to="/transfers">{t('ui-menus.main-menu.transfers')}</Link>
          </li>
          <li key="services">
            <div className="mobile-submenu-title">{t('ui-menus.main-menu.pro-services.submenu-title')}</div>
            <ul className="mobile-submenu">
              <li key="/payroll" className={location.pathname === '/payroll' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                <Link to="/payroll">{t('ui-menus.main-menu.pro-services.payroll')}</Link>
              </li>
              <li key="/custody" className={location.pathname === '/custody' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                <Link to="/custody">{t('ui-menus.main-menu.pro-services.custody')}</Link>
              </li>
            </ul>
          </li>
          <li key="tools">
            <div className="mobile-submenu-title">{t('ui-menus.main-menu.tools.submenu-title')}</div>
            <ul className="mobile-submenu">
              {connection.env !== 'mainnet-beta' && (
                <li key="/faucet" className={location.pathname === '/faucet' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                  <Link to="/faucet">{t('ui-menus.main-menu.tools.faucet')}</Link>
                </li>
              )}
              <li key="/wrap" className={location.pathname === '/wrap' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                <Link to="/wrap">{t('ui-menus.main-menu.tools.wrapper')}</Link>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </div>
  );
};
