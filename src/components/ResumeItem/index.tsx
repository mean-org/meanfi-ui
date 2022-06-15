import { useCallback, useContext } from 'react';
import './style.scss';
import { Button, Col, Dropdown, Row } from "antd"
import { useTranslation } from 'react-i18next';
import { MultisigTransaction, MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import Countdown from 'react-countdown';
import { IconThumbsUp, IconThumbsDown } from '../../Icons';
import { AppStateContext } from '../../contexts/appstate';
import { StreamInfo, STREAM_STATE } from '@mean-dao/money-streaming/lib/types';
import { Stream } from '@mean-dao/msp';

export const ResumeItem = (props: {
  id?: any;
  version?: number;
  src?: any;
  img?: any;
  title?: string;
  classNameTitle?: string;
  subtitle?: any;
  amount?: number | string;
  expires?: any;
  executedOn?: any;
  approved?: any;
  rejected?: any;
  status?: any;
  resume?: any;
  isDetailsPanel?: boolean;
  isStream?: boolean;
  rightIcon?: any;
  hasRightIcon?: boolean;
  rightIconHasDropdown?: boolean;
  dropdownMenu?: any;
  className?: string;
  isLink?: boolean;
  onClick?: any;
}) => {
  const {
    theme
  } = useContext(AppStateContext);

  const { 
    src,
    img,
    version,
    title,
    classNameTitle,
    subtitle,
    amount,
    expires,
    executedOn,
    approved,
    rejected,
    status,
    resume,
    isDetailsPanel,
    isStream,
    rightIcon,
    hasRightIcon,
    rightIconHasDropdown,
    dropdownMenu,
    className,
    isLink,
    onClick 
  } = props;

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

  const getStreamStatusBackgroundColor = useCallback((status: string) => {

    if (status === "Scheduled") {
      return "bg-purple";
    } 
    
    if (status === "Running") {
      return "bg-green";
    }

    if (status === "Paused") {
      return theme === 'light' ? "bg-gray-light" : "bg-gray-dark";
    }

    if (status === "Stopped") {
      return "bg-red";
    }

    return "";

  },[theme]);

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
      <Row gutter={[8, 8]} key="resume-item" className={`resume-item-container ${className} ${isLink ? "hover-list" : "align-items-end"} ${isDetailsPanel ? "pl-1 pr-2" : ""}`}>
        <Col xs={12} sm={12} md={12} lg={12} className="resume-left-container">
          {(src || img) && (
            <div className="img-container">
              {src && (
                <img src={src} alt={title} width={35} height={35} style={{borderRadius: "0.25em !important"}} />
              )}
              {img && img}
            </div>
          )}
          <div className={`resume-left-text ${isDetailsPanel ? "pb-1" : ""}`}>
            <div className={`resume-title ${isDetailsPanel ? "big-title" : ""} ${classNameTitle}`}>{title}</div>

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
        <Col className={`resume-right-container ${isDetailsPanel ? "mr-3" : "mr-1"}`}>
          <div className="resume-right-text">
            <>
              <div className={`resume-right-text-up`}>
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
                {status && (
                  (!isStream && status >= 0) ? (
                    <div className={`badge-container ${getTransactionStatusBackgroundColor(status)}`}>
                      <span className="badge darken small text-uppercase">{getTransactionStatusAction(status)}</span>
                    </div>
                  ) : (
                    <div className={`badge-container ${getStreamStatusBackgroundColor(status)}`}>
                      <span className="badge darken small text-uppercase">
                        {status}
                      </span>
                    </div>
                  )
                )}
                {amount && (
                  <div className="rate-amount">
                    {amount}
                  </div>
                )}
              </div>
              {resume && (
                <div className="info-label mb-0">{resume}</div>
              )}
            </>
          </div>
          {hasRightIcon ? (
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
                  onClick={onClick}
                />
              </span>
            )
          ) : null}
        </Col>
      </Row>
    </>
  )
}