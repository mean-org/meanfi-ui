import { Col, Row } from "antd";
import { ResumeItem } from "../ResumeItem";
import { RightInfoDetails } from "../RightInfoDetails";
import { TabsMean } from "../TabsMean";
import { IconArrowBack } from "../../Icons";
import "./style.scss";

export const MoneyStreamDetails = (props: {
  stream?: any;
  hideDetailsHandler?: any;
  infoData?: any;
  detailsData?: any;
  buttons?: any;
}) => {

  const { stream, hideDetailsHandler, infoData, detailsData, buttons } = props;

  // Render details
  const renderDetails = (
    <>
      {detailsData.map((detail: any, index: number) => (
        <Row gutter={[8, 8]} key={index} className="mb-1">
          <Col span={8} className="pr-1">
            <span className="info-label">{detail.label}</span>
          </Col>
          <Col span={16} className="pl-1">
            <span>{detail.value}</span>
          </Col>
        </Row>
      ))}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "details",
      name: "Details",
      render: renderDetails
    },
    {
      id: "activity",
      name: "Activity",
      render: ""
    }
  ];

  return (
    <>
      <div className="safe-details-container">
        <Row gutter={[8, 8]} className="safe-details-resume">
          <div onClick={hideDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        {stream && (
          <ResumeItem
            title={stream.title}
            status={stream.status}
            subtitle={stream.amount}
            resume={stream.resume}
            isDetailsPanel={true}
            isLink={false}
          />
        )}

        {infoData && (
          <RightInfoDetails
            infoData={infoData}
          /> 
        )}

        {buttons}

        {tabs && (
          <TabsMean
            tabs={tabs}
            defaultTab="details"
          /> 
        )}
      </div>
    </>
  )
}