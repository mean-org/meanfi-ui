import type { MoneyStreaming } from '@mean-dao/money-streaming/lib/money-streaming';
import type { TreasuryInfo } from '@mean-dao/money-streaming/lib/types';
import { Category, type PaymentStreaming, type PaymentStreamingAccount } from '@mean-dao/payment-streaming';
import type { PublicKey } from '@solana/web3.js';

const getStreamingAccountList = async ({
  tokenStreamingV1,
  tokenStreamingV2,
  srcAccountPk,
  category,
  isMultisigContext,
}: {
  tokenStreamingV1: MoneyStreaming | undefined;
  tokenStreamingV2: PaymentStreaming | undefined;
  srcAccountPk: PublicKey | undefined;
  category?: Category;
  isMultisigContext?: boolean;
}) => {
  if (!srcAccountPk) {
    throw new Error('Missing source account public key');
  }

  if (!tokenStreamingV1 || !tokenStreamingV2) {
    throw new Error('Missing token streaming client');
  }

  const cat = category ?? Category.default;
  console.log(`Fetching [${Category[cat]}] Streaming Accounts for:`, srcAccountPk?.toBase58());

  const treasuryAccumulator: (PaymentStreamingAccount | TreasuryInfo)[] = [];

  try {
    const v2Accounts = await tokenStreamingV2.listAccounts(
      srcAccountPk,
      true, // excludeAutoClose = true means not including StandaloneStream treasuries
      cat,
    );
    const namesTrimmed = v2Accounts.map(vc => {
      return { ...vc, name: vc.name.trim() };
    });
    treasuryAccumulator.push(...namesTrimmed);

    if (cat !== Category.vesting && !isMultisigContext) {
      const v1Accounts = await tokenStreamingV1.listTreasuries(srcAccountPk);
      treasuryAccumulator.push(...v1Accounts);
    }

    // This is because listTreasuries method cannot filter  out the autoClose accounts by itself
    const streamingAccounts = treasuryAccumulator.filter(t => !t.autoClose);

    return streamingAccounts;
  } catch (error) {
    console.error(error);
    return [];
  }
};

export default getStreamingAccountList;
