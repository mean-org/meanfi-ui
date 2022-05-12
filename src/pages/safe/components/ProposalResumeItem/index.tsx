import { useCallback, useContext } from 'react';
import './style.scss';
import { Button, Col, Row } from "antd"
import { IconArrowForward, IconThumbsDown, IconThumbsUp } from '../../../../Icons';
import { useTranslation } from 'react-i18next';
import { MultisigTransaction, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import Countdown from 'react-countdown';
import { AppStateContext } from '../../../../contexts/appstate';

export const ProposalResumeItem = (props: {
  id?: any;
  version?: number;
  logo?: string;
  title: string;
  expires?: any;
  executedOn?: any;
  approved?: any;
  rejected?: any;
  status?: any;
  needs?: any;
  isSafeDetails?: boolean;
}) => {
  const {
    theme
  } = useContext(AppStateContext);

  const { logo, version, title, expires, executedOn, approved, rejected, status, needs, isSafeDetails } = props;

  const { t } = useTranslation('common');

  const getTransactionStatusAction = useCallback((mtx: MultisigTransaction) => {

    if (status === MultisigTransactionStatus.Pending) {
      return "active";
    } 
    
    if (status === MultisigTransactionStatus.Approved) {
      return "passed";
    }

    if (status === MultisigTransactionStatus.Executed) {
      return "executed";
    }
    
    if (status === MultisigTransactionStatus.Voided) {
      return t("multisig.multisig-transactions.tx-voided");
    }

    if (status === MultisigTransactionStatus.Expired) {
      return "Expired";
    }

    return t("multisig.multisig-transactions.tx-rejected");

  },[status, t]);

  const getTransactionStatusBackgroundColor = useCallback((mtx: MultisigTransaction) => {

    if (status === MultisigTransactionStatus.Pending) {
      return "bg-purple";
    } 
    
    if (status === MultisigTransactionStatus.Approved) {
      return "bg-green";
    }

    if (status === MultisigTransactionStatus.Executed) {
      return "bg-green-dark";
    }
    
    if (status === MultisigTransactionStatus.Voided) {
      return "bg-orange-dark";
    }

    if (status === MultisigTransactionStatus.Expired) {
      return theme === 'light' ? "bg-gray-light" : "bg-gray-dark";
    }

    return "";

  },[status, theme]);

  // Random component
  const Completionist = () => <span>Expired on {expires}</span>;

  // Renderer callback with condition
  const renderer = ({ days, hours, minutes, seconds, completed }: any) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    } else {
      // Render a countdown
      const daysSpace = (days < 10) ? '0' : '';
      const hoursSpace = (hours < 10) ? '0' : '';
      const minutesSpace = (minutes < 10) ? '0' : '';
      const secondsSpace = (seconds < 10) ? '0' : '';

      return <span>{`Expires in ${`${daysSpace}${days}`}:${`${hoursSpace}${hours}`}:${`${minutesSpace}${minutes}`}:${`${secondsSpace}${seconds}`}`}</span>;
    }
  };

  return (
    <>
      <Row gutter={[8, 8]} className={`proposal-resume-item-container list-item ${!isSafeDetails ? "hover-list" : ""} ${isSafeDetails ? "align-items-start" : ""}`}>
        <Col className="proposal-resume-left-container">
          {logo && (
            <img src={logo} alt={title} />
          )}
          <div className="proposal-resume-left-text">
            <div className={`proposal-title ${isSafeDetails ? "big-title" : ""}`}>{title ? title : "Old transaction"}</div>
            {expires && (
              version !== 0 && (
                <div className="info-label">
                  {!executedOn ? (
                    <Countdown className="align-middle" date={expires} renderer={renderer} />
                  ) : (
                    <span>Executed on {executedOn}</span>
                  )}
                </div>
              )
            )}
          </div>
        </Col>
        <Col className="proposal-resume-right-container">
          <div className="proposal-resume-right-text">
            <div className="proposal-resume-right-text-up">
              {approved && (
                <div className="thumbs-up">
                  <span>{approved}</span>
                  <IconThumbsUp className="mean-svg-icons" />
                </div>
              )}
              {rejected && (
                version !== 0 && (
                <div className="thumbs-down">
                  <IconThumbsDown className="mean-svg-icons" />
                  <span>{rejected}</span>
                </div>
                )
              )}
              <div className={`badge-container ${getTransactionStatusBackgroundColor(status)}`}>
                <span className="badge darken small text-uppercase">{getTransactionStatusAction(status)}</span>
              </div>
            </div>
            {needs >= 0 && (
              <span className="info-label">{`Needs ${needs} ${needs > 1 ?"approvals" : "approval"} to pass`}</span>
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