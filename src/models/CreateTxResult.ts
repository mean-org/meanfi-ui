import { Transaction } from "@solana/web3.js";

export interface CreateTxResult {
  transaction: Transaction | null;
  log: any[];
}
