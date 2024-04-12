import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { MoneyStreaming } from '@mean-dao/money-streaming';
import {
  STREAM_STATE,
  type StreamActivity as StreamActivityV1,
  type StreamInfo,
  type TreasuryInfo,
  TreasuryType,
} from '@mean-dao/money-streaming/lib/types';
import {
  AccountType,
  PaymentStreaming,
  type PaymentStreamingAccount,
  STREAM_STATUS_CODE,
  type Stream,
  type StreamActivity,
} from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { PublicKey } from '@solana/web3.js';
import { IconArrowBack, IconExternalLink } from 'Icons';
import { Col, Row, Spin, Tabs } from 'antd';
import { CopyExtLinkGroup } from 'components/CopyExtLinkGroup';
import { Identicon } from 'components/Identicon';
import { ResumeItem } from 'components/ResumeItem';
import { RightInfoDetails } from 'components/RightInfoDetails';
import getIsV2Stream from 'components/common/getIsV2Stream';
import getIsV2Treasury from 'components/common/getIsV2Treasury';
import getRateAmountBn from 'components/common/getRateAmountBn';
import getStreamStartDate from 'components/common/getStreamStartDate';
import getV1Beneficiary from 'components/common/getV1Beneficiary';
import getV2Beneficiary from 'components/common/getV2Beneficiary';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from 'constants/common';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam, useConnection } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import useWindowSize from 'hooks/useWindowResize';
import { getStreamAssociatedMint } from 'middleware/getStreamAssociatedMint';
import { getStreamingAccountId } from 'middleware/getStreamingAccountId';
import { getStreamStatusResume, getStreamTitle } from 'middleware/streams';
import {
  consoleOut,
  getIntervalFromSeconds,
  getReadableDate,
  getShortDate,
  relativeTimeFromDates,
} from 'middleware/ui';
import { displayAmountWithSymbol, getAmountWithSymbol, shortenAddress } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import { getCategoryLabelByValue } from 'models/vesting';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Countdown from 'react-countdown';
import { isMobile } from 'react-device-detect';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { getFallBackRpcEndpoint } from 'services/connections-hq';
import './style.scss';

