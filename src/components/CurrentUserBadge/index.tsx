import { useCallback, useMemo, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { formatNumber, shortenAddress, useLocalStorageState } from "../../utils/utils";
import { useNativeAccount } from "../../contexts/accounts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { IconCopy, IconDownload, IconExternalLink, IconUpload, IconWallet } from "../../Icons";
import { Button, Col, Modal, Row } from "antd";
import { WALLET_PROVIDERS } from "../../constants";
import { Identicon } from "../Identicon";
import { copyText } from "../../utils/ui";
import { notify } from "../../utils/notifications";
import { useHistory } from "react-router-dom";

const SOLANA_EXPLORER_URI = 'https://explorer.solana.com/address/';

export const CurrentUserBadge = (props: {}) => {

  const history = useHistory();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const [providerUrl] = useLocalStorageState("walletProvider");

  const { wallet, select } = useWallet();
  const { account } = useNativeAccount();
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
        message: "Copy to Clipboard",
        description: "Account Address successfully copied",
      });
    } else {
      notify({
        message: "Copy to Clipboard",
        description: "Could not copy Account Address",
      });
    }
  }

  const onGoToStreamsClick = () => {
    history.push("/streams");
  }

  if (!wallet?.publicKey) {
    return null;
  }

  return (
    <>
      <div className="wallet-wrapper">
        <span className="wallet-key" onClick={showAccount}>
          {shortenAddress(`${wallet.publicKey}`)}
        </span>
        <div className="wallet-balance simplelink" onClick={onGoToStreamsClick}>
          <span className="effective-amount">
            {formatNumber.format((account?.lamports || 0) / LAMPORTS_PER_SOL)} SOL
          </span>
          <span className="transaction-legend incoming">
            <IconDownload className="mean-svg-icons"/>
            <span className="incoming-transactions-amout">0</span>
          </span>
          <span className="transaction-legend outgoing">
            <IconUpload className="mean-svg-icons"/>
            <span className="incoming-transactions-amout">0</span>
          </span>
        </div>
      </div>
      <Modal
        className="mean-modal"
        visible={isModalVisible}
        title="Account"
        onCancel={close}
        width={450}
        footer={null}
      >
        <div className="account-settings-group">
          {/* Wallet */}
          <Row>
            <Col span={12}>
              Connected with {usedProvider?.name}
            </Col>
            <Col span={12} className="text-right">
              <Button
                shape="round"
                size="small"
                type="ghost"
                className="mean-icon-button"
                onClick={switchWallet}>
                <IconWallet className="mean-svg-icons" />
                <span className="icon-button-text">Change</span>
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
                <span className="link-text">Copy Address</span>
              </span>
            </Col>
            <Col span={14}>
              <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${wallet.publicKey}`} target="_blank" rel="noopener noreferrer">
                <IconExternalLink className="mean-svg-icons link" />
                <span className="link-text">View on Solana Explorer</span>
              </a>
            </Col>
          </Row>
        </div>
      </Modal>
    </>
  );

};
