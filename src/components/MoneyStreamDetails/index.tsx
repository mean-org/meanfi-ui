import { Col, Row, Spin, Tabs } from "antd";
import { ResumeItem } from "../ResumeItem";
import { RightInfoDetails } from "../RightInfoDetails";
import { IconArrowBack, IconExternalLink } from "../../Icons";
import "./style.scss";
import { CopyExtLinkGroup } from "../CopyExtLinkGroup";
import { StreamActivity, StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { MSP, Stream, STREAM_STATUS, Treasury, TreasuryType } from "@mean-dao/msp";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { displayAmountWithSymbol, formatThousands, getAmountWithSymbol, shortenAddress, toTokenAmountBn, toUiAmount } from "../../middleware/utils";
import { consoleOut, friendlyDisplayDecimalPlaces, getIntervalFromSeconds, getReadableDate, getShortDate, relativeTimeFromDates, stringNumberFormat } from "../../middleware/ui";
import { AppStateContext } from "../../contexts/appstate";
import BN from "bn.js";
import { useTranslation } from "react-i18next";
import { FALLBACK_COIN_IMAGE, SOLANA_EXPLORER_URI_INSPECT_TRANSACTION } from "../../constants";
import { TokenInfo } from "@solana/spl-token-registry";
import { useSearchParams } from "react-router-dom";
import { useWallet } from "../../contexts/wallet";
import { ArrowDownOutlined, ArrowUpOutlined } from "@ant-design/icons";
import { getSolanaExplorerClusterParam, useConnectionConfig } from "../../contexts/connection";
import { Identicon } from "../Identicon";
import Countdown from "react-countdown";
import useWindowSize from "../../hooks/useWindowResize";
import { isMobile } from "react-device-detect";
import { getCategoryLabelByValue } from "../../models/enums";
import { PublicKey } from "@solana/web3.js";
import { getStreamTitle } from "../../middleware/streams";
import { MoneyStreaming } from "@mean-dao/money-streaming";

const { TabPane } = Tabs;

export const MoneyStreamDetails = (props: {
  accountAddress: string;
  stream?: Stream | StreamInfo | undefined;
  hideDetailsHandler?: any;
  infoData?: any;
  isStreamIncoming?: boolean;
  isStreamOutgoing?: boolean;
  buttons?: any;
  selectedToken?: TokenInfo | undefined;
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
  } = useContext(AppStateContext);
  const { endpoint } = useConnectionConfig();
  const { t } = useTranslation('common');
  const { width } = useWindowSize();
  const { publicKey } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isXsDevice, setIsXsDevice] = useState<boolean>(isMobile);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [treasuryDetails, setTreasuryDetails] = useState<Treasury | TreasuryInfo | undefined>(undefined);

  // Create and cache Money Streaming Program instance
  const ms = useMemo(() => new MoneyStreaming(
    endpoint,
    streamProgramAddress,
    "confirmed"
  ), [
    endpoint,
    streamProgramAddress
  ]);

  const msp = useMemo(() => {
    return new MSP(
      endpoint,
      streamV2ProgramAddress,
      "confirmed"
    );
  }, [
    endpoint,
    streamV2ProgramAddress
  ]);

  const tabOption = useMemo(() => {
    let tabOptionInQuery: string | null = null;
    if (searchParams) {
      tabOptionInQuery = searchParams.get('v');
      if (tabOptionInQuery) {
        return tabOptionInQuery;
      }
    }
    return tabOptionInQuery || "details";
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

  const getActivityList = useCallback((reload = false) => {
    if (stream) {
      const isNew = stream.version >= 2 ? true : false;
      const streamId = isNew
        ? (stream.id as PublicKey).toBase58()
        : stream.id as string
      if (reload) {
        getStreamActivity(streamId, stream.version, true);
      } else {
        getStreamActivity(streamId, stream.version, false);
      }
    }
  }, [getStreamActivity, stream]);

  const getRateAmountBn = useCallback((item: Stream | StreamInfo) => {
    if (item && selectedToken) {
      const rateAmount = item.version < 2
        ? toTokenAmountBn(item.rateAmount as number, selectedToken.decimals)
        : item.rateAmount as BN;
      return rateAmount;
    }
    return new BN(0);
  }, [selectedToken]);

  const getRateAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    if (!selectedToken) {
      return '';
    }

    let value = '';
    let associatedToken = '';

    if (item.version < 2) {
      associatedToken = (item as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (item as Stream).associatedToken.toBase58();
    }

    const rateAmount = getRateAmountBn(item);
    value += stringNumberFormat(
      toUiAmount(rateAmount, selectedToken.decimals),
      friendlyDisplayDecimalPlaces(rateAmount.toString()) || selectedToken.decimals
    )

    value += ' ';
    value += selectedToken ? selectedToken.symbol : `[${shortenAddress(associatedToken).toString()}]`;

    return value;
  }, [getRateAmountBn, selectedToken]);

  const getDepositAmountDisplay = useCallback((item: Stream | StreamInfo): string => {
    if (!selectedToken) {
      return '';
    }

    let value = '';
    let associatedToken = '';

    if (item.version < 2) {
      associatedToken = (item as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (item as Stream).associatedToken.toBase58();
    }

    if (item.rateIntervalInSeconds === 0) {
      if (item.version < 2) {
        const allocationAssigned = item.allocationAssigned as number;
        value += formatThousands(
          allocationAssigned,
          friendlyDisplayDecimalPlaces(allocationAssigned, selectedToken.decimals),
          2
        );
      } else {
        const allocationAssigned = new BN(item.allocationAssigned);
        value += stringNumberFormat(
          toUiAmount(allocationAssigned, selectedToken.decimals),
          friendlyDisplayDecimalPlaces(allocationAssigned.toString()) || selectedToken.decimals
        )
      }

      value += ' ';
      value += selectedToken ? selectedToken.symbol : `[${shortenAddress(associatedToken)}]`;
    }

    return value;
  }, [selectedToken]);

  const getStreamSubtitle = useCallback((item: Stream | StreamInfo) => {
    let subtitle = '';

    if (item && selectedToken) {
      const rate = +item.rateAmount.toString();
      let rateAmount = rate > 0
        ? getRateAmountDisplay(item)
        : getDepositAmountDisplay(item);

      if (rate > 0) {
        rateAmount += ' ' + getIntervalFromSeconds(item.rateIntervalInSeconds, true, t);
      }

      subtitle = rateAmount;
    }

    return subtitle;

  }, [getDepositAmountDisplay, getRateAmountDisplay, selectedToken, t]);

  const getStreamStatus = useCallback((item: Stream | StreamInfo): "scheduled" | "stopped" | "stopped-manually" | "running" => {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;
    if (v1.version < 2) {
      switch (v1.state) {
        case STREAM_STATE.Schedule:
          return "scheduled";
        case STREAM_STATE.Paused:
          return "stopped";
        default:
          return "running";
      }
    } else {
      switch (v2.status) {
        case STREAM_STATUS.Schedule:
          return "scheduled";
        case STREAM_STATUS.Paused:
          if (v2.isManuallyPaused) {
            return "stopped-manually";
          }
          return "stopped";
        default:
          return "running";
      }
    }
  }, []);

  const getStreamStatusLabel = useCallback((item: Stream | StreamInfo) => {
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
            return `starts on ${getShortDate(v2.startUtc)}`;
          case STREAM_STATUS.Paused:
            if (v2.isManuallyPaused) {
              return `paused on ${getShortDate(v2.startUtc)}`;
            }
            return `out of funds on ${getShortDate(v2.startUtc)}`;
          default:
            return `streaming since ${getShortDate(v2.startUtc)}`;
        }
      }
    }
  }, [t]);

  const isInboundStream = useCallback((item: Stream | StreamInfo): boolean => {
    if (item && publicKey && accountAddress) {
      const v1 = item as StreamInfo;
      const v2 = item as Stream;
      let beneficiary = '';
      if (v1.version < 2) {
        beneficiary = v1.beneficiaryAddress
          ? typeof v1.beneficiaryAddress === "string"
            ? (v1.beneficiaryAddress as string)
            : (v1.beneficiaryAddress as PublicKey).toBase58()
          : '';
      } else {
        beneficiary = v2.beneficiary
          ? typeof v2.beneficiary === "string"
            ? (v2.beneficiary as string)
            : (v2.beneficiary as PublicKey).toBase58()
          : '';
      }
      return beneficiary === accountAddress ? true : false
    }
    return false;
  }, [accountAddress, publicKey]);

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

  const getStreamIcon = useCallback((item: Stream | StreamInfo) => {

    const imageOnErrorHandler = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      event.currentTarget.src = FALLBACK_COIN_IMAGE;
      event.currentTarget.className = "error";
    };
    let associatedToken = '';

    if (item.version < 2) {
      associatedToken = (item as StreamInfo).associatedToken as string;
    } else {
      associatedToken = (item as Stream).associatedToken.toBase58();
    }

    if (selectedToken && selectedToken.logoURI) {
      return (
        <img
          alt={`${selectedToken.name}`}
          width={30}
          height={30}
          src={selectedToken.logoURI}
          onError={imageOnErrorHandler}
          className="token-img"/>
      );
    } else {
      return (
        <Identicon
          address={associatedToken}
          style={{ width: "30", display: "inline-flex" }}
          className="token-img" />
      );
    }
  }, [selectedToken]);

  useEffect(() => {
    if (!publicKey || !stream || !ms || !msp) { return; }

    const isNew = stream.version >= 2 ? true : false;
    const treasuryId = isNew ? (stream as Stream).treasury.toBase58() : (stream as StreamInfo).treasuryAddress as string;

    if (treasuryDetails && treasuryDetails.id as string === treasuryId) {
      return;
    }

    const mspInstance = isNew ? msp : ms;
    consoleOut('treasuryId:', treasuryId, 'blue');
    const treasueyPk = new PublicKey(treasuryId);

    mspInstance.getTreasury(treasueyPk)
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

  }, [ms, msp, publicKey, stream, treasuryDetails]);


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
    if (!stream) { return; }

    if (tabOption === "activity" && !activityLoaded) {
      setActivityLoaded(true);
      getActivityList(true);
    }
  }, [activityLoaded, getActivityList, stream, tabOption]);

  const getRelativeDate = (utcDate: string) => {
    const reference = new Date(utcDate);
    return relativeTimeFromDates(reference);
  }

  const isOtp = (): boolean => {
    if (stream) {
      const rateAmount = getRateAmountBn(stream);
      return rateAmount.isZero();
    }
    return false;
  }

  const isScheduledOtp = (): boolean => {
    if (stream) {
      const rateAmount = getRateAmountBn(stream);
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
  }


  ///////////////
  // Rendering //
  ///////////////

  const renderActivities = () => {
    return (
      <div className="stream-detail-component">
        <div className="stream-activity-list">
          <Spin spinning={loadingStreamActivity}>
            {(streamActivity && streamActivity.length > 0) ? (
              streamActivity.map((item, index) => {
                return (
                  <a key={`${index + 50}`} target="_blank" rel="noopener noreferrer"
                    className="transaction-list-row"
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
                        { selectedToken
                          ? displayAmountWithSymbol(
                              new BN(item.amount),
                              item.mint,
                              selectedToken.decimals,
                              splTokenList,
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
          {(streamActivity && streamActivity.length >= 5 && hasMoreStreamActivity) && (
            <div className="mt-1 text-center">
              <span className={loadingStreamActivity ? 'no-pointer' : 'secondary-link underline-on-hover'}
                role="link"
                onClick={() => getActivityList(false)}>
                {t('general.cta-load-more')}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderReceivingFrom = () => {
    if (!stream) { return null; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <CopyExtLinkGroup
        content={isNewStream() ? v2.treasurer.toBase58() : v1.treasurerAddress as string}
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
        content={isNewStream() ? v2.beneficiary.toBase58() : v1.beneficiaryAddress as string}
        number={8}
        externalLink={true}
      />
    )
  }

  const renderPaymentRate = () => {
    if (!stream || !selectedToken) { return '--'; }

    const rateAmount = getRateAmountBn(stream);
    let rate = !isOtp()
      ? getRateAmountDisplay(stream)
      : getDepositAmountDisplay(stream);

    if (rateAmount.gtn(0)) {
      rate += ' ' + getIntervalFromSeconds(stream.rateIntervalInSeconds, false, t);
    }

    return rate;
  }

  const renderReservedAllocation = () => {
    if (!stream || !selectedToken) { return '--'; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {
          isNewStream()
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
                selectedToken.decimals
              )
        }
      </>
    )
  }

  const renderFundsLeftInAccount = () => {
    if (!stream || !selectedToken) { return '--'; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {
          isNewStream()
            ? displayAmountWithSymbol(
                v2.fundsLeftInStream,
                selectedToken.address,
                selectedToken.decimals,
                splTokenList,
              )
            : getAmountWithSymbol(
                v1.escrowUnvestedAmount, 
                selectedToken.address,
                false,
                splTokenList,
                selectedToken.decimals
              )
        }
      </>
    )
  }

  const renderFundsSendToRecipient = () => {
    if (!stream || !selectedToken) { return '--'; }

    const v1 = stream as StreamInfo;
    const v2 = stream as Stream;

    return (
      <>
        {
          isNewStream()
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
                selectedToken.decimals
              )
        }
      </>
    )
  }

  const renderDepletionDate = () => {
    if (!stream) { return '--'; }
    const date = isNewStream()
      ? (stream as Stream).estimatedDepletionDate
      : (stream as StreamInfo).escrowEstimatedDepletionUtc as string;
    if (date){
      return getRelativeDate(date);
    } else {
      return getReadableDate(stream.startUtc as string, true);
    }
  }

  const renderBadges = () => {
    if (!treasuryDetails) { return; }

    const v1 = treasuryDetails as unknown as TreasuryInfo;
    const v2 = treasuryDetails as Treasury;
    const isNewTreasury = treasuryDetails && treasuryDetails.version >= 2 ? true : false;

    const type = isNewTreasury
      ? v2.treasuryType === TreasuryType.Open ? 'Open' : 'Locked'
      : v1.type === TreasuryType.Open ? 'Open' : 'Locked';

    const category = isNewTreasury
      && v2.category === 1 ? "Vesting" : "";

    const subCategory = isNewTreasury
      && v2.subCategory ? getCategoryLabelByValue(v2.subCategory) : '';

    let badges;

    type && (
      category ? (
        subCategory ? (
          badges = [category, subCategory, type]
        ) : (
          badges = [category, type]
        )
      ) : (
        badges = [type]
      )
    )

    return badges;
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
      // const showSeconds = seconds > 0 ? (seconds > 1 ? `${seconds} seconds` : `${seconds} second`) : "";

      return <span>{`${showYears} ${showDays} ${showHours} ${showMinutes}`}</span>;
    }
  };

  // Tab details
  const detailsData = [
    {
      label: stream ? (isStartDateFuture(stream.startUtc as string) ? "Starting on:" : "Started on:") : "--",
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
      label: stream && !isOtp()
        ? "Payment rate:"
        : "Deposit amount:",
      value: renderPaymentRate()
    },
    {
      label: stream && !isScheduledOtp() && "Reserved allocation:",
      value: stream && !isScheduledOtp() && renderReservedAllocation()
    },
    {
      label: isStreamIncoming && "Funds left in account:",
      value: isStreamIncoming && renderFundsLeftInAccount()
    },
    {
      label: isStreamOutgoing && "Funds sent to recipient:",
      value: isStreamOutgoing && (stream ? renderFundsSendToRecipient() : "--")
    },
    {
      label: (isStreamOutgoing && stream && getStreamStatus(stream) === "running") && "Funds will run out in:",
      value: (isStreamOutgoing && stream && getStreamStatus(stream) === "running") && <Countdown className="align-middle" date={
        isNewStream()
          ? (stream as Stream).estimatedDepletionDate
          : (stream as StreamInfo).escrowEstimatedDepletionUtc as string
        }
        renderer={renderer} />
    },
    {
      label: stream && getStreamStatus(stream) === "stopped" && !isOtp() && "Funds ran out on:",
      value: stream && getStreamStatus(stream) === "stopped" && !isOtp() && renderDepletionDate()
    },
    {
      label: "Stream id:",
      value: stream ? <CopyExtLinkGroup
        content={stream.id as string}
        number={8}
        externalLink={true}
        isTx={false}
        className="d-block text-truncate"
        classNameContainer="mb-1 mr-2"
      /> : "--"
    },
  ];

  // Render details
  const renderDetails = (
    <>
      {detailsData.map((detail: any, index: number) => (
        <Row gutter={[8, 8]} key={index} className="pl-1 details-item mr-0 ml-0">
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
      render: stream && renderActivities()
    }
  ];

  const renderTabset = () => {
    return (
      <Tabs activeKey={tabOption} onChange={navigateToTab} className="neutral">
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

  const title = stream ? getStreamTitle(stream, t) : `Unknown ${isStreamIncoming ? "incoming" : "outgoing"} stream`;
  const subtitle = stream ? getStreamSubtitle(stream) : "--";
  const resume = stream ? getStreamResume(stream) : "--";

  return (
    <>
      <div className="stream-fields-container">
        {/* Background animation */}
        {(stream && getStreamStatus(stream) === "running") ? (
          <div className="stream-background">
            {isInboundStream(stream) ? (
              <img className="inbound" src="/assets/incoming-crypto.svg" alt="" />
            ) : (
              <img className="inbound" src="/assets/outgoing-crypto.svg" alt="" />
            )}
          </div>
          ) : null
        }

        {!isXsDevice && (
          <Row gutter={[8, 8]} className="safe-details-resume mr-0 ml-0">
            <div onClick={hideDetailsHandler} className="back-button icon-button-container">
              <IconArrowBack className="mean-svg-icons" />
              <span className="ml-1">Back</span>
            </div>
          </Row>
        )}

        {stream && (
          <ResumeItem
            img={getStreamIcon(stream)}
            title={title}
            extraTitle={renderBadges()}
            status={getStreamStatusLabel(stream)}
            subtitle={subtitle}
            resume={resume}
            isDetailsPanel={true}
            isLink={false}
            isStream={true}
            classNameRightContent="header-stream-details-row resume-right-content"
          />
        )}

        {infoData && (
          <RightInfoDetails
            infoData={infoData}
            classNameInfoGroup="header-details-info-group"
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
  )
}