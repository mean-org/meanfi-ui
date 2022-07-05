import { Col, Row, Tabs } from "antd";
import { ResumeItem } from "../ResumeItem";
import { RightInfoDetails } from "../RightInfoDetails";
import { IconArrowBack, IconExternalLink } from "../../Icons";
import "./style.scss";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";
import { StreamActivity, StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { Stream, STREAM_STATUS } from "@mean-dao/msp";
import { useCallback, useContext, useEffect } from "react";
import { formatAmount, formatThousands, getAmountWithSymbol, getTokenAmountAndSymbolByTokenAddress, shortenAddress, toUiAmount } from "../../utils/utils";
import { getFormattedNumberToLocale, getIntervalFromSeconds, getReadableDate, getShortDate, relativeTimeFromDates } from "../../utils/ui";
import { AppStateContext } from "../../contexts/appstate";
import BN from "bn.js";
import { useTranslation } from "react-i18next";
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION, WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { TokenInfo } from "@solana/spl-token-registry";
import { useSearchParams } from "react-router-dom";
import { useWallet } from "../../contexts/wallet";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { getSolanaExplorerClusterParam } from "../../contexts/connection";
import { Identicon } from "../Identicon";
import Countdown from "react-countdown";

const { TabPane } = Tabs;

export const MoneyStreamDetails = (props: {
  stream?: Stream | StreamInfo | undefined;
  hideDetailsHandler?: any;
  infoData?: any;
  isStreamIncoming?: boolean;
  isStreamOutgoing?: boolean;
  buttons?: any;
}) => {
  const { stream, hideDetailsHandler, infoData, isStreamIncoming, isStreamOutgoing, buttons } = props;
  const {
    theme,
    splTokenList,
    selectedToken,
    streamActivity,
    hasMoreStreamActivity,
    loadingStreamActivity,
    getTokenByMintAddress,
    getStreamActivity,
  } = useContext(AppStateContext);
  const { t } = useTranslation('common');
  const [searchParams, setSearchParams] = useSearchParams();
  const { publicKey } = useWallet();

  const getQueryTabOption = useCallback(() => {

    let tabOptionInQuery: string | null = null;
    if (searchParams) {
      tabOptionInQuery = searchParams.get('v');
      if (tabOptionInQuery) {
        return tabOptionInQuery;
      }
    }
    return undefined;
  }, [searchParams]);

  const navigateToTab = useCallback((tab: string) => {
    setSearchParams({v: tab as string});
  }, [setSearchParams]);

  const isNewStream = useCallback(() => {
    if (stream) {
      return stream.version >= 2 ? true : false;
    }

    return false;
  }, [stream]);

  const getStreamTitle = (item: Stream | StreamInfo): string => {
    let title = '';
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;

      if (v1.version < 2) {
        if (v1.streamName) {
          return `${v1.streamName}`;
        }
        
        if (v1.isUpdatePending) {
          title = `${t('streams.stream-list.title-pending-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else if (v1.state === STREAM_STATE.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v1.treasurerAddress}`)})`;
        }
      } else {
        if (v2.name) {
          return `${v2.name}`;
        }

        if (v2.status === STREAM_STATUS.Schedule) {
          title = `${t('streams.stream-list.title-scheduled-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else if (v2.status === STREAM_STATUS.Paused) {
          title = `${t('streams.stream-list.title-paused-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        } else {
          title = `${t('streams.stream-list.title-receiving-from')} (${shortenAddress(`${v2.treasurer}`)})`;
        }
      }
    }

    return title;
  }

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';
    if (item) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    let value = '';

    if (item && item.rateAmount === 0 && item.allocationAssigned > 0) {
      let token = item.associatedToken ? getTokenByMintAddress(item.associatedToken as string) : undefined;

      if (token && token.address === WRAPPED_SOL_MINT_ADDRESS) {
        token = Object.assign({}, token, {
          symbol: 'SOL'
        }) as TokenInfo;
      }

      if (item.version < 2) {
        value += getFormattedNumberToLocale(formatAmount(item.rateAmount, 2));
      } else {
        value += getFormattedNumberToLocale(formatAmount(toUiAmount(new BN(item.rateAmount), token?.decimals || 6), 2));
      }
      value += ' ';
      value += token ? token.symbol : `[${shortenAddress(item.associatedToken as string)}]`;
    }
    return value;
  }, [getTokenByMintAddress]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item) {
      let rateAmount = item.rateAmount > 0 ? getRateAmountDisplay(item) : getDepositAmountDisplay(item);
      if (item.rateAmount > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;

  }, [getRateAmountDisplay, getDepositAmountDisplay, t]);

  const getStreamStatus = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATE.Paused:
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return t('streams.status.status-scheduled');
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return t('streams.status.status-paused');
            }
            return t('streams.status.status-stopped');
          default:
            return t('streams.status.status-running');
        }
      }
    }
  }, [t]);

  const getStreamResume = useCallback((item: Stream | StreamInfo) => {
    if (item) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        switch (v1.state) {
          case STREAM_STATE.Schedule:
            return t('streams.status.scheduled', {date: getShortDate(v1.startUtc as string)});
          case STREAM_STATE.Paused:
            return t('streams.status.stopped');
          default:
            return t('streams.status.streaming');
        }
      } else {
        switch (v2.status) {
          case STREAM_STATUS.Schedule:
            return `starts on ${getShortDate(v2.startUtc as string)}`;
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return `paused on ${getShortDate(v2.startUtc as string)}`;
            }
            return `out of funds on ${getShortDate(v2.startUtc as string)}`;
          default:
            return `streaming since ${getShortDate(v2.startUtc as string)}`;
        }
      }
    }
  }, [t]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      if (v1.version < 2) {
        return v1.beneficiaryAddress === publicKey.toBase58() ? true : false;
      } else {
        return v2.beneficiary === publicKey.toBase58() ? true : false;
      }
    }
    return false;
  }, [publicKey]);

  const isStartDateFuture = useCallback((date: string): boolean => {
    const now = new Date().toUTCString();
    const nowUtc = new Date(now);
    const comparedDate = new Date(date);
    if (comparedDate > nowUtc) {
      return true;
    }
    return false;
  }, []);

  const getActivityIcon = (item: StreamActivity) => {
    if (isInboundStream(stream as StreamInfo)) {
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

  const getActivityAmount = (item: StreamActivity, streamVersion: number): number => {
    const token = getTokenByMintAddress(item.mint as string);
    if (streamVersion < 2) {
      return item.amount;
    } else {
      return toUiAmount(new BN(item.amount), token?.decimals || 6);
    }
  }

  // Get stream activity
  useEffect(() => {
    if (!stream || !searchParams || !streamActivity) { return; }

    if (searchParams.get('v') === "activity") {
      getStreamActivity(stream.id as string, stream.version, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, streamActivity]);


  ///////////////
  // Rendering //
  ///////////////

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  }

  const renderActivities = (streamVersion: number) => {
    return (
      <>
        {!loadingStreamActivity ? (
          streamActivity !== undefined && streamActivity.length > 0 ? (
            streamActivity.map((item, index) => {

              const img = getActivityIcon(item);
              const title = getActivityAction(item);
              const subtitle = <CopyExtLinkGroup
                content={item.signature}
                number={8}
                externalLink={false}
              />

              const amount = getAmountWithSymbol(
                getActivityAmount(item, streamVersion),
                item.mint,
                false,
                splTokenList
              );

              const resume = getShortDate(item.utcDate as string, true);

              return (
                <a
                  key={index}
                  target="_blank" 
                  rel="noopener noreferrer"
                  href={`${SOLANA_EXPLORER_URI_INSPECT_TRANSACTION}${item.signature}${getSolanaExplorerClusterParam()}`} 
                  className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
                >
                  <ResumeItem
                    id={`${title} + ${index}`}
                    img={img}
                    title={title}
                    subtitle={subtitle}
                    amount={amount}
                    resume={resume}
                    hasRightIcon={true}
                    rightIcon={<IconExternalLink className="mean-svg-icons external-icon" />}
                    isLink={true}
                  />
                </a>
            )})
          ) : (
            <span className="pl-1">This stream has no activity</span>
          )
        ) : (
          <span className="pl-1">Loading activity stream ...</span>
        )}
        {(streamActivity && streamActivity.length >= 5 && hasMoreStreamActivity) && (
          <div className="mt-1 text-center">
            <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                role="link"
                onClick={() => {
                if (stream) {
                  getStreamActivity(stream.id as string, stream.version);
                }
              }}>
              {t('general.cta-load-more')}
            </span>
          </div>
        )}
      </>
    );
  }

  const renderReceivingFrom = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <CopyExtLinkGroup
        content={isNewStream() ? v2.treasurer as string : v1.treasurerAddress as string}
        number={8}
        externalLink={true}
      />
    )
  }

  const renderSendingTo = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <CopyExtLinkGroup
        content={isNewStream() ? v2.beneficiary as string : v1.beneficiaryAddress as string}
        number={8}
        externalLink={true}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNewStream() ?
              toUiAmount(new BN(v2.rateAmount), token?.decimals || 6) : v1.rateAmount, 
              stream.associatedToken as string
            )}  ${getIntervalFromSeconds(stream?.rateIntervalInSeconds as number, true, t)}`
          : '--'
        }
      </>
    )
  }

  const renderReservedAllocation = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNewStream() ?
            toUiAmount(new BN(v2.remainingAllocationAmount), token?.decimals || 6) : (v1.allocationAssigned || v1.allocationLeft), 
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNewStream() ?
            toUiAmount(new BN(v2.fundsLeftInStream), token?.decimals || 6) : v1.escrowUnvestedAmount, 
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  const renderFundsSendToRecipient = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;
    const token = getTokenByMintAddress(stream.associatedToken as string);

    return (
      <>
        {stream
          ? `${getTokenAmountAndSymbolByTokenAddress(isNewStream() ?
            toUiAmount(new BN(v2.fundsSentToBeneficiary), token?.decimals || 6) : (v1.allocationAssigned - v1.allocationLeft + v1.escrowVestedAmount), 
              stream.associatedToken as string
            )}`
          : '--'
        }
      </>
    )
  }

  // Random component
  const Completionist = () => <span>--</span>;

  // Renderer callback with condition
  const renderer = ({ years, days, hours, minutes, seconds, completed }: any) => {
    if (completed) {
      // Render a completed state
      return <Completionist />;
    } else {
      // Render a countdown
      const showYears = years > 0 ? (years > 1 ? `${years} years` : `${years} year`) : "";
      const showDays = days > 0 ? (days > 1 ? `${days} days` : `${days} day`) : "";
      const showHours = hours > 0 ? (hours > 1 ? `${hours} hours` : `${hours} hour`) : "";
      const showMinutes = minutes > 0 ? (minutes > 1 ? `${minutes} minutes` : `${minutes} minute`) : "";
      const showSeconds = seconds > 0 ? (seconds > 1 ? `${seconds} seconds` : `${seconds} second`) : "";

      return <span>{`${showYears} ${showDays} ${showHours} ${showMinutes} ${showSeconds}`}</span>;
    }
  };

  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;

  // Tab details
  const detailsData = [
    {
      label: stream ? isStartDateFuture(stream.startUtc as string) ? "Starting on:" : "Started on:" : "--",
      value: stream ? getReadableDate(stream.startUtc as string, true) : "--"
    },
    {
      label: isStreamIncoming && "Receiving from:",
      value: isStreamIncoming && (stream ? renderReceivingFrom() : "--")
    },
    {
      label: isStreamOutgoing && "Sending to:",
      value: isStreamOutgoing && (stream ? renderSendingTo() : "--")
    },
    {
      label: "Payment rate:",
      value: renderPaymentRate() ? renderPaymentRate() : "--"
    },
    {
      label: "Reserved allocation:",
      value: renderReservedAllocation() ? renderReservedAllocation() : "--"
    },
    {
      label: isStreamIncoming && "Funds left in account:",
      value: isStreamIncoming && (stream ? renderFundsLeftInAccount() : "--")
    },
    {
      label: isStreamOutgoing && "Funds sent to recipient:",
      value: isStreamOutgoing && (stream ? renderFundsSendToRecipient() : "--")
    },
    {
      label: (isStreamOutgoing && stream && getStreamStatus(stream) === "Running") && "Funds will run out in:",
      value: (isStreamOutgoing && stream && getStreamStatus(stream) === "Running") && <Countdown className="align-middle" date={isNewStream() ? v2.estimatedDepletionDate as string : v1.escrowEstimatedDepletionUtc as string} renderer={renderer} />
    },
    {
      label: stream && getStreamStatus(stream) === "Stopped" && "Funds ran out on:",
      value: stream && getStreamStatus(stream) === "Stopped" && getRelativeDate(isNewStream() ? v2.estimatedDepletionDate as string : v1.escrowEstimatedDepletionUtc as string)
    },
  ];

  // Render details
  const renderDetails = (
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

  // Tabs
  const tabs = [
    {
      id: "details",
      name: "Details",
      render: renderDetails
    },
    {
      id: "activity",
      name: "Activity",
      render: stream && renderActivities(stream.version)
    }
  ];

  const renderTabset = () => {
    const option = getQueryTabOption() || 'details'
    return (
      <Tabs activeKey={option} onChange={navigateToTab} className="neutral">
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

  const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_COIN_IMAGE;
    event.currentTarget.className = "error";
  };

  let img;

  if (stream) {
    const token = stream.associatedToken ? getTokenByMintAddress(stream.associatedToken as string) : undefined;

    if (stream.associatedToken) {
      if (token) {
        img = <img alt={`${token.name}`} width={30} height={30} src={token.logoURI} onError={imageOnErrorHandler} className="token-img" />
      } else {
        img = <Identicon address={stream.associatedToken} style={{ width: "30", display: "inline-flex" }} className="token-img" />
      }
    } else {
      img = <Identicon address={stream.id} style={{ width: "30", display: "inline-flex" }} className="token-img" />
    }
  }

  const title = stream ? getStreamTitle(stream) : `Unknown ${isStreamIncoming ? "incoming" : "outgoing"} stream`;
  const subtitle = stream ? getStreamSubtitle(stream) : "--";
  const status = stream ? getStreamStatus(stream) : "--";
  const resume = stream ? getStreamResume(stream) : "--";

  return (
    <>
      <div className="stream-fields-container">
        {/* Background animation */}
        {(stream && getStreamStatus(stream) === "Running") ? (
          <div className="stream-background">
            {isInboundStream(stream) ? (
              <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
            ) : (
              <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
            )}
          </div>
          ) : null
        }
        
        <Row gutter={[8, 8]} className="safe-details-resume">
          <div onClick={hideDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        {stream && (
          <ResumeItem
            img={img}
            title={title}
            status={status}
            subtitle={subtitle}
            resume={resume}
            isDetailsPanel={true}
            isLink={false}
            isStream={true}
          />
        )}

        {infoData && (
          <RightInfoDetails
            infoData={infoData}
          /> 
        )}

        {buttons}

        {tabs && renderTabset()}

        {/* {tabs && (
          <TabsMean
            tabs={tabs}
            defaultTab="details"
          />
        )} */}
      </div>
    </>
  )
}