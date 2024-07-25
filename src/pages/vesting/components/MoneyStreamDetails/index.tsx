import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { STREAM_STATUS_CODE, type Stream, type StreamActivity } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { IconExternalLink } from 'Icons';
import { Col, Row, Spin, Tabs } from 'antd';
import {
  FALLBACK_COIN_IMAGE,
  SOLANA_EXPLORER_URI_INSPECT_ADDRESS,
  SOLANA_EXPLORER_URI_INSPECT_TRANSACTION,
} from 'app-constants/common';
import { AddressDisplay } from 'components/AddressDisplay';
import { Identicon } from 'components/Identicon';
import getStreamStartDate from 'components/common/getStreamStartDate';
import { AppStateContext } from 'contexts/appstate';
import { getSolanaExplorerClusterParam } from 'contexts/connection';
import { useWallet } from 'contexts/wallet';
import { getStreamAssociatedMint } from 'middleware/getStreamAssociatedMint';
import {
  getIntervalFromSeconds,
  getReadableDate,
  getShortDate,
  getTimeToNow,
  relativeTimeFromDates,
} from 'middleware/ui';
import { displayAmountWithSymbol, shortenAddress } from 'middleware/utils';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type React from 'react';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LooseObject } from 'types/LooseObject';
import './style.scss';

export type StreamDetailTab = 'details' | 'activity';

