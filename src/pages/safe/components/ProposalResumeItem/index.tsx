import './style.scss';
import { Button, Col, Row } from "antd"
import { IconArrowForward, IconThumbsDown, IconThumbsUp } from '../../../../Icons';

export const ProposalResumeItem = (props: {
  id: number;
  logo?: string;
  title: string;
  expires: any;
  approved: number;
  rejected: number;
  status: string;
  needs?: number;
  isSafeDetails: boolean;
}) => {
  const { logo, title, expires, approved, rejected, status, needs, isSafeDetails } = props;
  
  return (
    <>
      <Row gutter={[8, 8]} className={`proposal-resume-item-container list-item ${!isSafeDetails ? "hover-list" : ""} ${isSafeDetails ? "align-items-start" : ""}`}>
        <Col className="proposal-resume-left-container">
          {logo && (
            <img src={logo} alt={title} />
          )}
          <div className="proposal-resume-left-text">
            <div className={`proposal-title ${isSafeDetails ? "big-title" : ""}`}>{title}</div>
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
            <div className="proposal-resume-right-text-up">
              <div className="thumbs-up">
                <span>{approved}</span>
                <IconThumbsUp className="mean-svg-icons" />
              </div>
              <div className="thumbs-down">
                <IconThumbsDown className="mean-svg-icons" />
                <span>{rejected}</span>
              </div>
              <div className={`badge-container ${status === "active" ? "bg-purple" : status === "passed" ? "bg-green" : status === "failed" ? "bg-red" : status === "voided" ? "bg-orange-dark" : ""}`}>
                <span className="badge darken small text-uppercase">{status}</span>
              </div>
            </div>
            {needs && (
              <span className="info-label">Needs {needs} approvals to pass</span>
            )}
          </div>
          {!isSafeDetails && (
            <span className="icon-button-container">
              <Button
                type="default"
                shape="circle"
                size="middle"
                icon={<IconArrowForward className="mean-svg-icons" />}
              />
            </span>
          )}
        </Col>
      </Row>
    </>
  )
}