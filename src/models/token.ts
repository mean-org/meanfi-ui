import { PublicKey, TokenAmount } from "@solana/web3.js";

export class AccountTokenParsedInfo {
  parsedInfo!: TokenAccountInfo;
  pubkey!: PublicKey;
  description?: string;
}

export type TokenAccountInfo = {
  mint: string;
  owner: string;
  tokenAmount: TokenAmount;
  state: string;
  isNative: boolean;
};

export type TokenPrice = {
  symbol: string;
  address: string;
  price: number;
};
