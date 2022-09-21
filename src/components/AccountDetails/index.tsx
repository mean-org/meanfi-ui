import React, { useContext } from 'react';
import { useCallback, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { shortenAddress } from "../../middleware/utils";
import {
  IconCopy,
  IconExchange,
  IconLogout,
  IconPulse,
  IconUser,
  IconWallet,
} from "../../Icons";
import "./style.scss";
import { Button, Dropdown, Menu, Modal } from "antd";
import { copyText } from "../../middleware/ui";
import { useTranslation } from "react-i18next";
import { AppStateContext } from '../../contexts/appstate';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent } from '../../middleware/segment-service';
import { openNotification } from '../Notifications';
import { ItemType } from 'antd/lib/menu/hooks/useItems';

export const AccountDetails = () => {

  const { t } = useTranslation("common");
  const {
    diagnosisInfo,
    setStreamList,
    setSelectedStream,
  } = useContext(AppStateContext);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const { publicKey, provider, select, disconnect, resetWalletProvider } = useWallet();

  const switchWallet = useCallback(() => {
    close();
    setTimeout(() => {
      select();
    }, 500);
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletChange);
  }, [close, select]);

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
    close();
    disconnect();
    resetWalletProvider();
  }, [close, disconnect, resetWalletProvider, setSelectedStream, setStreamList]);

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
          <IconUser className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{shortenAddress(publicKey)}</span>
        </div>
      )
    });
    items.push({
      key: '03-wallet-change',
      label: (
        <div onClick={switchWallet}>
          <IconUser className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{t('account-area.wallet-change')}</span>
        </div>
      )
    });
    items.push({
      key: '04-diagnosis-info',
      label: (
        <div onClick={showAccount}>
          <IconUser className="mean-svg-icons" />
          <span className="menu-item-text ml-1">{t('account-area.diagnosis-info')}</span>
        </div>
      )
    });
    items.push({
      key: '05-disconnect',
      label: (
        <div onClick={onDisconnectWallet}>
          <IconUser className="mean-svg-icons" />
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
    </>
  );

};
