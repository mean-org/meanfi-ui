import { Col, Row } from "antd";
import { useWallet } from "../../contexts/wallet";
import { CurrentUserBadge } from "../CurrentUserBadge";
import { ConnectButton } from "../ConnectButton";

export const FooterBar = () => {
  const { connected } = useWallet();

  return (
    <div className="container">
      <div>
        <Row className="app-footer">
          <Col span={12} className="text-left">
            This product is in beta. Do not deposit or swap large amounts of funds.
          </Col>
          <Col span={12} className="text-right">
            Powered by the Solana Network
          </Col>
        </Row>
      </div>
      <div className="footer-bar">
        {connected ? (
          <div className="footer-account-bar">
            <CurrentUserBadge />
          </div>
        ) : (
          <ConnectButton
            type="text"
            size="large"
            allowWalletChange={true}
          />
        )}
      </div>
    </div>
  );
};