export const MoneyStreamDetails = (props: {
  accountAddress: string;
  stream?: Stream | StreamInfo;
  hideDetailsHandler?: any;
  infoData?: any;
  isStreamIncoming?: boolean;
  isStreamOutgoing?: boolean;
  buttons?: any;
  selectedToken?: TokenInfo;
}) => {
  const {
    accountAddress,
    stream,
    hideDetailsHandler,
    infoData,
    isStreamIncoming,
    isStreamOutgoing,
    buttons,
    selectedToken,
  } = props;
  const {
    splTokenList,
    streamActivity,
    streamProgramAddress,
    hasMoreStreamActivity,
    loadingStreamActivity,
    streamV2ProgramAddress,
    getStreamActivity,
    setStreamDetail,
  } = useContext(AppStateContext);
  const connection = useConnection();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { publicKey } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<PaymentStreamingAccount | TreasuryInfo | undefined>(undefined);

  // Use a fallback RPC for Money Streaming Program (v1) instance
  const ms = useMemo(
    () => new MoneyStreaming(getFallBackRpcEndpoint().httpProvider, streamProgramAddress, 'confirmed'),
    [streamProgramAddress],
  );

  const paymentStreaming = useMemo(() => {
    return new PaymentStreaming(connection, new PublicKey(streamV2ProgramAddress), connection.commitment);
  }, [connection, streamV2ProgramAddress]);

  const isV2tream = useMemo(() => getIsV2Stream(stream), [stream]);

  const treasuryId = useMemo(() => {
    if (stream) {
      return isV2tream ? (stream as Stream).psAccount.toBase58() : ((stream as StreamInfo).treasuryAddress as string);
    }
    return '';
  }, [isV2tream, stream]);

  const tabOption = useMemo(() => {
    let tabOptionInQuery: string | null = null;
    if (searchParams) {
      tabOptionInQuery = searchParams.get('v');
      if (tabOptionInQuery) {
        return tabOptionInQuery;
      }
    }
    return tabOptionInQuery ?? 'details';
  }, [searchParams]);

  const navigateToTab = useCallback(
    (tab: string) => {
      setSearchParams({ v: tab });
    },
    [setSearchParams],
  );

  const getActivityList = useCallback(
    (reload = false) => {
      if (stream) {
        const streamId = isV2tream ? (stream.id as PublicKey).toBase58() : (stream.id as string);
        if (reload) {
          getStreamActivity(streamId, stream.version, true);
        } else {
          getStreamActivity(streamId, stream.version, false);
        }
      }
    },
    [getStreamActivity, isV2tream, stream],
  );

  const getRateAmountDisplay = useCallback((): string => {
    if (!selectedToken || !stream) {
      return '';
    }

    const rateAmount = getRateAmountBn(stream, selectedToken);
    const value = displayAmountWithSymbol(
      rateAmount,
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
      true,
      true,
    );

    return value;
  }, [selectedToken, splTokenList, stream]);

  const getDepositAmountDisplay = useCallback((): string => {
    if (!selectedToken || !stream) {
      return '';
    }

    let value = '';

    if (stream.rateIntervalInSeconds === 0) {
      if (isV2tream) {
        const allocationAssigned = new BN(stream.allocationAssigned);
        value += displayAmountWithSymbol(
          allocationAssigned,
          selectedToken.address,
          selectedToken.decimals,
          splTokenList,
          true,
          true,
        );
      } else {
        const allocationAssigned = stream.allocationAssigned as number;
        value += getAmountWithSymbol(
          allocationAssigned,
          selectedToken.address,
          false,
          splTokenList,
          selectedToken.decimals,
          true,
        );
      }
    }

    return value;
  }, [isV2tream, selectedToken, splTokenList, stream]);

  const getStreamSubtitle = useCallback(() => {
    let subtitle = '';

    if (stream && selectedToken) {
      const rate = +stream.rateAmount.toString();
      let rateAmount = rate > 0 ? getRateAmountDisplay() : getDepositAmountDisplay();

      if (rate > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(stream.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;
  }, [getDepositAmountDisplay, getRateAmountDisplay, selectedToken, stream, t]);

  const getStreamStatus = useCallback(
    (item: Stream | StreamInfo): 'scheduled' | 'stopped' | 'stopped-manually' | 'running' => {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (isV2tream) {
        switch (v2.statusCode) {
          case STREAM_STATUS_CODE.Scheduled:
            return 'scheduled';
          case STREAM_STATUS_CODE.Paused:
            if (v2.isManuallyPaused) {
              return 'stopped-manually';
            }
            return 'stopped';
          default:
            return 'running';
        }
      } else {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return 'scheduled';
          case STREAM_STATE.Paused:
            return 'stopped';
          default:
            return 'running';
        }
      }
    },
    [isV2tream],
  );

  const getStreamStatusLabel = useCallback(
    (item: Stream | StreamInfo) => {
      if (item) {
        const v1 = item as StreamInfo;
        const v2 = item as Stream;
        if (isV2tream) {
          switch (v2.statusCode) {
            case STREAM_STATUS_CODE.Scheduled:
              return t('streams.status.status-scheduled');
            case STREAM_STATUS_CODE.Paused:
              if (v2.isManuallyPaused) {
                return t('streams.status.status-paused');
              }
              return t('streams.status.status-stopped');
            default:
              return t('streams.status.status-running');
          }
        } else {
          switch (v1.state) {
            case STREAM_STATE.Schedule:
              return t('streams.status.status-scheduled');
            case STREAM_STATE.Paused:
              return t('streams.status.status-stopped');
            default:
              return t('streams.status.status-running');
          }
        }
      }
    },
    [isV2tream, t],
  );

  const isInboundStream = useCallback(
    (item: Stream | StreamInfo): boolean => {
      if (item && publicKey && accountAddress) {
        const v1 = item as StreamInfo;
        const v2 = item as Stream;
        let beneficiary = '';
        if (isV2tream) {
          beneficiary = getV2Beneficiary(v2);
        } else {
          beneficiary = getV1Beneficiary(v1);
        }

        return beneficiary === accountAddress;
      }
      return false;
    },
    [accountAddress, isV2tream, publicKey],
  );

  const getActivityIcon = (item: StreamActivityV1 | StreamActivity) => {
    if (isInboundStream(stream as StreamInfo)) {
      if (item.action === 'withdrew') {
        return <ArrowUpOutlined className='mean-svg-icons outgoing' />;
      } else {
        return <ArrowDownOutlined className='mean-svg-icons incoming' />;
      }
    } else {
      if (item.action === 'withdrew') {
        return <ArrowDownOutlined className='mean-svg-icons incoming' />;
      } else {
        return <ArrowUpOutlined className='mean-svg-icons outgoing' />;
      }
    }
  };

  const getActivityAction = (item: StreamActivityV1 | StreamActivity): string => {
    const actionText =
      item.action === 'deposited'
        ? t('streams.stream-activity.action-deposit')
        : t('streams.stream-activity.action-withdraw');
    return actionText;
  };

  const getStreamIcon = useCallback(
    (item: Stream | StreamInfo) => {
      const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
        event.currentTarget.src = FALLBACK_COIN_IMAGE;
        event.currentTarget.className = 'error';
      };

      const associatedToken = getStreamAssociatedMint(item);

      if (selectedToken?.logoURI) {
        return (
          <img
            alt={`${selectedToken.name}`}
            width={30}
            height={30}
            src={selectedToken.logoURI}
            onError={imageOnErrorHandler}
            className='token-img'
          />
        );
      } else {
        return (
          <Identicon address={associatedToken} style={{ width: '30', display: 'inline-flex' }} className='token-img' />
        );
      }
    },
    [selectedToken],
  );

  useEffect(() => {
    if (!publicKey || !treasuryId || !ms || !paymentStreaming || !treasuryDetails) {
      return;
    }

    if (getStreamingAccountId(treasuryDetails) === treasuryId) {
      return;
    }

    consoleOut('treasuryId:', treasuryId, 'blue');
    const treasueyPk = new PublicKey(treasuryId);
    if (isV2tream) {
      paymentStreaming
        .getAccount(treasueyPk)
        .then(details => {
          if (details) {
            setTreasuryDetails(details);
          } else {
            setTreasuryDetails(undefined);
          }
        })
        .catch(error => {
          console.error(error);
          setTreasuryDetails(undefined);
        });
    } else {
      ms.getTreasury(treasueyPk)
        .then(details => {
          if (details) {
            setTreasuryDetails(details);
          } else {
            setTreasuryDetails(undefined);
          }
        })
        .catch(error => {
          console.error(error);
          setTreasuryDetails(undefined);
        });
    }
  }, [isV2tream, ms, paymentStreaming, publicKey, treasuryDetails, treasuryId]);

  // Detect XS screen
  useEffect(() => {
    if (width < 576) {
      setIsXsDevice(true);
    } else {
      setIsXsDevice(false);
    }
  }, [width]);

  // Get stream activity
  useEffect(() => {
    if (!stream) {
      return;
    }

    if (tabOption === 'activity' && !activityLoaded) {
      setActivityLoaded(true);
      getActivityList(true);
    }
  }, [activityLoaded, getActivityList, stream, tabOption]);

  // Component unmount
  useEffect(() => {
    return () => {
      consoleOut('clearing selected stream data...', '', 'blue');
      setStreamDetail(undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  };

  const isOtp = (): boolean => {
    if (stream) {
      const rateAmount = getRateAmountBn(stream, selectedToken);
      return !!rateAmount.isZero();
    }
    return false;
  };

  const isScheduledOtp = (): boolean => {
    if (stream) {
      const rateAmount = getRateAmountBn(stream, selectedToken);
      if (rateAmount.isZero()) {
        const now = new Date().toUTCString();
        const nowUtc = new Date(now);
        const streamStartDate = new Date(stream.startUtc as string);
        if (streamStartDate > nowUtc) {
          return true;
        }
      }
    }
    return false;
  };

  ///////////////
  // Rendering //
  ///////////////

  const renderActivities = () => {
    return (
      <div className='stream-detail-component'>
        <div className='stream-activity-list'>
          <Spin spinning={loadingStreamActivity}>
            {streamActivity && streamActivity.length > 0 ? (
              streamActivity.map((item, index) => {
                return (
                  <a
                    key={`${index + 50}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='transaction-list-row'
                    href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${
                      item.signature
                    }${getSolanaExplorerClusterParam()}`}
                  >
                    <div className='icon-cell'>{getActivityIcon(item)}</div>
                    <div className='description-cell no-padding'>
                      <div className='title text-truncate'>{getActivityAction(item)}</div>
                      <div className='subtitle text-truncate'>{shortenAddress(item.initializer)}</div>
                    </div>
                    <div className='rate-cell'>
                      <div className='rate-amount'>
                        {selectedToken
                          ? displayAmountWithSymbol(
                              new BN(item.amount),
                              item.mint,
                              selectedToken.decimals,
                              splTokenList,
                            )
                          : '--'}
                      </div>
                      <div className='interval'>{getShortDate(item.utcDate, true)}</div>
                    </div>
                    <div className='actions-cell'>
                      <IconExternalLink className='mean-svg-icons' style={{ width: '15', height: '15' }} />
                    </div>
                  </a>
                );
              })
            ) : (
              <>
                {loadingStreamActivity ? (
                  <p>{t('streams.stream-activity.loading-activity')}</p>
                ) : (
                  <>
                    <p>{t('streams.stream-activity.no-activity')}</p>
                  </>
                )}
              </>
            )}
          </Spin>
          {streamActivity && streamActivity.length >= 5 && hasMoreStreamActivity && (
            <div className='mt-1 text-center'>
              <span
                className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                role='link'
                onClick={() => getActivityList(false)}
              >
                {t('general.cta-load-more')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReceivingFrom = () => {
    if (!stream) {
      return null;
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <CopyExtLinkGroup
        content={isV2tream ? v2.psAccountOwner.toBase58() : (v1.treasurerAddress as string)}
        number={8}
        externalLink={true}
      />
    );
  };

  const renderSendingTo = () => {
    if (!stream) {
      return null;
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <CopyExtLinkGroup
        content={isV2tream ? v2.beneficiary.toBase58() : (v1.beneficiaryAddress as string)}
        number={8}
        externalLink={true}
      />
    );
  };

  const renderPaymentRate = () => {
    if (!stream || !selectedToken) {
      return '--';
    }

    const rateAmount = getRateAmountBn(stream, selectedToken);
    let rate = !isOtp() ? getRateAmountDisplay() : getDepositAmountDisplay();

    if (rateAmount.gtn(0)) {
      rate += ' ' + getIntervalFromSeconds(stream.rateIntervalInSeconds, false, t);
    }

    return rate;
  };

  const renderReservedAllocation = () => {
    if (!stream || !selectedToken) {
      return '--';
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {isV2tream
          ? displayAmountWithSymbol(
              v2.remainingAllocationAmount,
              selectedToken.address,
              selectedToken.decimals,
              splTokenList,
            )
          : getAmountWithSymbol(
              v1.allocationReserved || v1.allocationLeft,
              selectedToken.address,
              false,
              splTokenList,
              selectedToken.decimals,
            )}
      </>
    );
  };

  const renderFundsLeftInAccount = () => {
    if (!stream || !selectedToken) {
      return '--';
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {isV2tream
          ? displayAmountWithSymbol(v2.fundsLeftInStream, selectedToken.address, selectedToken.decimals, splTokenList)
          : getAmountWithSymbol(
              v1.escrowUnvestedAmount,
              selectedToken.address,
              false,
              splTokenList,
              selectedToken.decimals,
            )}
      </>
    );
  };

  const renderFundsSendToRecipient = () => {
    if (!stream || !selectedToken) {
      return '--';
    }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {isV2tream
          ? displayAmountWithSymbol(
              v2.fundsSentToBeneficiary,
              selectedToken.address,
              selectedToken.decimals,
              splTokenList,
            )
          : getAmountWithSymbol(
              v1.allocationAssigned - v1.allocationLeft + v1.escrowVestedAmount,
              selectedToken.address,
              false,
              splTokenList,
              selectedToken.decimals,
            )}
      </>
    );
  };

  const renderDepletionDate = () => {
    if (!stream) {
      return '--';
    }
    const date = isV2tream
      ? (stream as Stream).estimatedDepletionDate
      : ((stream as StreamInfo).escrowEstimatedDepletionUtc as string);
    if (date) {
      return getRelativeDate(date);
    } else {
      return getReadableDate(stream.startUtc as string, true);
    }
  };

  const getBadgesList = () => {
    if (!treasuryDetails) {
      return;
    }

    const v1 = treasuryDetails as TreasuryInfo;
    const v2 = treasuryDetails as PaymentStreamingAccount;
    const isV2Treasury = getIsV2Treasury(treasuryDetails);
    const v2Type = v2.accountType === AccountType.Open ? 'Open' : 'Locked';
    let type = '';

    if (isV2Treasury) {
      type = v2.category === 1 ? 'Vesting' : v2Type;
    } else {
      type = v1.type === TreasuryType.Open ? 'Open' : 'Locked';
    }

    if (isOtp() || isScheduledOtp()) {
      type = 'One Time Payment';
    }

    const category = isV2Treasury ? v2.category : 0;

    const subCategory = isV2Treasury && v2.subCategory ? getCategoryLabelByValue(v2.subCategory) : '';

    let badges;
    if (type) {
      if (category && subCategory) {
        badges = [type, subCategory];
      } else {
        badges = [type];
      }
    }

    return badges;
  };

  // Random component
  const Completionist = () => <span>--</span>;

  // Renderer callback with condition
  const renderer = ({ years, days, hours, minutes, seconds, completed }: any) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    } else {
      // Render a countdown
      const whenYearsPlusOne = years > 1 ? `${years} years` : `${years} year`;
      const showYears = years > 0 ? whenYearsPlusOne : '';
      const whenDaysPlusOne = days > 1 ? `${days} days` : `${days} day`;
      const showDays = days > 0 ? whenDaysPlusOne : '';
      const whenHoursPlusOne = hours > 1 ? `${hours} hours` : `${hours} hour`;
      const showHours = hours > 0 ? whenHoursPlusOne : '';
      const whenMinutesPlusOne = minutes > 1 ? `${minutes} minutes` : `${minutes} minute`;
      const showMinutes = minutes > 0 ? whenMinutesPlusOne : '';

      return <span>{`${showYears} ${showDays} ${showHours} ${showMinutes}`}</span>;
    }
  };

  const streamStartDate = useMemo(() => getStreamStartDate(stream), [stream]);

  // Tab details
  const detailsData = [
    {
      label: streamStartDate.label,
      value: streamStartDate.value,
    },
    {
      label: isStreamIncoming && 'Receiving from:',
      value: isStreamIncoming && (stream ? renderReceivingFrom() : '--'),
    },
    {
      label: isStreamOutgoing && 'Sending to:',
      value: isStreamOutgoing && (stream ? renderSendingTo() : '--'),
    },
    {
      label: stream && !isOtp() ? 'Payment rate:' : 'Deposit amount:',
      value: renderPaymentRate(),
    },
    {
      label: stream && !isScheduledOtp() && 'Reserved allocation:',
      value: stream && !isScheduledOtp() && renderReservedAllocation(),
    },
    {
      label: isStreamIncoming && 'Funds left in account:',
      value: isStreamIncoming && renderFundsLeftInAccount(),
    },
    {
      label: isStreamOutgoing && 'Funds sent to recipient:',
      value: isStreamOutgoing && (stream ? renderFundsSendToRecipient() : '--'),
    },
    {
      label: isStreamOutgoing && stream && getStreamStatus(stream) === 'running' && 'Funds will run out in:',
      value: isStreamOutgoing && stream && getStreamStatus(stream) === 'running' && (
        <Countdown
          className='align-middle'
          date={
            isV2tream
              ? (stream as Stream).estimatedDepletionDate
              : ((stream as StreamInfo).escrowEstimatedDepletionUtc as string)
          }
          renderer={renderer}
        />
      ),
    },
    {
      label: stream && getStreamStatus(stream) === 'stopped' && !isOtp() && 'Funds ran out on:',
      value: stream && getStreamStatus(stream) === 'stopped' && !isOtp() && renderDepletionDate(),
    },
    {
      label: 'Stream id:',
      value: stream ? (
        <CopyExtLinkGroup
          content={stream.id as string}
          number={8}
          externalLink={true}
          isTx={false}
          className='d-block text-truncate'
          classNameContainer='mb-1 mr-2'
        />
      ) : (
        '--'
      ),
    },
  ];

  // Render details
  const renderDetails = (
    <>
      {detailsData.map((detail: any, index: number) => (
        <Row gutter={[8, 8]} key={index} className='pl-1 details-item mr-0 ml-0'>
          <Col span={8} className='pr-1'>
            <span className='info-label'>{detail.label}</span>
          </Col>
          <Col span={16} className='pl-1'>
            <span>{detail.value}</span>
          </Col>
        </Row>
      ))}
    </>
  );

  // Tabs
  const tabs = [
    {
      key: 'details',
      label: 'Details',
      children: renderDetails,
    },
    {
      key: 'activity',
      label: 'Activity',
      children: stream && renderActivities(),
    },
  ];

  const renderTabset = () => {
    return <Tabs items={tabs} activeKey={tabOption} onChange={navigateToTab} className='neutral' />;
  };

  const streamFlowDirection = isStreamIncoming ? 'incoming' : 'outgoing';
  const title = stream ? getStreamTitle(stream, t) : `Unknown ${streamFlowDirection} stream`;
  const subtitle = stream ? getStreamSubtitle() : '--';
  const resume = stream ? getStreamStatusResume(stream, t) : '--';

  return (
    <>
      <div className='stream-fields-container'>
        {/* Background animation */}
        {stream && getStreamStatus(stream) === 'running' ? (
          <div className='stream-background'>
            {isInboundStream(stream) ? (
              <img className='inbound' src='/assets/incoming-crypto.svg' alt='' />
            ) : (
              <img className='inbound' src='/assets/outgoing-crypto.svg' alt='' />
            )}
          </div>
        ) : null}

        {!isXsDevice && (
          <Row gutter={[8, 8]} className='safe-details-resume mr-0 ml-0'>
            <div onClick={hideDetailsHandler} className='back-button icon-button-container'>
              <IconArrowBack className='mean-svg-icons' />
              <span className='ml-1'>Back</span>
            </div>
          </Row>
        )}

        {stream && (
          <ResumeItem
            img={getStreamIcon(stream)}
            title={title}
            extraTitle={getBadgesList()}
            status={getStreamStatusLabel(stream)}
            subtitle={subtitle}
            resume={resume}
            isDetailsPanel={true}
            isLink={false}
            isStream={true}
            classNameRightContent='header-stream-details-row resume-right-content'
          />
        )}

        {infoData && (
          <RightInfoDetails
            infoData={infoData}
            classNameInfoGroup='header-details-info-group'
            xs={24}
            sm={24}
            md={24}
            lg={24}
          />
        )}

        {buttons}

        {tabs && renderTabset()}
      </div>
    </>
  );
};
