import './style.scss';
import { Col, Row } from "antd"
import { IconThumbsDown, IconThumbsUp, IconWallet } from '../../../../Icons';

export const ProposalResumeItem = (props: {
  id: number;
  title: string;
  expires: any;
  approved: number;
  rejected: number;
  status: string;
  needs?: number;
}) => {
  const { title, expires, approved, rejected, status, needs } = props;
  
  return (
    <>
      <Row gutter={[8, 8]} className="proposal-resume-item-container">
        <Col className="proposal-resume-left-container">
          <IconWallet className="mean-svg-icons" />
          <div className="proposal-resume-left-text">
            <div className="proposal-title">{title}</div>
            <span className="info-label">
              {status === "active" ? (
                `Expires in ${expires}`
              ) : status === "passed" ? (
                `Executed in ${expires}`
              ) : status === "failed" ? (
                `Rejected in ${expires}`
              ) : null}
            </span>
          </div>
        </Col>
        <Col className="proposal-resume-right-container">
          <div className="proposal-resume-right-text">
            <div className="thumbs-up">
              <span>{approved}</span>
              <IconThumbsUp className="mean-svg-icons" />
            </div>
            <div className="thumbs-down">
              <IconThumbsDown className="mean-svg-icons" />
              <span>{rejected}</span>
            </div>
            <div className="badge-container">
              <span className="badge darken small text-uppercase">{status}</span>
            </div>
          </div>
          {needs && (
            <span className="info-label">Needs {needs} approvals to pass</span>
          )}
        </Col>
      </Row>
    </>
  )
}