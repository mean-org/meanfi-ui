import React, { useContext, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { AccountDetails } from "../AccountDetails";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { useConnectionConfig } from '../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';
import { SOLANA_WALLET_GUIDE } from '../../constants';
import { IconExternalLink } from '../../Icons';
import { DepositOptions } from '../DepositOptions';
import { CustomCSSProps } from '../../utils/css-custom-props';
import { isLocal, isProd } from '../../utils/ui';
import { NotificationBell } from '../CurrentBalance';
import { ACCOUNTS_ROUTE_BASE_PATH } from '../../pages/accounts';
import { RoutingInfo } from '../../models/common-types';
import { INVEST_ROUTE_BASE_PATH } from '../../pages/invest';

const { SubMenu } = Menu;
const MENU_ITEMS_ROUTE_INFO: RoutingInfo[] = [
  {
    key: 'accounts',
    path: ACCOUNTS_ROUTE_BASE_PATH,
    parent: 'root'
  },
  {
    key: 'exchange',
    path: '/exchange',
    parent: 'root'
  },
  {
    key: 'invest',
    path: INVEST_ROUTE_BASE_PATH,
    parent: 'root'
  },
  {
    key: 'vesting',
    path: '/vesting',
    parent: 'root'
  },
  {
    key: 'multisig',
    path: '/multisig',
    parent: 'root'
  },
  {
    key: 'custody',
    path: '/custody',
    parent: 'services'
  },
  {
    key: 'faucet',
    path: '/faucet',
    parent: 'services'
  },
  {
    key: 'stats',
    path: '/stats',
    parent: 'root'
  },
];

export const AppBar = (props: {
  menuType: string;
  topNavVisible: boolean;
  onOpenDrawer: any;
}) => {
  const location = useLocation();
  const connectionConfig = useConnectionConfig();
  const { connected } = useWallet();
  const { t } = useTranslation("common");
  const {
    isWhitelisted,
    isDepositOptionsModalVisible,
    hideDepositOptionsModal,
  } = useContext(AppStateContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const dismissMenu = () => {
    const mobileMenuTrigger = document.getElementById("overlay-input");
    if (mobileMenuTrigger) {
      mobileMenuTrigger?.click();
    }
  }

  useEffect(() => {
    const selection: string[] = [];

    const getRouteInfoItem = () => {
      return MENU_ITEMS_ROUTE_INFO.find(i => location.pathname.startsWith(i.path));
    }

    const route = getRouteInfoItem();

    if (route) {
      if (route.parent !== 'root') {
        selection.push(route.parent);
      }
      selection.push(route.key);
    }

    setSelectedItems(selection);
  }, [location.pathname]);

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
    <Menu selectedKeys={selectedItems} mode="horizontal">
      <Menu.Item key="accounts">
        <Link to={ACCOUNTS_ROUTE_BASE_PATH}>{t('ui-menus.main-menu.accounts')}</Link>
      </Menu.Item>
      <Menu.Item key="exchange">
        <Link to="/exchange">{t('ui-menus.main-menu.swap')}</Link>
      </Menu.Item>
      <Menu.Item key="invest">
        <Link to="/invest">{t('ui-menus.main-menu.invest.submenu-title')}</Link>
      </Menu.Item>
      <Menu.Item key="vesting">
        <Link to="/vesting">{t('ui-menus.main-menu.services.vesting')}</Link>
      </Menu.Item>
      <Menu.Item key="multisig">
        <Link to="/multisig">{t('ui-menus.main-menu.services.multisig')}</Link>
      </Menu.Item>
      <SubMenu key="services" title={t('ui-menus.main-menu.services.submenu-title')}>
        <Menu.Item key="custody">
          <Link to="/custody">{t('ui-menus.main-menu.services.custody')}</Link>
        </Menu.Item>
        <Menu.Item key="wallet-guide">
          <a href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
            <span className="menu-item-text">{t('ui-menus.main-menu.services.wallet-guide')}</span>
          </a>
        </Menu.Item>
        {!isProd() && (
          <Menu.Item key="faucet">
            <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
          </Menu.Item>
        )}
      </SubMenu>
      {(isLocal() || isWhitelisted) && (
        <Menu.Item key="stats">
          <Link to="/stats">{t('ui-menus.main-menu.stats')}</Link>
        </Menu.Item>
      )}
    </Menu>
  );

  if (props.menuType === 'desktop' ) {
    return (
      <>
        <div className="App-Bar-left">{props.topNavVisible ? mainNav : (<span>&nbsp;</span>)}</div>
        <div className="App-Bar-right">
          {!isProd() && (
            <div className="cluster-indicator">
              <ThunderboltOutlined />
              <span className="network-name">{connectionConfig.cluster}</span>
            </div>
          )}
          <NotificationBell onOpenDrawer={props.onOpenDrawer}/>
          {connected ? (
            <div className="connection-and-account-bar">
              <AccountDetails />
            </div>
          ) : (
            <>
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
        <div className="mobile-menu">
          <input type="checkbox" id="overlay-input" />
          <label htmlFor="overlay-input" id="overlay-button"><span></span></label>
          <div id="overlay">
            <div className="h-100 w-100 flex-column flex-center vertical-scroll">
              <ul onClick={dismissMenu}>
                <li key="accounts" className={selectedItems.includes("accounts") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 1} as CustomCSSProps}>
                  <Link to={ACCOUNTS_ROUTE_BASE_PATH}>{t('ui-menus.main-menu.accounts')}</Link>
                </li>
                <li key="exchange" className={selectedItems.includes("exchange") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 2} as CustomCSSProps}>
                  <Link to="/exchange">{t('ui-menus.main-menu.swap')}</Link>
                </li>
                <li key="invest" className={selectedItems.includes("invest") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 3} as CustomCSSProps}>
                  <Link to="/invest">{t('ui-menus.main-menu.invest.submenu-title')}</Link>
                </li>
                <li key="vesting" className={selectedItems.includes("vesting") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 4} as CustomCSSProps}>
                  <Link to="/vesting">{t('ui-menus.main-menu.services.vesting')}</Link>
                </li>
                <li key="multisig" className={selectedItems.includes("multisig") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 5} as CustomCSSProps}>
                  <Link to="/multisig">{t('ui-menus.main-menu.services.multisig')}</Link>
                </li>
                <li key="custody" className={selectedItems.includes("custody") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 6} as CustomCSSProps}>
                  <Link to="/custody">{t('ui-menus.main-menu.services.custody')}</Link>
                </li>
                {!isProd() && (
                  <li key="faucet" className={selectedItems.includes("faucet") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 7} as CustomCSSProps}>
                    <Link to="/faucet">{t('ui-menus.main-menu.services.faucet')}</Link>
                  </li>
                )}
                <li key="wallet-guide" className="mobile-menu-item" style={{'--animation-order': 7} as CustomCSSProps}>
                  <a href={SOLANA_WALLET_GUIDE} target="_blank" rel="noopener noreferrer">
                    <span className="menu-item-text">{t('ui-menus.main-menu.services.wallet-guide')}</span>
                    &nbsp;<IconExternalLink className="mean-svg-icons link" />
                  </a>
                </li>
                {(isLocal() || isWhitelisted) && (
                  <li key="stats" className={selectedItems.includes("stats") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 8} as CustomCSSProps}>
                    <Link to="/stats">{t('ui-menus.main-menu.stats')}</Link>
                  </li>
                )}
              </ul>
            </div>
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
