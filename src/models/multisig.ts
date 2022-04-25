import { Idl, Program } from "@project-serum/anchor";
import { GetProgramAccountsFilter, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { OperationType } from "./enums";

export const MEAN_MULTISIG_OPS = new PublicKey("3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw");
export const LAMPORTS_PER_SIG = 5000;
export const DEFAULT_EXPIRATION_TIME_SECONDS = 604800;
export const ZERO_FEES = {
  multisigFee: 0,
  networkFee: 0,
  rentExempt: 0
} as MultisigTransactionFees;

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
  //
  Failed = 5
}

export type Multisig = {
  id: PublicKey;
  label: string;
  description?: string;
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
  description?: string;
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
  proposer: PublicKey | undefined;
  pdaTimestamp: number | undefined,
  pdaBump: number | undefined;
  details: MultisigTransactionDetail,
  didSigned: boolean; // this should be a number needs to be changed in the program (0 = not signed, 1 = signed, 2 = rejected),
}

export type MultisigTransactionDetail = {
  title: string;
  description: string;
  expirationDate: Date | undefined
}

export type MultisigTransactionSummary = {
  address: string;
  operation: string;
  multisig: string;
  approvals: number;
  createdOn: string;
  executedOn: string;
  status: string;
  proposer: string;
  title: string;
  description: string;
  expirationDate: string;
  didSigned: boolean;
  instruction: MultisigTransactionInstructionInfo
}

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

export enum MULTISIG_ACTIONS {
  createMultisig = 1,
  createTransaction = 2,
  cancelTransaction = 3
}

export type MultisigTransactionFees = {
  networkFee: number,
  rentExempt: number,
  multisigFee: number,
}

export const listMultisigTransactions = async (
  program: Program<Idl>,
  multisig: Multisig,
  owner: PublicKey

): Promise<MultisigTransaction[]> => {

  try {

    let filters: GetProgramAccountsFilter[] = [
      { dataSize: 1200 },
      { memcmp: { offset: 8, bytes: multisig.id.toString() } }
    ];

    let transactions: MultisigTransaction[] = [];
    let txs = await program.account.transaction.all(filters);
    for (let tx of txs) {

      const [txDetailAddress] = await PublicKey.findProgramAddress(
        [
          multisig.id.toBuffer(),
          tx.publicKey.toBuffer()
        ], 
        program.programId
      );

      const txDetail = await program.account.transactionDetail.fetchNullable(txDetailAddress);
      let txInfo = parseMultisigTransaction(multisig, owner, tx, txDetail);
      transactions.push(txInfo);
    }
    
    const sortedTxs = transactions.sort((a, b) => b.createdOn.getTime() - a.createdOn.getTime());

    return sortedTxs;

  } catch (err: any) {
    console.error(`List Multisig Transactions: ${err}`);
    return [];
  }
}

export const getFees = async (
  program: Program<Idl>,
  action: MULTISIG_ACTIONS

): Promise<MultisigTransactionFees> => {

  let txFees: MultisigTransactionFees = {
    networkFee: 0.0,
    rentExempt: 0.0,
    multisigFee: 0.02,
  };

  switch (action) {
    case MULTISIG_ACTIONS.createMultisig: {
      txFees.networkFee = 0.00001;
      txFees.rentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(program.account.multisigV2.size);
      break;
    }
    case MULTISIG_ACTIONS.createTransaction: {
      txFees.networkFee = 0.00001;
      txFees.rentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(1500);
      break;
    }
    case MULTISIG_ACTIONS.cancelTransaction: {
      txFees.networkFee = 0.000005;
      txFees.rentExempt = 0.0;
      break;
    }
    default: {
      break;
    }
  }

  txFees.rentExempt = txFees.rentExempt / LAMPORTS_PER_SOL;

  return txFees;
};

