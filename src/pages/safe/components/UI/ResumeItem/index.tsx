import { useCallback, useContext } from 'react';
import './style.scss';
import { Button, Col, Dropdown, Row } from "antd"
import { useTranslation } from 'react-i18next';
import { MultisigTransaction, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import Countdown from 'react-countdown';
import { AppStateContext } from '../../../../../contexts/appstate';
import { IconThumbsDown, IconThumbsUp } from '../../../../../Icons';
import { formatThousands } from '../../../../../utils/utils';

export const ResumeItem = (props: {
  id?: any;
  version?: number;
  src?: any;
  img?: any;
  title?: string;
  subtitle?: any;
  expires?: any;
  executedOn?: any;
  approved?: any;
  rejected?: any;
  status?: any;
  needs?: any;
  isProposalDetails?: boolean;
  isProgramDetails?: boolean;
  isAssetDetails?: boolean;
  isProgram?: boolean;
  isAsset?: boolean;
  programSize?: number;
  rightContent?: any;
  rightIcon?: any;
  hasRightIcon?: boolean;
  rightIconHasDropdown?: boolean;
  dropdownMenu?: any;
}) => {
  const {
    theme
  } = useContext(AppStateContext);

  const { src, img, version, title, subtitle, expires, executedOn, approved, rejected, status, needs, isProposalDetails, isProgram, isAsset, programSize, rightContent, rightIcon, hasRightIcon, rightIconHasDropdown, dropdownMenu } = props;

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
  const Completionist = () => <span>Expired on {expires.toDateString()}</span>;

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
      <Row gutter={[8, 8]} key="resume-item" className={`resume-item-container ${!isProposalDetails ? "hover-list list-item" : "justify-content-space-between pl-1"} ${isProposalDetails ? "align-items-end" : ""}`}>
        <Col className="resume-left-container">
          {(src || img) && (
            <div className="img-container">
              {src && (
                <img src={src} alt={title} width={35} height={35} style={{borderRadius: "0.25em !important"}} />
              )}
              {img && img}
            </div>
          )}
          <div className={`resume-left-text ${isProposalDetails ? "pb-1" : ""}`}>
            <div className={`resume-title ${isProposalDetails ? "big-title" : ""}`}>{title ? title : "Unknown proposal"}</div>

            {version !== 0 && (
              subtitle ? (
                <div className="info-label">
                  <span className="subtitle">{subtitle}</span>
                </div>
              ) : (
                expires ? (
                  <div className="info-label">
                    {(executedOn || status === 2) ? (
                      <span>Executed on {executedOn}</span>
                    ) : (
                      (status === 0 || status === 1) ? (
                        <Countdown className="align-middle" date={expires.toString()} renderer={renderer} />
                      ) : status === 4 ? (
                        <span>Voided</span>
                      ) : status === 5 ? (
                        <span>Expired on {expires.toDateString()}</span>
                      ) : null 
                    )}
                  </div>
                ) : (
                  <div className="info-label">
                    <span className="subtitle">Does not expire</span>
                  </div>
                )
              )
            )}
          </div>
        </Col>
        <Col className={`resume-right-container ${!isProposalDetails ? "mr-1" : "mr-2"}`}>
          <div className="resume-right-text">
            {(!isProgram && !isAsset) ? (
              <>
                <div className={`resume-right-text-up ${needs === 0 ? "mb-1" : ""}`}>
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
                {(status === 0) && (
                  needs > 0 && (
                    <span className="info-label">{`Needs ${needs} ${needs > 1 ?"approvals" : "approval"} to pass`}</span>
                  )
                )}
              </>
            ) : isProgram ? (
              <>
                {programSize && (
                  <div className="">
                    <div className="rate-amount">
                      {formatThousands(programSize)}
                    </div>
                    <div className="info-label mb-0">bytes</div>
                  </div>
                )}
              </>
            ) : (
              <div className="rate-amount mr-1">
                {rightContent}
              </div>
            )}
          </div>
          {!isProposalDetails && (
            hasRightIcon ? (

              rightIconHasDropdown ? (
                <Dropdown
                  overlay={dropdownMenu}
                  placement="bottomRight"
                  trigger={["click"]}>
                  <span className="ellipsis-icon icon-button-container">
                    <Button
                      type="default"
                      shape="circle"
                      size="middle"
                      icon={rightIcon}
                      onClick={(e) => e.preventDefault()}
                    />
                  </span>
                </Dropdown>
              ) : (
                <span className="icon-button-container">
                  <Button
                    type="default"
                    shape="circle"
                    size="middle"
                    icon={rightIcon}
                  />
                </span>
              )
            ) : null
          )}
        </Col>
      </Row>
    </>
  )
}