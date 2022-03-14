import React, { useContext } from 'react';
import { useCallback, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { shortenAddress } from "../../utils/utils";
import {
  IconCopy,
  IconDiagnosis,
  IconExternalLink,
  IconLogout,
  IconWallet,
} from "../../Icons";
import "./style.less";
import { Button, Col, Collapse, Modal, Row } from "antd";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { Identicon } from "../Identicon";
import { notify } from "../../utils/notifications";
import { copyText } from "../../utils/ui";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { useTranslation } from "react-i18next";
import { AppStateContext } from '../../contexts/appstate';
import { segmentAnalytics } from '../../App';
import { AppUsageEvent } from '../../utils/segment-service';

const { Panel } = Collapse;

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
  const { wallet, provider, select, disconnect } = useWallet();

  const switchWallet = () => {
    setTimeout(() => {
      select();
    }, 500);
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletChange);
    close();
  }

  const onCopyAddress = () => {
    if (copyText(wallet?.publicKey)) {
      notify({
        description: t('notifications.account-address-copied-message'),
        type: "info"
      });
    } else {
      notify({
        description: t('notifications.account-address-not-copied-message'),
        type: "error"
      });
    }
  }

  const onCopyDiagnosisInfo = () => {
    if (!diagnosisInfo) {
      notify({
        description: t('account-area.diagnosis-info-not-copied'),
        type: "error"
      });
      return;
    }
    const debugInfo = `${diagnosisInfo.dateTime}\n${diagnosisInfo.clientInfo}\n${diagnosisInfo.networkInfo}\n${diagnosisInfo.accountInfo}\n${diagnosisInfo.appBuildInfo}`;
    if (copyText(debugInfo)) {
      notify({
        description: t('account-area.diagnosis-info-copied'),
        type: "info"
      });
    } else {
      notify({
        description: t('account-area.diagnosis-info-not-copied'),
        type: "error"
      });
    }
  }

  if (!wallet?.publicKey) {
    return null;
  }

  const onDisconnectWallet = () => {
    setSelectedStream(undefined);
    setStreamList(undefined);
    // Record user event in Segment Analytics
    segmentAnalytics.recordEvent(AppUsageEvent.WalletDisconnect);
    close();
    disconnect();
    // TODO: If we decide to turn OFF wallet autoConnect then next line will be needed
    // resetWalletProvider();
  }

  const renderDebugInfo = (
    <div>
      {diagnosisInfo && (
        <>
          {diagnosisInfo.dateTime && (
            <div className="diagnosis-info-item text-monospace">{diagnosisInfo.dateTime}</div>
          )}
          {diagnosisInfo.clientInfo && (
            <div className="diagnosis-info-item text-monospace">{diagnosisInfo.clientInfo}</div>
          )}
          {diagnosisInfo.networkInfo && (
            <div className="diagnosis-info-item text-monospace">{diagnosisInfo.networkInfo}</div>
          )}
          {diagnosisInfo.accountInfo && (
            <div className="diagnosis-info-item text-monospace">{diagnosisInfo.accountInfo}</div>
          )}
          {diagnosisInfo.appBuildInfo && (
            <div className="diagnosis-info-item text-monospace">{diagnosisInfo.appBuildInfo}</div>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      <div className="wallet-wrapper">
        <span className="wallet-key" onClick={showAccount}>
          {shortenAddress(`${wallet.publicKey}`)}
        </span>
      </div>
      <Modal
        className="mean-modal"
        visible={isModalVisible}
        title={t('account-area.modal-title')}
        onCancel={close}
        width={450}
        footer={null}>
        <div className="account-settings-group">
          {/* Wallet */}
          <Row>
            <Col span={16}>
              {t('account-area.wallet-provider')} {provider?.name}
            </Col>
            <Col span={8} className="text-right">
              <Button
                shape="round"
                size="small"
                type="ghost"
                className="mean-icon-button thin-stroke extra-small"
                onClick={switchWallet}>
                <IconWallet className="mean-svg-icons" />
                <span className="icon-button-text">{t('account-area.wallet-change')}</span>
              </Button>
            </Col>
          </Row>
          {/* Account id */}
          <Row>
            <Col span={14}>
              <div className="account-settings-row font-bold font-size-120">
                <Identicon
                  address={wallet.publicKey.toBase58()}
                  style={{ marginRight: "0.5rem", display: "inline-flex" }} />
                <span>
                  {shortenAddress(`${wallet.publicKey}`)}
                </span>
              </div>
            </Col>
            <Col span={10} className="text-right">
              <Button
                shape="round"
                size="small"
                type="ghost"
                className="mean-icon-button thin-stroke extra-small"
                onClick={onDisconnectWallet}>
                <IconLogout className="mean-svg-icons" />
                <span className="icon-button-text">{t('account-area.disconnect')}</span>
              </Button>
            </Col>
          </Row>
          {/* Account helpers */}
          <Row>
            <Col span={10}>
              <span className="simplelink underline-on-hover" role="link" onClick={onCopyAddress}>
                <IconCopy className="mean-svg-icons" />
                <span className="link-text">{t('account-area.copy-address')}</span>
              </span>
            </Col>
            <Col span={14}>
              <a className="simplelink underline-on-hover" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${wallet.publicKey}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons" />
                <span className="link-text">{t('account-area.explorer-link')}</span>
              </a>
            </Col>
          </Row>
          {diagnosisInfo && (
            <div className="position-relative">
              <Button
                shape="round"
                size="small"
                type="ghost"
                className="mean-icon-button thin-stroke extra-small position absolute right-top"
                onClick={onCopyDiagnosisInfo}>
                <IconCopy className="mean-svg-icons" />
                <span className="icon-button-text">{t('general.cta-copy')}</span>
              </Button>
              <Collapse
                ghost
                bordered={false}
                defaultActiveKey={[]}
                expandIcon={({ isActive }) => <IconDiagnosis className="mean-svg-icons" />}>
                <Panel header={t('account-area.diagnosis-info')} key="1">
                  {renderDebugInfo}
                </Panel>
              </Collapse>
            </div>
          )}
        </div>
      </Modal>
    </>
  );

};
