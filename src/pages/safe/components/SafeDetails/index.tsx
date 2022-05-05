import './style.scss';
import { Button, Col, Collapse, Row } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconThumbsDown, IconApprove, IconCross, IconCheckCircle, IconCreated, IconMinus, IconCaretDown } from "../../../../Icons"
import { ProposalResumeItem } from '../ProposalResumeItem';
import { shortenAddress } from '../../../../utils/utils';
import { TabsMean } from '../../../../components/TabsMean';

export const SafeDetailsView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposalSelected: any;
}) => {
  const { Panel } = Collapse;
  const { isSafeDetails, onDataToSafeView, proposalSelected } = props;

  const collapseHandler = (key: any) => {}

  // When back button is clicked, goes to Safe Info
  const hideSafeDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToSafeView();
  };

  // Display the instructions in the "Instructions" tab, on safe details page
  const renderInstructions = (
    <div className="safe-details-collapse w-100">
      <Collapse
        accordion={true}
        onChange={collapseHandler}>
        {proposalSelected.instructions.map((instruction: any) => {

          const header =  <Col className="instruction-header">
                            <div className="circle-background">{instruction.id}</div>
                            <div className="instruction-header-text">
                              <div className="">{instruction.title}</div>
                              <span className="info-label">{instruction.description}</span>
                            </div>
                          </Col>;

          const instructionsContent = [
            {
              label: "Name",
              content: instruction.name
            },
            {
              label: "Sender",
              content: instruction.sender
            },
            {
              label: "Recipient",
              content: instruction.recipient
            },
            {
              label: "Amount",
              content: instruction.amount
            },
          ];

          return (
            <Panel header={header} key={instruction.id} showArrow={false} extra={<span className="icon-button-container arrow-up-down">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconCaretDown className="mean-svg-icons" />}
              />
            </span>}>
              {instructionsContent.map((instContent, index) => (
                <Row gutter={[8, 8]} className="mb-1" key={index}>
                  {instContent.content && (
                    <>
                      <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                        <span className="info-label">{instContent.label}:</span>
                      </Col>
                      <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                        <span>{instContent.content}</span>
                      </Col>
                    </>
                  )}
                </Row>
              ))}
            </Panel>
          )
        })}
      </Collapse>
    </div>
  );

  // Display the activities in the "Activity" tab, on safe details page
  const renderActivities = (
    <Row>
      {proposalSelected.activities.map((activity: any) => {
        let icon = null;

        switch (activity.description) {
          case 'approved':
            icon = <IconApprove className="mean-svg-icons fg-green" />;
            break;
          case 'rejected':
            icon = <IconCross className="mean-svg-icons fg-red" />;
            break;
          case 'passed':
            icon = <IconCheckCircle className="mean-svg-icons fg-green" />;
            break;
          case 'created':
            icon = <IconCreated className="mean-svg-icons fg-purple" />;
            break;
          case 'deleted':
            icon = <IconMinus className="mean-svg-icons fg-purple" />;
            break;
          default:
            icon = "";
            break;
        }

        return (
          <div 
            key={activity.id}
            className={`d-flex w-100 align-items-center activities-list ${activity.id % 2 === 0 ? '' : 'background-gray'}`}
            >
              <div className="list-item">
                <span className="mr-2">
                    {activity.date}
                </span>
                {icon}
                <span>
                  {`Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
                </span>
              </div>
          </div>
        )
      })}
    </Row>
  )

  // Tabs
  const tabs = [
    {
      name: "Instructions",
      render: renderInstructions
    }, 
    {
      name: "Activity",
      render: renderActivities
    }
  ];

  return (
    <div className="safe-details-container">
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideSafeDetailsHandler} className="back-button icon-button-container">
          <IconArrowBack className="mean-svg-icons" />
          <span>Back</span>
        </div>
      </Row>
      <ProposalResumeItem 
        id={proposalSelected.id}
        logo={proposalSelected.logo}
        title={proposalSelected.title}
        expires={proposalSelected.expires}
        approved={proposalSelected.approved}
        rejected={proposalSelected.rejected}
        status={proposalSelected.status}
        needs={proposalSelected.needs}
        isSafeDetails={isSafeDetails}
      />
      <Row className="safe-details-description">
        {proposalSelected.description}
      </Row>
      <Row gutter={[8, 8]} className="safe-details-proposal">
        <Col className="safe-details-left-container">
          <IconUser className="user-image mean-svg-icons" />
          <div className="proposal-resume-left-text">
            <div className="info-label">Proposed by</div>
            <span>{proposalSelected.proposedBy}</span>
          </div>
        </Col>
        <Col className="safe-details-right-container btn-group">
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={() => {}}>
              <div className="btn-content">
                <IconThumbsUp className="mean-svg-icons" />
                Approve
              </div>
          </Button>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={() => {}}>
              <div className="btn-content">
                <IconThumbsDown className="mean-svg-icons" />
                Reject
              </div>
          </Button>
        </Col>
      </Row>
      <div className="safe-tabs-container">
        <TabsMean
          tabs={tabs}
          headerClassName="safe-tabs-header-container"
          bodyClassName="safe-tabs-content-container"
        />
      </div>
    </div>
  )
};