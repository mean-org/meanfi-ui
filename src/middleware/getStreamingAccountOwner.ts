import { TreasuryInfo } from "@mean-dao/money-streaming";
import { PaymentStreamingAccount } from "@mean-dao/payment-streaming";

export const getStreamingAccountOwner = (account: TreasuryInfo | PaymentStreamingAccount): string => {
  const v1 = account as TreasuryInfo;
  const v2 = account as PaymentStreamingAccount;
  return account.version < 2
    ? v1.treasurerAddress as string
    : v2.owner.toBase58();
}
