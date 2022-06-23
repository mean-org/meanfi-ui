import React, { useCallback, useContext, useEffect, useState } from 'react';
import moment from 'moment';
import BN from 'bn.js';
import './style.scss';
import { Col, Row, Spin, Tabs } from 'antd';
import { Stream, STREAM_STATUS, StreamActivity } from '@mean-dao/msp';
import { cutNumber, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, makeDecimal, shortenAddress, toUiAmount } from '../../../../utils/utils';
import { getFormattedNumberToLocale, getIntervalFromSeconds, getReadableDate, getShortDate, getTimeToNow, relativeTimeFromDates } from '../../../../utils/ui';
import { AppStateContext } from '../../../../contexts/appstate';
import { useTranslation } from 'react-i18next';
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_ADDRESS, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, WRAPPED_SOL_MINT_ADDRESS } from '../../../../constants';
import { TokenInfo } from '@solana/spl-token-registry';
import { useWallet } from '../../../../contexts/wallet';
import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { getSolanaExplorerClusterParam } from '../../../../contexts/connection';
import { AddressDisplay } from '../../../../components/AddressDisplay';
import { IconExternalLink } from '../../../../Icons';
import { Identicon } from '../../../../components/Identicon';

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
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [tabOption, setTabOption] = useState<StreamDetailTab>("details");
  const { publicKey } = useWallet();

  const onTabChanged = useCallback((tab: string) => {
    setTabOption(tab as StreamDetailTab);
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
        if (item.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${item.treasurer}`)})`;
        } else if (item.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${item.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${item.treasurer}`)})`;
        }
      } else {
        if (item.status === STREAM_STATUS.Schedule) {
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
    let value = '';

    if (item) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      value += getFormattedNumberToLocale(cutNumber(makeDecimal(new BN(item.rateAmount), token?.decimals || 6), 2));
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getDepositAmountDisplay = useCallback((item: Stream): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      value += getFormattedNumberToLocale(cutNumber(makeDecimal(new BN(item.allocationAssigned), token?.decimals || 6), 2));
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamSubtitle = useCallback((item: Stream) => {
    let title = '';

    if (item) {
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, false, t);
      }

      if (isInboundStream) {
        if (item.status === STREAM_STATUS.Schedule) {
          title = t('streams.stream-list.subtitle-scheduled-inbound', {
            rate: rateAmount
          });
          title += ` ${getShortDate(item.startUtc as string)}`;
        } else {
          title = t('streams.stream-list.subtitle-running-inbound', {
            rate: rateAmount
          });
          title += ` ${getShortDate(item.startUtc as string)}`;
        }
      } else {
        if (item.status === STREAM_STATUS.Schedule) {
          title = t('streams.stream-list.subtitle-scheduled-outbound', {
            rate: rateAmount
          });
          title += ` ${getShortDate(item.startUtc as string)}`;
        } else {
          title = t('streams.stream-list.subtitle-running-outbound', {
            rate: rateAmount
          });
          title += ` ${getShortDate(item.startUtc as string)}`;
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
        case STREAM_STATUS.Schedule:
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

  const getStreamResume = useCallback((item: Stream) => {
    if (item) {
      switch (item.status) {
        case STREAM_STATUS.Schedule:
          return `starts on ${getShortDate(item.startUtc as string)}`;
        case STREAM_STATUS.Paused:
          if (item.isManuallyPaused) {
            return `paused on ${getShortDate(item.startUtc as string)}`;
          }
          return `out of funds on ${getShortDate(item.startUtc as string)}`;
        default:
          return `streaming since ${getShortDate(item.startUtc as string)}`;
      }
    }
  }, []);

  const getStreamStatusSubtitle = useCallback((item: Stream) => {
    if (item) {
      switch (item.status) {
        case STREAM_STATUS.Schedule:
          return t('streams.status.scheduled', { date: getShortDate(item.startUtc as string) });
        case STREAM_STATUS.Paused:
          if (item.isManuallyPaused) {
            return t('streams.status.stopped-manually');
          }
          return t('vesting.vesting-account-streams.stream-status-complete');
        default:
          return t('vesting.vesting-account-streams.stream-status-streaming', { timeLeft: getTimeToNow(item.estimatedDepletionDate as string) });
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

  const getActivityAmount = (item: StreamActivity) => {
    const token = getTokenByMintAddress(item.mint as string);
    return toUiAmount(new BN(item.amount), token?.decimals || 6);
  }

  const renderActivities = () => {
    return (
      <>
        <Spin spinning={loadingStreamActivity}>
          {(streamActivity && streamActivity.length > 0) ? (
            streamActivity.map((item, index) => {
              return (
                <a key={`${index + 50}`} target="_blank" rel="noopener noreferrer"
                  className="transaction-list-row stripped-rows"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`}>
                  <div className="icon-cell">
                    <div className="token-icon">
                      {getActivityIcon(item)}
                    </div>
                  </div>
                  <div className="description-cell no-padding">
                    <div className="title text-truncate">{getActivityAction(item)}</div>
                    <div className="subtitle text-truncate">{shortenAddress(item.initializer)}</div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">{
                      getAmountWithSymbol(
                        getActivityAmount(item),
                        item.mint,
                        false,
                        splTokenList
                      )}
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
      </>
    );
  }

  const renderReceivingFrom = () => {
    if (!stream) { return null; }

    return (
      <AddressDisplay
        address={stream.treasurer as string}
        iconStyles={{ width: "15", height: "15" }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    )
  }

  const renderSendingTo = () => {
    if (!stream) { return null; }

    return (
      <AddressDisplay
        address={stream.beneficiary as string}
        iconStyles={{ width: "15", height: "15" }}
        newTabLink={`${SOLANA_EXPLORER_URI_INSPECT_ADDRESS}${publicKey?.toBase58()}${getSolanaExplorerClusterParam()}`}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!stream) { return null; }

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(stream.rateAmount), token?.decimals || 6), 
              stream.associatedToken as string
            )} ${getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}`
          : '--'
        }
      </>
    )
  }

  const renderReservedAllocation = () => {
    if (!stream) { return null; }

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(stream.remainingAllocationAmount), token?.decimals || 6),
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!stream) { return null; }

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(stream.fundsLeftInStream), token?.decimals || 6),
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsSendToRecipient = () => {
    if (!stream) { return null; }

    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(
              toUiAmount(new BN(stream.fundsSentToBeneficiary), token?.decimals || 6),
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  // Tab details
  const detailsData = [
    {
      label: "Started on:",
      value: stream ? moment(stream.startUtc).format("LLL").toLocaleString() : "--"
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
      label: "Payment rate:",
      value: renderPaymentRate() ? renderPaymentRate() : "--"
    },
    {
      label: "Reserved allocation:",
      value: renderReservedAllocation() ? renderReservedAllocation() : ""
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
      value: (!isInboundStream && stream && stream.status === STREAM_STATUS.Running) && `${getReadableDate(stream.estimatedDepletionDate as string)} (${getTimeToNow(stream.estimatedDepletionDate as string)})`
    },
    {
      label: stream && stream.status === STREAM_STATUS.Paused && "Funds ran out on:",
      value: stream && stream.status === STREAM_STATUS.Paused && getRelativeDate(stream.estimatedDepletionDate as string)
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

  // Tabs
  const tabs = [
    {
      id: "details",
      name: "Details",
      render: renderDetails()
    },
    {
      id: "activity",
      name: "Activity",
      render: renderActivities()
    }
  ];

  const renderTabset = () => {
    return (
      <Tabs activeKey={tabOption} onChange={onTabChanged} className="neutral">
        {tabs.map(item => {
          return (
            <TabPane tab={item.name} key={item.id} tabKey={item.id}>
              {item.render}
            </TabPane>
          );
        })}
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
                ? getTokenAmountAndSymbolByTokenAddress(
                    toUiAmount(new BN(item.withdrawableAmount), selectedToken?.decimals || 6),
                    item.associatedToken as string
                  )
                : getTokenAmountAndSymbolByTokenAddress(
                    toUiAmount(new BN(item.fundsLeftInStream), selectedToken?.decimals || 6),
                    item.associatedToken as string,
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

        {tabs && renderTabset()}

      </div>
    </>
  )
}
