import { AccountInfo, PublicKey } from '@solana/web3.js';

export type AccountsDictionary = {
  publicKey: PublicKey;
  account: AccountInfo<Buffer>;
  owner?: PublicKey;
};
