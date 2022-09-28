import { Button, Dropdown, Menu, Modal } from "antd";
import { ItemType } from 'antd/lib/menu/hooks/useItems';
import { segmentAnalytics } from 'App';
import { AccountSelectorModal } from "components/AccountSelectorModal";
import { openNotification } from "components/Notifications";
import { AppStateContext } from 'contexts/appstate';
import { useWallet } from "contexts/wallet";
import {
  IconCopy,
  IconExit,
  IconPulse,
  IconUser,
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
    diagnosisInfo,
    setSelectedStream,
    setStreamList,
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

  const onCompleteAccountSelection = useCallback(() => {
    setIsSelectingAccount(false);
    navigate(ACCOUNTS_ROUTE_BASE_PATH);
  }, []);

  const onCopyAddress = () => {
    if (copyText(publicKey)) {
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
    setSelectedStream(undefined);
    setStreamList(undefined);
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    disconnect();
    resetWalletProvider();
  }, [disconnect, resetWalletProvider, setSelectedStream, setStreamList]);

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
          <span className="menu-item-text ml-1">Click to copy address</span>
        </div>
      )
    });
    items.push({
      key: '03-wallet-change',
      label: (
        <div onClick={switchWallet}>
          <IconWallet className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{t('account-area.wallet-change')}</span>
        </div>
      )
    });
    items.push({
      key: '04-account-change',
      label: (
        <div onClick={switchAccount}>
          <IconUser className="mean-svg-icons" />
          <span className="menu-item-text ml-1">Change account</span>
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

  return (
    <>
      <div className="wallet-wrapper">
        <Dropdown overlay={getMenu()} placement="bottomRight" trigger={["click"]}>
          <span className="wallet-key">
            {provider && (
              <img src={provider.icon} alt={provider.name} width="22" className="wallet-provider-icon" />
            )}
            {shortenAddress(`${publicKey}`)}
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
        onAccountSelected={onCompleteAccountSelection}
      />

    </>
  );

};
