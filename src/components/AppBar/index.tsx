import { ThunderboltOutlined } from '@ant-design/icons';
import { AccountDetails } from "components/AccountDetails";
import { AppContextMenu } from "components/AppContextMenu";
import { ConnectButton } from "components/ConnectButton";
import { NotificationBell } from 'components/NotificationBell';
import { DepositOptions } from 'components/DepositOptions';
import { AppStateContext } from 'contexts/appstate';
import { useConnectionConfig } from 'contexts/connection';
import { useWallet } from "contexts/wallet";
import { isProd } from 'middleware/ui';
import { useContext } from 'react';

export const AppBar = (props: {
  menuType: string;
  topNavVisible: boolean;
  onOpenDrawer: any;
}) => {
  const connectionConfig = useConnectionConfig();
  const { connected } = useWallet();
  const {
    isDepositOptionsModalVisible,
    hideDepositOptionsModal,
  } = useContext(AppStateContext);

  return (
    <>
      <div className="App-Bar-left"><span>&nbsp;</span></div>
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
        isVisible={isDepositOptionsModalVisible}
        key="deposit-modal2"
        handleClose={hideDepositOptionsModal}
      />
    </>
  );
};
