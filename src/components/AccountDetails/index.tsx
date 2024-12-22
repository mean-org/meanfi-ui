import { Popover } from 'antd';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { segmentAnalytics } from 'src/App';
import { IconSafe } from 'src/Icons';
import { CREATE_SAFE_ROUTE_PATH } from 'src/app-constants/common';
import { AccountSelector } from 'src/components/AccountSelector';
import { useWalletAccount } from 'src/contexts/walletAccount';
import useWindowSize from 'src/hooks/useWindowResize';
import { shortenAddress } from 'src/middleware/utils';
import { AppUsageEvent } from 'src/services/segment-service';
import './style.scss';
import { useWallet } from 'src/contexts/wallet';

export const AccountDetails = () => {
  const { selectedAccount, setSelectedAccount } = useWalletAccount();
  const navigate = useNavigate();
  const { width } = useWindowSize();
  const { publicKey, wallet, disconnect } = useWallet();
  const [popoverVisible, setPopoverVisible] = useState(false);

  const onCompleteAccountSelection = useCallback(
    (account: string) => {
      setPopoverVisible(false);
      navigate(`/redirect-account/${account}`);
    },
    [navigate],
  );

  const onCreateSafe = useCallback(() => {
    setPopoverVisible(false);
    navigate(CREATE_SAFE_ROUTE_PATH);
  }, [navigate]);

  const onDisconnectWallet = useCallback(() => {
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    setSelectedAccount(undefined, true);
    navigate('/');
    disconnect();
  }, [navigate, setSelectedAccount, disconnect]);

  const renderPersonalAccount = () => {
    return (
      <>
        {wallet && (
          <img src={wallet.adapter.icon} alt={wallet.adapter.name} width='24' className='wallet-provider-icon' />
        )}
        <div className='account-descriptor'>
          <div className='account-name'>Personal Account</div>
          <div className='account-id'>{shortenAddress(selectedAccount.address, 6)}</div>
        </div>
      </>
    );
  };

  const renderSupersafeAccount = () => {
    return (
      <>
        <IconSafe className='mean-svg-icons wallet-provider-icon' style={{ width: 24, height: 24 }} />
        <div className='account-descriptor'>
          <div className='account-name'>{selectedAccount.name}</div>
          <div className='account-id'>{shortenAddress(selectedAccount.address, 6)}</div>
        </div>
      </>
    );
  };

  const isSmScreen = (): boolean => {
    return width < 768;
  };

  const handlePopoverVisibleChange = (visibleChange: boolean) => {
    setPopoverVisible(visibleChange);
  };

  const bodyContent = (
    <div className='account-selector-popover-content vertical-scroll'>
      <AccountSelector
        onAccountSelected={onCompleteAccountSelection}
        onCreateSafeClick={onCreateSafe}
        onDisconnectWallet={onDisconnectWallet}
      />
    </div>
  );

  if (!publicKey) {
    return null;
  }

  return (
    <Popover
      placement={isSmScreen() ? 'topLeft' : 'bottomRight'}
      content={bodyContent}
      open={popoverVisible}
      onOpenChange={handlePopoverVisibleChange}
      className='account-selector-max-width'
      trigger='click'
    >
      <div className='wallet-wrapper'>
        <span className='wallet-key'>
          {selectedAccount.isMultisig ? renderSupersafeAccount() : renderPersonalAccount()}
        </span>
      </div>
    </Popover>
  );
};
