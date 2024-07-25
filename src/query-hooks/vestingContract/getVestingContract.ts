import type { PaymentStreaming } from '@mean-dao/payment-streaming';
import { PublicKey } from '@solana/web3.js';

const getVestingContract = async ({
  vestingAccountId,
  tokenStreamingV2,
}: {
  vestingAccountId: string | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
}) => {
  if (!vestingAccountId) {
    throw new Error('Missing vesting account id');
  }

  if (!tokenStreamingV2) {
    throw new Error('Missing token streaming client');
  }

  const account = new PublicKey(vestingAccountId);

  return await tokenStreamingV2.getAccount(account);
};

export default getVestingContract;
