import { useCallback, useContext, useEffect, useState } from "react";
import { Divider, Row, Col, Button } from "antd";
import { SearchOutlined, EllipsisOutlined } from "@ant-design/icons";
import { IconPause, IconDownload, IconDocument, IconUpload, IconBank, IconClock, IconShare } from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";
import { formatAmount, getTokenAmountAndSymbolByTokenAddress, getTokenDecimals, isValidNumber, shortenAddress } from "../../../utils/utils";
import { getTokenByMintAddress } from "../../../utils/tokens";
import { convertLocalDateToUTCIgnoringTimezone, getIntervalFromSeconds } from "../../../utils/ui";
import { SOLANA_EXPLORER_URI } from "../../../constants";
import { ContractSelectorModal } from '../../../components/ContractSelectorModal';
import { OpenStreamModal } from '../../../components/OpenStreamModal';
import { WithdrawModal } from '../../../components/WithdrawModal';
import _ from "lodash";

export const Streams = () => {
  const { connected, publicKey } = useWallet();
  const {
    streamList,
    streamDetail,
    setCurrentScreen,
    setStreamDetail,
    setSelectedStream,
    openStreamById
  } = useContext(AppStateContext);

  useEffect(() => {
    if (!connected) {
      setCurrentScreen("contract");
    } else {
      if (streamList && streamList.length === 0) {
        setCurrentScreen("contract");
      }
    }
  });

  useEffect(() => {
    let updateDateTimer: any;

    const updateData = () => {
      if (streamDetail) {
        const clonedDetail = _.cloneDeep(streamDetail);

        const tokenDecimals = 10 ** getTokenDecimals(clonedDetail.associatedToken as string);
        let startDateUtc = new Date(clonedDetail.startUtc as string);
        let escrowVestedAmount = 0;
        let today = new Date();
        let utcNow = convertLocalDateToUTCIgnoringTimezone(today);
        const rate = clonedDetail.rateAmount / clonedDetail.rateIntervalInSeconds;
        const elapsedTime = (utcNow.getTime() - startDateUtc.getTime()) / 1000;

        if (utcNow.getTime() >= startDateUtc.getTime()) {
            escrowVestedAmount = rate * elapsedTime * tokenDecimals;

            if (escrowVestedAmount >= clonedDetail.totalDeposits) {
                escrowVestedAmount = clonedDetail.totalDeposits;
            }
        }

        clonedDetail.escrowVestedAmount = Math.fround(escrowVestedAmount);
        clonedDetail.escrowUnvestedAmount = Math.fround(clonedDetail.totalDeposits - clonedDetail.totalWithdrawals - escrowVestedAmount);
        setStreamDetail(clonedDetail);
      }
    }

    // Install the timer
    updateDateTimer = window.setInterval(() => {
      updateData();
    }, 1000);

    // Return callback to run on unmount.
    return () => {
      if (updateDateTimer) {
        window.clearInterval(updateDateTimer);
      }
    };
  }, [streamDetail, setStreamDetail]);

  // Contract switcher modal
  const [isContractSelectorModalVisible, setIsContractSelectorModalVisibility] = useState(false);
  const showContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(true), []);
  const closeContractSelectorModal = useCallback(() => setIsContractSelectorModalVisibility(false), []);
  const onAcceptContractSelector = () => {
    setCurrentScreen("contract");
    closeContractSelectorModal();
  };

  // Open stream modal
  const [isOpenStreamModalVisible, setIsOpenStreamModalVisibility] = useState(false);
  const showOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(true), []);
  const closeOpenStreamModal = useCallback(() => setIsOpenStreamModalVisibility(false), []);
  const onAcceptOpenStream = (e: any) => {
    // Do some shit and close the modal
    console.log('onAcceptOpenStream:', e);
    openStreamById(e);
    closeOpenStreamModal();
  };

  // Open stream modal
  const [isWithdrawModalVisible, setIsWithdrawModalVisibility] = useState(false);
  const showWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(true), []);
  const closeWithdrawModal = useCallback(() => setIsWithdrawModalVisibility(false), []);
  const onAcceptWithdraw = (e: any) => {
    // Do some shit and close the modal
    console.log('onAcceptWithdraw:', e);
    closeWithdrawModal();
  };

  const isInboundStream = (item: StreamInfo): boolean => {
    return item.beneficiaryAddress === publicKey?.toBase58();
  }

  const getAmountWithSymbol = (amount: any, address: string, onlyValue = false) => {
    return getTokenAmountAndSymbolByTokenAddress(amount, address, onlyValue);
  }

  const getStreamIcon = (item: StreamInfo) => {
    const isInbound = isInboundStream(item);

    if (isInbound) {
      if (item.isUpdatePending) {
        return (
          <IconDocument className="mean-svg-icons pending" />
        );
      } else if (!item.isStreaming) {
        return (
          <IconPause className="mean-svg-icons paused" />
        );
      } else {
        return (
          <IconDownload className="mean-svg-icons incoming" />
        );
      }
    } else {
      if (item.isUpdatePending) {
        return (
          <IconDocument className="mean-svg-icons pending" />
        );
      } else if (!item.isStreaming) {
        return (
          <IconPause className="mean-svg-icons paused" />
        );
      } else {
        return (
          <IconUpload className="mean-svg-icons outgoing" />
        );
      }
    }
  }

  const getReadableDate = (date: string): string => {
    if (!date) { return ''; }
    const converted = Date.parse(date);
    const localDate = new Date(converted);
    return localDate.toUTCString();
  }

  const getEscrowEstimatedDepletionUtcLabel = (date: Date): string => {
    const today = new Date();
    const miniDate = streamDetail && streamDetail.escrowEstimatedDepletionUtc
      ? getReadableDate(streamDetail.escrowEstimatedDepletionUtc.toString())
      : '';

    if (date > today) {
      return '(will run out today)';
    } else if (date < today) {
      return '';
    } else {
      return `(will run out by ${miniDate})`;
    }
  }

  const getTransactionTitle = (item: StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);
    if (isInbound) {
      if (item.isUpdatePending) {
        title = `Pending execution from (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `Paused stream from (${shortenAddress(`${item.treasurerAddress}`)})`;
      } else {
        title = `Receiving from (${shortenAddress(`${item.treasurerAddress}`)})`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `Pending execution to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `Paused stream to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      } else {
        title = `Sending to (${shortenAddress(`${item.beneficiaryAddress}`)})`;
      }
    }
    return title;
  }

  const getTransactionSubTitle = (item: StreamInfo): string => {
    let title = '';
    const isInbound = isInboundStream(item);
    if (isInbound) {
      if (item.isUpdatePending) {
        title = `This contract is pending your approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        title = `Receiving money since ${getReadableDate(item.startUtc as string)}`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `This contract is pending beneficiary approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        title = `Sending money since ${getReadableDate(item.startUtc as string)}`;
      }
    }
    return title;
  }

  const getEscrowTokenSymbol = (addr: string): string => {
    const escrowToken = getTokenByMintAddress(addr as string);
    return escrowToken ? escrowToken.symbol : '';
  }

  const renderInboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconDownload className="mean-svg-icons incoming" />
    </div>
    <div className="stream-details-data-wrapper">

      {/* Sender */}
      <Row className="mb-3">
        <Col span={12}>
          <div className="info-label">Sender</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              {streamDetail && (
                <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${streamDetail.treasurerAddress}`} target="_blank" rel="noopener noreferrer">
                  {shortenAddress(`${streamDetail.treasurerAddress}`)}
                </a>
              )}
            </span>
          </div>
        </Col>
        <Col span={12}>
          <div className="info-label">Payment Rate</div>
          <div className="transaction-detail-row">
            <span className="info-data">
              {streamDetail && streamDetail.rateAmount && isValidNumber(streamDetail.rateAmount.toString())
                ? formatAmount(streamDetail.rateAmount as number, 2)
                : '--'}
              &nbsp;
              {streamDetail && streamDetail.beneficiaryAddress
                ? getEscrowTokenSymbol(streamDetail.beneficiaryAddress as string)
                : ''}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
        </Col>
      </Row>

      {/* Started date */}
      <div className="mb-3">
        <div className="info-label">Started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconClock className="mean-svg-icons" />
          </span>
          <span className="info-data">
            {getReadableDate(streamDetail?.startUtc as string)}
          </span>
        </div>
      </div>

      {/* Funds left (Total Unvested) */}
      <div className="mb-3">
        <div className="info-label text-truncate">Funds left in account {streamDetail
          ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
          : ''}
        </div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconBank className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.escrowUnvestedAmount, streamDetail.associatedToken as string)
              : '--'}
              {/* &nbsp;
              {streamDetail && isValidNumber(streamDetail.escrowUnvestedAmount.toString())
              ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
              : ''} */}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Amount withdrawn */}
      <div className="mb-3">
        <div className="info-label">Total amount you have withdrawn since stream started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconDownload className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.totalWithdrawals, streamDetail.associatedToken as string)
              : '--'}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Funds available to withdraw now (Total Vested) */}
      <div className="mb-3">
        <div className="info-label">Funds available to withdraw now</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconUpload className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data large">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
              : '--'}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Withdraw button */}
      <div className="mt-4 mb-3 withdraw-container">
        <Button
          block
          className="withdraw-cta"
          type="text"
          shape="round"
          size="small"
          disabled={!streamDetail || !streamDetail.escrowVestedAmount}
          onClick={showWithdrawModal} >
          Withdraw funds
        </Button>
        <Button
          shape="round"
          type="text"
          size="small"
          className="ant-btn-shaded"
          onClick={() => {}}
          icon={<EllipsisOutlined />}>
        </Button>
      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      <p>No activity so far.</p>

    </div>
  </>
  );

  const renderOutboundStream = (
    <>
    <div className="stream-type-indicator">
      <IconUpload className="mean-svg-icons outgoing" />
    </div>
    <div className="stream-details-data-wrapper">
      {/* Beneficiary */}
      <Row className="mb-3">
        <Col span={12}>
          <div className="info-label">Recipient</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${streamDetail?.beneficiaryAddress}`} target="_blank" rel="noopener noreferrer">
                {shortenAddress(`${streamDetail?.beneficiaryAddress}`)}
              </a>
            </span>
          </div>
        </Col>
        <Col span={12}>
          <div className="info-label">Payment Rate</div>
          <div className="transaction-detail-row">
            <span className="info-data">
              {streamDetail && streamDetail.rateAmount && isValidNumber(streamDetail.rateAmount.toString())
                ? formatAmount(streamDetail.rateAmount as number, 2)
                : '--'}
              &nbsp;
              {streamDetail && streamDetail.beneficiaryAddress
                ? getEscrowTokenSymbol(streamDetail.beneficiaryAddress as string)
                : '0'}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
        </Col>
      </Row>

      {/* Started date */}
      <div className="mb-3">
        <div className="info-label">Started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconClock className="mean-svg-icons" />
          </span>
          <span className="info-data">
            {getReadableDate(streamDetail?.startUtc as string)}
          </span>
        </div>
      </div>

      {/* Total deposit */}
      <div className="mb-3">
        <div className="info-label">Total amount you have deposited since stream started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconDownload className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.totalDeposits, streamDetail.associatedToken as string)
              : '--'}
            </span>
            ) : (
              <span className="info-data">&nbsp;</span>
            )}
        </div>
      </div>

      {/* Funds sent (Total Vested) */}
      <div className="mb-3">
        <div className="info-label">Funds sent to recepient</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconUpload className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.escrowVestedAmount, streamDetail.associatedToken as string)
              : '--'}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Funds left (Total Unvested) */}
      <div className="mb-3">
        <div className="info-label text-truncate">{streamDetail && !streamDetail?.escrowUnvestedAmount
          ? `Funds left in account`
          : `Funds left in account (will run out by ${streamDetail && streamDetail.escrowEstimatedDepletionUtc
            ? getReadableDate(streamDetail.escrowEstimatedDepletionUtc.toString())  // TODO: OJO
            : ''})`}
        </div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconBank className="mean-svg-icons" />
          </span>
          {streamDetail ? (
            <span className="info-data large">
            {streamDetail
              ? getAmountWithSymbol(streamDetail.escrowUnvestedAmount, streamDetail.associatedToken as string)
              : '--'}
            </span>
          ) : (
            <span className="info-data">&nbsp;</span>
          )}
        </div>
      </div>

      {/* Top up (add funds) */}
      <div className="mt-4 mb-3 withdraw-container">
        <Button
          block
          className="withdraw-cta"
          type="text"
          shape="round"
          size="small"
          onClick={() => {}} >
          Top up (add funds)
        </Button>
        <Button
          shape="round"
          type="text"
          size="small"
          className="ant-btn-shaded"
          onClick={() => {}}
          icon={<EllipsisOutlined />}>
        </Button>
      </div>

      <Divider className="activity-divider" plain></Divider>
      <div className="activity-title">Activity</div>
      <p>No activity so far.</p>

    </div>
  </>
  );

  return (
    <div className="streams-layout">
      {/* Left / top panel*/}
      <div className="streams-container">
        <div className="streams-heading">My Money Streams</div>
        <div className="inner-container">
          {/* item block */}
          <div className="item-block vertical-scroll">
            {streamList && streamList.length ? (
              streamList.map((item, index) => {
                const onStreamClick = () => {
                  console.log('selected stream:', item);
                  setSelectedStream(item);
                };
                return (
                  <div key={`${index + 50}`} onClick={onStreamClick}
                    className={`transaction-list-row ${streamDetail && streamDetail.id === item.id ? 'selected' : ''}`}>
                    <div className="icon-cell">
                      {getStreamIcon(item)}
                    </div>
                    <div className="description-cell">
                      <div className="title text-truncate">{item.memo || getTransactionTitle(item)}</div>
                      <div className="subtitle text-truncate">{getTransactionSubTitle(item)}</div>
                    </div>
                    <div className="rate-cell">
                      <div className="rate-amount">
                        {item && item.rateAmount && isValidNumber(item.rateAmount.toString()) ? formatAmount(item.rateAmount, 2) : '--'}
                        &nbsp;
                        {item && item.associatedToken ? getEscrowTokenSymbol(item.associatedToken as string) : ''}
                      </div>
                      <div className="interval">{getIntervalFromSeconds(item.rateIntervalInSeconds)}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <>
              <p>No streams available</p>
              </>
            )}
          </div>
          {/* Bottom CTA */}
          <div className="bottom-ctas">
            <div className="create-stream">
              <Button
                block
                type="primary"
                shape="round"
                size="small"
                onClick={showContractSelectorModal}>
                Create new money stream
              </Button>
            </div>
            <div className="open-stream">
              <Button
                shape="round"
                type="text"
                size="small"
                className="ant-btn-shaded"
                onClick={showOpenStreamModal}
                icon={<SearchOutlined />}>
              </Button>
            </div>
          </div>
        </div>
      </div>
      {/* Right / down panel */}
      <div className="stream-details-container">
        <Divider className="streams-divider" plain></Divider>
        <div className="streams-heading">Stream details</div>
        <div className="inner-container">
          {connected && streamDetail ? (
            <>
            {isInboundStream(streamDetail) ? renderInboundStream : renderOutboundStream}
            </>
          ) : (
            <p>Please select a stream to view details</p>
          )}
        </div>
      </div>
      <ContractSelectorModal
        isVisible={isContractSelectorModalVisible}
        handleOk={onAcceptContractSelector}
        handleClose={closeContractSelectorModal}/>
      <OpenStreamModal
        isVisible={isOpenStreamModalVisible}
        handleOk={onAcceptOpenStream}
        handleClose={closeOpenStreamModal} />
      <WithdrawModal
        isVisible={isWithdrawModalVisible}
        handleOk={onAcceptWithdraw}
        handleClose={closeWithdrawModal} />
    </div>
  );
};
