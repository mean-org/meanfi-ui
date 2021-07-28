import { ThunderboltOutlined } from '@ant-design/icons';
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from "../AppContextMenu";
import { CurrentNetwork } from "../CurrentNetwork";
import { useConnectionConfig } from '../../contexts/connection';

export const AppBar = (props: { left?: JSX.Element; right?: JSX.Element }) => {
  const connection = useConnectionConfig();
  const { connected } = useWallet();

  const TopBar = (
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
  );

  return TopBar;
};
