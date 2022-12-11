import { DEFAULT_EXPIRATION_TIME_SECONDS, MeanMultisig, MultisigInfo } from '@mean-dao/mean-multisig-sdk';
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
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import { OperationType } from 'models/enums';
import { BaseProposal } from 'models/multisig';
import { NATIVE_SOL_MINT } from './ids';
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
  return fromAccountInfo.owner.equals(SystemProgram.programId) ? NATIVE_SOL_MINT : new PublicKey(fromAccount.mint);
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
  let transferIx = SystemProgram.transfer({
    fromPubkey: fromAddress,
    toPubkey: toAddress,
    lamports: new BN(data.amount * LAMPORTS_PER_SOL).toNumber(),
  });

  const ixs: TransactionInstruction[] = [];

  if (!fromMintAddress.equals(NATIVE_SOL_MINT)) {
    const mintInfo = await connection.getAccountInfo(fromMintAddress);

    if (!mintInfo) {
      throw Error('Invalid token mint account');
    }

    const mint = MintLayout.decode(Buffer.from(mintInfo.data));
    const toAccountInfo = await connection.getAccountInfo(toAddress);

    if (!toAccountInfo || !toAccountInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      const toAccountATA = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMintAddress,
        toAddress,
        true,
      );

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
    }

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

  const expirationTime = parseInt((Date.now() / 1_000 + DEFAULT_EXPIRATION_TIME_SECONDS).toString());

  const tx = await multisigClient.createTransaction(
    publicKey,
    data.proposalTitle === '' ? 'Propose funds transfer' : data.proposalTitle,
    '', // description
    new Date(expirationTime * 1_000),
    fromMintAddress.equals(NATIVE_SOL_MINT) ? OperationType.Transfer : OperationType.TransferTokens,
    selectedMultisig.id,
    transferIx.programId,
    transferIx.keys,
    transferIx.data,
    ixs,
  );

  return tx;
};
