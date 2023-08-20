import { StreamInfo } from '@mean-dao/money-streaming';
import { Stream } from '@mean-dao/payment-streaming';
import { BN } from '@project-serum/anchor';
import { TokenInfo } from 'models/SolanaTokenInfo';
import { toTokenAmountBn } from 'middleware/utils';
import getIsV2Stream from './getIsV2Stream';

const getRateAmountBn = (stream: Stream | StreamInfo, selectedToken: TokenInfo | undefined) => {
  if (stream && selectedToken) {
    const isV2Stream = getIsV2Stream(stream);
    const rateAmount = isV2Stream
      ? (stream.rateAmount as BN)
      : toTokenAmountBn(stream.rateAmount as number, selectedToken.decimals);
    return rateAmount;
  }

  return new BN(0);
};

export default getRateAmountBn;
