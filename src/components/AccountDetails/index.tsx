import { Popover } from "antd";
import { segmentAnalytics } from 'App';
import { AccountSelector } from "components/AccountSelector";
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from "contexts/wallet";
import useWindowSize from "hooks/useWindowResize";
import {
  IconSafe
} from "Icons";
import { AppUsageEvent } from 'middleware/segment-service';
import { shortenAddress } from "middleware/utils";
import { ACCOUNTS_ROUTE_BASE_PATH } from "pages/accounts";
import { useCallback, useContext, useState } from 'react';
import { useNavigate } from "react-router-dom";
import "./style.scss";

export const AccountDetails = () => {

  const {
    selectedAccount,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const { publicKey, provider, disconnect, resetWalletProvider } = useWallet();
  const [popoverVisible, setPopoverVisible] = useState(false);

  const onCompleteAccountSelection = useCallback(() => {
    setPopoverVisible(false);
    navigate(ACCOUNTS_ROUTE_BASE_PATH);
  }, []);

  const onDisconnectWallet = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    disconnect();
    resetWalletProvider();
  }, [disconnect, resetWalletProvider]);

  const renderPersonalAccount = () => {
    return (
      <>
        {provider && (
          <img src={provider.icon} alt={provider.name} width="24" className="wallet-provider-icon" />
        )}
        <div className="account-descriptor">
          <div className="account-name">Personal Account</div>
          <div className="account-id">{shortenAddress(selectedAccount.address, 8)}</div>
        </div>
      </>
    );
  }

  const renderSupersafeAccount = () => {
    return (
      <>
        <IconSafe className="mean-svg-icons wallet-provider-icon" style={{ width: 24, height: 24 }} />
        <div className="account-descriptor">
          <div className="account-name">{selectedAccount.name}</div>
          <div className="account-id">{shortenAddress(selectedAccount.address, 8)}</div>
        </div>
      </>
    );
  }

  const isSmScreen = ():boolean => {
    return width < 768 ? true : false;
  }

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const bodyContent = (
    <>
    <div className="account-selector-popover-content vertical-scroll">
      <AccountSelector onAccountSelected={onCompleteAccountSelection} onDisconnectWallet={onDisconnectWallet} />
    </div>
    </>
  );

  if (!publicKey) {
    return null;
  }

  return (
    <>
      <Popover
        placement={isSmScreen() ? "topLeft" : "bottomRight"}
        content={bodyContent}
        open={popoverVisible}
        onOpenChange={handlePopoverVisibleChange}
        className="account-selector-max-width"
        trigger="click">
        <div className="wallet-wrapper">
          <span className="wallet-key">
            {selectedAccount.isMultisig ? renderSupersafeAccount() : renderPersonalAccount()}
          </span>
        </div>
      </Popover>
    </>
  );

};
