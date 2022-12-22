import { TreasuryInfo } from '@mean-dao/money-streaming';
import { PaymentStreamingAccount } from '@mean-dao/payment-streaming';

export const getStreamingAccountId = (account: TreasuryInfo | PaymentStreamingAccount) => {
  const v1 = account as TreasuryInfo;
  const v2 = account as PaymentStreamingAccount;
  return account.version < 2 ? (v1.id as string) : v2.id.toBase58();
};
