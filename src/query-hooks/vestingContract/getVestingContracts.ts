import { Category, type PaymentStreaming } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';

const getVestingContracts = async ({
  tokenStreamingV2,
  srcAccountPk,
}: {
  tokenStreamingV2: PaymentStreaming | undefined;
  srcAccountPk: PublicKey | undefined;
}) => {
  if (!srcAccountPk) {
    throw new Error('Missing source account public key');
  }

  if (!tokenStreamingV2) {
    throw new Error('Missing token streaming client');
  }

  const cat = Category.vesting;
  console.log(`Fetching [${Category[cat]}] contracts for:`, srcAccountPk?.toBase58());

  try {
    const v2Accounts = await tokenStreamingV2.listAccounts(
      srcAccountPk,
      true, // excludeAutoClose = true means not including StandaloneStream treasuries
      cat,
    );
    const contracts = v2Accounts.map(vc => {
      return { ...vc, name: vc.name.trim() };
    })

    // This is because listTreasuries method cannot filter out the autoClose accounts by itself
    // const streamingAccounts = treasuryAccumulator.filter(t => !t.autoClose);

    return contracts;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export default getVestingContracts;
