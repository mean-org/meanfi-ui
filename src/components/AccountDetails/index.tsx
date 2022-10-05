import { Dropdown, Menu } from "antd";
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import { AccountSelectorModal } from "components/AccountSelectorModal";
import { openNotification } from "components/Notifications";
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from "contexts/wallet";
import {
  IconCopy,
  IconCreateNew,
  IconExchange,
  IconSafe,
  IconWallet
} from "Icons";
import { AppUsageEvent } from 'middleware/segment-service';
import { copyText } from "middleware/ui";
import { shortenAddress } from "middleware/utils";
import { ACCOUNTS_ROUTE_BASE_PATH } from "pages/accounts";
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import "./style.scss";

export const AccountDetails = () => {

  const {
    selectedAccount,
    multisigAccounts,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { publicKey, provider, select, disconnect, resetWalletProvider } = useWallet();
  const [isSelectingAccount, setIsSelectingAccount] = useState<boolean>(false);

  const switchWallet = useCallback(() => {
    setTimeout(() => {
      disconnect();
      navigate('/');
      select();
    }, 500);
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletChange);
  }, [disconnect, navigate, select]);

  const switchAccount = useCallback(() => {
    setIsSelectingAccount(true);
  }, []);

  const onCloseAccountSelector = useCallback(() => {
    setIsSelectingAccount(false);
  }, []);

  const onCompleteAccountSelection = useCallback(() => {
    setIsSelectingAccount(false);
    navigate(ACCOUNTS_ROUTE_BASE_PATH);
  }, []);

  const onCopyAddress = () => {
    if (copyText(selectedAccount.address)) {
      openNotification({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  const onDisconnectWallet = useCallback(() => {
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    disconnect();
    resetWalletProvider();
  }, [disconnect, resetWalletProvider]);

  if (!publicKey) {
    return null;
  }

  const getPlusAccounts = () => {
    if (!selectedAccount.isMultisig || !multisigAccounts || multisigAccounts.length === 0) {
      return '';
    }
    let numSafes = multisigAccounts.length + 1;
    return ` (+${numSafes - 1})`;
  }

  const getMenu = () => {
    const items: ItemType[] = [];
    items.push({
      key: '01-connected-account',
      label: (
        <div onClick={onCopyAddress}>
          <IconCopy className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Copy account address</span>
        </div>
      )
    });
    items.push({
      key: '02-account-change',
      label: (
        <div onClick={switchAccount}>
          <IconExchange className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Switch account{getPlusAccounts()}</span>
        </div>
      )
    });
    items.push({
      key: '03-create-safe',
      label: (
        <div onClick={() => { return false; }}>
          <IconCreateNew className="mean-svg-icons" />
          <span className="menu-item-text ml-1">New SuperSafe account</span>
        </div>
      )
    });
    items.push({type: "divider"});
    items.push({
      key: '04-wallet-provider',
      label: (
        <>
          {provider ? (
            <>
              <img src={provider.icon} alt={provider.name} width="26" />
              <span className="menu-item-text ml-1">Connected with {provider.name}</span>
            </>
          ) : (
            <>
              <IconWallet className="mean-svg-icons" />
              <span className="menu-item-text ml-1">Unknown wallet</span>
            </>
          )}
        </>
      )
    });
    items.push({
      key: '05-disconnect',
      label: (
        <div onClick={onDisconnectWallet} className="text-right">
          <span className="menu-item-text ml-1">{t('account-area.disconnect')}</span>
        </div>
      )
    });

    return <Menu items={items} />;
  }

  const renderPersonalAccount = () => {
    return (
      <>
        {provider && (
          <img src={provider.icon} alt={provider.name} width="24" className="wallet-provider-icon" />
        )}
        <div className="account-descriptor">
          <div className="account-name">Personal Account</div>
          <div className="account-id">{shortenAddress(publicKey, 8)}</div>
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

  return (
    <>
      <div className="wallet-wrapper">
        <Dropdown overlay={getMenu()} placement="bottomRight" trigger={["click"]}>
          <span className="wallet-key">
            {selectedAccount.isMultisig ? renderSupersafeAccount() : renderPersonalAccount()}
          </span>
        </Dropdown>
      </div>

      <AccountSelectorModal
        isVisible={isSelectingAccount}
        isFullWorkflowEnabled={false}
        onHandleClose={onCloseAccountSelector}
        onAccountSelected={onCompleteAccountSelection}
      />

    </>
  );

};
