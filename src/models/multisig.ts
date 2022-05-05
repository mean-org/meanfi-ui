import { GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { Idl, Program } from "@project-serum/anchor";
import { OperationType } from "./enums";
import {

  MultisigInfo,
  MultisigTransaction,
  MultisigTransactionDetail,
  MultisigTransactionFees,
  getTransactionStatus,

} from "@mean-dao/mean-multisig-sdk";

export const ZERO_FEES = {
  multisigFee: 0,
  networkFee: 0,
  rentExempt: 0
} as MultisigTransactionFees;

export type MultisigTransactionInstructionInfo = {
  programId: string;
  accounts: InstructionAccountInfo[];
  data: InstructionDataInfo[];
}

export type InstructionAccountInfo = {
  index: number;
  label: string;
  value: string;
}

export type InstructionDataInfo = {
  label: string;
  value: string;
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

export type CreateMintPayload = {
  decimals: number;
}

export type SetMintAuthPayload = {
  multisig: string;
  mint: string;
  newAuthority: number;
}

export const listMultisigTransactions = async (
  program: Program<Idl>,
  multisig: MultisigInfo,
  owner: PublicKey

): Promise<MultisigTransaction[]> => {

  try {

    const filters: GetProgramAccountsFilter[] = [
      { dataSize: 1200 },
      { memcmp: { offset: 8, bytes: multisig.id.toString() } }
    ];

    const transactions: MultisigTransaction[] = [];
    const txs = await program.account.transaction.all(filters);
    for (const tx of txs) {

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          multisig.id.toBuffer(),
          tx.publicKey.toBuffer()
        ], 
        program.programId
      );

      const txDetail = await program.account.transactionDetail.fetchNullable(txDetailAddress);
      const txInfo = parseMultisigTransaction(multisig, owner, tx, txDetail);
      transactions.push(txInfo);
    }
    
    const sortedTxs = transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());

    return sortedTxs;

  } catch (err: any) {
    console.error(`List Multisig Transactions: ${err}`);
    return [];
  }
}

export const parseMultisigTransaction = (
  multisig: any,
  owner: PublicKey,
  txInfo: any,
  txDetailInfo: any

): MultisigTransaction => {

  try {
    const currentOwnerIndex = multisig.owners.findIndex((o: any) => o.address === owner.toBase58());
    return Object.assign({}, {
      id: txInfo.publicKey,
      multisig: txInfo.account.multisig,
      programId: txInfo.account.programId,
      signers: txInfo.account.signers,
      ownerSeqNumber: txInfo.account.ownerSetSeqno,
      createdOn: new Date(txInfo.account.createdOn.toNumber() * 1000),
      executedOn: txInfo.account.executedOn && txInfo.account.executedOn > 0
        ? new Date(txInfo.account.executedOn.toNumber() * 1000) 
        : undefined,
      status: getTransactionStatus(multisig, txInfo, txDetailInfo),
      operation: parseInt(Object.keys(OperationType).filter(k => k === txInfo.account.operation.toString())[0]),
      accounts: txInfo.account.accounts,
      didSigned: txInfo.account.signers[currentOwnerIndex],
      proposer: txInfo.account.proposer,
      pdaTimestamp: txInfo.account.pdaTimestamp ? txInfo.account.pdaTimestamp.toNumber() : undefined,
      pdaBump: txInfo.account.pdaBump,
      data: txInfo.account.data,
      details: parseMultisigTransactionDetail(txDetailInfo)

    } as MultisigTransaction);

  } catch (err) {
    throw Error(`Multisig Transaction Error: ${err}`);
  }
}

export const parseMultisigTransactionDetail = (txDetailInfo: any): MultisigTransactionDetail => {

  try {

    const txDetail = {
      title: txDetailInfo && txDetailInfo.title ? new TextDecoder('utf8').decode(
        Buffer.from(
          Uint8Array.of(...txDetailInfo.title.filter((b: number) => b !== 0))
        )
      ) : "",
      description: txDetailInfo && txDetailInfo.description ? new TextDecoder('utf8').decode(
        Buffer.from(
          Uint8Array.of(...txDetailInfo.description.filter((b: number) => b !== 0))
        )
      ) : "",
      expirationDate: ( 
        txDetailInfo && 
        txDetailInfo.expirationDate > 0
      ) ? new Date(txDetailInfo.expirationDate.toNumber() * 1_000) : undefined,

    } as MultisigTransactionDetail;

    return txDetail;

  } catch (err) {
    throw Error(`Multisig Transaction Error: ${err}`);
  }
}