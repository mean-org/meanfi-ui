import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Stream, StreamActivity, STREAM_STATUS } from '@mean-dao/msp';
import { TokenInfo } from '@solana/spl-token-registry';
import { Col, Row, Spin, Tabs } from 'antd';
import BN from 'bn.js';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { Identicon } from '../../../../components/Identicon';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from '../../../../constants';
import { AppStateContext } from '../../../../contexts/appstate';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { useWallet } from '../../../../contexts/wallet';
import { IconExternalLink } from '../../../../Icons';
import { getIntervalFromSeconds, getReadableDate, getShortDate, getTimeToNow, relativeTimeFromDates } from '../../../../middleware/ui';
import { displayAmountWithSymbol, shortenAddress } from '../../../../middleware/utils';
import './style.scss';

const { TabPane } = Tabs;
export type StreamDetailTab = "details" | "activity";

export const MoneyStreamDetails = (props: {
  hasMoreStreamActivity: boolean;
  highlightedStream: Stream | undefined;
  isInboundStream: boolean;
  loadingStreamActivity: boolean;
  onLoadMoreActivities: any;
  selectedToken: TokenInfo | undefined;
  stream: Stream | undefined;
  streamActivity: StreamActivity[];
}) => {
  const {
    hasMoreStreamActivity,
    highlightedStream,
    isInboundStream,
    loadingStreamActivity,
    onLoadMoreActivities,
    selectedToken,
    stream,
    streamActivity,
  } = props;
  const {
    splTokenList,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [tabOption, setTabOption] = useState<StreamDetailTab>("details");
  const { publicKey } = useWallet();

  const onTabChanged = useCallback((tab: string) => {
    setTabOption(tab as StreamDetailTab);
  }, []);

  const isStartDateFuture = useCallback((date: string): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const comparedDate = new Date(date);
    const dateWithoutOffset = new Date(comparedDate.getTime() - (comparedDate.getTimezoneOffset() * 60000));
    if (dateWithoutOffset > nowUtc) {
      return true;
    }
    return false;
  }, []);

  const getStreamTypeIcon = useCallback(() => {
    if (isInboundStream) {
      return (
        <span className="stream-type incoming">
          <ArrowDownOutlined />
        </span>
      );
    } else {
      return (
        <span className="stream-type outgoing">
          <ArrowUpOutlined />
        </span>
      );
    }
  }, [isInboundStream]);

  const getStreamTitle = (item: Stream): string => {
    let title = '';
    if (item) {
      if (item.name) {
        return `${item.name}`;
      }
      if (isInboundStream) {
        if (item.status === STREAM_STATUS.Scheduled) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurer}`)})`;
        } else if (item.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurer}`)})`;
        }
      } else {
        if (item.status === STREAM_STATUS.Scheduled) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(`${item.beneficiary}`)})`;
        } else if (item.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(`${item.beneficiary}`)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(`${item.beneficiary}`)})`;
        }
      }
    }

    return title;
  }

  const getRateAmountDisplay = useCallback((item: Stream): string => {
    if (!selectedToken) {
      return '';
    }

    const rateAmount = new BN(item.rateAmount);

    const value = displayAmountWithSymbol(
      rateAmount,
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
      true,
      true
    );

    return value;
  }, [selectedToken, splTokenList]);

  const getDepositAmountDisplay = useCallback((item: Stream): string => {
    if (!selectedToken) {
      return '';
    }

    const allocationAssigned = new BN(item.allocationAssigned);
    const value = displayAmountWithSymbol(
      allocationAssigned,
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
      true,
      true
    );

    return value;
  }, [selectedToken, splTokenList]);

  const getStreamSubtitle = useCallback((item: Stream) => {
    let title = '';

    if (item) {
      let rateAmount = item.rateAmount.gtn(0) ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount.gtn(0)) {
        rateAmount += ' ' + getIntervalFromSeconds(new BN(item.rateIntervalInSeconds).toNumber(), false, t);
      }

      if (isInboundStream) {
        if (item.status === STREAM_STATUS.Scheduled) {
          title = t('streams.stream-list.subtitle-scheduled-inbound', {
            rate: rateAmount
          });
        } else {
          title = t('streams.stream-list.subtitle-running-inbound', {
            rate: rateAmount
          });
        }
      } else {
        if (item.status === STREAM_STATUS.Scheduled) {
          title = t('streams.stream-list.subtitle-scheduled-outbound', {
            rate: rateAmount
          });
        } else {
          title = t('streams.stream-list.subtitle-running-outbound', {
            rate: rateAmount
          });
        }
      }
    }

    return title;

  }, [isInboundStream, getRateAmountDisplay, getDepositAmountDisplay, t]);

  const getStreamStatus = useCallback((item: Stream) => {

    let bgClass = '';
    let content = '';

    if (item) {
      switch (item.status) {
        case STREAM_STATUS.Scheduled:
          bgClass = 'bg-purple';
          content = t('streams.status.status-scheduled');
          break;
        case STREAM_STATUS.Paused:
          if (item.isManuallyPaused) {
            bgClass = 'error';
            content = t('streams.status.status-stopped');
          } else {
            bgClass = 'error';
            content = t('streams.status.status-stopped');
          }
          break;
        default:
          bgClass = 'bg-green';
          content = t('streams.status.status-running');
          break;
      }
    }

    return (
      <span className={`badge small font-bold text-uppercase fg-white ${bgClass}`}>{content}</span>
    );

  }, [t]);

  const getStreamStatusSubtitle = useCallback((item: Stream) => {
    if (item) {
      switch (item.status) {
        case STREAM_STATUS.Scheduled:
          return t('streams.status.scheduled', { date: getShortDate(item.startUtc, false) });
        case STREAM_STATUS.Paused:
          if (item.isManuallyPaused) {
            return t('streams.status.stopped-manually');
          }
          return t('vesting.vesting-account-streams.stream-status-complete');
        default:
          return t('vesting.vesting-account-streams.stream-status-streaming', { timeLeft: getTimeToNow(item.estimatedDepletionDate) });
      }
    }
  }, [t]);

  /////////////////////
  // Data management //
  /////////////////////

  useEffect(() => {
    if (highlightedStream && tabOption === "activity" && streamActivity.length < 5) {
      onLoadMoreActivities();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabOption]);


  ///////////////
  // Rendering //
  ///////////////

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  }

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  const getActivityIcon = (item: StreamActivity) => {
    if (isInboundStream) {
      if (item.action === 'withdrew') {
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing" />
        );
      } else {
        return (
          <ArrowDownOutlined className="mean-svg-icons incoming" />
        );
      }
    } else {
      if (item.action === 'withdrew') {
        return (
          <ArrowDownOutlined className="mean-svg-icons incoming" />
        );
      } else {
        return (
          <ArrowUpOutlined className="mean-svg-icons outgoing" />
        );
      }
    }
  }

  const getActivityAction = (item: StreamActivity): string => {
    const actionText = item.action === 'deposited'
      ? t('streams.stream-activity.action-deposit')
      : t('streams.stream-activity.action-withdraw');
    return actionText;
  }

  const renderReceivingFrom = () => {
    if (!stream) { return null; }

    return (
      <AddressDisplay
        address={stream.treasurer.toBase58()}
        iconStyles={{ width: "15", height: "15" }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!stream || !selectedToken) { return '--'; }

    const rateAmountBN = new BN(stream.rateAmount);

    let rateAmount = rateAmountBN.gtn(0) ? getRateAmountDisplay(stream) : getDepositAmountDisplay(stream);
    if (rateAmountBN.gtn(0)) {
      rateAmount += ' ' + getIntervalFromSeconds(new BN(stream.rateIntervalInSeconds).toNumber(), false, t);
    }

    return rateAmount;
  }

  const renderReservedAllocation = () => {
    if (!stream || !selectedToken) { return '--'; }

    return (
      <>
        {
          displayAmountWithSymbol(
            stream.remainingAllocationAmount,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
          )
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!stream || !selectedToken) { return '--'; }

    return (
      <>
        {
          displayAmountWithSymbol(
            stream.fundsLeftInStream,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
          )
        }
      </>
    )
  }

  const renderFundsSendToRecipient = () => {
    if (!stream || !selectedToken) { return '--'; }

    return (
      <>
        {
          displayAmountWithSymbol(
            stream.fundsSentToBeneficiary,
            selectedToken.address,
            selectedToken.decimals,
            splTokenList,
          )
        }
      </>
    )
  }

  const renderStreamId = () => {
    if (!stream) { return null; }

    return (
      <>
        <AddressDisplay
          address={stream.id.toBase58()}
          maxChars={8}
          iconStyles={{ width: "15", height: "15", verticalAlign: 'text-top' }}
          newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}
        />
      </>
    )
  }

  const renderSendingTo = () => {
    if (!stream) { return null; }

    return (
      <AddressDisplay
        address={stream.beneficiary.toBase58()}
        maxChars={8}
        iconStyles={{ width: "15", height: "15", verticalAlign: 'text-top' }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    )
  }

  const renderCliffVestAmount = () => {
    if (!stream || !selectedToken) { return null; }

    return displayAmountWithSymbol(
      stream.cliffVestAmount,
      selectedToken.address,
      selectedToken.decimals,
      splTokenList,
    );
  }

  const renderActivities = () => {
    return (
      <div className="stream-activity-list">
        <Spin spinning={loadingStreamActivity}>
          {(streamActivity && streamActivity.length > 0) ? (
            streamActivity.map((item, index) => {
              return (
                <a key={`${index + 50}`} target="_blank" rel="noopener noreferrer"
                  className="transaction-list-row stripped-rows"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                  <div className="icon-cell">
                    {getActivityIcon(item)}
                  </div>
                  <div className="description-cell no-padding">
                    <div className="title text-truncate">{getActivityAction(item)}</div>
                    <div className="subtitle text-truncate">{shortenAddress(item.initializer)}</div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">
                      {
                        selectedToken
                          ? displayAmountWithSymbol(
                              new BN(item.amount),
                              item.mint,
                              selectedToken.decimals,
                              splTokenList,
                              true,
                              true
                            )
                          : '--'
                      }
                    </div>
                    <div className="interval">{getShortDate(item.utcDate as string, true)}</div>
                  </div>
                  <div className="actions-cell">
                    <IconExternalLink className="mean-svg-icons" style={{ width: "15", height: "15" }} />
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
        {streamActivity.length > 0 && hasMoreStreamActivity && (
          <div className="mt-1 text-center">
            <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
              role="link"
              onClick={onLoadMoreActivities}>
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Tab details
  const detailsData = [
    {
      label: stream ? isStartDateFuture(stream.startUtc) ? "Starting on:" : "Started on:" : "--",
      value: stream ? getReadableDate(stream.startUtc, true) : "--"
    },
    {
      label: isInboundStream && "Receiving from:",
      value: isInboundStream && renderReceivingFrom()
    },
    {
      label: !isInboundStream && "Sending to:",
      value: !isInboundStream && renderSendingTo()
    },
    {
      label: "Cliff release:",
      value: renderCliffVestAmount()
    },
    {
      label: "Payment rate:",
      value: renderPaymentRate()
    },
    {
      label: "Reserved allocation:",
      value: renderReservedAllocation()
    },
    {
      label: isInboundStream && "Funds left in account:",
      value: isInboundStream && renderFundsLeftInAccount()
    },
    {
      label: !isInboundStream && "Funds sent to recipient:",
      value: !isInboundStream && renderFundsSendToRecipient()
    },
    {
      label: (!isInboundStream && stream && stream.status === STREAM_STATUS.Running) && "Funds will run out in:",
      value: (!isInboundStream && stream && stream.status === STREAM_STATUS.Running) && `${getReadableDate(stream.estimatedDepletionDate)} (${getTimeToNow(stream.estimatedDepletionDate)})`
    },
    {
      label: stream && stream.status === STREAM_STATUS.Paused && "Funds ran out on:",
      value: stream && stream.status === STREAM_STATUS.Paused && getRelativeDate(stream.estimatedDepletionDate)
    },
    {
      label: "Stream id:",
      value: renderStreamId()
    },
  ];

  const renderDetails = () => {
    return (
      <>
        {detailsData.map((detail: any, index: number) => (
          <Row gutter={[8, 8]} key={index} className="pl-1 details-item">
            <Col span={8} className="pr-1">
              <span className="info-label">{detail.label}</span>
            </Col>
            <Col span={16} className="pl-1">
              <span>{detail.value}</span>
            </Col>
          </Row>
        ))}
      </>
    );
  };

  const renderTabset = () => {
    return (
      <Tabs activeKey={tabOption} onChange={onTabChanged} className="neutral">
        <TabPane tab="Details" key="details" tabKey="details">
          {renderDetails()}
        </TabPane>
        <TabPane tab="Activity" key="activity" tabKey="activity">
          {renderActivities()}
        </TabPane>
      </Tabs>
    );
  }

  const renderStream = (item: Stream) => {
    if (!selectedToken) { return null; }

    return (
      <div className="transaction-list-row no-pointer">
        <div className="icon-cell">
          {getStreamTypeIcon()}
          <div className="token-icon">
            {selectedToken && selectedToken.logoURI ? (
              <img alt={`${selectedToken.name}`} width={36} height={36} src={selectedToken.logoURI} onError={imageOnErrorHandler} />
            ) : (
              <Identicon address={item.associatedToken} style={{ width: "36", height: "36", display: "inline-flex" }} />
            )}
          </div>
        </div>
        <div className="description-cell">
          <div className="title text-truncate">{getStreamTitle(item)}</div>
          <div className="subtitle text-truncate">{getStreamSubtitle(item)}</div>
        </div>
        <div className="rate-cell">
          <div className="rate-amount">{getStreamStatus(item)}</div>
          <div className="interval">{getStreamStatusSubtitle(item)}</div>
        </div>
      </div>
    );
  };

  const renderStreamBalance = (item: Stream) => {
    if (!item || !selectedToken) { return null; }

    return (
      <div className="details-panel-meta mt-2 mb-2">
        <div className="info-label text-truncate line-height-110">
          {
            isInboundStream
              ? t('streams.stream-detail.label-funds-available-to-withdraw')
              : t('streams.stream-detail.label-funds-left-in-account')
          }
        </div>
        <div className="transaction-detail-row">
          <span className="info-data line-height-110">
            {
              isInboundStream
                ? displayAmountWithSymbol(
                    item.withdrawableAmount,
                    selectedToken.address,
                    selectedToken.decimals,
                    splTokenList,
                  )
                : displayAmountWithSymbol(
                    item.fundsLeftInStream,
                    selectedToken.address,
                    selectedToken.decimals,
                    splTokenList,
                  )
            }
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="stream-detail-component shift-up-2">

        {stream && renderStream(stream)}

        {stream && renderStreamBalance(stream)}

        {renderTabset()}

      </div>
    </>
  )
}
