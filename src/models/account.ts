import {
  AccountInfo,
  PublicKey,

} from "@solana/web3.js";

import { AccountInfo as TokenAccountInfo } from "@solana/spl-token";

export interface TokenAccount {
  pubkey: PublicKey;
  account: AccountInfo<Buffer>;
  info: TokenAccountInfo;
}

export interface AccountDetails {
  dateTime: string;
  clientInfo: string;
  networkInfo: string;
  accountInfo: string;
  appBuildInfo: string;
}
