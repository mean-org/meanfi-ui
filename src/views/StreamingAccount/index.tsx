import { StreamInfo, STREAM_STATE, TreasuryInfo } from "@mean-dao/money-streaming/lib/types";
import { Stream, STREAM_STATUS, Treasury } from "@mean-dao/msp";
import { TokenInfo } from "@solana/spl-token-registry";
import { Button, Col, Dropdown, Menu, Row } from "antd";
import BN from "bn.js";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";
import { CopyExtLinkGroup } from "../../components/CopyExtLinkGroup";
import { ResumeItem } from "../../components/ResumeItem";
import { TabsMean } from "../../components/TabsMean";
import { WRAPPED_SOL_MINT_ADDRESS } from "../../constants";
import { AppStateContext } from "../../contexts/appstate";
import { IconArrowBack, IconArrowForward, IconEllipsisVertical } from "../../Icons";
import { getFormattedNumberToLocale, getIntervalFromSeconds, getShortDate, toUsCurrency } from "../../utils/ui";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, shortenAddress, toUiAmount } from "../../utils/utils";

export const StreamingAccountView = (props: {
  streamSelected: Stream | StreamInfo | undefined;
  streamingAccountSelected: Treasury | TreasuryInfo | undefined;
  streams: Array<Stream | StreamInfo> | undefined;
  onSendFromStreamingAccountDetails?: any;
  onSendFromOutgoingStreamInfo?: any;
}) => {
  const {
    getTokenByMintAddress,
  } = useContext(AppStateContext);
  
  const { streamSelected, streamingAccountSelected, streams, onSendFromStreamingAccountDetails, onSendFromOutgoingStreamInfo  } = props;

  const { t } = useTranslation('common');

  const hideDetailsHandler = () => {
    onSendFromStreamingAccountDetails();
  }

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

  // Dropdown (three dots button)
  const menu = (
    <Menu>
      <Menu.Item key="ms-00" onClick={() => {}}>
        <span className="menu-item-text">Close account</span>
      </Menu.Item>
      <Menu.Item key="ms-01" onClick={() => {}}>
        <span className="menu-item-text">Refresh account data</span>
      </Menu.Item>
      <Menu.Item key="ms-02" onClick={() => {}}>
        <span className="menu-item-text">SOL balance</span>
      </Menu.Item>
    </Menu>
  );

  const renderStreamingAccountStreams = (
    <>
      {(streams && streams.length > 0) ? (
        streams.map((stream, index) => {
          const onSelectStream = () => {
            // Sends outgoing stream value to the parent component "Accounts"
            onSendFromOutgoingStreamInfo(stream);
          };
  
          const title = stream ? getStreamTitle(stream) : "Unknown outgoing stream";
          const subtitle = getStreamSubtitle(stream);
          const status = getStreamStatus(stream);
          const resume = getStreamResume(stream);
  
          return (
            <div 
              key={index}
              onClick={onSelectStream}
              className={`d-flex w-100 align-items-center simplelink ${(index + 1) % 2 === 0 ? '' : 'background-gray'}`}
            >
              <ResumeItem
                id={index}
                title={title}
                subtitle={subtitle}
                resume={resume}
                status={status}
                hasRightIcon={true}
                rightIcon={<IconArrowForward className="mean-svg-icons" />}
                isLink={true}
                isStream={true}
              />
            </div>
          )
        })
      ) : (
        <span className="pl-1">This streaming account has no streams</span>
      )}
    </>
  );

  // Tabs
  const tabs = [
    {
      id: "streams",
      name: "Streams",
      render: renderStreamingAccountStreams
    },
    {
      id: "activity",
      name: "Activity",
      render: ""
    }
  ];

  const v1 = streamingAccountSelected as TreasuryInfo;
  const v2 = streamingAccountSelected as Treasury;

  const isNewTreasury = streamingAccountSelected && streamingAccountSelected.version >= 2 ? true : false;


  const streamAccountTitle = isNewTreasury ? v2.name : v1.label;

  const streamAccountSubtitle = <CopyExtLinkGroup
    content={isNewTreasury ? v2.id as string : v1.id as string}
    number={8}
    externalLink={true}
  />;

  const streamAccountContent = "Available streaming balance";

  const token = getTokenByMintAddress(isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string);

  const streamAccountResume = (v1.balance || v2.balance) ? getTokenAmountAndSymbolByTokenAddress(isNewTreasury 
    ? toUiAmount(new BN(v2.balance), token?.decimals || 6)
    : v1.balance, isNewTreasury ? v2.associatedToken as string : v1.associatedTokenAddress as string) : "$0.00";

  return (
    <>
      <div className="">
        <Row gutter={[8, 8]} className="safe-details-resume">
          <div onClick={hideDetailsHandler} className="back-button icon-button-container">
            <IconArrowBack className="mean-svg-icons" />
            <span className="ml-1">Back</span>
          </div>
        </Row>

        {streamingAccountSelected && (
          <ResumeItem
            title={streamAccountTitle}
            subtitle={streamAccountSubtitle}
            content={streamAccountContent}
            resume={streamAccountResume}
            isDetailsPanel={true}
            isLink={false}
            // isStream={true}
            isStreamingAccount={true}
          />
        )}

        <Row gutter={[8, 8]} className="safe-btns-container mb-1">
          <Col xs={20} sm={18} md={20} lg={18} className="btn-group">
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => {}}>
                <div className="btn-content">
                  Create stream
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => {}}>
                <div className="btn-content">
                  Add funds
                </div>
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              className="thin-stroke"
              onClick={() => {}}>
                <div className="btn-content">
                  Withdraw funds
                </div>
            </Button>
          </Col>

          <Col xs={4} sm={6} md={4} lg={6}>
            <Dropdown
              overlay={menu}
              placement="bottomRight"
              trigger={["click"]}>
              <span className="ellipsis-icon icon-button-container mr-1">
                <Button
                  type="default"
                  shape="circle"
                  size="middle"
                  icon={<IconEllipsisVertical className="mean-svg-icons"/>}
                  onClick={(e) => e.preventDefault()}
                />
              </span>
            </Dropdown>
          </Col>
        </Row>

        <TabsMean
          tabs={tabs}
          defaultTab="streams"
        />
      </div>
    </>
  )
}