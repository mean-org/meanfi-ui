import { STREAM_STATE, type StreamInfo } from '@mean-dao/money-streaming/lib/types';
import { STREAM_STATUS_CODE, type Stream } from '@mean-dao/payment-streaming';
import type { TFunction } from 'i18next';
import { getShortDate } from '../ui';

export const getStreamStatusResume = (item: Stream | StreamInfo, trans: TFunction) => {
  if (!item) {
    return '';
  }

  const v1 = item as StreamInfo;
  const v2 = item as Stream;
  if (item.version < 2) {
    switch (v1.state) {
      case STREAM_STATE.Schedule:
        return trans('streams.status.scheduled', {
          date: getShortDate(v1.startUtc as string),
        });
      case STREAM_STATE.Paused:
        return trans('streams.status.stopped');
      default:
        return trans('streams.status.streaming');
    }
  }

  switch (v2.statusCode) {
    case STREAM_STATUS_CODE.Scheduled:
      return `starts on ${getShortDate(v2.startUtc)}`;
    case STREAM_STATUS_CODE.Paused:
      if (v2.isManuallyPaused) {
        return '';
        // return `paused on ${getShortDate(v2.startUtc)}`;
      }
      return `out of funds on ${getShortDate(v2.estimatedDepletionDate)}`;
    default:
      return `streaming since ${getShortDate(v2.startUtc)}`;
  }
};
