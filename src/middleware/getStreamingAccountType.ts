import { TreasuryInfo } from '@mean-dao/money-streaming';
import { AccountType, PaymentStreamingAccount } from '@mean-dao/payment-streaming';

export const getStreamingAccountType = (account: TreasuryInfo | PaymentStreamingAccount) => {
  const v1 = account as TreasuryInfo;
  const v2 = account as PaymentStreamingAccount;
  const treasuryType = account.version < 2 ? +v1.type : +v2.accountType;

  return treasuryType as AccountType;
};
