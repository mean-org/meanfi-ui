import type { PublicKey } from '@solana/web3.js';
import type { TokenAccountInfo } from './TokenAccountInfo';

export class AccountTokenParsedInfo {
  parsedInfo!: TokenAccountInfo;
  pubkey!: PublicKey;
  description?: string;
}
