import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Redirect } from "react-router-dom";
import { useWallet, WALLET_PROVIDERS } from "../../contexts/wallet";
import { shortenAddress, useLocalStorageState } from "../../utils/utils";
import {
  IconCopy,
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconUpload,
  IconWallet,
} from "../../Icons";
import { Button, Col, Modal, Row, Spin, Tooltip } from "antd";
import { SOLANA_EXPLORER_URI_INSPECT_ADDRESS } from "../../constants";
import { Identicon } from "../Identicon";
import { notify } from "../../utils/notifications";
import { AppStateContext } from "../../contexts/appstate";
import { copyText } from "../../utils/ui";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { StreamInfo } from "../../money-streaming/types";

interface StreamStats {
  incoming: number;
  outgoing: number;
}

const defaultStreamStats = {
  incoming: 0,
  outgoing: 0
};

export const CurrentUserBadge = (props: {}) => {

  const [redirect, setRedirect] = useState<string | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const [providerUrl] = useLocalStorageState("walletProvider");
  const {
    streamList,
    loadingStreams,
    customStreamDocked,
    setCustomStreamDocked,
    refreshStreamList,
  } = useContext(AppStateContext);
  const [streamStats, setStreamStats] = useState<StreamStats>(defaultStreamStats);
  const { wallet, publicKey, select } = useWallet();
  const usedProvider = useMemo(
    () => WALLET_PROVIDERS.find(({ url }) => url === providerUrl),
    [providerUrl]
  );

  useEffect(() => {

    const isInboundStream = (item: StreamInfo): boolean => {
      return item.beneficiaryAddress === publicKey?.toBase58();
    }

    const updateStats = () => {
      if (streamList && streamList.length) {
        const incoming = streamList.filter(s => isInboundStream(s));
        const outgoing = streamList.filter(s => !isInboundStream(s));
        const stats: StreamStats = {
          incoming: incoming.length,
          outgoing: outgoing.length
        }
        setStreamStats(stats);
      }
    }

    updateStats();
    return () => {};
  }, [publicKey, streamList]);

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
    refreshStreamList(true);
    setCustomStreamDocked(false);
    setRedirect('/');
  };

  if (!wallet?.publicKey) {
    return null;
  }

  return (
    <>
      {redirect && (<Redirect to={redirect} />)}
      <div className="wallet-wrapper">
        <span className="wallet-key" onClick={showAccount}>
          {shortenAddress(`${wallet.publicKey}`)}
        </span>
        <Tooltip placement="bottom" title="Click to reload streams">
          <div className={`wallet-balance ${loadingStreams ? 'click-disabled' : 'simplelink'}`} onClick={onGoToStreamsClick}>
            <Spin size="small" />
            {customStreamDocked ? (
              <span className="transaction-legend neutral">
                <IconRefresh className="mean-svg-icons"/>
              </span>
            ) : (
              <>
                <span className="transaction-legend incoming">
                  <IconDownload className="mean-svg-icons"/>
                  <span className="incoming-transactions-amout">{streamStats.incoming}</span>
                </span>
                <span className="transaction-legend outgoing">
                  <IconUpload className="mean-svg-icons"/>
                  <span className="incoming-transactions-amout">{streamStats.outgoing}</span>
                </span>
              </>
            )}
          </div>
        </Tooltip>
      </div>
      <Modal
        className="mean-modal"
        visible={isModalVisible}
        title="Account"
        onCancel={close}
        width={450}
        footer={null}>
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
              <a className="secondary-link" target="_blank" rel="noopener noreferrer"
                 href={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${wallet.publicKey}${getSolanaExplorerClusterParam()}`}>
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
