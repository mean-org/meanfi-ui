import { useContext } from "react";
import { Divider } from "antd";
import { IconPause, IconDownload, IconDocument, IconUpload } from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";
import { formatAmount, shortenAddress } from "../../../utils/utils";
import moment from "moment-timezone";
import { getTokenByMintAddress } from "../../../utils/tokens";
import { getIntervalFromSeconds } from "../../../utils/ui";

export const Streams = () => {
  const { publicKey } = useWallet();
  const { streamList, selectedStream, setSelectedStream } = useContext(AppStateContext);
  /*
    Stream display title composition: Status + address

    'Sending to ' + address
    'Receiving from' + address
    'Paused stream to ' + address
    'Paused stream from ' + address
    'Pending execution to' + address
    'Pending execution from' + address

    For all outgoing streams use the treasurer address
    For all incoming streams use the beneficiary address
  */

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
    var myDatetimeFormat= "MMM d, hh:mm A z";
    return moment(date).format(myDatetimeFormat);
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

  const getEscrowTokenSymbol = (item: StreamInfo): string => {
    const escrowToken = getTokenByMintAddress(item.escrowTokenAddress as string);
    return escrowToken?.symbol || '';
  }

  return (
    <div className="streams-layout">
      {/* Left / top panel*/}
      <div className="streams-container">
        <div className="streams-heading">My Money Streams</div>
        <div className="inner-container">
          {/* item block */}
          {streamList && streamList.length ? (
            streamList.map((item, index) => {
              const onStreamClick = function () {
                console.log("stream selected:", item);
                setSelectedStream(item)
              };
              return (
                <div key={`${index + 50}`} onClick={onStreamClick}
                  className={`transaction-row ${selectedStream?.id === item.id ? 'selected' : ''}`}>
                  <div className="icon-cell">
                    {getStreamIcon(item)}
                  </div>
                  <div className="description-cell">
                    <div className="title">{item.memo || getTransactionTitle(item)}</div>
                    <div className="subtitle">{getTransactionSubTitle(item)}</div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">{`${item.rateAmount ? formatAmount(item.rateAmount, 2) : '--'} ${getEscrowTokenSymbol(item)}`}</div>
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
      </div>
      {/* Right / down panel */}
      <div className="stream-details-container">
        <Divider plain></Divider>
        <div className="streams-heading">Stream details</div>
        <div className="inner-container">
          Right view, details of the money stream
        </div>
      </div>
    </div>
  );
};