export const MoneyStreamDetails = (props: {
  hasMoreStreamActivity: boolean;
  highlightedStream: Stream | undefined;
  isInboundStream: boolean;
  loadingStreamActivity: boolean;
  onLoadMoreActivities: () => void;
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
  const { splTokenList } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [tabOption, setTabOption] = useState<StreamDetailTab>('details');
  const { publicKey } = useWallet();

  const onTabChanged = useCallback((tab: string) => {
    setTabOption(tab as StreamDetailTab);
  }, []);

  const getStreamTypeIcon = useCallback(() => {
    if (isInboundStream) {
      return (
        <span className='stream-type incoming'>
          <ArrowDownOutlined />
        </span>
      );
    }

    return (
      <span className='stream-type outgoing'>
        <ArrowUpOutlined />
      </span>
    );
  }, [isInboundStream]);

  const getStreamTitle = (item: Stream): string => {
    let title = '';
    if (item) {
      if (item.name) {
        return `${item.name}`;
      }
      if (isInboundStream) {
        if (item.statusCode === STREAM_STATUS_CODE.Scheduled) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(item.psAccountOwner)})`;
        } else if (item.statusCode === STREAM_STATUS_CODE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(item.psAccountOwner)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(item.psAccountOwner)})`;
        }
      } else {
        if (item.statusCode === STREAM_STATUS_CODE.Scheduled) {
          title = `${t('streams.stream-list.title-scheduled-to')} (${shortenAddress(item.beneficiary)})`;
        } else if (item.statusCode === STREAM_STATUS_CODE.Paused) {
          title = `${t('streams.stream-list.title-paused-to')} (${shortenAddress(item.beneficiary)})`;
        } else {
          title = `${t('streams.stream-list.title-sending-to')} (${shortenAddress(item.beneficiary)})`;
        }
      }
    }

    return title;
  };

  const getRateAmountDisplay = useCallback(
    (item: Stream): string => {
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
        true,
      );

      return value;
    },
    [selectedToken, splTokenList],
  );

  const getDepositAmountDisplay = useCallback(
    (item: Stream): string => {
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
        true,
      );

      return value;
    },
    [selectedToken, splTokenList],
  );

  const getStreamSubtitle = useCallback(
    (item: Stream) => {
      let title = '';

      if (item) {
        let rateAmount = item.rateAmount.gtn(0) ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
        if (item.rateAmount.gtn(0)) {
          rateAmount += ' ' + getIntervalFromSeconds(new BN(item.rateIntervalInSeconds).toNumber(), false, t);
        }

        if (isInboundStream) {
          if (item.statusCode === STREAM_STATUS_CODE.Scheduled) {
            title = t('streams.stream-list.subtitle-scheduled-inbound', {
              rate: rateAmount,
            });
          } else {
            title = t('streams.stream-list.subtitle-running-inbound', {
              rate: rateAmount,
            });
          }
        } else {
          if (item.statusCode === STREAM_STATUS_CODE.Scheduled) {
            title = t('streams.stream-list.subtitle-scheduled-outbound', {
              rate: rateAmount,
            });
          } else {
            title = t('streams.stream-list.subtitle-running-outbound', {
              rate: rateAmount,
            });
          }
        }
      }

      return title;
    },
    [isInboundStream, getRateAmountDisplay, getDepositAmountDisplay, t],
  );

  const getStreamStatus = useCallback(
    (item: Stream) => {
      let bgClass = '';
      let content = '';

      if (item) {
        switch (item.statusCode) {
          case STREAM_STATUS_CODE.Scheduled:
            bgClass = 'bg-purple';
            content = t('streams.status.status-scheduled');
            break;
          case STREAM_STATUS_CODE.Paused:
            if (item.isManuallyPaused) {
              bgClass = 'error';
              content = t('streams.status.status-stopped');
            } else {
              bgClass = 'error';
              content = t('vesting.status.status-stopped');
            }
            break;
          default:
            bgClass = 'bg-green';
            content = t('streams.status.status-running');
            break;
        }
      }

      return <span className={`badge small font-bold text-uppercase fg-white ${bgClass}`}>{content}</span>;
    },
    [t],
  );

  const getStreamStatusSubtitle = useCallback(
    (item: Stream) => {
      if (item) {
        switch (item.statusCode) {
          case STREAM_STATUS_CODE.Scheduled:
            return t('streams.status.scheduled', {
              date: getShortDate(item.startUtc, false),
            });
          case STREAM_STATUS_CODE.Paused:
            if (item.isManuallyPaused) {
              return t('streams.status.stopped-manually');
            }
            return t('vesting.vesting-account-streams.stream-status-complete');
          default:
            return t('vesting.vesting-account-streams.stream-status-streaming', {
              timeLeft: getTimeToNow(item.estimatedDepletionDate),
            });
        }
      }
    },
    [t],
  );

  /////////////////////
  // Data management //
  /////////////////////

  // biome-ignore lint/correctness/useExhaustiveDependencies: Deps managed manually
  useEffect(() => {
    if (highlightedStream && tabOption === 'activity' && streamActivity.length < 5) {
      onLoadMoreActivities();
    }
  }, [tabOption, highlightedStream, streamActivity.length]);

  ///////////////
  // Rendering //
  ///////////////

  const getRelativeDate = useCallback((utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  }, []);

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = 'error';
  };

  const getActivityIcon = useCallback(
    (item: StreamActivity) => {
      if (isInboundStream) {
        if (item.action === 'withdrew') {
          return <ArrowUpOutlined className='mean-svg-icons outgoing' />;
        }

        return <ArrowDownOutlined className='mean-svg-icons incoming' />;
      }

      if (item.action === 'withdrew') {
        return <ArrowDownOutlined className='mean-svg-icons incoming' />;
      }

      return <ArrowUpOutlined className='mean-svg-icons outgoing' />;
    },
    [isInboundStream],
  );

  const getActivityAction = useCallback(
    (item: StreamActivity): string => {
      const actionText =
        item.action === 'deposited'
          ? t('streams.stream-activity.action-deposit')
          : t('streams.stream-activity.action-withdraw');
      return actionText;
    },
    [t],
  );

  const renderReceivingFrom = useCallback(() => {
    if (!stream) {
      return null;
    }

    return (
      <AddressDisplay
        address={stream.psAccountOwner.toBase58()}
        iconStyles={{ width: '15', height: '15' }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    );
  }, [publicKey, stream]);

  const renderPaymentRate = useCallback(() => {
    if (!stream || !selectedToken) {
      return '--';
    }

    const rateAmountBN = new BN(stream.rateAmount);

    let rateAmount = rateAmountBN.gtn(0) ? getRateAmountDisplay(stream) : getDepositAmountDisplay(stream);
    if (rateAmountBN.gtn(0)) {
      rateAmount += ' ' + getIntervalFromSeconds(new BN(stream.rateIntervalInSeconds).toNumber(), false, t);
    }

    return rateAmount;
  }, [getDepositAmountDisplay, getRateAmountDisplay, selectedToken, stream, t]);

  const renderReservedAllocation = useCallback(() => {
    if (!stream || !selectedToken) {
      return '--';
    }

    return (
      <>
        {displayAmountWithSymbol(
          stream.remainingAllocationAmount,
          selectedToken.address,
          selectedToken.decimals,
          splTokenList,
        )}
      </>
    );
  }, [selectedToken, splTokenList, stream]);

  const renderFundsLeftInAccount = useCallback(() => {
    if (!stream || !selectedToken) {
      return '--';
    }

    return (
      <>
        {displayAmountWithSymbol(stream.fundsLeftInStream, selectedToken.address, selectedToken.decimals, splTokenList)}
      </>
    );
  }, [selectedToken, splTokenList, stream]);

  const renderFundsSendToRecipient = useCallback(() => {
    if (!stream || !selectedToken) {
      return '--';
    }

    return (
      <>
        {displayAmountWithSymbol(
          stream.fundsSentToBeneficiary,
          selectedToken.address,
          selectedToken.decimals,
          splTokenList,
        )}
      </>
    );
  }, [selectedToken, splTokenList, stream]);

  const renderStreamId = useCallback(() => {
    if (!stream) {
      return null;
    }

    return (
      <>
        <AddressDisplay
          address={stream.id.toBase58()}
          maxChars={8}
          iconStyles={{ width: '15', height: '15', verticalAlign: 'text-top' }}
          newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${stream.id}${getSolanaExplorerClusterParam()}`}
        />
      </>
    );
  }, [stream]);

  const renderSendingTo = useCallback(() => {
    if (!stream) {
      return null;
    }

    return (
      <AddressDisplay
        address={stream.beneficiary.toBase58()}
        maxChars={8}
        iconStyles={{ width: '15', height: '15', verticalAlign: 'text-top' }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    );
  }, [publicKey, stream]);

  const renderCliffVestAmount = useCallback(() => {
    if (!stream || !selectedToken) {
      return null;
    }

    return displayAmountWithSymbol(stream.cliffVestAmount, selectedToken.address, selectedToken.decimals, splTokenList);
  }, [selectedToken, splTokenList, stream]);

  const renderActivities = useCallback(() => {
    return (
      <div className='stream-activity-list'>
        <Spin spinning={loadingStreamActivity}>
          {streamActivity && streamActivity.length > 0 ? (
            streamActivity.map((item, index) => {
              return (
                <a
                  key={`${index + 50}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='transaction-list-row stripped-rows'
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}
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
                            true,
                            true,
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
        {streamActivity.length > 0 && hasMoreStreamActivity && (
          <div className='mt-1 text-center'>
            <span
              className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
              role='link'
              onKeyDown={() => {}}
              onClick={onLoadMoreActivities}
            >
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
      </div>
    );
  }, [
    getActivityAction,
    getActivityIcon,
    hasMoreStreamActivity,
    loadingStreamActivity,
    onLoadMoreActivities,
    selectedToken,
    splTokenList,
    streamActivity,
    t,
  ]);

  const streamStartDate = useMemo(() => getStreamStartDate(stream), [stream]);

  // Tab details
  const detailsData = useMemo(
    () => [
      {
        label: streamStartDate.label,
        value: streamStartDate.value,
      },
      {
        label: isInboundStream && 'Receiving from:',
        value: isInboundStream && renderReceivingFrom(),
      },
      {
        label: !isInboundStream && 'Sending to:',
        value: !isInboundStream && renderSendingTo(),
      },
      {
        label: 'Cliff release:',
        value: renderCliffVestAmount(),
      },
      {
        label: 'Payment rate:',
        value: renderPaymentRate(),
      },
      {
        label: 'Reserved allocation:',
        value: renderReservedAllocation(),
      },
      {
        label: isInboundStream && 'Funds left in account:',
        value: isInboundStream && renderFundsLeftInAccount(),
      },
      {
        label: !isInboundStream && 'Funds sent to recipient:',
        value: !isInboundStream && renderFundsSendToRecipient(),
      },
      {
        label:
          !isInboundStream && stream && stream.statusCode === STREAM_STATUS_CODE.Running && 'Funds will run out in:',
        value:
          !isInboundStream &&
          stream &&
          stream.statusCode === STREAM_STATUS_CODE.Running &&
          `${getReadableDate(stream.estimatedDepletionDate)} (${getTimeToNow(stream.estimatedDepletionDate)})`,
      },
      {
        label: stream && stream.statusCode === STREAM_STATUS_CODE.Paused && 'Funds ran out on:',
        value:
          stream && stream.statusCode === STREAM_STATUS_CODE.Paused && getRelativeDate(stream.estimatedDepletionDate),
      },
      {
        label: 'Stream id:',
        value: renderStreamId(),
      },
    ],
    [
      stream,
      isInboundStream,
      streamStartDate,
      renderFundsSendToRecipient,
      renderFundsLeftInAccount,
      renderReservedAllocation,
      renderCliffVestAmount,
      renderReceivingFrom,
      renderPaymentRate,
      getRelativeDate,
      renderSendingTo,
      renderStreamId,
    ],
  );

  const renderDetails = useCallback(() => {
    return (
      <>
        {detailsData.map((detail: LooseObject, index: number) => (
          <Row gutter={[8, 8]} key={index} className='pl-1 details-item'>
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
  }, [detailsData]);

  const renderTabset = useCallback(() => {
    const items = [];
    items.push({
      key: 'details',
      label: 'Details',
      children: renderDetails(),
    });
    items.push({
      key: 'activity',
      label: 'Activity',
      children: renderActivities(),
    });

    return <Tabs items={items} activeKey={tabOption} onChange={onTabChanged} className='neutral' />;
  }, [onTabChanged, renderActivities, renderDetails, tabOption]);

  const renderStream = (item: Stream) => {
    if (!selectedToken) {
      return null;
    }

    const associatedToken = getStreamAssociatedMint(item);

    return (
      <div className='transaction-list-row no-pointer'>
        <div className='icon-cell'>
          {getStreamTypeIcon()}
          <div className='token-icon'>
            {selectedToken?.logoURI ? (
              <img
                alt={`${selectedToken.name}`}
                width={36}
                height={36}
                src={selectedToken.logoURI}
                onError={imageOnErrorHandler}
              />
            ) : (
              <Identicon address={associatedToken} style={{ width: '36', height: '36', display: 'inline-flex' }} />
            )}
          </div>
        </div>
        <div className='description-cell'>
          <div className='title text-truncate'>{getStreamTitle(item)}</div>
          <div className='subtitle text-truncate'>{getStreamSubtitle(item)}</div>
        </div>
        <div className='rate-cell'>
          <div className='rate-amount'>{getStreamStatus(item)}</div>
          <div className='interval'>{getStreamStatusSubtitle(item)}</div>
        </div>
      </div>
    );
  };

  const renderStreamBalance = (item: Stream) => {
    if (!item || !selectedToken) {
      return null;
    }

    return (
      <div className='details-panel-meta mt-2 mb-2'>
        <div className='info-label text-truncate line-height-110'>
          {isInboundStream
            ? t('streams.stream-detail.label-funds-available-to-withdraw')
            : t('streams.stream-detail.label-funds-left-in-account')}
        </div>
        <div className='transaction-detail-row'>
          <span className='info-data line-height-110'>
            {isInboundStream
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
                )}
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className='stream-detail-component shift-up-2'>
        {stream && renderStream(stream)}

        {stream && renderStreamBalance(stream)}

        {renderTabset()}
      </div>
    </>
  );
};
