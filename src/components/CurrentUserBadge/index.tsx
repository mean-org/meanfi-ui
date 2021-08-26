import { useCallback, useMemo, useState } from "react";
import { useWallet, WALLET_PROVIDERS } from "../../contexts/wallet";
import { shortenAddress, useLocalStorageState } from "../../utils/utils";
import {
  IconCopy,
  IconExternalLink,
  IconWallet,
} from "../../Icons";
import { Button, Col, Modal, Row } from "antd";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { Identicon } from "../Identicon";
import { notify } from "../../utils/notifications";
import { copyText } from "../../utils/ui";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { useTranslation } from "react-i18next";

export const CurrentUserBadge = (props: {}) => {

  const { t } = useTranslation("common");
  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const [providerUrl] = useLocalStorageState("walletProvider");
  const { wallet, select } = useWallet();
  const usedProvider = useMemo(
    () => WALLET_PROVIDERS.find(({ url }) => url === providerUrl),
    [providerUrl]
  );

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

  const getUiTranslation = (translationId: string) => {
    return t(`account-area.${translationId}`);
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
        title={getUiTranslation('modal-title')}
        onCancel={close}
        width={450}
        footer={null}>
        <div className="account-settings-group">
          {/* Wallet */}
          <Row>
            <Col span={12}>
              {getUiTranslation('wallet-provider')} {usedProvider?.name}
            </Col>
            <Col span={12} className="text-right">
              <Button
                shape="round"
                size="small"
                type="ghost"
                className="mean-icon-button"
                onClick={switchWallet}>
                <IconWallet className="mean-svg-icons" />
                <span className="icon-button-text">{getUiTranslation('wallet-change')}</span>
              </Button>
            </Col>
          </Row>
          {/* Account id */}
          <Row>
            <Col span={24}>
              <div className="account-settings-row font-bold font-size-120">
                <Identicon
                  address={wallet.publicKey.toBase58()}
                  style={{ marginRight: "0.5rem", display: "inline-flex" }} />
                <span>
                  {shortenAddress(`${wallet.publicKey}`)}
                </span>
              </div>
            </Col>
          </Row>
          {/* Account helpers */}
          <Row>
            <Col span={10}>
              <span className="secondary-link" role="link" onClick={onCopyAddress}>
                <IconCopy className="mean-svg-icons link" />
                <span className="link-text">{getUiTranslation('copy-address')}</span>
              </span>
            </Col>
            <Col span={14}>
              <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${wallet.publicKey}${getSolanaExplorerClusterParam()}`}>
                <IconExternalLink className="mean-svg-icons link" />
                <span className="link-text">{getUiTranslation('explorer-link')}</span>
              </a>
            </Col>
          </Row>
        </div>
      </Modal>
    </>
  );

};
