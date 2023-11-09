import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID, u64 } from '@solana/spl-token';
import {
  Connection,
  LAMPORTS_PER_SOL, PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from '@solana/web3.js';
import { BaseProposal } from 'models/multisig';
import { SOL_MINT } from './ids';
import { toTokenAmount } from './utils';
import { BN } from '@project-serum/anchor';
import { getMintDecimals, isTokenAccount } from './accountInfoGetters';
import getAccountInfoByAddress from './getAccountInfoByAddress';
import { consoleOut } from './ui';

export interface TransferTokensTxParams extends BaseProposal {
  amount: number;
  from: string;
  to: string;
}

/**
 * Builds a transaction to transfer tokens from a Safe to a beneficiary account
 * using the Token program. The beneficiary account must exist and it should be
 * either a wallet which already contains the corresponding ATA for the mint
 * or can also be an ATA account. No ATA will be auto-created!
 *
 * @param connection - A Solana connection
 * @param multisigAuthority - Public key of the sender holding the asset (Multisig Authority)
 * @param feePayer - Fee payer account
 * @param from - Public key of the source token account
 * @param to - Public key of the beneficiary wallet or ATA address
 * @param data - beneficiary, mint and token amount to be transferred
 */
export const createFundsTransferProposal = async (
  connection: Connection,
  multisigAuthority: PublicKey,
  feePayer: PublicKey,
  from: PublicKey,
  to: PublicKey,
  amount: number,
) => {
  let toAddress = to;
  let transferIx: TransactionInstruction;

  // Check from address
  const fromAccountInfo = await getAccountInfoByAddress(connection, from);
  if (!fromAccountInfo) {
    throw Error('Invalid from account');
  }

  // Set the mint & owner based on the from address
  const { accountInfo, parsedAccountInfo } = fromAccountInfo;
  const fromAccountOwner = parsedAccountInfo
    ? new PublicKey(parsedAccountInfo.data.parsed.info.owner)
    : accountInfo?.owner;
  const fromMintAddress = parsedAccountInfo ? new PublicKey(parsedAccountInfo.data.parsed.info.mint) : SOL_MINT;

  consoleOut('Account Owner:', fromAccountOwner.toBase58(), 'blue');
  consoleOut('Mint:', fromMintAddress.toBase58(), 'blue');

  if (fromMintAddress.equals(SOL_MINT)) {
    transferIx = SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: toAddress,
      lamports: new BN(amount * LAMPORTS_PER_SOL).toNumber(),
    });
  } else {
    // Check mint
    const mintAccountInfo = await getAccountInfoByAddress(connection, fromMintAddress);
    if (!mintAccountInfo) {
      throw Error('Invalid token mint account');
    }

    const decimals = getMintDecimals(mintAccountInfo.parsedAccountInfo);
    consoleOut('decimals:', decimals, 'blue');

    let beneficiaryToken = toAddress;

    // Check beneficiary address
    let isBeneficiaryAta = false;
    const beneficiaryAccountInfo = await getAccountInfoByAddress(connection, toAddress);
    if (beneficiaryAccountInfo?.parsedAccountInfo) {
      isBeneficiaryAta = isTokenAccount(beneficiaryAccountInfo.parsedAccountInfo);
    }

    if (!isBeneficiaryAta) {
      // beneficiary could be a wallet, lets check if it has ATA created
      beneficiaryToken = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        fromMintAddress,
        toAddress,
        true,
      );
      const beneficiaryTokenAccountInfo = await connection.getAccountInfo(beneficiaryToken);

      if (!beneficiaryTokenAccountInfo) {
        throw Error('Beneficiary token account not found');
      }
    }

    toAddress = beneficiaryToken;

    const tokenAmount = toTokenAmount(amount, decimals, true) as string;

    transferIx = Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      from,
      toAddress,
      multisigAuthority,
      [],
      new u64(tokenAmount),
    );
  }

  const tx = new Transaction().add(transferIx);
  tx.feePayer = feePayer;
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  return {
    tx,
  };
};
