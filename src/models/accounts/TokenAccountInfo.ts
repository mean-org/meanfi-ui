import { TokenAmount } from "@solana/web3.js";


export type TokenAccountInfo = {
  mint: string;
  owner: string;
  tokenAmount: TokenAmount;
  state: string;
  isNative: boolean;
};
