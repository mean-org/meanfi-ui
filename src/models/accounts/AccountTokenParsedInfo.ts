import { PublicKey } from "@solana/web3.js";
import { TokenAccountInfo } from "./TokenAccountInfo";


export class AccountTokenParsedInfo {
  parsedInfo!: TokenAccountInfo;
  pubkey!: PublicKey;
  description?: string;
}
