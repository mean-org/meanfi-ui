import { STREAM_STATE, type StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { STREAM_STATUS_CODE, type Stream } from '@mean-dao/payment-streaming';
import type { TFunction } from 'i18next';
import { shortenAddress } from '../utils';

export const getStreamTitle = (item: Stream | StreamInfo, trans: TFunction): string => {
  if (item) {
    const v1 = item as StreamInfo;
    const v2 = item as Stream;

    if (item.version < 2) {
      if (v1.streamName) {
        return `${v1.streamName}`;
      }
      if (v1.isUpdatePending) {
        return `${
          trans ? trans('streams.stream-list.title-pending-from') : 'Pending execution from'
        } (${shortenAddress(`${v1.treasurerAddress}`)})`;
      }
      if (v1.state === STREAM_STATE.Schedule) {
        return `${
          trans ? trans('streams.stream-list.title-scheduled-from') : 'Scheduled stream from'
        } (${shortenAddress(`${v1.treasurerAddress}`)})`;
      }
      if (v1.state === STREAM_STATE.Paused) {
        return `${trans ? trans('streams.stream-list.title-paused-from') : 'Paused stream from'} (${shortenAddress(
          `${v1.treasurerAddress}`,
        )})`;
      }

      return `${trans ? trans('streams.stream-list.title-receiving-from') : 'Receiving from'} (${shortenAddress(
        `${v1.treasurerAddress}`,
      )})`;
    }

    if (v2.name) {
      return `${v2.name}`;
    }

    if (v2.statusCode === STREAM_STATUS_CODE.Scheduled) {
      return `${
        trans ? trans('streams.stream-list.title-scheduled-from') : 'Scheduled stream from'
      } (${shortenAddress(`${v2.psAccountOwner}`)})`;
    }
    if (v2.statusCode === STREAM_STATUS_CODE.Paused) {
      return `${trans ? trans('streams.stream-list.title-paused-from') : 'Paused stream from'} (${shortenAddress(
        `${v2.psAccountOwner}`,
      )})`;
    }

    return `${trans ? trans('streams.stream-list.title-receiving-from') : 'Receiving from'} (${shortenAddress(
      `${v2.psAccountOwner}`,
    )})`;
  }

  return '';
};
