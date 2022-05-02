import './style.scss';
import { Button, Col, Collapse, Row } from "antd"
import { IconArrowBack, IconUser, IconThumbsUp, IconThumbsDown } from "../../../../Icons"
import { ProposalResumeItem } from '../ProposalResumeItem';
import { useState } from 'react';
import { shortenAddress } from '../../../../utils/utils';

export const SafeDetailsView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposalSelected: any
}) => {
  const { isSafeDetails, onDataToSafeView, proposalSelected } = props;

  // When back button is clicked, goes to Safe Info
  const hideDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToSafeView();
  };

  const { Panel } = Collapse;

  function callback(key: any) {}

  const renderInstructions = (
    <div className="w-100">
      <Collapse
        expandIconPosition="right"
        accordion={true}
        onChange={callback}>
        {proposalSelected.instructions.map((instruction: any) => {

          const header =  <Col className="instruction-header">
                            <div className="circle-background">{instruction.id}</div>
                            <div className="instruction-header-text">
                              <div className="">{instruction.title}</div>
                              <span className="info-label">{instruction.description}</span>
                            </div>
                          </Col>;

          return (
            <Panel header={header} key={instruction.id}>
              <Row gutter={[8, 8]} className="mb-1">
                {instruction.name && (
                  <>
                    <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                      <span className="info-label">Name:</span>
                    </Col>
                    <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                      <span>{instruction.name}</span>
                    </Col>
                  </>
                )}
                {instruction.sender && (
                  <>
                    <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                      <span className="info-label">Sender:</span>
                    </Col>
                    <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                      <span>{instruction.sender}</span>
                    </Col>
                  </>
                )}
                {instruction.recipient && (
                  <>
                    <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                      <span className="info-label">Recipient:</span>
                    </Col>
                    <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                      <span>{instruction.recipient}</span>
                    </Col>
                  </>
                )}
                {instruction.amount && (
                  <>
                    <Col xs={6} sm={6} md={4} lg={4} className="pr-1">
                      <span className="info-label">Amount:</span>
                    </Col>
                    <Col xs={18} sm={18} md={20} lg={20} className="pl-1">
                      <span>{instruction.amount}</span>
                    </Col>
                  </>
                )}
              </Row>
            </Panel>
          )
        })}
      </Collapse>
    </div>
  );

  const renderActivities = (
    <Row>
      {proposalSelected.activities.map((activity: any) => (
        <div key={activity.id}>
          {`${activity.date} - Proposal ${activity.description} by ${activity.proposedBy} [${shortenAddress(activity.address, 4)}]`}
        </div>
      ))}
    </Row>
  )

  // Tabs
  const tabs = ["Instructions", "Activity"];

  const [activeTab, setActiveTab] = useState(tabs[0]);

  const onClickHandler = (event: any) => {
    if (event.target.innerHTML !== activeTab) {
      setActiveTab(event.target.innerHTML);
    }
  };

  return (
    <div className="safe-details-container">
      <Row gutter={[8, 8]} className="safe-details-resume">
        <div onClick={hideDetailsHandler} className="back-button icon-button-container">
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
        <Col className="safe-details-right-container">
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
        <Row gutter={[8, 8]} className="safe-tabs-header-container mt-1">
          <ul className="tabs ant-menu-overflow ant-menu-horizontal">
            {tabs.map((tab, index) => (
              <li 
                key={index} 
                className={`ant-menu-item ${activeTab === tab ? "active ant-menu-item-selected" : ""}`} 
                tabIndex={0} 
                onClick={onClickHandler}
              >
                <span className="ant-menu-title-content">{tab}</span>
              </li>
            ))}
          </ul>
        </Row>
        <Row gutter={[8, 8]} className="safe-tabs-content-container safe-details-collapse">
          {activeTab === "Instructions" && renderInstructions}
          {activeTab === "Activity" && renderActivities}
        </Row>
      </div>
    </div>
  )
};