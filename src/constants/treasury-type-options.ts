import { TreasuryType } from '@mean-dao/money-streaming/lib/types';
import { TreasuryTypeOption } from '../models/treasuries';

export const TREASURY_TYPE_OPTIONS: TreasuryTypeOption[] = [
  {
    name: 'Open Money Streaming Treasury',
    type: TreasuryType.Open,
    translationId: 'treasury-type-open',
    disabled: false,
  },
  {
    name: 'Locked Money Streaming Treasury',
    type: TreasuryType.Lock,
    translationId: 'treasury-type-locked',
    disabled: false,
  },
];

export const VESTING_ACCOUNT_TYPE_OPTIONS: TreasuryTypeOption[] = [
  {
    name: 'Locked vesting contract',
    type: TreasuryType.Lock,
    translationId: 'vesting-account-type-locked',
    disabled: false,
  },
  // {
  //     name: 'Open vesting contract',
  //     type: TreasuryType.Open,
  //     translationId: 'vesting-account-type-open',
  //     disabled: false,
  // },
];
