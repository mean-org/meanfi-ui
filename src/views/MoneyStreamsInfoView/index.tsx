import { Button, Col, Row } from "antd";
import { RightInfoDetails } from "../../components/RightInfoDetails";

export const MoneyStreamsInfoView = (props: {
  // tabs?: Array<any>;
}) => {

  // const { tabs } = props;

  // Protocol

  // Balance

  const infoData = [
    {
      name: "Protocol",
      value: "Money Streams",
      content: "Badges"
    },
    {
      name: "Balance (My TVL)",
      value: "$3,391.01",
      content: "Tracking 2 smart contracts"
    }
  ];

  return (
    <>
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

      {/* <TabsMean
        tabs={tabs}
        defaultTab="summary"
      /> */}
    </>
  )
}