import { Button, Col, Dropdown, Menu, Row } from "antd";
import { ResumeItem } from "../../components/ResumeItem";
import { TabsMean } from "../../components/TabsMean";
import { IconArrowBack, IconArrowForward, IconEllipsisVertical } from "../../Icons";

export const StreamingAccountView = (props: {
  stream?: any;
  onSendFromStreamingAccountDetails?: any;
  onSendFromOutgoingStreamInfo?: any;
}) => {

  const { stream, onSendFromStreamingAccountDetails, onSendFromOutgoingStreamInfo  } = props;

  const hideDetailsHandler = () => {
    onSendFromStreamingAccountDetails();
  }

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={() => {}}>
        <span className="menu-item-text">Close account</span>
      </Menu.Item>
      <Menu.Item key="ms-01" onClick={() => {}}>
        <span className="menu-item-text">Refresh account data</span>
      </Menu.Item>
      <Menu.Item key="ms-02" onClick={() => {}}>
        <span className="menu-item-text">SOL balance</span>
      </Menu.Item>
    </Menu>
  );

  const streamingAccountstreams = [
    {
      title: "Hourly Payment for Yamel",
      amount: "500.00 USDC/hour",
      resume: "out of funds on 01/02/2022",
      status: 1
    },
    {
      title: "Monthly Payment for Yansel",
      amount: "500.00 USDC/month",
      resume: "streaming since 04/15/2022",
      status: 2
    },
    {
      title: "Weekly payment for Pavelsan",
      amount: "500.00 USDC/week",
      resume: "paused on 01/02/2022",
      status: 0
    },
    {
      title: "Hourly payment for Eydel",
      amount: "500.00 USDC/hour",
      resume: "starts on 6/9/2022",
      status: 4
    },
  ];

  const renderStreamingAccountStreams = (
    <>
      {streamingAccountstreams.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown outgoing stream";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
          >
            <ResumeItem
              id={index}
              title={title}
              subtitle={stream.amount}
              resume={stream.resume}
              status={stream.status}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
            />
          </div>
        )
      })}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "streams",
      name: "Streams",
      render: renderStreamingAccountStreams
    },
    {
      id: "activity",
      name: "Activity",
      render: ""
    }
  ];

  return (
    <>
      <div className="">
        <Row gutter={[8, 8]} className="safe-details-resume">
          <div onClick={hideDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        <ResumeItem
          title={stream.title}
          subtitle={stream.subtitle}
          amount={stream.amount}
          resume={stream.resume}
          isDetailsPanel={true}
          isLink={false}
        />

        <Row gutter={[8, 8]} className="safe-btns-container mb-1">
          <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
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
                  Add funds
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => {}}>
                <div className="btn-content">
                  Withdraw funds
                </div>
            </Button>
          </Col>

          <Col xs={4} sm={6} md={4} lg={6}>
            <Dropdown
              overlay={menu}
              placement="bottomRight"
              trigger={["click"]}>
              <span className="ellipsis-icon icon-button-container mr-1">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                  onClick={(e) => e.preventDefault()}
                />
              </span>
            </Dropdown>
          </Col>
        </Row>

        <TabsMean
          tabs={tabs}
          defaultTab="streams"
        />
      </div>
    </>
  )
}