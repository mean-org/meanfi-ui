import { Stream, STREAM_STATUS } from "@mean-dao/msp";
import { StreamInfo, STREAM_STATE } from "@mean-dao/money-streaming/lib/types";
import { shortenAddress } from "./utils";
import { t } from "i18next";

// Stream title
export const getStreamTitle = (item: Stream | StreamInfo): string => {
  let title = '';
  if (item) {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (item.version < 2) {
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