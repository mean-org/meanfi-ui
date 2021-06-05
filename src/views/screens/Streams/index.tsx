import { useContext } from "react";
import { Divider } from "antd";
import { IconCopy, IconDownload, IconExternalLink, IconUpload, IconWallet } from "../../../Icons";
import { AppStateContext } from "../../../contexts/appstate";
import { StreamInfo } from "../../../money-streaming/money-streaming";
import { useWallet } from "../../../contexts/wallet";

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
    return item.beneficiaryWithdrawalAddress === publicKey;
  }

  const getStreamIcon = (item: StreamInfo) => {
    const isInbound = isInboundStream(item);
    if (isInbound) {
      return (
        <IconDownload className="mean-svg-icons incoming" />
      );
    } else {
      return (
        <IconUpload className="mean-svg-icons outgoing"/>
      );
    }
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
                    <div className="title">Pending execution (from 0xaf65…B481)</div>
                    <div className="subtitle">This contract is pending your signature</div>
                  </div>
                  <div className="rate-cell">
                    <div className="rate-amount">14 SOL</div>
                    <div className="interval">per month</div>
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
