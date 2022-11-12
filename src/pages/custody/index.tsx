import React from 'react';
import {
  CustomerServiceOutlined,
  SafetyOutlined,
  TransactionOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Col, Row } from 'antd';
import { PreFooter } from '../../components/PreFooter';
import { MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL } from '../../constants';
import { useTranslation } from 'react-i18next';

export const CustodyView = () => {
  const { t } = useTranslation('common');

  const onApplyToMeanfiCustody = () => {
    window.open(MEAN_FINANCE_APPLY_TO_CUSTODY_FORM_URL, '_blank', 'noreferrer');
  };

  return (
    <div className="solid-bg">
      <section className="hero">
        <h1 className="heading">{t('custody.heading')}</h1>
        <p className="subheading">{t('custody.subheading')}</p>
        <Button
          className="main-cta"
          type="primary"
          shape="round"
          size="large"
          onClick={() => onApplyToMeanfiCustody()}
        >
          {t('custody.custody-button')}
        </Button>
      </section>

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
                <h2 className="highlight-title">
                  {t('custody.first-container.title-one')}
                </h2>
                <div className="text-container">
                  <p className="highlight-text">
                    {t('custody.first-container.text-one')}
                  </p>
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
                <h2 className="highlight-title">
                  {t('custody.first-container.title-two')}
                </h2>
                <div className="text-container">
                  <p className="highlight-text">
                    {t('custody.first-container.text-two')}
                  </p>
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
                <h2 className="highlight-title">
                  {t('custody.first-container.title-three')}
                </h2>
                <div className="text-container">
                  <p className="highlight-text">
                    {t('custody.first-container.text-three')}
                  </p>
                </div>
              </div>
            </Col>
          </Row>
        </div>
      </section>

      <section className="content flex-center contrast-section min-section-height">
        <div className="container">
          <div className="highlight-box text-center">
            <h2 className="highlight-title">
              {t('custody.second-container.title')}
            </h2>
            <div className="text-container">
              <p className="highlight-text">
                {t('custody.second-container.text')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="content flex-center min-section-height">
        <div className="container">
          <div className="highlight-box text-center">
            <h2 className="highlight-title">
              {t('custody.third-container.title')}
            </h2>
            <div className="text-container">
              <p className="highlight-text">
                {t('custody.third-container.text')}
              </p>
              <Button
                className="main-cta"
                type="primary"
                shape="round"
                size="large"
                onClick={() => onApplyToMeanfiCustody()}
              >
                {t('custody.custody-button')}
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
