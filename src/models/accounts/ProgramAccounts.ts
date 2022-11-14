import { PublicKey } from "@solana/web3.js";


export type ProgramAccounts = {
  pubkey: PublicKey;
  owner: PublicKey;
  executable: PublicKey;
  upgradeAuthority: PublicKey;
  size: number;
};
