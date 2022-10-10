import { ThunderboltOutlined } from '@ant-design/icons';
import { Menu } from 'antd';
import { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { AppStateContext } from '../../contexts/appstate';
import { useConnectionConfig } from '../../contexts/connection';
import { useWallet } from "../../contexts/wallet";
import { CustomCSSProps } from '../../middleware/css-custom-props';
import { isProd } from '../../middleware/ui';
import { RoutingInfo } from '../../models/common-types';
import { ACCOUNTS_ROUTE_BASE_PATH } from '../../pages/accounts';
import { STAKING_ROUTE_BASE_PATH } from '../../pages/staking';
import { AccountDetails } from "../AccountDetails";
import { AppContextMenu } from "../AppContextMenu";
import { ConnectButton } from "../ConnectButton";
import { NotificationBell } from '../CurrentBalance';
import { DepositOptions } from '../DepositOptions';

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
    key: 'staking',
    path: STAKING_ROUTE_BASE_PATH,
    parent: 'root'
  },
  {
    key: 'vesting',
    path: '/vesting',
    parent: 'root'
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
    <Menu
      selectedKeys={selectedItems}
      mode="horizontal"
      items={[
        {
          key: 'accounts',
          label: (<Link to={ACCOUNTS_ROUTE_BASE_PATH}>{t('ui-menus.main-menu.accounts')}</Link>),
        },
        {
          key: 'exchange',
          label: (<Link to="/exchange">{t('ui-menus.main-menu.swap')}</Link>),
        },
        {
          key: 'staking',
          label: (<Link to="/staking">{t('ui-menus.main-menu.staking')}</Link>),
        },
        {
          key: 'vesting',
          label: (<Link to="/vesting">{t('ui-menus.main-menu.vesting')}</Link>),
        },
        {
          key: 'stats',
          label: (<Link to="/stats">{t('ui-menus.main-menu.stats')}</Link>),
        },
      ]}
    />
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
                <li key="staking" className={selectedItems.includes("staking") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 3} as CustomCSSProps}>
                  <Link to="/staking">{t('ui-menus.main-menu.staking')}</Link>
                </li>
                <li key="vesting" className={selectedItems.includes("vesting") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 4} as CustomCSSProps}>
                  <Link to="/vesting">{t('ui-menus.main-menu.vesting')}</Link>
                </li>
                <li key="stats" className={selectedItems.includes("stats") ? 'mobile-menu-item active' : 'mobile-menu-item'} style={{'--animation-order': 8} as CustomCSSProps}>
                  <Link to="/stats">{t('ui-menus.main-menu.stats')}</Link>
                </li>
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
