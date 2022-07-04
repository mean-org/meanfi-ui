import { Commitment, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { AnchorProvider, BorshInstructionCoder, Idl, Program, SplToken, SplTokenCoder } from "@project-serum/anchor";
import { OperationType } from "./enums";
import bs58 from "bs58";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { MEAN_MULTISIG_PROGRAM, MultisigTransaction } from "@mean-dao/mean-multisig-sdk";
import { MeanSplTokenInstructionCoder } from "./spl-token-coder/instruction";
import { MeanSystemInstructionCoder } from "./system-program-coder/instruction";

export const MEAN_MULTISIG_OPS = new PublicKey("3TD6SWY9M1mLY2kZWJNavPLhwXvcRsWdnZLRaMzERJBw");
export const LAMPORTS_PER_SIG = 5000;
export const DEFAULT_EXPIRATION_TIME_SECONDS = 604800;
export const ZERO_FEES = {
  multisigFee: 0,
  networkFee: 0,
  rentExempt: 0
} as MultisigTransactionFees;

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

export type MultisigTransactionDetail = {
  title: string;
  description: string;
  expirationDate: Date | undefined
}

export interface MultisigTransactionWithId {
  multisigId: string;
  transactions: MultisigTransaction[];
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

export const getIxNameFromMultisigTransaction = (transaction: MultisigTransaction, programIdl?: Idl) => {

  let ix: any;

  if (!programIdl) {
    switch(transaction.operation) {
      case OperationType.Transfer:
      case OperationType.TransferTokens: 
        ix = "transfer";
        break;
      default: ix = undefined;
    }
    return ix;
  }

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
    case OperationType.DeleteAsset:
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
    case OperationType.StreamTransferBeneficiary:
      ix = programIdl.instructions.filter(ix => ix.name === "transferStream")[0];
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

    // console.log('ix', ix);

    // if (!program || program.programId.equals(TOKEN_PROGRAM_ID)) { // HERE TOKEN IX
    //   return getMultisigInstructionSummary(ix);
    // }

    if (!program) {
      return getMultisigInstructionSummary(ix);
    }

    const ixName = getIxNameFromMultisigTransaction(transaction, program.idl);
    // console.log('ixName', ixName);

    if (!ixName) {
      return getMultisigInstructionSummary(ix);
    }

    const coder = program.programId.equals(TOKEN_PROGRAM_ID) 
      ? new MeanSplTokenInstructionCoder(program.idl)
      : new BorshInstructionCoder(program.idl);

    // console.log('coder', coder);

    const dataEncoded = bs58.encode(ix.data);
    const dataDecoded = coder.decode(dataEncoded, "base58");
    // console.log('dataDecoded', dataDecoded);

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

    // console.log('formattedData', formattedData);

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

export const parseMultisigSystemProposalIx = (transaction: MultisigTransaction): MultisigTransactionInstructionInfo | null => {

  try {

    const ix = new TransactionInstruction({
      programId: transaction.programId,
      keys: transaction.accounts,
      data: transaction.data
    });

    const ixName = getIxNameFromMultisigTransaction(transaction);
    // console.log('ixName', ixName);

    if (!ixName) {
      return getMultisigInstructionSummary(ix);
    }

    const coder = new MeanSystemInstructionCoder();
    // console.log('coder', coder);

    // const dataEncoded = bs58.encode(ix.data);
    const dataDecoded = coder.decode(ix.data);
    // console.log('dataDecoded', dataDecoded);

    if (!dataDecoded) {
      return getMultisigInstructionSummary(ix);
    }

    const ixData = (dataDecoded.data as any);

    const formattedData = coder.format(
      {
        name: dataDecoded.name,
        data: ixData
      },
      ix.keys
    );

    // console.log('formattedData', formattedData);

    if (!formattedData) {
      return getMultisigInstructionSummary(ix);
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

    const ixInfo = {
      programId: ix.programId.toBase58(),
      programName: "System Program",
      accounts: ixAccInfos,
      data: dataInfos

    } as MultisigTransactionInstructionInfo;

    return ixInfo;

  } catch (err: any) {
    console.error(`Parse Multisig Transaction: ${err}`);
    return null;
  }
}

export const sentenceCase = (field: string): string => {
  const result = field.replace(/([A-Z])/g, " $1");
  return result.charAt(0).toUpperCase() + result.slice(1);
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