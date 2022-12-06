import { Popover } from 'antd';
import { segmentAnalytics } from 'App';
import { AccountSelector } from 'components/AccountSelector';
import { CREATE_SAFE_ROUTE_PATH } from 'constants/common';
import { useWallet } from 'contexts/wallet';
import { useWalletAccount } from 'contexts/walletAccount';
import useWindowSize from 'hooks/useWindowResize';
import { IconSafe } from 'Icons';
import { AppUsageEvent } from 'middleware/segment-service';
import { shortenAddress } from 'middleware/utils';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './style.scss';

export const AccountDetails = () => {
  const { selectedAccount } = useWalletAccount();
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const { publicKey, provider, disconnect } = useWallet();
  const [popoverVisible, setPopoverVisible] = useState(false);

  const onCompleteAccountSelection = useCallback(() => {
    setPopoverVisible(false);
    navigate('/');
  }, [navigate]);

  const onCreateSafe = useCallback(() => {
    setPopoverVisible(false);
    navigate(CREATE_SAFE_ROUTE_PATH);
  }, [navigate]);

  const onDisconnectWallet = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    disconnect();
  }, [disconnect]);

  const renderPersonalAccount = () => {
    return (
      <>
        {provider && <img src={provider.icon} alt={provider.name} width="24" className="wallet-provider-icon" />}
        <div className="account-descriptor">
          <div className="account-name">Personal Account</div>
          <div className="account-id">{shortenAddress(selectedAccount.address, 8)}</div>
        </div>
      </>
    );
  };

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
  };

  const isSmScreen = (): boolean => {
    return width < 768 ? true : false;
  };

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const bodyContent = (
    <>
      <div className="account-selector-popover-content vertical-scroll">
        <AccountSelector
          onAccountSelected={onCompleteAccountSelection}
          onCreateSafeClick={onCreateSafe}
          onDisconnectWallet={onDisconnectWallet}
        />
      </div>
    </>
  );

  if (!publicKey) {
    return null;
  }

  return (
    <>
      <Popover
        placement={isSmScreen() ? 'topLeft' : 'bottomRight'}
        content={bodyContent}
        open={popoverVisible}
        onOpenChange={handlePopoverVisibleChange}
        className="account-selector-max-width"
        trigger="click"
      >
        <div className="wallet-wrapper">
          <span className="wallet-key">
            {selectedAccount.isMultisig ? renderSupersafeAccount() : renderPersonalAccount()}
          </span>
        </div>
      </Popover>
    </>
  );
};
