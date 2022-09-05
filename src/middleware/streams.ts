import { Stream, STREAM_STATUS } from "@mean-dao/msp";
import { StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { shortenAddress } from "./utils";

// Stream title
export const getStreamTitle = (item: Stream | StreamInfo, trans?: any): string => {
  let title = '';
  if (item) {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (item.version < 2) {
      if (v1.streamName) {
        return `${v1.streamName}`;
      }
      
      if (v1.isUpdatePending) {
        title = `${trans ? trans('streams.stream-list.title-pending-from') : "Pending execution from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else if (v1.state === STREAM_STATE.Schedule) {
        title = `${trans ? trans('streams.stream-list.title-scheduled-from') : "Scheduled stream from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else if (v1.state === STREAM_STATE.Paused) {
        title = `${trans ? trans('streams.stream-list.title-paused-from') : "Paused stream from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      } else {
        title = `${trans ? trans('streams.stream-list.title-receiving-from') : "Receiving from"} (${shortenAddress(`${v1.treasurerAddress}`)})`;
      }
    } else {
      if (v2.name) {
        return `${v2.name}`;
      }

      if (v2.status === STREAM_STATUS.Schedule) {
        title = `${trans ? trans('streams.stream-list.title-scheduled-from') : "Scheduled stream from"} (${shortenAddress(`${v2.treasurer}`)})`;
      } else if (v2.status === STREAM_STATUS.Paused) {
        title = `${trans ? trans('streams.stream-list.title-paused-from') : "Paused stream from"} (${shortenAddress(`${v2.treasurer}`)})`;
      } else {
        title = `${trans ? trans('streams.stream-list.title-receiving-from') : "Receiving from"} (${shortenAddress(`${v2.treasurer}`)})`;
      }
    }
  }

  return title;
}