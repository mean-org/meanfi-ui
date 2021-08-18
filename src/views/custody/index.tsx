import { HddOutlined, SafetyOutlined } from "@ant-design/icons";
import { Avatar, Button, Col, Row, Image } from "antd";
import { PreFooter } from "../../components/PreFooter";

export const CustodyView = () => {

  return (
    <div className="solid-bg">
      <div className="hero">
        <h1 className="heading">Crypto Asset Custody for Institutions</h1>
        <Button
          className="main-cta"
          type="primary"
          shape="round"
          size="large"
          onClick={() => {}}>
          Apply to MeanFi Custody
        </Button>
      </div>
      <div className="container main-container">

        <section className="content">
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <div className="highlight-box">
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
        </section>

        <section className="content">
          <Row gutter={[24, 24]}>
            <Col xs={{span: 24, order: 2}} md={{span: 12, order: 1}}>
              <div className="ant-image" style={{width: '100%', height: 'auto'}}>
                <img className="ant-image-img" alt=""
                      src="https://images.squarespace-cdn.com/content/v1/5475f6eae4b0821160f6ac3e/1538589349188-9CFX678L2PDDFZVCOIH1/blockchain+handshake?format=1500w" />
              </div>
            </Col>
            <Col xs={{span: 24, order: 1}} md={{span: 12, order: 2}}>
              <div className="highlight-box">
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
        </section>

        <section className="content">
          <div className="boxed-area align-center">
            <div>Lorem ipsum dolor sit amet consectetur adipisicing elit. Optio harum fuga libero, tempore, error aspernatur iure similique vero deserunt quas, reprehenderit eum corporis magni expedita. Libero ut deserunt dolores aliquid mollitia corporis cum sint in pariatur eveniet dicta, quo dignissimos ducimus obcaecati quasi repudiandae, saepe maiores molestiae autem reprehenderit hic!</div>
          </div>
        </section>
      </div>
      <PreFooter />
    </div>
  );

};
