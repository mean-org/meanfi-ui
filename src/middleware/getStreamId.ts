import type { StreamInfo } from '@mean-dao/money-streaming';
import type { Stream } from '@mean-dao/payment-streaming';

export const getStreamId = (stream: Stream | StreamInfo | undefined) => {
  if (!stream) {
    return '';
  }
  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  return stream.version < 2 ? (v1.id as string) : v2.id.toBase58();
};
