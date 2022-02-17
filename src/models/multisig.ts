import { Keypair, PublicKey, SignaturePubkeyPair } from "@solana/web3.js";
import { OperationType } from "./enums";

export enum MultisigTransactionStatus {
  // No enough signatures
  Pending = 0,
  // Approved by the required amount of signers
  Approved = 1,
  // Successfully executed (didExecute = true)
  Executed = 2,
  // Rejected by any owner
  Rejected = 3
};

export type Multisig = {
  id: PublicKey;
  label: string;
  address: PublicKey;
  owners: MultisigParticipant[];
  threshold: number;
  nounce: number;
  ownerSeqNumber: number;
  createdOnUtc: Date;
  pendingTxsAmount: number;
  version: number;
};

export type MultisigV2 = {
  id: PublicKey;
  label: string;
  address: PublicKey;
  owners: MultisigParticipant[];
  threshold: number;
  nounce: number;
  ownerSeqNumber: number;
  createdOnUtc: Date;
  pendingTxsAmount: number;
  version: number
};

export type MultisigTransaction = {
  id: PublicKey;
  operation: OperationType;
  multisig: PublicKey;
  programId: PublicKey;
  signers: boolean[];
  createdOn: Date;
  executedOn: Date | undefined;
  status: MultisigTransactionStatus;
  accounts: any[];
  data: Buffer;
  keypairs: Keypair[];
  didSigned: boolean; // this should be a number needs to be changed in the program (0 = not signed, 1 = signed, 2 = rejected)
}

export type MintTokensInfo = {
  tokenAddress: string;
  mintTo: string;
  amount: number;
}

export type MultisigVault = {
  address: PublicKey;
  amount: any;
  closeAuthority: PublicKey;
  closeAuthorityOption: number;
  delegate: PublicKey;
  delegateOption: number;
  delegatedAmount: any;
  isNative: any;
  isNativeOption: number;
  mint: PublicKey;
  owner: PublicKey;
  state: number;
}

export type MultisigParticipant = {
  address: string;
  name: string;
}
