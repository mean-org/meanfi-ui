import React from 'react';
import { CustomerServiceOutlined, SafetyOutlined, TransactionOutlined } from "@ant-design/icons";
import { Avatar, Button, Col, Row, Timeline } from "antd";
import { PreFooter } from "../../components/PreFooter";
import { MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL, MEAN_FINANCE_DISCORD_URL, MEAN_FINANCE_TWITTER_URL } from "../../constants";
import { useTranslation } from 'react-i18next';

export const IdoView = () => {
  const { t } = useTranslation('common');

  const onApplyToMeanfiCustody = () => {
    window.open(MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL, '_blank','noreferrer');
  }

  return (
    <div className="solid-bg">

      <section className="content contrast-section no-padding">
        <div className="container">
          <Row gutter={[0, 24]}>
            <Col xs={24} md={12}>
              <div className="padded-content">
                <h1 className="heading ido-heading">Welcome to the<br/>Mean <span className="fg-primary-highlight">IDO</span></h1>
                <div className="boxed-area">
                  <h2 className="subheading ido-subheading">How it works</h2>
                  <p>The IDO consists of two consecutive 24 hour phases:</p>
                  <ul className="vertical-list dash-bullet">
                    <li><em className="text-underline">Sale period:</em> USDC may be deposited or withdrawn from the pool. MEAN price will fluctuate based on the size of the pool.</li>
                    <li><em className="text-underline">Grace period:</em> USDC may only be withdrawn from the pool. MEAN price will only go down in this phase.</li>
                  </ul>
                  <div>Afterwards, depositors can redeem an amount of MEAN tokens proportional to their share of the pool.</div>
                </div>
                <div className="text-center px-5 mt-3">
                  <h2 className="subheading ido-subheading">Timeline</h2>
                </div>
                <div className="position-relative">
                  <Timeline mode="left">
                    <Timeline.Item label="2015-09-01">Create a services</Timeline.Item>
                    <Timeline.Item label="2015-09-01 09:12:11">Solve initial network problems</Timeline.Item>
                    <Timeline.Item>Technical testing</Timeline.Item>
                    <Timeline.Item label="2015-09-01 09:12:11">Network problems being solved</Timeline.Item>
                  </Timeline>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className="padded-content flex-column flex-center">
                <div className="ant-image" style={{width: '320px', height: 'auto', maxHeight: '280px'}}>
                  <img className="ant-image-img" alt="IDO Launch" src="/assets/launch.png" />
                </div>
                <div className="text-center px-5 mt-3">
                  <h2 className="subheading ido-subheading">The Mean IDO can only be accessed from select countries.</h2>
                </div>
                <p className="text-center">By clicking acknowledge below, I certify that I am not a resident of Afghanistan, Ivory Coast, Cuba, Iraq, Iran, Liberia, North Korea, Syria, Sudan, South Sudan, Zimbabwe, Antigua, United States, American Samoa, Guam, Northern Mariana Islands, Puerto Rico, United States Minor Outlying Islands, US Virgin Islands, Ukraine, Belarus, Albania, Burma, Central African Republic, Democratic Republic of Congo, Lybia, Somalia, Yemen, United Kingdom, Thailand.</p>
                <p className="text-center">If you have any questions, please contact us via <a className="secondary-link" href={MEAN_FINANCE_TWITTER_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.twitter')}</a>, or <a className="secondary-link" href={MEAN_FINANCE_DISCORD_URL} target="_blank" rel="noopener noreferrer">{t('ui-menus.app-context-menu.discord')}</a>.</p>
                <Button
                  className="main-cta"
                  type="primary"
                  shape="round"
                  size="large"
                  onClick={() => onApplyToMeanfiCustody()}>
                  Apply to MeanFi Custody
                </Button>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      {/* <section className="hero">
        <h1 className="heading">Welcome to the Mean IDO</h1>
        <p className="subheading">The most advanced digital asset platform, for secure crypto custody, trading, staking, governance, and more.</p>
        <Button
          className="main-cta"
          type="primary"
          shape="round"
          size="large"
          onClick={() => onApplyToMeanfiCustody()}>
          Apply to MeanFi Custody
        </Button>
      </section> */}

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
