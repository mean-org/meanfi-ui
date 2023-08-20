import { StreamInfo } from '@mean-dao/money-streaming';
import { Stream } from '@mean-dao/payment-streaming';

const getIsV2Stream = (stream: Stream | StreamInfo | undefined) => {
  if (stream?.version) {
    return stream.version >= 2;
  }
  return false;
};

export default getIsV2Stream;
