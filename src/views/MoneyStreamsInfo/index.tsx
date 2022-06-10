import { Button, Col, Menu, Row } from "antd";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { RightInfoDetails } from "../../components/RightInfoDetails";
import { TabsMean } from "../../components/TabsMean";
import { IconArrowForward, IconVerticalEllipsis } from "../../Icons";
import "./style.scss";

export const MoneyStreamsInfoView = (props: {
  onSendFromIncomingStreamInfo?: any;
  onSendFromOutgoingStreamInfo?: any;
  onSendFromStreamingAccountDetails?: any;
}) => {

  const { 
    onSendFromIncomingStreamInfo,
    onSendFromOutgoingStreamInfo,
    onSendFromStreamingAccountDetails
  } = props;

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

  const renderSummary = (
    <>
      <Row gutter={[8, 8]}>
        <Col xs={22} sm={10} md={22} lg={10} className="background-card">
          <h3>Incoming Streams</h3>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $49,853.58
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                3 streams
              </div>
            </div>
          </div>
        </Col>
        <Col xs={22} sm={10} md={22} lg={10} className="background-card">
          <h3>Outgoing Streams</h3>
          <div className="card-row">
            <div className="card-column">
              <div className="info-label">
                Balance
              </div>
              <div className="info-value">
                $12,291.01
              </div>
            </div>
            <div className="card-column">
              <div className="info-label">
                Total streams
              </div>
              <div className="info-value">
                4 streams
              </div>
            </div>
          </div>
        </Col>
      </Row>
    </>
  );

  const selectedMultisig = "C4Eb4AJh5ribXGnzvbFuRLWUBdp1AogpD8q1RssTB7H9";
  const subtitle = <CopyExtLinkGroup
    content={selectedMultisig}
    number={8}
    externalLink={true}
  />

  const incomingStreams = [
    {
      title: "Monthly Remittance from Jesse",
      amount: "3.29805 USDC/hour",
      resume: "out of funds on 01/02/2022",
      status: 1
    },
    {
      title: "Mean Salary for Pavelsan",
      amount: "100 USDC/hour",
      resume: "starts in 06:35:11",
      status: 2
    },
    {
      title: "Grape’s Research Distribution",
      amount: "25,158 GRAPE/hour",
      resume: "streaming since 01/05/2022",
      status: 0
    },
  ];

  const outgoingStreams = [
    {
      title: "Monthly remittance for Mom",
      amount: "150 USDC/month",
      resume: "streaming since 01/05/2022",
      status: 1
    }
  ];

  const streamingAccounts = [
    {
      title: "Coinbase team salary",
      subtitle: subtitle,
      amount: "3",
      resume: "streams"
    }
  ];

  const teamSalary = [
    {
      title: "Yamel Amador’s Salary",
      amount: "5.11 USDC/hour",
      resume: "streaming since 03/01/2022",
      status: 1
    },
    {
      title: "Tania’s Salary",
      amount: "1,000.00 USDC/min",
      resume: "streaming since 04/15/2022",
      status: 2
    },
    {
      title: "Michel Comp",
      amount: "2,150.11 USDC/month",
      resume: "out of funds on 01/02/2022",
      status: 0
    }
  ];

  // Incoming streams list
  const renderListOfIncomingStreams = (
    <>
      {incomingStreams.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromIncomingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown incoming stream";

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

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="0" onClick={() => {}}>
        <span className="menu-item-text">Add outgoing stream</span>
      </Menu.Item>
      <Menu.Item key="0" onClick={() => {}}>
        <span className="menu-item-text">Add streaming account</span>
      </Menu.Item>
    </Menu>
  );

  // Outgoing streams list
  const renderListOfOutgoingStreams = (
    <>
      <ResumeItem
        title="Outflows"
        classNameTitle="text-uppercase"
        subtitle={subtitle}
        amount={1}
        resume="outflow"
        className="account-category-title"
        hasRightIcon={true}
        rightIconHasDropdown={true}
        rightIcon={<IconVerticalEllipsis className="mean-svg-icons"/>}
        dropdownMenu={menu}
        isLink={false}
      />
      {outgoingStreams.map((stream, index) => {
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
              status={stream.status}
              subtitle={stream.amount}
              resume={stream.resume}
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
            />
          </div>
        )
      })}
      {streamingAccounts.map((stream, index) => {
        const onSelectedStreamingAccount = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromStreamingAccountDetails(stream);
        }

        const title = stream.title ? stream.title : "Unknown streaming account";

        return (
          <div 
            key={index}
          >
            <ResumeItem
              title={title}
              classNameTitle="text-uppercase"
              subtitle={stream.subtitle}
              amount={stream.amount}
              resume={stream.resume}
              className="account-category-title"
              hasRightIcon={true}
              rightIcon={<IconArrowForward className="mean-svg-icons" />}
              isLink={true}
              onClick={onSelectedStreamingAccount}
            />
          </div>
        )
      })}
      {teamSalary.map((stream, index) => {
        const onSelectStream = () => {
          // Sends outgoing stream value to the parent component "Accounts"
          onSendFromOutgoingStreamInfo(stream);
        };

        const title = stream.title ? stream.title : "Unknown salary";

        return (
          <div 
            key={index}
            onClick={onSelectStream}
            className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
              <ResumeItem
                id={index}
                title={title}
                status={stream.status}
                subtitle={stream.amount}
                resume={stream.resume}
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
      id: "summary",
      name: "Summary",
      render: renderSummary
    },
    {
      id: "incoming",
      name: "Incoming (3)",
      render: renderListOfIncomingStreams
    },
    {
      id: "outgoing",
      name: "Outgoing (4)",
      render: renderListOfOutgoingStreams
    },
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

      <TabsMean
        tabs={tabs}
        defaultTab="summary"
      />
    </>
  )
}