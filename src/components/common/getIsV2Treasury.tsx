import type { TreasuryInfo } from '@mean-dao/money-streaming';
import type { PaymentStreamingAccount } from '@mean-dao/payment-streaming';

const getIsV2Treasury = (treasury: TreasuryInfo | PaymentStreamingAccount) => {
  return treasury.version >= 2;
};

export default getIsV2Treasury;
