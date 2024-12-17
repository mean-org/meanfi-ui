import type { StreamInfo } from '@mean-dao/money-streaming';
import type { Stream } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { toTokenAmountBn } from 'src/middleware/utils';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';
import getIsV2Stream from './getIsV2Stream';

const getRateAmountBn = (stream: Stream | StreamInfo, selectedToken: TokenInfo | undefined) => {
  if (stream && selectedToken) {
    const isV2Stream = getIsV2Stream(stream);
    return isV2Stream
      ? (stream.rateAmount as BN)
      : toTokenAmountBn(stream.rateAmount as number, selectedToken.decimals);
  }

  return new BN(0);
};

export default getRateAmountBn;
