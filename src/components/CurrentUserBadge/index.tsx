import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useWallet } from "../../contexts/wallet";
import { shortenAddress, useLocalStorageState } from "../../utils/utils";
import { IconCopy, IconDownload, IconExternalLink, IconUpload, IconWallet } from "../../Icons";
import { Button, Col, Modal, Row } from "antd";
import { SOLANA_EXPLORER_URI, WALLET_PROVIDERS } from "../../constants";
import { Identicon } from "../Identicon";
import { copyText } from "../../utils/ui";
import { notify } from "../../utils/notifications";
import { AppStateContext } from "../../contexts/appstate";
import { StreamInfo } from "../../money-streaming/money-streaming";
import { PublicKey } from "@solana/web3.js";
import { Constants } from "../../money-streaming/constants";
import { listStreams } from "../../money-streaming/utils";
import { useConnection } from "../../contexts/connection";

interface StreamStats {
  incoming: number;
  outgoing: number;
}

const defaultStreamStats = {
  incoming: 0,
  outgoing: 0
};

export const CurrentUserBadge = (props: {}) => {

  const [isModalVisible, setIsModalVisible] = useState(false);
  const showAccount = useCallback(() => setIsModalVisible(true), []);
  const close = useCallback(() => setIsModalVisible(false), []);
  const [providerUrl] = useLocalStorageState("walletProvider");
  const {
    streamList,
    setCurrentScreen,
    setStreamList,
    setSelectedStream,
    setStreamDetail,
  } = useContext(AppStateContext);
  const [streamStats, setStreamStats] = useState<StreamStats>(defaultStreamStats);
  const connection = useConnection();
  const { wallet, publicKey, select } = useWallet();
  const usedProvider = useMemo(
    () => WALLET_PROVIDERS.find(({ url }) => url === providerUrl),
    [providerUrl]
  );

  const refreshStreamList = () => {
    if (publicKey) {
      const programId = new PublicKey(Constants.STREAM_PROGRAM_ADDRESS);
  
      listStreams(connection, programId, publicKey, publicKey, 'finalized', true)
        .then(async streams => {
          setStreamList(streams);
          setTimeout(() => {
            console.log('streamList:', streamList);
            setSelectedStream(streams[0]);
            setStreamDetail(streams[0]);
            setCurrentScreen("streams");
          }, 500);
        });
    }
  };

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
    refreshStreamList();
  };

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
          {/* <span className="effective-amount">
            {formatNumber.format((account?.lamports || 0) / LAMPORTS_PER_SOL)} SOL
          </span> */}
          <span className="transaction-legend incoming">
            <IconDownload className="mean-svg-icons"/>
            <span className="incoming-transactions-amout">{streamStats.incoming}</span>
          </span>
          <span className="transaction-legend outgoing">
            <IconUpload className="mean-svg-icons"/>
            <span className="incoming-transactions-amout">{streamStats.outgoing}</span>
          </span>
        </div>
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