export const getTransactionStatus = (multisig: any, info: any, detail: any): MultisigTransactionStatus => {

  try {

    if (!multisig) { throw Error("Invalid parameter: 'multisig'"); }

    const executed = info.account.executedOn && info.account.executedOn.toNumber() > 0;

    if (executed) {
      return MultisigTransactionStatus.Executed;
    }

    const expirationDate = (
      !executed &&
      detail && 
      detail.expirationDate > 0
    ) ? new Date(detail.expirationDate.toNumber() * 1_000) : undefined;

    if (expirationDate && expirationDate.getTime() < Date.now()) {
      return MultisigTransactionStatus.Failed;
    }
  
    let status = MultisigTransactionStatus.Pending;
    let approvals = info.account.signers.filter((s: boolean) => s === true).length;
  
    if (multisig && multisig.threshold === approvals) {
      status = MultisigTransactionStatus.Approved;
    }
  
    if (multisig && multisig.ownerSeqNumber !== info.account.ownerSetSeqno) {
      status = MultisigTransactionStatus.Voided;
    }
  
    return status;

  } catch (err) {
    throw Error(`Multisig Transaction Status: ${err}`);
  }
}

export const parseMultisigTransaction = (
  multisig: any,
  owner: PublicKey,
  txInfo: any,
  txDetailInfo: any

): MultisigTransaction => {

  try {
    let currentOwnerIndex = multisig.owners.findIndex((o: any) => o.address === owner.toBase58());
    return Object.assign({}, {
      id: txInfo.publicKey,
      multisig: txInfo.account.multisig,
      programId: txInfo.account.programId,
      signers: txInfo.account.signers,
      ownerSeqNumber: txInfo.account.ownerSetSeqno,
      createdOn: new Date(txInfo.account.createdOn.toNumber() * 1000),
      executedOn: txInfo.account.executedOn && txInfo.account.executedOn > 0 && txInfo.account.executedOn.byteLength <= 53
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

export const getMultisigTransactionSummary = (
  transaction: MultisigTransaction

): MultisigTransactionSummary | undefined => {
  try {

    let txSummary = {
      address: transaction.id.toBase58(),
      operation: transaction.operation.toString(),
      proposer: transaction.proposer ? transaction.proposer.toBase58() : "",
      title: transaction.details ? transaction.details.title : "",
      description: transaction.details ? transaction.details.description : "",
      createdOn: transaction.createdOn.toString(),
      executedOn: transaction.executedOn ? transaction.executedOn.toString() : "",
      expirationDate: transaction.details && transaction.details.expirationDate ? transaction.details.expirationDate.toString() : "",
      approvals: transaction.signers.filter(s => s === true).length,
      multisig: transaction.multisig.toBase58(),
      status: transaction.status.toString(),
      didSigned: transaction.didSigned,
      instruction: parseMultisigTransactionInstruction(transaction)

    } as MultisigTransactionSummary;

    return txSummary;

  } catch (err: any) {
    console.error(`Parse Multisig Transaction: ${err}`);
    return undefined;
  }
}

export const parseMultisigTransactionInstruction = (
  transaction: MultisigTransaction

): MultisigTransactionInstructionInfo | null => {
  try {

    let ixAccInfos: InstructionAccountInfo[] = [];
    let accIndex = 0;

    for (let acc of transaction.accounts) {

      ixAccInfos.push({
        index: accIndex,
        label: "",
        value: acc.pubkey.toBase58()

      } as InstructionAccountInfo);

      accIndex ++;
    }

    // let ixDataInfos: InstructionDataInfo[] = [];
    let bufferStr = Buffer.from(transaction.data).toString('hex');
    let bufferStrArray: string[] = [];

    for (let i = 0; i < bufferStr.length; i += 2) {
      bufferStrArray.push(bufferStr.substring(i, i + 2));
    }

    let ixInfo = {
      programId: transaction.programId.toBase58(),
      accounts: ixAccInfos,
      data: [{
        label: "",
        value: bufferStrArray.join(' ')

      } as InstructionDataInfo]

    } as MultisigTransactionInstructionInfo;

    return ixInfo;

  } catch (err: any) {
    console.error(`Parse Multisig Transaction: ${err}`);
    return null;
  }
}