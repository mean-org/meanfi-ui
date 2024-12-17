import type { StreamInfo } from '@mean-dao/money-streaming';
import type { Stream } from '@mean-dao/payment-streaming';
import isStartDateFuture from 'src/middleware/token-streaming-utils/isStartDateFuture';
import { getReadableDate } from 'src/middleware/ui';

const getStreamStartDate = (stream: Stream | StreamInfo | undefined) => {
  if (!stream) {
    return {
      label: '--',
      value: '--',
    };
  }

  return {
    label: isStartDateFuture(stream.startUtc as string) ? 'Starting on:' : 'Started on:',
    value: getReadableDate(stream.startUtc as string, true),
  };
};

export default getStreamStartDate;
