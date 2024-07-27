import PrioritizationFeesConfigPopover from 'components/PrioritizationFeesConfigPopover';
import { useWallet } from 'contexts/wallet';
import { AccountDetails } from '../AccountDetails';
import { AppContextMenu } from '../AppContextMenu';
import { ConnectButton } from '../ConnectButton';
import { NotificationBell } from '../NotificationBell';

export const FooterBar = (props: { onOpenDrawer: () => void }) => {
  const { connected } = useWallet();

  return (
    <div className='app-footer'>
      <div className='container'>
        <div className='footer-bar'>
          {connected ? (
            <div className='footer-account-bar'>
              <AccountDetails />
            </div>
          ) : (
            <ConnectButton />
          )}
          <div className='navbar-utilities'>
            <NotificationBell onOpenDrawer={props.onOpenDrawer} />
            <PrioritizationFeesConfigPopover />
          </div>
          <div className='app-context-menu'>
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
