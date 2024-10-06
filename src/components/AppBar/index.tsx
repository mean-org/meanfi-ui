import { ThunderboltOutlined } from '@ant-design/icons';
import { Menu } from 'antd';
import type { ItemType, MenuItemType } from 'antd/lib/menu/interface';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { MEAN_DAO_DOCS_URL } from 'src/app-constants/common';
import { AccountDetails } from 'src/components/AccountDetails';
import { AppContextMenu } from 'src/components/AppContextMenu';
import { ConnectButton } from 'src/components/ConnectButton';
import { DepositOptions } from 'src/components/DepositOptions';
import { NotificationBell } from 'src/components/NotificationBell';
import PrioritizationFeesConfigPopover from 'src/components/PrioritizationFeesConfigPopover';
import { AppStateContext } from 'src/contexts/appstate';
import { useConnectionConfig } from 'src/contexts/connection';
import { useWallet } from 'src/contexts/wallet';
import type { CustomCSSProps } from 'src/middleware/css-custom-props';
import { isProd } from 'src/middleware/ui';
import type { RoutingInfo } from 'src/models/common-types';

const MENU_ITEMS_ROUTE_INFO: RoutingInfo[] = [
  {
    key: 'exchange',
    path: '/exchange',
    parent: 'root',
  },
  {
    key: 'staking',
    path: '/staking',
    parent: 'root',
  },
  {
    key: 'docs',
    path: undefined,
    parent: undefined,
  },
  {
    key: 'stats',
    path: '/stats',
    parent: 'root',
  },
  {
    key: 'playground',
    path: '/playground',
    parent: 'root',
  },
  {
    key: 'accounts',
    path: '/',
    parent: 'root',
  },
];

interface AppBarProps {
  menuType: string;
  topNavVisible: boolean;
  onOpenDrawer: () => void;
}

