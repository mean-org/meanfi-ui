import React from 'react';
import { useWallet } from '../../contexts/wallet';
import { AccountDetails } from '../AccountDetails';
import { ConnectButton } from '../ConnectButton';
import { AppContextMenu } from '../AppContextMenu';
import { NotificationBell } from '../NotificationBell';

export const FooterBar = (props: { onOpenDrawer?: any }) => {
  const { connected } = useWallet();

  return (
    <div className="app-footer">
      <div className="container">
        <div className="footer-bar">
          {connected ? (
            <div className="footer-account-bar">
              <AccountDetails />
            </div>
          ) : (
            <ConnectButton />
          )}
          <NotificationBell onOpenDrawer={props.onOpenDrawer} />
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
