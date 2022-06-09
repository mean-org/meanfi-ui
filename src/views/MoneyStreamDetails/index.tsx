import { Button, Col, Row } from "antd";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TabsMean } from "../../components/TabsMean";
import { IconArrowBack } from "../../Icons";
import "./style.scss";

export const MoneyStreamDetailsView = (props: {
  stream?: any;
  onSendFromStreamDetails?: any;
  // tabs?: Array<any>;
}) => {

  const { stream, onSendFromStreamDetails } = props;

  // Protocol

  // Balance

  const hideDetailsHandler = () => {
    onSendFromStreamDetails();
  }

  // Info Data
  const infoData = [
    {
      name: "Funds available to withdraw now",
      value: "22.15258 USDC"
    },
  ]

  // Tabs
  const tabs = [
    {
      id: "details",
      name: "Details",
      render: ""
    },
    {
      id: "activity",
      name: "Activity",
      render: ""
    }
  ];

  return (
    <>
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span className="ml-1">Back</span>
        </div>
      </Row>

      <ResumeItem
        title={stream.title}
        status={stream.status}
        subtitle={stream.amount}
        resume={stream.resume}
        isDetailsPanel={true}
        isLink={false}
      />

      <RightInfoDetails
        infoData={infoData}
      /> 

      <Row gutter={[8, 8]} className="safe-btns-container mb-1">
        <Col xs={24} sm={24} md={24} lg={24} className="btn-group">
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={() => {}}>
              <div className="btn-content">
                Create stream
              </div>
          </Button>
          <Button
            type="default"
            shape="round"
            size="small"
            className="thin-stroke"
            onClick={() => {}}>
              <div className="btn-content">
                Find money stream
              </div>
          </Button>
        </Col>
      </Row>

      <TabsMean
        tabs={tabs}
        defaultTab="details"
      />
    </>
  )
}