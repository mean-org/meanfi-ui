import {
  AccountMeta,
  Commitment,
  Connection,
  Keypair,
  Message,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { AnchorProvider, BN, Idl, Program, SplToken, SplTokenCoder } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { AppConfig, UiInstruction } from '@mean-dao/mean-multisig-apps';
import { MultisigTransaction } from '@mean-dao/mean-multisig-sdk';
import { OperationType } from './enums';
import { getAmountFromLamports } from '../middleware/utils';

export const CREDIX_PROGRAM_MAINNET = new PublicKey('CRDx2YkdtYtGZXGHZ59wNv1EwKHQndnRc1gT4p8i2vPX');
export const CREDIX_PROGRAM_DEVNET = new PublicKey('crdszSnZQu7j36KfsMJ4VEmMUTJgrNYXwoPVHUANpAu');
export const NATIVE_LOADER = new PublicKey('NativeLoader1111111111111111111111111111111');
export const LAMPORTS_PER_SIG = 5000;
export const DEFAULT_EXPIRATION_TIME_SECONDS = 604800;
export const ZERO_FEES = {
  multisigFee: 0,
  networkFee: 0,
  rentExempt: 0,
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
  version: number;
};

export type MultisigTransactionDetail = {
  title: string;
  description: string;
  expirationDate: Date | undefined;
};

export interface MultisigProposalsWithAuthority {
  multisigAuth: string;
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
  instruction: MultisigTransactionInstructionInfo;
};

export type MultisigTransactionInstructionInfo = {
  programId: string;
  programName: string;
  accounts: InstructionAccountInfo[];
  data: InstructionDataInfo[];
};

export type InstructionAccountInfo = {
  index: number;
  label: string;
  value: string;
};

export type InstructionDataInfo = {
  index: number;
  label: string;
  value: any;
};

export type MintTokensInfo = {
  tokenAddress: string;
  mintTo: string;
  amount: number;
};

export type MultisigAsset = {
  address: PublicKey;
  amount: BN;
  closeAuthority: PublicKey | undefined;
  closeAuthorityOption: number;
  decimals: number;
  delegate: PublicKey | undefined;
  delegateOption: number;
  delegatedAmount: number;
  isNative: boolean;
  isNativeOption: number;
  mint: PublicKey;
  owner: PublicKey;
  state: number;
};

export type MultisigVault = {
  address: PublicKey;
  amount: any;
  closeAuthority: PublicKey;
  closeAuthorityOption: number;
  decimals: number;
  delegate: PublicKey;
  delegateOption: number;
  delegatedAmount: any;
  isNative: any;
  isNativeOption: number;
  mint: PublicKey;
  owner: PublicKey;
  state: number;
};

export type MultisigMint = {
  address: PublicKey;
  isInitialized: boolean;
  decimals: number;
  supply: any;
  mintAuthority: PublicKey;
  freezeAuthority: PublicKey;
};

export type MultisigParticipant = {
  address: string;
  name: string;
};

export type CreateMintPayload = {
  decimals: number;
};

export type MultisigTxParams = {
  programId: PublicKey; // Ix program id
  ixAccounts: AccountMeta[]; // keys o accounts of the Ix
  ixData: Buffer | undefined; // data of the Ix
  ixs?: TransactionInstruction[]; // pre instructions
};

export interface BaseProposal {
  proposalTitle: string;
}

export interface SetProgramAuthPayload extends BaseProposal {
  programAddress: string;
  programDataAddress: string;
  newAuthAddress: string;
}

export interface SetAssetAuthPayload extends BaseProposal {
  selectedAuthority: string;
}

enum MULTISIG_ACTIONS {
  createMultisig = 1,
  createTransaction = 2,
  cancelTransaction = 3,
}

export type MultisigTransactionFees = {
  networkFee: number;
  rentExempt: number;
  multisigFee: number;
};

export interface CreateNewProposalParams {
  appId: string;
  multisigId: string;
  title: string;
  description: string;
  expires: number;
  config: AppConfig;
  instruction: UiInstruction;
}

export interface CreateNewSafeParams {
  label: string;
  threshold: number;
  owners: MultisigParticipant[];
}

export const getFees = async (program: Program<Idl>, action: MULTISIG_ACTIONS): Promise<MultisigTransactionFees> => {
  const txFees: MultisigTransactionFees = {
    networkFee: 0.0,
    rentExempt: 0.0,
    multisigFee: 0.02,
  };

  switch (action) {
    case MULTISIG_ACTIONS.createMultisig: {
      txFees.networkFee = 0.00001;
      txFees.rentExempt = await program.provider.connection.getMinimumBalanceForRentExemption(
        program.account.multisigV2.size,
      );
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

  txFees.rentExempt = getAmountFromLamports(txFees.rentExempt);

  return txFees;
};

export const getIxNameFromMultisigTransaction = (transaction: MultisigTransaction, programIdl?: Idl) => {
  let ix: any;

  if (!programIdl) {
    switch (transaction.operation) {
      case OperationType.Transfer:
      case OperationType.TransferTokens:
        ix = 'transfer';
        break;
      default:
        ix = undefined;
    }
    return ix;
  }

  switch (transaction.operation) {
    // System Program
    case OperationType.Transfer:
      ix = 'transfer';
      break;
    // MEan Multisig
    case OperationType.EditMultisig:
      ix = programIdl.instructions.find(ix => ix.name === 'editMultisig');
      break;
    // SPL Token
    case OperationType.TransferTokens:
      ix = programIdl.instructions.find(ix => ix.name === 'transfer');
      break;
    case OperationType.SetAssetAuthority:
      ix = programIdl.instructions.find(ix => ix.name === 'setAuthority');
      break;
    case OperationType.CloseTokenAccount:
    case OperationType.DeleteAsset:
      ix = programIdl.instructions.find(ix => ix.name === 'closeAccount');
      break;
    // MSP
    case OperationType.TreasuryCreate:
      ix = programIdl.instructions.find(ix => ix.name === 'createTreasury');
      break;
    case OperationType.TreasuryStreamCreate:
      ix = programIdl.instructions.find(ix => ix.name === 'createStream');
      break;
    case OperationType.TreasuryRefreshBalance:
      ix = programIdl.instructions.find(ix => ix.name === 'refreshTreasuryData');
      break;
    case OperationType.TreasuryAddFunds:
      ix = programIdl.instructions.find(ix => ix.name === 'addFunds');
      break;
    case OperationType.TreasuryClose:
      ix = programIdl.instructions.find(ix => ix.name === 'closeTreasury');
      break;
    case OperationType.TreasuryWithdraw:
      ix = programIdl.instructions.find(ix => ix.name === 'treasuryWithdraw');
      break;
    case OperationType.StreamCreate:
      ix = programIdl.instructions.find(ix => ix.name === 'createStream');
      break;
    case OperationType.StreamAddFunds:
      ix = programIdl.instructions.find(ix => ix.name === 'allocate');
      break;
    case OperationType.StreamPause:
      ix = programIdl.instructions.find(ix => ix.name === 'pauseStream');
      break;
    case OperationType.StreamResume:
      ix = programIdl.instructions.find(ix => ix.name === 'resumeStream');
      break;
    case OperationType.StreamClose:
      ix = programIdl.instructions.find(ix => ix.name === 'closeStream');
      break;
    case OperationType.StreamWithdraw:
      ix = programIdl.instructions.find(ix => ix.name === 'withdraw');
      break;
    case OperationType.StreamTransferBeneficiary:
      ix = programIdl.instructions.find(ix => ix.name === 'transferStream');
      break;
    // CREDIX
    case OperationType.CredixDepositFunds:
      ix = programIdl.instructions.find(ix => ix.name === 'depositFunds');
      break;
    case OperationType.CredixWithdrawFunds:
    case OperationType.CredixRedeemWithdrawRequest:
      ix = programIdl.instructions.find(
        ix => ix.name === 'withdrawFunds' || ix.name === 'createWithdrawRequest' || ix.name === 'redeemWithdrawRequest',
      );
      break;
    case OperationType.CredixDepositTranche:
      ix = programIdl.instructions.find(ix => ix.name === 'depositTranche');
      break;
    case OperationType.CredixWithdrawTranche:
      ix = programIdl.instructions.find(ix => ix.name === 'withdrawTranche');
      break;
    default:
      ix = undefined;
  }

  if (typeof ix === 'string') {
    return ix.length ? ix : '';
  }

  return ix ? ix.name : '';
};

export const createAnchorProgram = (
  connection: Connection,
  programId: PublicKey,
  programIdl: Idl,
  commitment: Commitment = 'confirmed',
): Program<any> => {
  const opts = {
    skipPreflight: false,
    commitment: commitment || 'confirmed',
    preflightCommitment: commitment || 'confirmed',
    maxRetries: 3,
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
    };

    return new Program<SplToken>(programIdl as SplToken, programId, provider, coder());
  }

  return new Program(programIdl, programId, provider);
};

export const sentenceCase = (field: string): string => {
  const result = field.replace(/([A-Z])/g, ' $1');
  return result.charAt(0).toUpperCase() + result.slice(1);
};

export const parseSerializedTx = async (connection: Connection, base64Str: string): Promise<Transaction | null> => {
  try {
    if (!connection || !base64Str) {
      throw Error(`Parse Serialized Transaction: Invalid parameters.`);
    }

    const base64StrRegx = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;

    if (!base64StrRegx.test(base64Str)) {
      throw Error(`Parse Serialized Transaction: The parameter "base64Str" is not a valid base64 string.`);
    }

    const buffer = Buffer.from(base64Str, 'base64');

    let tx: Transaction | null = null;

    try {
      tx = Transaction.from(buffer);
    } catch (error) {
      // Errors above indicate that the bytes do not encode a transaction.
    }

    if (!tx) {
      const message = Message.from(buffer);
      tx = Transaction.populate(message);
    }

    return tx;
  } catch (err: any) {
    console.error(`Parse Serialized Transaction: ${err}`);
    return null;
  }
};

export const getMultisigInstructionSummary = (
  instruction: TransactionInstruction,
): MultisigTransactionInstructionInfo | null => {
  try {
    const ixAccInfos: InstructionAccountInfo[] = [];
    let accIndex = 0;

    for (const acc of instruction.keys) {
      ixAccInfos.push({
        index: accIndex,
        label: '',
        value: acc.pubkey.toBase58(),
      } as InstructionAccountInfo);

      accIndex++;
    }

    const bufferStr = Buffer.from(instruction.data).toString('hex');
    const bufferStrArray: string[] = [];

    for (let i = 0; i < bufferStr.length; i += 2) {
      bufferStrArray.push(bufferStr.substring(i, i + 2));
    }

    const ixInfo = {
      programId: instruction.programId.toBase58(),
      accounts: ixAccInfos,
      data: [
        {
          label: '',
          value: bufferStrArray.join(' '),
        } as InstructionDataInfo,
      ],
    } as MultisigTransactionInstructionInfo;

    return ixInfo;
  } catch (err: any) {
    console.error(`Multisig Instruction Summary: ${err}`);
    return null;
  }
};

export const isCredixFinance = (id: string) => {
  return id === CREDIX_PROGRAM_DEVNET.toBase58() || id === CREDIX_PROGRAM_MAINNET.toBase58();
};