export const AppBar = ({ menuType, topNavVisible, onOpenDrawer }: AppBarProps) => {
  const location = useLocation();
  const { t } = useTranslation('common');
  const connectionConfig = useConnectionConfig();
  const { connected } = useWallet();
  const { isDepositOptionsModalVisible, hideDepositOptionsModal } = useContext(AppStateContext);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const routeInfo = useMemo(
    () =>
      MENU_ITEMS_ROUTE_INFO.find(i => {
        if (!i.path) {
          return false;
        }
        if (i.path === location.pathname) {
          return true;
        }
        return location.pathname.startsWith(i.path);
      }),
    [location.pathname],
  );

  const dismissMenu = () => {
    const mobileMenuTrigger = document.getElementById('overlay-input');
    if (mobileMenuTrigger) {
      mobileMenuTrigger?.click();
    }
  };

  // Menu selection
  useEffect(() => {
    const selection: string[] = [];

    if (routeInfo?.parent) {
      if (routeInfo.parent !== 'root') {
        selection.push(routeInfo.parent);
      }
      selection.push(routeInfo.key);
    }

    setSelectedItems(selection);
  }, [routeInfo?.key, routeInfo?.parent]);

  // Mobile menu triggers and listeners
  useEffect(() => {
    const mobileMenuTriggerClickListener = () => {
      if (!isMenuOpen) {
        document.body.classList.add('menu-open');
        setIsMenuOpen(true);
      } else {
        document.body.classList.remove('menu-open');
        setIsMenuOpen(false);
      }
    };

    const resizeListener = () => {
      const mobileMenuTrigger = document.querySelector('#overlay-input');
      if (mobileMenuTrigger) {
        mobileMenuTrigger?.addEventListener('click', mobileMenuTriggerClickListener);
      }
    };

    // Call it a first time
    resizeListener();

    // Then set a set resize listener
    window.addEventListener('resize', resizeListener);

    // clean up function
    return () => {
      const mobileMenuTrigger = document.querySelector('#overlay-input');
      if (mobileMenuTrigger) {
        mobileMenuTrigger.removeEventListener('click', mobileMenuTriggerClickListener);
      }
      // remove resize listener
      window.removeEventListener('resize', resizeListener);
    };
  }, [isMenuOpen]);

  // Prebuild the menu options
  const mainNav = () => {
    const items: ItemType<MenuItemType>[] = [];
    items.push({
      key: 'accounts',
      label: <Link to='/'>{t('ui-menus.main-menu.accounts')}</Link>,
    });
    items.push({
      key: 'exchange',
      label: <Link to='/exchange'>{t('ui-menus.main-menu.exchange')}</Link>,
    });
    items.push({
      key: 'staking',
      label: <Link to='/staking'>{t('ui-menus.main-menu.staking')}</Link>,
    });
    items.push({
      key: 'docs',
      label: (
        <Link to={MEAN_DAO_DOCS_URL} target='_blank' rel='noopener noreferrer'>
          {t('ui-menus.app-context-menu.how-to-use')}
        </Link>
      ),
    });
    return <Menu selectedKeys={selectedItems} mode='horizontal' items={items} />;
  };

  if (menuType === 'desktop') {
    return (
      <>
        <div className='App-Bar-left'>{topNavVisible ? mainNav() : <span>&nbsp;</span>}</div>
        <div className='App-Bar-right'>
          {!isProd() && (
            <div className='cluster-indicator'>
              <ThunderboltOutlined />
              <span className='network-name'>{connectionConfig.cluster}</span>
            </div>
          )}
          <div className='navbar-utilities'>
            <PrioritizationFeesConfigPopover />
            <NotificationBell onOpenDrawer={onOpenDrawer} />
          </div>
          {connected ? (
            <div className='connection-and-account-bar'>
              <AccountDetails />
            </div>
          ) : (
            <ConnectButton />
          )}
          <div className='app-context-menu'>
            <AppContextMenu />
          </div>
        </div>
        {isDepositOptionsModalVisible ? (
          <DepositOptions
            isVisible={isDepositOptionsModalVisible}
            key='deposit-modal2'
            handleClose={hideDepositOptionsModal}
          />
        ) : null}
      </>
    );
  }

  return (
    <div className='mobile-menu'>
      <input type='checkbox' id='overlay-input' />
      <label htmlFor='overlay-input' id='overlay-button'>
        <span />
      </label>
      <div id='overlay'>
        <div className='h-100 w-100 flex-column flex-center vertical-scroll'>
          <ul onClick={dismissMenu} onKeyDown={dismissMenu}>
            <li
              key='accounts'
              className={selectedItems.includes('accounts') ? 'mobile-menu-item active' : 'mobile-menu-item'}
              style={{ '--animation-order': 1 } as CustomCSSProps}
            >
              <Link to='/'>{t('ui-menus.main-menu.accounts')}</Link>
            </li>
            <li
              key='exchange'
              className={selectedItems.includes('exchange') ? 'mobile-menu-item active' : 'mobile-menu-item'}
              style={{ '--animation-order': 2 } as CustomCSSProps}
            >
              <Link to='/exchange'>{t('ui-menus.main-menu.exchange')}</Link>
            </li>
            <li
              key='staking'
              className={selectedItems.includes('staking') ? 'mobile-menu-item active' : 'mobile-menu-item'}
              style={{ '--animation-order': 3 } as CustomCSSProps}
            >
              <Link to='/staking'>{t('ui-menus.main-menu.staking')}</Link>
            </li>
            <li
              key='docs'
              className={selectedItems.includes('docs') ? 'mobile-menu-item active' : 'mobile-menu-item'}
              style={{ '--animation-order': 4 } as CustomCSSProps}
            >
              <Link to={MEAN_DAO_DOCS_URL} target='_blank' rel='noopener noreferrer'>
                {t('ui-menus.app-context-menu.how-to-use')}
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <DepositOptions
        isVisible={isDepositOptionsModalVisible && menuType !== 'desktop'}
        key='deposit-modal2'
        handleClose={hideDepositOptionsModal}
      />
    </div>
  );
};
