import { TransactionFees } from "@mean-dao/msp";
import { Keypair, PublicKey } from "@solana/web3.js";
import { OperationType } from "./enums";

export const MEAN_MULTISIG_OPS = new PublicKey("3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw");

export enum MultisigTransactionStatus {
  // No enough signatures
  Pending = 0,
  // Approved by the required amount of signers
  Approved = 1,
  // Successfully executed (didExecute = true)
  Executed = 2,
  // Rejected by any owner
  Rejected = 3,
  // Invalid owners set seq number
  Voided = 4,
};

export type Multisig = {
  id: PublicKey;
  label: string;
  authority: PublicKey;
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
  authority: PublicKey;
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
  ownerSeqNumber: number;
  status: MultisigTransactionStatus;
  accounts: any[];
  data: Buffer;
  keypairs: Keypair[];
  proposer: PublicKey | undefined;
  pdaTimestamp: number | undefined,
  pdaBump: number | undefined;
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
  decimals: number;
}

export type MultisigMint = {
  address: PublicKey;
  isInitialized: boolean;
  decimals: number;
  supply: any;
  mintAuthority: PublicKey;
  freezeAuthority: PublicKey;
}

export type MultisigParticipant = {
  address: string;
  name: string;
}

export type CreateMintPayload = {
  decimals: number;
}

export type SetMintAuthPayload = {
  multisig: string;
  mint: string;
  newAuthority: number;
}

export const CREATE_MULTISIG_FEES: TransactionFees = {
  blockchainFee: 0.000005,
  mspFlatFee: 0.02,
  mspPercentFee: 0
};
