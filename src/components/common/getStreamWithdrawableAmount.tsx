import type { StreamInfo } from '@mean-dao/money-streaming';
import type { Stream } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';

const getStreamWithdrawableAmount = (stream: Stream | StreamInfo) => {
  const v1 = stream as StreamInfo;
  const v2 = stream as Stream;
  const isNew = stream.version >= 2;
  return isNew ? v2.withdrawableAmount : new BN(v1.escrowVestedAmount);
};

export default getStreamWithdrawableAmount;
