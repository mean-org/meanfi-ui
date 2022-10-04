import { Button, Dropdown, Menu, Modal } from "antd";
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import { AccountSelectorModal } from "components/AccountSelectorModal";
import { openNotification } from "components/Notifications";
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from "contexts/wallet";
import {
  IconCopy,
  IconCreateNew,
  IconExit,
  IconPulse,
  IconSafe,
  IconUser,
  IconWallet
} from "Icons";
import { AppUsageEvent } from 'middleware/segment-service';
import { copyText } from "middleware/ui";
import { shortenAddress } from "middleware/utils";
import { MeanFiAccountType } from "models/enums";
import { ACCOUNTS_ROUTE_BASE_PATH } from "pages/accounts";
import { useCallback, useContext, useState } from 'react';
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import "./style.scss";

export const AccountDetails = () => {

  const {
    diagnosisInfo,
    accountAddress,
    selectedAccount,
    multisigAccounts,
  } = useContext(AppStateContext);
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { publicKey, provider, select, disconnect, resetWalletProvider } = useWallet();
  const [isSelectingAccount, setIsSelectingAccount] = useState<boolean>(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);

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
    if (copyText(accountAddress)) {
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

  const onCopyDiagnosisInfo = () => {
    if (!diagnosisInfo) {
      openNotification({
        description: t('account-area.diagnosis-info-not-copied'),
        type: "error"
      });
      return;
    }
    const debugInfo = `${diagnosisInfo.dateTime}\n${diagnosisInfo.clientInfo}\n${diagnosisInfo.networkInfo}\n${diagnosisInfo.accountInfo}\n${diagnosisInfo.appBuildInfo}`;
    if (copyText(debugInfo)) {
      openNotification({
        description: t('account-area.diagnosis-info-copied'),
        type: "info"
      });
    } else {
      openNotification({
        description: t('account-area.diagnosis-info-not-copied'),
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

  const renderDebugInfo = (
    <div>
      {diagnosisInfo && (
        <>
          {diagnosisInfo.dateTime && (
            <div className="diagnosis-info-item">{diagnosisInfo.dateTime}</div>
          )}
          {diagnosisInfo.clientInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.clientInfo}</div>
          )}
          {diagnosisInfo.networkInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.networkInfo}</div>
          )}
          {diagnosisInfo.accountInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.accountInfo}</div>
          )}
          {diagnosisInfo.appBuildInfo && (
            <div className="diagnosis-info-item">{diagnosisInfo.appBuildInfo}</div>
          )}
        </>
      )}
    </div>
  );

  const getPlusAccounts = () => {
    if (selectedAccount.type === MeanFiAccountType.Wallet || !multisigAccounts || multisigAccounts.length === 0) {
      return '';
    }
    if (multisigAccounts.length === 2) {
      return ' (+1 safe)';
    } else if (multisigAccounts.length > 2) {
      return ` (+${multisigAccounts.length - 1} safes)`
    } else {
      return '';
    }
  }

  const getMenu = () => {
    const items: ItemType[] = [];
    items.push({
      key: '01-wallet-provider',
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
    items.push({type: "divider"});
    items.push({
      key: '02-connected-account',
      label: (
        <div onClick={onCopyAddress}>
          <IconCopy className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Copy account address</span>
        </div>
      )
    });
    items.push({
      key: '03-account-change',
      label: (
        <div onClick={switchAccount}>
          <IconUser className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Change account{getPlusAccounts()}</span>
        </div>
      )
    });
    items.push({
      key: '04-create-safe',
      label: (
        <div onClick={() => { return false; }}>
          <IconCreateNew className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Create SuperSafe</span>
        </div>
      )
    });
    items.push({
      key: '05-diagnosis-info',
      label: (
        <div onClick={showAccount}>
          <IconPulse className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{t('account-area.diagnosis-info')}</span>
        </div>
      )
    });
    items.push({
      key: '06-disconnect',
      label: (
        <div onClick={onDisconnectWallet}>
          <IconExit className="mean-svg-icons" />
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
          <div className="account-type">Personal Account</div>
          <div className="account-id">{shortenAddress(publicKey)}</div>
        </div>
      </>
    );
  }

  const renderSupersafeAccount = () => {
    return (
      <>
        <IconSafe className="mean-svg-icons wallet-provider-icon" style={{ width: 24, height: 24 }} />
        <div className="account-descriptor">
          <div className="account-type">Super Safe</div>
          <div className="account-id">{selectedAccount.name}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="wallet-wrapper">
        <Dropdown overlay={getMenu()} placement="bottomRight" trigger={["click"]}>
          <span className="wallet-key">
            {selectedAccount.type === MeanFiAccountType.Multisig && renderSupersafeAccount()}
            {selectedAccount.type === MeanFiAccountType.Wallet && renderPersonalAccount()}
          </span>
        </Dropdown>
      </div>

      <Modal
        className="mean-modal simple-modal"
        open={isModalVisible}
        title={<div className="modal-title">{t('account-area.diagnosis-info')}</div>}
        onCancel={close}
        width={450}
        footer={null}>
        <div className="px-4 pb-4">
          {diagnosisInfo && (
            <>
              <div className="mb-3">
                {renderDebugInfo}
              </div>
              <div className="flex-center">
                <Button
                  type="default"
                  shape="round"
                  size="middle"
                  className="thin-stroke"
                  onClick={onCopyDiagnosisInfo}>
                  <IconCopy className="mean-svg-icons" />
                  <span className="icon-button-text">{t('general.cta-copy')}</span>
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <AccountSelectorModal
        isVisible={isSelectingAccount}
        isFullWorkflowEnabled={false}
        onHandleClose={onCloseAccountSelector}
        onAccountSelected={onCompleteAccountSelection}
      />

    </>
  );

};
