import { MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
import {
  AccountLayout,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
  u64,
} from '@solana/spl-token';
import {
  AccountInfo,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import { BaseProposal } from 'models/multisig';
import { SOL_MINT } from './ids';
import { consoleOut } from './ui';
import { toTokenAmount } from './utils';

export interface TransferTokensTxParams extends BaseProposal {
  amount: number;
  from: string;
  to: string;
}

const getFromAccount = (fromAccountInfo: AccountInfo<Buffer>) => {
  return fromAccountInfo.owner.equals(SystemProgram.programId)
    ? fromAccountInfo
    : AccountLayout.decode(Buffer.from(fromAccountInfo.data));
};

const getFromMint = (fromAccountInfo: AccountInfo<Buffer>) => {
  const fromAccount = getFromAccount(fromAccountInfo);
  return fromAccountInfo.owner.equals(SystemProgram.programId) ? SOL_MINT : new PublicKey(fromAccount.mint);
};

export const createTransferTokensTx = async (
  connection?: Connection,
  publicKey?: PublicKey,
  selectedMultisig?: MultisigInfo,
  multisigClient?: MeanMultisig,
  data?: TransferTokensTxParams,
) => {
  if (!connection || !publicKey || !selectedMultisig || !multisigClient || !data) {
    throw Error('Invalid transaction data');
  }

  const fromAddress = new PublicKey(data.from);
  const fromAccountInfo = await connection.getAccountInfo(fromAddress);

  if (!fromAccountInfo) {
    throw Error('Invalid from token account');
  }

  const fromMintAddress = getFromMint(fromAccountInfo);
  let toAddress = new PublicKey(data.to);
  let transferIx: TransactionInstruction;
  const ixs: TransactionInstruction[] = [];

  if (fromMintAddress.equals(SOL_MINT)) {
    transferIx = SystemProgram.transfer({
      fromPubkey: fromAddress,
      toPubkey: toAddress,
      lamports: new BN(data.amount * LAMPORTS_PER_SOL).toNumber(),
    });
  } else {
    const mintInfo = await connection.getAccountInfo(fromMintAddress);

    if (!mintInfo) {
      throw Error('Invalid token mint account');
    }

    const mint = MintLayout.decode(Buffer.from(mintInfo.data));

    const toAccountATA = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      fromMintAddress,
      toAddress,
      true,
    );
    consoleOut('toAccountATA:', toAccountATA.toBase58(), 'blue');

    const toAccountATAInfo = await connection.getAccountInfo(toAccountATA);

    if (!toAccountATAInfo) {
      ixs.push(
        Token.createAssociatedTokenAccountInstruction(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          fromMintAddress,
          toAccountATA,
          toAddress,
          publicKey,
        ),
      );
    }

    toAddress = toAccountATA;

    const tokenAmount = toTokenAmount(data.amount, mint.decimals, true) as string;

    transferIx = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      fromAddress,
      toAddress,
      selectedMultisig.authority,
      [],
      new u64(tokenAmount),
    );
  }

  const tx = new Transaction().add(transferIx);
  tx.feePayer = publicKey;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  return {
    tx,
    preInstructions: ixs,
  };
};
