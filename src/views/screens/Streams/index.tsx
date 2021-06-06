import { useContext } from "react";
import { Divider, Row, Col, Button } from "antd";
import { IconPause, IconDownload, IconDocument, IconUpload, IconBank, IconClock, IconShare } from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";
import { formatAmount, isValidNumber, shortenAddress } from "../../../utils/utils";
import { getTokenByMintAddress } from "../../../utils/tokens";
import { getIntervalFromSeconds } from "../../../utils/ui";
import { SOLANA_EXPLORER_URI, STREAM_LONG_DATE_FORMAT, STREAM_MINIMUM_DATE_FORMAT, STREAM_SHORT_DATE_FORMAT } from "../../../constants";
import moment from "moment-timezone";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export const Streams = () => {
  const { publicKey } = useWallet();
  const {
    streamList,
    selectedStream,
    streamDetail,
    setSelectedStream
  } = useContext(AppStateContext);

  const isInboundStream = (item: StreamInfo): boolean => {
    return item.beneficiaryWithdrawalAddress === publicKey?.toBase58();
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

  const getShortReadableDate = (date: Date): string => {
    if (!date) { return ''; }
    return moment(date).format(STREAM_SHORT_DATE_FORMAT);
  }

  const getReadableDate = (date: Date): string => {
    if (!date) { return ''; }
    return moment(date).format(STREAM_LONG_DATE_FORMAT);
  }

  const getMinimumDate = (date: Date): string => {
    if (!date) { return ''; }
    return moment(date).format(STREAM_MINIMUM_DATE_FORMAT);
  }

  const getEscrowEstimatedDepletionUtcLabel = (date: Date): string => {
    const today = new Date();
    const miniDate = streamDetail && streamDetail.escrowEstimatedDepletionUtc
      ? getMinimumDate(streamDetail.escrowEstimatedDepletionUtc)
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
        title = `Pending execution to (${shortenAddress(`${item.beneficiaryWithdrawalAddress}`)})`;
      } else if (!item.isStreaming) {
        title = `Paused stream to (${shortenAddress(`${item.beneficiaryWithdrawalAddress}`)})`;
      } else {
        title = `Sending to (${shortenAddress(`${item.beneficiaryWithdrawalAddress}`)})`;
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
        title = `Receiving money since ${getShortReadableDate(item.startUtc as Date)}`;
      }
    } else {
      if (item.isUpdatePending) {
        title = `This contract is pending beneficiary approval`;
      } else if (!item.isStreaming) {
        title = `This stream is paused due to the lack of funds`;
      } else {
        title = `Sending money since ${getShortReadableDate(item.startUtc as Date)}`;
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
      <Row className="mb-12px">
        <Col span={12}>
          <div className="info-label">Sender</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${(streamDetail?.treasurerAddress as PublicKey).toBase58()}`} target="_blank" rel="noopener noreferrer">
                {shortenAddress(`${(streamDetail?.treasurerAddress as PublicKey).toBase58()}`)}
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
              {streamDetail && streamDetail.beneficiaryWithdrawalAddress
                ? getEscrowTokenSymbol(streamDetail.beneficiaryWithdrawalAddress as string)
                : ''}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
        </Col>
      </Row>

      {/* Started date */}
      <div className="mb-12px">
        <div className="info-label">Started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconClock className="mean-svg-icons" />
          </span>
          <span className="info-data">
            {getReadableDate(streamDetail?.startUtc as Date)}
          </span>
        </div>
      </div>

      {/* Funds left (Total Unvested) */}
      <div className="mb-12px">
        <div className="info-label">Funds left in account</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconBank className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.escrowUnvestedAmount && isValidNumber(streamDetail.escrowUnvestedAmount.toString())
            ? formatAmount((streamDetail.escrowUnvestedAmount as number) / LAMPORTS_PER_SOL, 6)
            : '0'}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          &nbsp;
          {streamDetail && isValidNumber(streamDetail.escrowUnvestedAmount.toString())
          ? getEscrowEstimatedDepletionUtcLabel(streamDetail.escrowEstimatedDepletionUtc as Date)
          : ''}
          </span>
        </div>
      </div>

      {/* Total deposit */}
      <div className="mb-12px">
        <div className="info-label">Total amount you have deposited since stream started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconDownload className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.totalDeposits && isValidNumber(streamDetail.totalDeposits.toString())
            ? formatAmount((streamDetail.totalDeposits as number) / LAMPORTS_PER_SOL, 6, false)
            : ''}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          </span>
        </div>
      </div>
      {/* Funds sent (Total Vested) */}
      <div className="mb-12px">
        <div className="info-label">Funds sent to recepient</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconUpload className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.escrowVestedAmount && isValidNumber(streamDetail.escrowVestedAmount.toString())
            ? formatAmount((streamDetail.escrowVestedAmount as number) / LAMPORTS_PER_SOL, 6)
            : ''}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          </span>
        </div>
      </div>
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
      <Row className="mb-12px">
        <Col span={12}>
          <div className="info-label">Recipient</div>
          <div className="transaction-detail-row">
            <span className="info-icon">
              <IconShare className="mean-svg-icons" />
            </span>
            <span className="info-data">
              <a className="secondary-link" href={`${SOLANA_EXPLORER_URI}${streamDetail?.beneficiaryWithdrawalAddress}`} target="_blank" rel="noopener noreferrer">
                {shortenAddress(`${streamDetail?.beneficiaryWithdrawalAddress}`)}
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
              {streamDetail && streamDetail.beneficiaryWithdrawalAddress
                ? getEscrowTokenSymbol(streamDetail.beneficiaryWithdrawalAddress as string)
                : ''}
              {getIntervalFromSeconds(streamDetail?.rateIntervalInSeconds as number, true)}
            </span>
          </div>
        </Col>
      </Row>
      {/* Started date */}
      <div className="mb-12px">
        <div className="info-label">Started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconClock className="mean-svg-icons" />
          </span>
          <span className="info-data">
            {getReadableDate(streamDetail?.startUtc as Date)}
          </span>
        </div>
      </div>
      {/* Total deposit */}
      <div className="mb-12px">
        <div className="info-label">Total amount you have deposited since stream started</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconDownload className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.totalDeposits && isValidNumber(streamDetail.totalDeposits.toString())
            ? formatAmount((streamDetail.totalDeposits as number) / LAMPORTS_PER_SOL, 6, false)
            : ''}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          </span>
        </div>
      </div>
      {/* Funds sent (Total Vested) */}
      <div className="mb-12px">
        <div className="info-label">Funds sent to recepient</div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconUpload className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.escrowVestedAmount && isValidNumber(streamDetail.escrowVestedAmount.toString())
            ? formatAmount((streamDetail.escrowVestedAmount as number) / LAMPORTS_PER_SOL, 6)
            : ''}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          </span>
        </div>
      </div>
      {/* Funds left (Total Unvested) */}
      <div className="mb-12px">
        <div className="info-label">{streamDetail && !streamDetail?.escrowUnvestedAmount
          ? `Funds left in account`
          : `Funds left in account (will run out by ${streamDetail && streamDetail.escrowEstimatedDepletionUtc
            ? getMinimumDate(streamDetail.escrowEstimatedDepletionUtc)
            : ''})`}
        </div>
        <div className="transaction-detail-row">
          <span className="info-icon">
            <IconBank className="mean-svg-icons" />
          </span>
          <span className="info-data">
          {streamDetail?.escrowUnvestedAmount && isValidNumber(streamDetail.escrowUnvestedAmount.toString())
            ? formatAmount((streamDetail.escrowUnvestedAmount as number) / LAMPORTS_PER_SOL, 6)
            : '0'}
          &nbsp;
          {getEscrowTokenSymbol((streamDetail?.escrowTokenAddress as PublicKey).toBase58())}
          </span>
        </div>
      </div>
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
          <div className="item-block">
            {streamList && streamList.length ? (
              streamList.map((item, index) => {
                const onStreamClick = () => setSelectedStream(item);
                return (
                  <div key={`${index + 50}`} onClick={onStreamClick}
                    className={`transaction-row ${selectedStream?.id === item.id ? 'selected' : ''}`}>
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
                        {item && item.escrowTokenAddress ? getEscrowTokenSymbol(item.escrowTokenAddress as string) : ''}
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
          <Row className="bottom-cta">
            <Col span={12} offset={5}>
              <Button
                block
                type="primary"
                shape="round"
                size="small"
                onClick={() => {}}>
                Create new money stream
              </Button>
            </Col>
          </Row>
        </div>
      </div>
      {/* Right / down panel */}
      <div className="stream-details-container">
        <Divider plain></Divider>
        <div className="streams-heading">Stream details</div>
        <div className="inner-container">
          {selectedStream ? (
            <>
            {isInboundStream(selectedStream) ? renderInboundStream : renderOutboundStream}
            </>
          ) : (
            <p>Please select a stream to view details</p>
          )}
        </div>
      </div>
    </div>
  );
};
