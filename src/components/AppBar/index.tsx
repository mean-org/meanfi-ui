import React, { useContext, useEffect, useState } from 'react';
import { Link, Redirect, useLocation } from 'react-router-dom';
import { Menu, Tooltip } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentBalance } from "../CurrentBalance";
import { useConnectionConfig } from '../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { MEANFI_METRICS_URL, SOLANA_WALLET_GUIDE } from '../../constants';
import { IconExternalLink } from '../../Icons';
import { DepositOptions } from '../DepositOptions';
import { environment } from '../../environments/environment';
import { CustomCSSProps } from '../../utils/css-custom-props';
import { appConfig } from '../..';
import { useOnlineStatus } from '../../contexts/online-status';
import { isDev } from '../../utils/ui';

const { SubMenu } = Menu;

export const AppBar = (props: { menuType: string }) => {
  const location = useLocation();
  const connectionConfig = useConnectionConfig();
  const { publicKey, connected } = useWallet();
  const isOnline = useOnlineStatus();
  const { t } = useTranslation("common");
  const {
    detailsPanelOpen,
    addAccountPanelOpen,
    isDepositOptionsModalVisible,
    setLoadingStreams,
    refreshStreamList,
    setDtailsPanelOpen,
    setCustomStreamDocked,
    showDepositOptionsModal,
    hideDepositOptionsModal,
    setAddAccountPanelOpen,
    setCanShowAccountDetails,
  } = useContext(AppStateContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);

  const isProd = (): boolean => {
    return environment === 'production' ? true : false;
  }

  const onGoToTransfersClick = (e: any) => {
    setCustomStreamDocked(false);
    if (publicKey) {
      setLoadingStreams(true);
      refreshStreamList(true);
    }
  };

  const closeAllPanels = () => {
    if (detailsPanelOpen) {
      setDtailsPanelOpen(false);
    } else if (addAccountPanelOpen) {
      setCanShowAccountDetails(true);
      setAddAccountPanelOpen(false);
    }
  }

  const dismissMenu = () => {
    const mobileMenuTrigger = document.getElementById("overlay-input");
    if (mobileMenuTrigger) {
      mobileMenuTrigger?.click();
      closeAllPanels();
    }
  }

  const getChartsLink = (): string => {
    const bucket = appConfig.getConfig().influxDbBucket;
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
      <Menu.Item key="/exchange">
        <Link to="/exchange">{t('ui-menus.main-menu.swap')}</Link>
      </Menu.Item>
      <Menu.Item key="/transfers">
        <Link to="/transfers" onClick={onGoToTransfersClick}>{t('ui-menus.main-menu.transfers')}</Link>
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
        {!isProd() && (
          <Menu.Item key="/faucet">
            <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
          </Menu.Item>
        )}
        {!isProd() && (
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

  const renderOnlineStatus = (
    <div className="flex">
      <Tooltip placement="bottom" destroyTooltipOnHide={true} title={isOnline
          ? t('notifications.network-connection-good')
          : t('notifications.network-connection-poor')}>
        <span className={`online-status ${isOnline ? 'success' : 'error'} mr-1`}></span>
      </Tooltip>
    </div>
  );

  if (props.menuType === 'desktop' ) {
    return (
      <>
        <div className="App-Bar-left">{mainNav}</div>
        <div className="App-Bar-right">
          {connected ? (
            <>
            {!isProd() && (
              <div className="cluster-indicator">
                <ThunderboltOutlined />
                <span className="network-name">{connectionConfig.cluster}</span>
              </div>
            )}
            {renderOnlineStatus}
            <div className="connection-and-account-bar">
              <CurrentBalance />
              <CurrentUserBadge />
            </div>
            </>
          ) : (
            <>
              {renderOnlineStatus}
              <ConnectButton />
            </>
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
      <>
        {redirect && (<Redirect to={redirect} />)}
        <div className="mobile-menu">
          <input type="checkbox" id="overlay-input" />
          <label htmlFor="overlay-input" id="overlay-button"><span></span></label>
          <div id="overlay">
            <ul onClick={dismissMenu}>
              <li key="/accounts" className={location.pathname === '/accounts' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 1} as CustomCSSProps}>
                <Link to="/accounts">{t('ui-menus.main-menu.accounts')}</Link>
              </li>
              <li key="/exchange" className={location.pathname === '/exchange' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 2} as CustomCSSProps}>
                <Link to="/exchange">{t('ui-menus.main-menu.swap')}</Link>
              </li>
              <li key="/transfers" style={{'--animation-order': 1} as CustomCSSProps}
                  className={location.pathname === '/transfers' ? 'mobile-menu-item active' : 'mobile-menu-item'}>
                <Link to="/transfers" onClick={onGoToTransfersClick}>{t('ui-menus.main-menu.transfers')}</Link>
              </li>
              <li key="deposits" className="mobile-menu-item" onClick={showDepositOptionsModal} style={{'--animation-order': 4} as CustomCSSProps}>
                <span className="menu-item-text">{t('ui-menus.main-menu.deposits')}</span>
              </li>
              <li key="/payroll" className={location.pathname === '/payroll' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 5} as CustomCSSProps}>
                <Link to="/payroll">{t('ui-menus.main-menu.services.payroll')}</Link>
              </li>
              <li key="/custody" className={location.pathname === '/custody' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 6} as CustomCSSProps}>
                <Link to="/custody">{t('ui-menus.main-menu.services.custody')}</Link>
              </li>
              {!isProd() && (
                <li key="/faucet" className={location.pathname === '/faucet' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 7} as CustomCSSProps}>
                  <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
                </li>
              )}
              {!isProd() && (
                <li key="/wrap" className={location.pathname === '/wrap' ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 8} as CustomCSSProps}>
                  <Link to="/wrap">{t('ui-menus.main-menu.services.wrap')}</Link>
                </li>
              )}
              <li key="wallet-guide" className="mobile-menu-item" style={{'--animation-order': isProd() ? 7 : 9} as CustomCSSProps}>
                <a href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
                  <span className="menu-item-text">{t('ui-menus.main-menu.services.wallet-guide')}</span>
                  &nbsp;<IconExternalLink className="mean-svg-icons link" />
                </a>
              </li>
              {/* Charts */}
              {/* <li key="charts" className="mobile-menu-item" style={{'--animation-order': isProd() ? 8 : 10} as CustomCSSProps}>
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
      </>
    );
  }
};
