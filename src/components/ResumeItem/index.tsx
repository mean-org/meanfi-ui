import { MultisigTransactionStatus } from '@mean-dao/mean-multisig-sdk';
import { Button, Dropdown, type MenuProps } from 'antd';
import { type ReactNode, useCallback, useContext, useState } from 'react';
import Countdown from 'react-countdown';
import { useTranslation } from 'react-i18next';
import { IconThumbsDown, IconThumbsUp } from 'src/Icons';
import type { CountdownRendererParams } from 'src/components/CountdownTimer/CountdownRenderer';
import { AppStateContext } from 'src/contexts/appstate';
import './style.scss';

export const ResumeItem = (props: {
  id?: string | number;
  version?: number;
  src?: string;
  img?: ReactNode;
  title?: string;
  extraTitle?: string[];
  classNameTitle?: string;
  classNameRightContent?: string;
  classNameIcon?: string;
  subtitle?: ReactNode;
  amount?: string | number;
  expires?: string | Date;
  executedOn?: string;
  approved?: number;
  rejected?: number;
  userSigned?: boolean;
  status?: number | string;
  content?: string;
  resume?: ReactNode;
  isDetailsPanel?: boolean;
  isStream?: boolean;
  isStreamingAccount?: boolean;
  rightIcon?: ReactNode;
  hasRightIcon?: boolean;
  dropdownMenu?: MenuProps['items'];
  rightIconHasDropdown?: boolean;
  className?: string;
  isLink?: boolean;
  onClick?: () => void;
  xs?: number;
  sm?: number;
  md?: number;
  lg?: number;
}) => {
  const { theme } = useContext(AppStateContext);

  const {
    id,
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

  const getTransactionStatusAction = useCallback(
    (status: number) => {
      if (status === MultisigTransactionStatus.Active) {
        return t('multisig.multisig-transactions.tx-active');
      }

      if (status === MultisigTransactionStatus.Passed) {
        return t('multisig.multisig-transactions.tx-passed');
      }

      if (status === MultisigTransactionStatus.Executed) {
        return t('multisig.multisig-transactions.tx-executed');
      }

      if (status === MultisigTransactionStatus.Voided) {
        return t('multisig.multisig-transactions.tx-voided');
      }

      if (status === MultisigTransactionStatus.Expired) {
        return t('multisig.multisig-transactions.tx-expired');
      }

      return t('multisig.multisig-transactions.tx-failed');
    },
    [t],
  );

  const getTransactionStatusBackgroundColor = useCallback(
    (status: number) => {
      if (status === MultisigTransactionStatus.Active) {
        return 'bg-purple';
      }

      if (status === MultisigTransactionStatus.Passed) {
        return 'bg-green';
      }

      if (status === MultisigTransactionStatus.Executed) {
        return 'bg-green-dark';
      }

      if (status === MultisigTransactionStatus.Voided) {
        return 'bg-orange-dark';
      }

      if (status === MultisigTransactionStatus.Failed) {
        return 'bg-red';
      }

      if (status === MultisigTransactionStatus.Expired) {
        return theme === 'light' ? 'bg-gray-light' : 'bg-gray-dark';
      }

      return '';
    },
    [theme],
  );

  const getStreamStatusBackgroundColor = useCallback(
    (status: string) => {
      if (status === 'Scheduled') {
        return 'bg-purple';
      }

      if (status === 'Running') {
        return 'bg-green';
      }

      if (status === 'Paused') {
        return theme === 'light' ? 'bg-gray-light' : 'bg-gray-dark';
      }

      if (status === 'Stopped') {
        return 'bg-red';
      }

      return '';
    },
    [theme],
  );

  // Random component
  const Completionist = () => (
    <span>Expired on {!expires ? '-' : typeof expires === 'string' ? expires : expires.toDateString()}</span>
  );

  // Renderer callback with condition
  const renderer = ({ days, hours, minutes, seconds, completed }: CountdownRendererParams) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    }

    // Render a countdown
    const daysSpace = days < 10 ? '0' : '';
    const hoursSpace = hours < 10 ? '0' : '';
    const minutesSpace = minutes < 10 ? '0' : '';
    const secondsSpace = seconds < 10 ? '0' : '';

    return (
      <span>{`Expires in ${daysSpace}${days}:${hoursSpace}${hours}:${minutesSpace}${minutes}:${secondsSpace}${seconds}`}</span>
    );
  };

  const renderExecutedOnDisplay = () => {
    if (expires && (status === 0 || status === 1)) {
      return <Countdown className='align-middle' date={expires.toString()} renderer={renderer} />;
    }
    if (status === 4) {
      return <span>Voided</span>;
    }
    if (expires && status === 5) {
      return <span>Expired on {typeof expires === 'string' ? expires : expires.toDateString()}</span>;
    }

    return null;
  };

  const renderRightIcon = () => {
    const items: MenuProps['items'] = dropdownMenu || [];
    return rightIconHasDropdown ? (
      <Dropdown menu={{ items }} placement='bottomRight' trigger={['click']}>
        <span className='ellipsis-icon icon-button-container'>
          <Button type='default' shape='circle' size='middle' icon={rightIcon} onClick={e => e.preventDefault()} />
        </span>
      </Dropdown>
    ) : (
      <span className='icon-button-container'>
        <Button
          type='default'
          shape='circle'
          size='middle'
          icon={rightIcon}
          onClick={onClick}
          className={classNameIcon}
        />
      </span>
    );
  };

  return (
    <div key={`resume-item-${id ?? counterKey}`} className='d-flex'>
      <div
        onClick={onClick}
        onKeyDown={() => {}}
        className={`resume-item-container mr-0 ml-0 ${className} ${isLink ? '' : 'align-items-end'} ${
          isDetailsPanel ? 'pl-1 pr-2' : ''
        }`}
      >
        <div className='resume-left-container'>
          {(src || img) && (
            <div className='img-container'>
              {src && (
                <img src={src} alt={title} width={35} height={35} style={{ borderRadius: '0.25em !important' }} />
              )}
              {img || null}
            </div>
          )}
          <div className={`resume-left-text ${isDetailsPanel ? 'pb-1' : ''}`}>
            <div className={`resume-title ${isDetailsPanel ? 'big-title' : ''} ${classNameTitle}`}>
              {title}
              {/* biome-ignore lint/suspicious/noExplicitAny: Worthy to analyze */}
              {extraTitle?.map((badge: any, index: number) => (
                <span key={`badge-${index}`} className='ml-1 badge darken small text-uppercase'>
                  {badge}
                </span>
              ))}
            </div>
            {version !== 0 &&
              (subtitle ? (
                subtitle === 'null' ? (
                  <div className='info-label'>
                    <span className='subtitle' />
                  </div>
                ) : (
                  <div className='info-label'>
                    <span className='subtitle'>{subtitle}</span>
                  </div>
                )
              ) : expires ? (
                <div className='info-label'>
                  {executedOn || status === 2 ? <span>Executed on {executedOn}</span> : renderExecutedOnDisplay()}
                </div>
              ) : (
                <div className='info-label'>
                  <span className='subtitle'>Does not expire</span>
                </div>
              ))}
          </div>
        </div>
        <div className={`resume-right-container ${isDetailsPanel ? 'mr-2' : 'mr-1'} ${classNameRightContent}`}>
          <div className='resume-right-text'>
            <>
              <div className={'resume-right-text-up'}>
                {approved ? (
                  <div className='thumbs-up' title={userSigned === true ? 'You approved this proposal' : ''}>
                    <span>{approved}</span>
                    <IconThumbsUp className='mean-svg-icons' />
                  </div>
                ) : null}
                {rejected && version !== 0 ? (
                  <div className='thumbs-down' title={userSigned === false ? 'You rejected this proposal' : ''}>
                    <IconThumbsDown className='mean-svg-icons' />
                    <span>{rejected}</span>
                  </div>
                ) : null}
                {status !== undefined &&
                  (!isStream ? (
                    <div className={`badge-container ${getTransactionStatusBackgroundColor(status as number)}`}>
                      <span className='badge darken small text-uppercase'>
                        {getTransactionStatusAction(status as number)}
                      </span>
                    </div>
                  ) : (
                    <div className={`badge-container ${getStreamStatusBackgroundColor(status as string)}`}>
                      <span className='badge darken small text-uppercase'>{status}</span>
                    </div>
                  ))}
                {amount && <div className='rate-amount'>{amount}</div>}
                {content && <div className='info-label'>{content}</div>}
              </div>
              {resume && <div className={`${!isStreamingAccount ? 'info-label' : ''} mb-0`}>{resume}</div>}
            </>
          </div>
          {hasRightIcon && renderRightIcon()}
        </div>
      </div>
    </div>
  );
};
