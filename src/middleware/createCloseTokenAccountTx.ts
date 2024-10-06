import { TOKEN_PROGRAM_ID, Token, u64 } from '@solana/spl-token';
import {
  type AccountInfo,
  type Connection,
  type ParsedAccountData,
  PublicKey,
  type TransactionInstruction,
} from '@solana/web3.js';
import { WRAPPED_SOL_MINT_ADDRESS } from 'src/app-constants/common';
import { NATIVE_SOL } from 'src/app-constants/tokens';
import type { TokenAccountInfo } from 'src/models/accounts';
import { composeTxWithPrioritizationFees, serializeTx } from './transactions';

export async function hasTokenBalance(connection: Connection, tokenPubkey: PublicKey) {
  let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;

  try {
    accountInfo = (await connection.getParsedAccountInfo(tokenPubkey)).value;
  } catch (error) {
    console.error(error);
  }

  if (!accountInfo) {
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const info = (accountInfo as any).data.parsed.info as TokenAccountInfo;

  return info.mint !== NATIVE_SOL.address &&
    info.mint !== WRAPPED_SOL_MINT_ADDRESS &&
    (info.tokenAmount.uiAmount || 0) > 0
    ? true
    : false;
}

export async function createCloseTokenAccountTx(connection: Connection, tokenPubkey: PublicKey, owner: PublicKey) {
  const ixs: TransactionInstruction[] = [];
  let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;

  try {
    accountInfo = (await connection.getParsedAccountInfo(tokenPubkey)).value;
  } catch (error) {
    console.error(error);
  }

  if (!accountInfo) {
    return null;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Anything can go here
  const info = (accountInfo as any).data.parsed.info as TokenAccountInfo;
  const hasBalance = await hasTokenBalance(connection, tokenPubkey);

  // If the account has balance, burn the tokens
  if (hasBalance) {
    ixs.push(
      Token.createBurnInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(info.mint),
        tokenPubkey,
        owner,
        [],
        new u64(info.tokenAmount.amount),
      ),
    );
  }

  // Close the account
  ixs.push(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID, tokenPubkey, owner, owner, []));

  const transaction = await composeTxWithPrioritizationFees(connection, owner, ixs);

  serializeTx(transaction);

  return transaction;
}
