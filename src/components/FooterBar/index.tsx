import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";
import { AppContextMenu } from '../AppContextMenu';

export const FooterBar = () => {
  const { connected } = useWallet();

  return (
    <div className="app-footer">
      <div className="container">
        <div className="footer-bar">
          {connected ? (
            <div className="footer-account-bar">
              <CurrentUserBadge />
            </div>
          ) : (
            <ConnectButton />
          )}
          <div className="app-context-menu">
            <AppContextMenu />
          </div>
        </div>
      </div>
    </div>
  );
};
