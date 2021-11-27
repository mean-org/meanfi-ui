import React, { useContext } from 'react';
import { useCallback, useMemo, useState } from "react";
import { useWallet, WALLET_PROVIDERS } from "../../contexts/wallet";
import { shortenAddress, useLocalStorageState } from "../../utils/utils";
import {
  IconCopy,
  IconExternalLink,
  IconLogout,
  IconWallet,
} from "../../Icons";
import { Button, Col, Modal, Row } from "antd";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { Identicon } from "../Identicon";
import { notify } from "../../utils/notifications";
import { copyText } from "../../utils/ui";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { useTranslation } from "react-i18next";
import { AppStateContext } from '../../contexts/appstate';

export const CurrentUserBadge = () => {

  const { t } = useTranslation("common");
  const {
    setSelectedStream,
    setStreamList
  } = useContext(AppStateContext);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const { wallet, provider, select, disconnect, resetWalletProvider } = useWallet();

  const switchWallet = () => {
    setTimeout(() => {
      select();
    }, 500);
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

  if (!wallet?.publicKey) {
    return null;
  }

  const onDisconnectWallet = () => {
    setSelectedStream(undefined);
    setStreamList(undefined);
    close();
    disconnect();
    resetWalletProvider();
  }

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
              <span className="secondary-link" role="link" onClick={onCopyAddress}>
                <IconCopy className="mean-svg-icons link" />
                <span className="link-text">{t('account-area.copy-address')}</span>
              </span>
            </Col>
            <Col span={14}>
              <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${wallet.publicKey}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons link" />
                <span className="link-text">{t('account-area.explorer-link')}</span>
              </a>
            </Col>
          </Row>
        </div>
      </Modal>
    </>
  );

};
