import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";
import { useConnectionConfig } from '../../contexts/connection';
import { Link } from 'react-router-dom';
import { Menu } from 'antd';

const { SubMenu } = Menu;

export const AppBar = (props: { left?: JSX.Element; right?: JSX.Element }) => {
  const connection = useConnectionConfig();
  const { connected } = useWallet();

  return (
    <>
      <div className="App-Bar-left">
        <Menu mode="horizontal" className="w-100">
          <Menu.Item key="swap">
            <Link to="/swap">Swap</Link>
          </Menu.Item>
          <Menu.Item key="transfers">
            <Link to="/transfers">Transfers</Link>
          </Menu.Item>
          <SubMenu key="services" title="Pro Services">
            <Menu.Item key="payroll">Payroll</Menu.Item>
            <Menu.Item key="custody">Custody</Menu.Item>
          </SubMenu>
          <SubMenu key="tools" title="Tools">
            <Menu.Item key="faucet">Faucet</Menu.Item>
            <Menu.Item key="wrap">Wrapper</Menu.Item>
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
