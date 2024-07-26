import { AccountType } from '@mean-dao/payment-streaming';
import type { TreasuryTypeOption } from '../models/treasuries';

export const TREASURY_TYPE_OPTIONS: TreasuryTypeOption[] = [
  {
    name: 'Open Money Streaming Treasury',
    type: AccountType.Open,
    translationId: 'treasury-type-open',
    disabled: false,
  },
  {
    name: 'Locked Money Streaming Treasury',
    type: AccountType.Lock,
    translationId: 'treasury-type-locked',
    disabled: false,
  },
];

export const VESTING_ACCOUNT_TYPE_OPTIONS: TreasuryTypeOption[] = [
  {
    name: 'Locked vesting contract',
    type: AccountType.Lock,
    translationId: 'vesting-account-type-locked',
    disabled: false,
  },
  // {
  //     name: 'Open vesting contract',
  //     type: AccountType.Open,
  //     translationId: 'vesting-account-type-open',
  //     disabled: false,
  // },
];
