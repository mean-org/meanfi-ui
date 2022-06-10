import { Button, Col, Dropdown, Menu, Row } from "antd";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { IconEllipsisVertical } from "../../Icons";
import { MoneyStreamDetails } from "../../components/MoneyStreamDetails";

export const MoneyStreamsOutgoingView = (props: {
  stream?: any;
  onSendFromOutgoingStreamDetails?: any;
  // tabs?: Array<any>;
}) => {

  const { stream, onSendFromOutgoingStreamDetails } = props;

  const hideDetailsHandler = () => {
    onSendFromOutgoingStreamDetails();
  }

  // Info Data
  const infoData = [
    {
      name: "Funds left in account",
      value: "0.000000 USDC"
    },
  ];

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={() => {}}>
        <span className="menu-item-text">Copy stream id</span>
      </Menu.Item>
      <Menu.Item key="ms-01" onClick={() => {}}>
        <span className="menu-item-text">View on Explorer</span>
      </Menu.Item>
      <Menu.Item key="ms-01" onClick={() => {}}>
        <span className="menu-item-text">Close stream</span>
      </Menu.Item>
    </Menu>
  );

  // Buttons
  const buttons = (
    <Row gutter={[8, 8]} className="safe-btns-container mb-1">
      <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
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
              Pause stream
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
  );

  const sendingTo =  <CopyExtLinkGroup
    content={"Gc88HJN4eNssQkp7LUTGfpo14Y3wE6zKFrEBtLrmiQpq"}
    number={8}
    externalLink={true}
  />

  // Tab details
  const detailsData = [
    {
      label: "Started on:",
      value: "March 3rd 2022"
    },
    {
      label: "Sending to:",
      value: sendingTo ? sendingTo : "--"
    },
    {
      label: "Payment rate:",
      value: "3.29805 USDC / month"
    },
    {
      label: "Reserved allocation:",
      value: "100.00000 USDC"
    },
    {
      label: "Funds sent to recipient:",
      value: "50.12569 USDC"
    },
    {
      label: "Funds will run out in:",
      value: "12 days and 23 hours"
    },
    {
      label: "Funds ran out on:",
      value: "June 1, 2022 (6 days ago)"
    },
  ];

  return (
    <>
      <MoneyStreamDetails
        stream={stream}
        hideDetailsHandler={hideDetailsHandler}
        infoData={infoData}
        detailsData={detailsData}
        buttons={buttons}
      />
    </>
  )
}