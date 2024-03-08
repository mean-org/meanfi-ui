import { useWallet } from '../../contexts/wallet';
import { AccountDetails } from '../AccountDetails';
import { ConnectButton } from '../ConnectButton';
import { AppContextMenu } from '../AppContextMenu';
import { NotificationBell } from '../NotificationBell';
import PrioritizationFeesConfigPopover from 'components/PrioritizationFeesConfigPopover';

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
          <div className="navbar-utilities">
            <NotificationBell onOpenDrawer={props.onOpenDrawer} />
            <PrioritizationFeesConfigPopover />
          </div>
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
