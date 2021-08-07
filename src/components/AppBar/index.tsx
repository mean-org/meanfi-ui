import { useContext, useState } from 'react';
import { Link, Redirect } from 'react-router-dom';
import { Menu } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";
import { useConnectionConfig } from '../../contexts/connection';
import { useTranslation } from 'react-i18next';
import { AppStateContext } from '../../contexts/appstate';

const { SubMenu } = Menu;

export const AppBar = (props: { left?: JSX.Element; right?: JSX.Element }) => {
  const connection = useConnectionConfig();
  const { connected } = useWallet();
  const { t } = useTranslation("common");
  const { setContract } = useContext(AppStateContext);
  const [redirect, setRedirect] = useState<string | null>(null);

  const setPayroll = () => {
    setContract('Payroll');
    setRedirect('/transfers');
  }

  return (
    <>
      {redirect && (<Redirect to={redirect} />)}
      <div className="App-Bar-left">
        <Menu mode="horizontal" className="w-100">
          <Menu.Item key="swap">
            <Link to="/swap">{t('ui-menus.main-menu.swap')}</Link>
          </Menu.Item>
          <Menu.Item key="transfers">
            <Link to="/transfers">{t('ui-menus.main-menu.transfers')}</Link>
          </Menu.Item>
          <SubMenu key="services" title={t('ui-menus.main-menu.pro-services.submenu-title')}>
            <Menu.Item key="payroll" onClick={() => setPayroll()}>{t('ui-menus.main-menu.pro-services.payroll')}</Menu.Item>
            <Menu.Item key="custody">
              <Link to="/custody">{t('ui-menus.main-menu.pro-services.custody')}</Link>
            </Menu.Item>
          </SubMenu>
          <SubMenu key="tools" title={t('ui-menus.main-menu.tools.submenu-title')}>
            {connection.env !== 'mainnet-beta' && (
              <Menu.Item key="faucet">
                <Link to="/faucet">{t('ui-menus.main-menu.tools.faucet')}</Link>
              </Menu.Item>
            )}
            <Menu.Item key="wrap">
              <Link to="/wrap">{t('ui-menus.main-menu.tools.wrapper')}</Link>
            </Menu.Item>
          </SubMenu>
        </Menu>
      </div>
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
        {props.right}
      </div>
    </>
  );
};
