import React from 'react';
import { CustomerServiceOutlined, SafetyOutlined, TransactionOutlined } from "@ant-design/icons";
import { Avatar, Button, Col, Row } from "antd";
import { PreFooter } from "../../components/PreFooter";
import { MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL } from "../../constants";

export const CustodyView = () => {

  const onApplyToMeanfiCustody = () => {
    window.open(MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL, '_blank','noreferrer');
  }

  return (
    <div className="solid-bg">

      <div className="hero">
        <h1 className="heading">Crypto Asset Custody</h1>
        <p className="subheading">The most advanced digital asset platform, for secure crypto custody, trading, staking, governance, and more.</p>
        <Button
          className="main-cta"
          type="primary"
          shape="round"
          size="large"
          onClick={() => onApplyToMeanfiCustody()}>
          Apply to MeanFi Custody
        </Button>
      </div>

      <section className="content">
        <div className="container">
          <Row gutter={[24, 24]}>
            <Col xs={24} md={8}>
              <div className="highlight-box text-center">
                <div className="highlight-icon">
                  <Avatar
                    size={{ xs: 64, sm: 64, md: 64, lg: 72, xl: 80, xxl: 100 }}
                    icon={<SafetyOutlined />}
                  />
                </div>
                <h2 className="highlight-title">Safeguard your investments</h2>
                <div className="text-container">
                  <p className="highlight-text">We provide secure custody solutions for institutions and individuals alike so they can safely invest in crypto assets.</p>
                </div>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div className="highlight-box text-center">
                <div className="highlight-icon">
                  <Avatar
                    size={{ xs: 64, sm: 64, md: 64, lg: 72, xl: 80, xxl: 100 }}
                    icon={<TransactionOutlined />}
                  />
                </div>
                <h2 className="highlight-title">Trade, borrow, and earn rewards</h2>
                <div className="text-container">
                  <p className="highlight-text">With MeanFi Trading, access multiple venues through one onboarding. Borrow crypto or USD against crypto collateral, or lend and earn returns on assets under custody.</p>
                </div>
              </div>
            </Col>
            <Col xs={24} md={8}>
              <div className="highlight-box text-center">
                <div className="highlight-icon">
                  <Avatar
                    size={{ xs: 64, sm: 64, md: 64, lg: 72, xl: 80, xxl: 100 }}
                    icon={<CustomerServiceOutlined />}
                  />
                </div>
                <h2 className="highlight-title">Onboarding and Support</h2>
                <div className="text-container">
                  <p className="highlight-text">Dedicated Support Team that guides you during the onboard process and help you resolve any challenge.</p>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      <section className="content flex-center contrast-section min-section-height">
        <div className="container">
          <div className="highlight-box text-center">
            <h2 className="highlight-title">WHY MEANFI CUSTODY</h2>
            <div className="text-container">
              <p className="highlight-text">We're a team of engineers, designers, and crypto experts who believe that the future is digital assets. However, with no way to securely store them right now we feel like our hands are tied behind our back. So we decided to build MeanFi Custody so that you can finally make your money work for you!</p>
            </div>
          </div>
        </div>
      </section>

      <section className="content flex-center min-section-height">
        <div className="container">
          <div className="highlight-box text-center">
            <h2 className="highlight-title">Supported Assets</h2>
            <div className="text-container">
              <p className="highlight-text">MeanFi supports assets that meet our standards of quality and safety. Our list includes USDC, USDT, SOL, DAI, and more. We are always looking to grow our portfolio with new Assets. To learn more about our roadmap, please get in touch.</p>
              <Button
                className="main-cta"
                type="primary"
                shape="round"
                size="large"
                onClick={() => onApplyToMeanfiCustody()}>
                Apply to MeanFi Custody
              </Button>
            </div>
          </div>
        </div>
      </section>

{/* 
      <section className="content">
        <div className="container">
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <div className="highlight-box justify-content-center">
                <div className="highlight-icon">
                  <Avatar
                    size={{ xs: 64, sm: 64, md: 64, lg: 72, xl: 80, xxl: 100 }}
                    icon={<HddOutlined />}
                  />
                </div>
                <h2 className="highlight-title">Feature highlights</h2>
                <div className="text-container">
                  <p className="highlight-text">Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptates corporis temporibus obcaecati voluptate nesciunt ea aliquid eos, explicabo molestiae fuga vero pariatur.</p>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="ant-image" style={{width: '100%', height: 'auto'}}>
                <img className="ant-image-img" alt=""
                      src="https://images.squarespace-cdn.com/content/v1/58f7bc39bebafb94498d25bf/1598361043038-I1DQT0LWPTPJOSK2Z0PP/crypto-asset-custody.jpeg?format=1500w" />
              </div>
            </Col>
          </Row>
        </div>
      </section>

      <section className="content">
        <div className="container">
          <Row gutter={[24, 24]}>
            <Col xs={{span: 24, order: 2}} md={{span: 12, order: 1}}>
              <div className="ant-image" style={{width: '100%', height: 'auto'}}>
                <img className="ant-image-img" alt=""
                      src="https://images.squarespace-cdn.com/content/v1/5475f6eae4b0821160f6ac3e/1538589349188-9CFX678L2PDDFZVCOIH1/blockchain+handshake?format=1500w" />
              </div>
            </Col>
            <Col xs={{span: 24, order: 1}} md={{span: 12, order: 2}}>
              <div className="highlight-box justify-content-center">
                <div className="highlight-icon">
                  <Avatar
                    size={{ xs: 64, sm: 64, md: 64, lg: 72, xl: 80, xxl: 100 }}
                    icon={<SafetyOutlined />}
                  />
                </div>
                <h2 className="highlight-title">Feature highlights</h2>
                <div className="text-container">
                  <p className="highlight-text">Lorem ipsum dolor sit amet consectetur adipisicing elit. Voluptates corporis temporibus obcaecati voluptate nesciunt ea aliquid eos, explicabo molestiae fuga vero pariatur.</p>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>
 */}

      <PreFooter />
    </div>
  );

};
