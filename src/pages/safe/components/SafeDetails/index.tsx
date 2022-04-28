import './style.scss';
import { Button, Col, Row } from "antd"
import { IconArrowBack, IconApprove, IconReject, IconUser } from "../../../../Icons"
import { ProposalResumeItem } from '../ProposalResumeItem';

export const SafeDetailsView = (props: {
  isSafeDetails: boolean;
  onDataToSafeView: any;
  proposalSelected: any
}) => {
  const { onDataToSafeView, proposalSelected } = props;

  // When back button is clicked, goes to Safe Info
  const hideDetailsHandler = () => {
    // Sends the value to the parent component "SafeView"
    onDataToSafeView();
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
        title={proposalSelected.title}
        expires={proposalSelected.expires}
        approved={proposalSelected.approved}
        rejected={proposalSelected.rejected}
        status={proposalSelected.status}
        needs={proposalSelected.needs}
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
                <IconApprove className="mean-svg-icons" />
                Approve
              </div>
          </Button>
          <Button
            type="ghost"
            size="small"
            className="thin-stroke"
            onClick={() => {}}>
              <div className="btn-content">
                <IconReject className="mean-svg-icons" />
                Reject
              </div>
          </Button>
        </Col>
        
      </Row>
    </div>
  )
}