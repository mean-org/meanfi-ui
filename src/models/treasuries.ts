import type { AccountType } from '@mean-dao/payment-streaming';
import type { TokenInfo } from 'src/models/SolanaTokenInfo';

export interface TreasuryTypeOption {
  name: string;
  type: AccountType;
  translationId: string;
  disabled: boolean;
}

export type StreamTreasuryType = 'open' | 'locked' | 'unknown';

export interface TreasuryCreateOptions {
  treasuryTitle: string;
  treasuryName: string;
  treasuryType: AccountType;
  multisigId: string;
  token: TokenInfo;
}

export interface CloseStreamTransactionParams {
  title: string;
  payer: string;
  stream: string;
  closeTreasury: boolean;
}

export interface TreasuryWithdrawParams {
  proposalTitle: string;
  destination: string;
  amount: string;
  payer: string;
  treasury: string;
}

export interface UserTreasuriesSummary {
  totalAmount: number;
  openAmount: number;
  lockedAmount: number;
  totalNet: number;
}

export const INITIAL_TREASURIES_SUMMARY: UserTreasuriesSummary = {
  totalAmount: 0,
  openAmount: 0,
  lockedAmount: 0,
  totalNet: 0,
};
