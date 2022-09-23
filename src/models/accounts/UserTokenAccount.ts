import { TokenInfo } from "models/SolanaTokenInfo";


export interface UserTokenAccount extends TokenInfo {
  publicAddress?: string; // Token Account Public Address
  balance?: number; // To pre-fill balance instead of having to get balance on the fly
  valueInUsd?: number; // To pre.fill the value in USD from the balance
  displayIndex?: number; // To keep consecutive indexing while merging lists
  isAta?: boolean;
  owner?: string;
}
