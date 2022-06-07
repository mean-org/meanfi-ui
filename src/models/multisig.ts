import { Commitment, Connection, GetProgramAccountsFilter, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, BorshInstructionCoder, Idl, Program, SplToken, SplTokenCoder } from "@project-serum/anchor";
import { OperationType } from "./enums";
import bs58 from "bs58";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MEAN_MULTISIG_PROGRAM } from "@mean-dao/mean-multisig-sdk";

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
  Expired = 5
}

export type Multisig = {
  id: PublicKey;
  label: string;
  description?: string;
  authority: PublicKey;
  owners: MultisigParticipant[];
  threshold: number;
  nounce: number;
  ownerSetSeqno: number;
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
  ownerSetSeqno: number;
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
  ownerSetSeqno: number;
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
  programName: string;
  accounts: InstructionAccountInfo[];
  data: InstructionDataInfo[];
}

export type InstructionAccountInfo = {
  index: number;
  label: string;
  value: string;
}

export type InstructionDataInfo = {
  index: number;
  label: string;
  value: any;
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

export const getFees = async (
  program: Program<Idl>,
  action: MULTISIG_ACTIONS

): Promise<MultisigTransactionFees> => {

  const txFees: MultisigTransactionFees = {
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
      return MultisigTransactionStatus.Expired;
    }
  
    let status = MultisigTransactionStatus.Pending;
    const approvals = info.account.signers.filter((s: boolean) => s === true).length;
  
    if (multisig && multisig.threshold === approvals) {
      status = MultisigTransactionStatus.Approved;
    }
  
    if (multisig && multisig.ownerSetSeqno !== info.account.ownerSetSeqno) {
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
    const currentOwnerIndex = multisig.owners.findIndex((o: any) => o.address === owner.toBase58());
    return Object.assign({}, {
      id: txInfo.publicKey,
      multisig: txInfo.account.multisig,
      programId: txInfo.account.programId,
      signers: txInfo.account.signers,
      ownerSetSeqno: txInfo.account.ownerSetSeqno,
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

export const getMultisigTransactionSummary = (
  transaction: MultisigTransaction

): MultisigTransactionSummary | undefined => {
  try {

    const expDate = (
      transaction.details && 
      transaction.details.expirationDate
    ) ? (
      transaction.details.expirationDate.getTime().toString().length > 13
         ? new Date(parseInt((transaction.details.expirationDate.getTime() / 1_000).toString())).toString()
         : transaction.details.expirationDate.toString()
     ) : "";

    const txSummary = {
      address: transaction.id.toBase58(),
      operation: transaction.operation.toString(),
      proposer: transaction.proposer ? transaction.proposer.toBase58() : "",
      title: transaction.details ? transaction.details.title : "",
      description: transaction.details ? transaction.details.description : "",
      createdOn: transaction.createdOn.toString(),
      executedOn: transaction.executedOn ? transaction.executedOn.toString() : "",
      expirationDate: expDate,
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

    const ixAccInfos: InstructionAccountInfo[] = [];
    let accIndex = 0;

    for (const acc of transaction.accounts) {

      ixAccInfos.push({
        index: accIndex,
        label: "",
        value: acc.pubkey.toBase58()

      } as InstructionAccountInfo);

      accIndex ++;
    }

    // let ixDataInfos: InstructionDataInfo[] = [];
    const bufferStr = Buffer.from(transaction.data).toString('hex');
    const bufferStrArray: string[] = [];

    for (let i = 0; i < bufferStr.length; i += 2) {
      bufferStrArray.push(bufferStr.substring(i, i + 2));
    }

    const ixInfo = {
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

export const getIxNameFromMultisigTransaction = (programIdl: Idl, transaction: MultisigTransaction) => {

  let ix: any;

  switch(transaction.operation) {
    // MEan Multisig
    case OperationType.EditMultisig:
      ix = programIdl.instructions.filter(ix => ix.name === "editMultisig")[0];
      break;
    // SPL Token
    case OperationType.TransferTokens:
      ix = programIdl.instructions.filter(ix => ix.name === "transfer")[0];
      break;
    case OperationType.SetAssetAuthority:
      ix = programIdl.instructions.filter(ix => ix.name === "setAuthority")[0];
      break;
    case OperationType.CloseTokenAccount:
      ix = programIdl.instructions.filter(ix => ix.name === "closeAccount")[0];
      break;
    // MSP
    case OperationType.TreasuryCreate:
      ix = programIdl.instructions.filter(ix => ix.name === "createTreasury")[0];
      break;
    case OperationType.TreasuryStreamCreate:
      ix = programIdl.instructions.filter(ix => ix.name === "createStream")[0];
      break;
    case OperationType.TreasuryRefreshBalance:
      ix = programIdl.instructions.filter(ix => ix.name === "refreshTreasuryData")[0];
      break;
    case OperationType.TreasuryAddFunds:
      ix = programIdl.instructions.filter(ix => ix.name === "addFunds")[0];
      break;
    case OperationType.TreasuryClose:
      ix = programIdl.instructions.filter(ix => ix.name === "closeTreasury")[0];
      break;
    case OperationType.TreasuryWithdraw:
      ix = programIdl.instructions.filter(ix => ix.name === "treasuryWithdraw")[0];
      break;
    case OperationType.StreamCreate:
      ix = programIdl.instructions.filter(ix => ix.name === "createStream")[0];
      break;
    case OperationType.StreamAddFunds:
      ix = programIdl.instructions.filter(ix => ix.name === "allocate")[0];
      break;
    case OperationType.StreamPause:
      ix = programIdl.instructions.filter(ix => ix.name === "pauseStream")[0];
      break;
    case OperationType.StreamResume:
      ix = programIdl.instructions.filter(ix => ix.name === "resumeStream")[0];
      break;
    case OperationType.StreamClose:
      ix = programIdl.instructions.filter(ix => ix.name === "closeStream")[0];
      break;
    case OperationType.StreamWithdraw:
      ix = programIdl.instructions.filter(ix => ix.name === "withdraw")[0];
      break;
    // CREDIX
    case OperationType.CredixDepositFunds:
      ix = programIdl.instructions.filter(ix => ix.name === "depositFunds")[0];
      break;
    case OperationType.CredixWithdrawFunds:
      ix = programIdl.instructions.filter(ix => ix.name === "withdrawFunds")[0];
      break;
    default: ix = undefined;
  }

  return ix ? ix.name : "";
}

export const createAnchorProgram = (
  connection: Connection,
  programId: PublicKey,
  programIdl: Idl,
  commitment: Commitment = "confirmed"

): Program<any> => {

  const opts = {
    skipPreflight: false,
    commitment: commitment || "confirmed",
    preflightCommitment: commitment || "confirmed",
    maxRetries: 3
  };

  const readOnlyWallet = Keypair.generate();
  const anchorWallet = {
    publicKey: new PublicKey(readOnlyWallet.publicKey),
    signAllTransactions: async (txs: any) => txs,
    signTransaction: async (tx: any) => tx,
  };

  const provider = new AnchorProvider(connection, anchorWallet, opts);

  if (programId.equals(TOKEN_PROGRAM_ID)) {

    const coder = (): SplTokenCoder => {
      return new SplTokenCoder(programIdl);
    }

    return new Program<SplToken>(programIdl as SplToken, programId, provider, coder());
  }
  
  return new Program(programIdl, programId, provider);
}

export const parseMultisigProposalIx = (
  transaction: MultisigTransaction,
  program?: Program<any> | undefined

): MultisigTransactionInstructionInfo | null => {

  try {

    const ix = new TransactionInstruction({
      programId: transaction.programId,
      keys: transaction.accounts,
      data: transaction.data
    });

    if (!program || program.programId.equals(TOKEN_PROGRAM_ID)) {
      return getMultisigInstructionSummary(ix);
    }

    const ixName = getIxNameFromMultisigTransaction(program.idl, transaction);

    if (!ixName) {
      return getMultisigInstructionSummary(ix);
    }

    const coder = new BorshInstructionCoder(program.idl);
    const dataEncoded = bs58.encode(ix.data);
    const dataDecoded = coder.decode(dataEncoded, "base58");

    if (!dataDecoded) {
      return getMultisigInstructionSummary(ix);
    }

    const ixData = (dataDecoded.data as any);

    const formattedData = coder.format(
      {
        name: dataDecoded.name,
        data: !program.programId.equals(MEAN_MULTISIG_PROGRAM) ? ixData : {
          label: ixData["label"],
          threshold: ixData["threshold"],
          owners: []
        }
      },
      ix.keys
    );

    if (!formattedData) {
      return getMultisigInstructionSummary(ix);
    }

    if (program.programId.equals(MEAN_MULTISIG_PROGRAM)) {
      for (const arg of formattedData.args) {
        if (arg.name === "owners") {
          arg.data = ixData["owners"].map((o: any) => {
            return {
              label: o.name,
              type: "string",
              data: o.address.toBase58()
            }
          });
        }
      }
    }

    const ixAccInfos: InstructionAccountInfo[] = [];
    let accIndex = 0;

    for (const acc of ix.keys) {

      ixAccInfos.push({
        index: accIndex,
        label: formattedData.accounts[accIndex].name,
        value: acc.pubkey.toBase58()

      } as InstructionAccountInfo);

      accIndex ++;
    }

    const dataInfos: InstructionDataInfo[] = [];
    let dataIndex = 0;

    for (const dataItem of formattedData.args) {
      dataInfos.push({
        label: `${dataItem.name[0].toUpperCase()}${dataItem.name.substring(1)}`,
        value: dataItem.data,
        index: dataIndex
      } as InstructionDataInfo);
      dataIndex ++;
    }

    const nameArray = (program.idl.name as string).split("_");
    const ixInfo = {
      programId: ix.programId.toBase58(),
      programName: nameArray.map(i => `${i[0].toUpperCase()}${i.substring(1)}`).join(" "),
      accounts: ixAccInfos,
      data: dataInfos

    } as MultisigTransactionInstructionInfo;

    return ixInfo;

  } catch (err: any) {
    console.error(`Parse Multisig Transaction: ${err}`);
    return null;
  }
}

export const parseSerializedTx = async (
  connection: Connection,
  base64Str: string
): Promise<Transaction | null> => {
  try {

    if (!connection || !base64Str) { 
      throw Error(`Parse Serialized Transaction: Invalid parameters.`)
    }

    // const base64Str = uiInstruction.uiElements[0].value;
    const base64StrRegx = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

    if (!base64StrRegx.test(base64Str)) {
      throw Error(`Parse Serialized Transaction: The parameter "base64Str" is not a valid base64 string.`);
    }

    const buffer = Buffer.from(base64Str, 'base64');
    const tx = Transaction.from(buffer);

    return tx;

  } catch (err: any) {
    console.error(`Parse Serialized Transaction: ${err}`);
    return null;
  }
}

export const getMultisigInstructionSummary = (
  instruction: TransactionInstruction

): MultisigTransactionInstructionInfo | null => {

  try {

    const ixAccInfos: InstructionAccountInfo[] = [];
    let accIndex = 0;

    for (const acc of instruction.keys) {

      ixAccInfos.push({
        index: accIndex,
        label: "",
        value: acc.pubkey.toBase58()

      } as InstructionAccountInfo);

      accIndex ++;
    }

    const bufferStr = Buffer.from(instruction.data).toString('hex');
    const bufferStrArray: string[] = [];

    for (let i = 0; i < bufferStr.length; i += 2) {
      bufferStrArray.push(bufferStr.substring(i, i + 2));
    }

    const ixInfo = {
      programId: instruction.programId.toBase58(),
      accounts: ixAccInfos,
      data: [{
        label: "",
        value: bufferStrArray.join(' ')

      } as InstructionDataInfo]

    } as MultisigTransactionInstructionInfo;

    return ixInfo;

  } catch (err: any) {
    console.error(`Multisig Instruction Summary: ${err}`);
    return null;
  }
}