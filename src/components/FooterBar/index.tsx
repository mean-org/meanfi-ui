import React from "react";
import { Col, Row } from "antd";

export const FooterBar = () => {

  return (
    <div className="container">
      <Row className="app-footer">
        <Col span={12} className="text-left">
          This product is in beta. Do not deposit or swap large amounts of funds.
        </Col>
        <Col span={12} className="text-right">
          Powered by the Solana Network
        </Col>
      </Row>
    </div>
  );
};
