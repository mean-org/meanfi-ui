import { MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { Button, Dropdown } from "antd";
import { AppStateContext } from 'contexts/appstate';
import { IconThumbsDown, IconThumbsUp } from 'Icons';
import { useCallback, useContext, useState } from 'react';
import Countdown from 'react-countdown';
import { useTranslation } from 'react-i18next';
import './style.scss';

export const ResumeItem = (props: {
  id?: any;
  version?: number;
  src?: any;
  img?: any;
  title?: string;
  extraTitle?: any;
  classNameTitle?: string;
  classNameRightContent?: string;
  classNameIcon?: string;
  subtitle?: any;
  amount?: any;
  expires?: any;
  executedOn?: any;
  approved?: any;
  rejected?: any;
  userSigned?: any;
  status?: number | string;
  content?: string;
  resume?: any;
  isDetailsPanel?: boolean;
  isStream?: boolean;
  isStreamingAccount?: boolean;
  rightIcon?: any;
  hasRightIcon?: boolean;
  rightIconHasDropdown?: boolean;
  dropdownMenu?: any;
  className?: string;
  isLink?: boolean;
  onClick?: any;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
}) => {
  const {
    theme
  } = useContext(AppStateContext);

  const { 
    src,
    img,
    version,
    title,
    extraTitle,
    classNameTitle,
    classNameRightContent,
    classNameIcon,
    subtitle,
    amount,
    expires,
    executedOn,
    approved,
    rejected,
    userSigned,
    status,
    content,
    resume,
    isDetailsPanel,
    isStream,
    isStreamingAccount,
    rightIcon,
    hasRightIcon,
    rightIconHasDropdown,
    dropdownMenu,
    className,
    isLink,
    onClick,
  } = props;

  const { t } = useTranslation('common');
  const [counterKey] = useState(new Date().getTime());

  const getTransactionStatusAction = useCallback((status: number) => {

    if (status === MultisigTransactionStatus.Active) {
      return t("multisig.multisig-transactions.tx-active");
    } 
    
    if (status === MultisigTransactionStatus.Passed) {
      return t("multisig.multisig-transactions.tx-passed");
    }

    if (status === MultisigTransactionStatus.Executed) {
      return t("multisig.multisig-transactions.tx-executed");
    }
    
    if (status === MultisigTransactionStatus.Voided) {
      return t("multisig.multisig-transactions.tx-voided");
    }

    if (status === MultisigTransactionStatus.Expired) {
      return t("multisig.multisig-transactions.tx-expired");
    }

    return t("multisig.multisig-transactions.tx-failed");

  },[t]);

  const getTransactionStatusBackgroundColor = useCallback((status: number) => {

    if (status === MultisigTransactionStatus.Active) {
      return "bg-purple";
    } 
    
    if (status === MultisigTransactionStatus.Passed) {
      return "bg-green";
    }

    if (status === MultisigTransactionStatus.Executed) {
      return "bg-green-dark";
    }
    
    if (status === MultisigTransactionStatus.Voided) {
      return "bg-orange-dark";
    }

    if (status === MultisigTransactionStatus.Failed) {
      return "bg-red";
    }

    if (status === MultisigTransactionStatus.Expired) {
      return theme === 'light' ? "bg-gray-light" : "bg-gray-dark";
    }

    return "";

  },[theme]);

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

      return <span>{`Expires in ${daysSpace}${days}:${hoursSpace}${hours}:${minutesSpace}${minutes}:${secondsSpace}${seconds}`}</span>;
    }
  };

  const renderExecutedOnDisplay = () => {
    if (status === 0 || status === 1) {
      return (<Countdown className="align-middle" date={expires.toString()} renderer={renderer} />);
    } else if (status === 4) {
      return (<span>Voided</span>);
    } else if (status === 5) {
      return (<span>Expired on {expires.toDateString()}</span>);
    }

    return null;
  }

  const renderRightIcon = () => {
    return rightIconHasDropdown ? (
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
          className={classNameIcon}
        />
      </span>
    );
  }

  return (
    <div className="d-flex">
      <div key={`resume-item-${counterKey}`} onClick={onClick} className={`resume-item-container mr-0 ml-0 ${className} ${isLink ? "" : "align-items-end"} ${isDetailsPanel ? "pl-1 pr-2" : ""}`}>
        <div className="resume-left-container">
          {(src || img) && (
            <div className="img-container">
              {src && (
                <img src={src} alt={title} width={35} height={35} style={{borderRadius: "0.25em !important"}} />
              )}
              {img || null}
            </div>
          )}
          <div className={`resume-left-text ${isDetailsPanel ? "pb-1" : ""}`}>
            <div className={`resume-title ${isDetailsPanel ? "big-title" : ""} ${classNameTitle}`}>
              {title}
              {extraTitle && (
                extraTitle.map((badge: any, index: number) => (
                  <span key={`badge-${index}`} className="ml-1 badge darken small text-uppercase">
                    {badge}
                  </span>
                ))
              )}
            </div>

            {version !== 0 && (
              <>
                {subtitle && (
                  <div className="info-label">
                    <span className="subtitle">{subtitle}</span>
                  </div>
                )}
                {expires ? (
                  <div className="info-label">
                    {(executedOn || status === 2) ? (
                      <span>Executed on {executedOn}</span>
                    ) : renderExecutedOnDisplay()}
                  </div>
                ) : (
                  <div className="info-label">
                    <span className="subtitle">Does not expire</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className={`resume-right-container ${isDetailsPanel ? "mr-2" : "mr-1"} ${classNameRightContent}`}>
          <div className="resume-right-text">
            <>
              <div className={`resume-right-text-up`}>
                {approved > 0 && (
                  <div className="thumbs-up" title={userSigned === true ? "You approved this proposal" : ""}>
                    <span>{approved}</span>
                    <IconThumbsUp className="mean-svg-icons" />
                  </div>
                )}
                {rejected > 0 && (
                  version !== 0 && (
                  <div className="thumbs-down" title={userSigned === false ? "You rejected this proposal" : ""}>
                    <IconThumbsDown className="mean-svg-icons" />
                    <span>{rejected}</span>
                  </div>
                  )
                )}
                {status !== undefined && (
                  (!isStream) ? (
                    <div className={`badge-container ${getTransactionStatusBackgroundColor(status as number)}`}>
                      <span className="badge darken small text-uppercase">{getTransactionStatusAction(status as number)}</span>
                    </div>
                  ) : (
                    <div className={`badge-container ${getStreamStatusBackgroundColor(status as string)}`}>
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
                {content && (
                  <div className="info-label">
                    {content}
                  </div>
                )}
              </div>
              {resume && (
                <div className={`${!isStreamingAccount ? "info-label" : ""} mb-0`}>{resume}</div>
              )}
            </>
          </div>
          {hasRightIcon && renderRightIcon()}
        </div>
      </div>
    </div>
  )
}
