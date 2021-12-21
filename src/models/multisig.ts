import { PublicKey } from "@solana/web3.js";
import { OperationType } from "./enums";

export enum MultisigTransactionStatus {
  // No enough signatures
  Pending = 0,
  // Approved by the required amount of signers
  Approved = 1,
  // Successfully executed (didExecute = true)
  Executed = 2
};

export type MultisigAccountInfo = {
  id: PublicKey;
  label: string;
  address: PublicKey;
  owners: PublicKey[];
  threshold: number;
  nounce: number;
  ownerSeqNumber: number;
  createdOnUtc: Date;
  pendingTxsAmount: number;
};

export type MultisigTransactionInfo = {
  id: PublicKey;
  operation: OperationType;
  multisig: PublicKey;
  programId: PublicKey;
  signedBy: PublicKey[];
  createdOn: Date;
  executedOn: Date | undefined,
  status: MultisigTransactionStatus,
  accounts: any[]
}

export type MintTokensInfo = {
  tokenAddress: string;
  mintTo: string;
  amount: number;
}
