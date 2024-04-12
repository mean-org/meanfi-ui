import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import {
  type Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  SystemProgram,
  type Transaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { WRAPPED_SOL_MINT } from './ids';
import { composeTxWithPrioritizationFees } from './transactions';

export const wrapSol = async (connection: Connection, from: PublicKey, amount: number): Promise<Transaction> => {
  const ixs: TransactionInstruction[] = [];
  const newAccount = Keypair.generate();
  const minimumWrappedAccountBalance = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);

  ixs.push(
    SystemProgram.createAccount({
      fromPubkey: from,
      newAccountPubkey: newAccount.publicKey,
      lamports: minimumWrappedAccountBalance + amount * LAMPORTS_PER_SOL,
      space: AccountLayout.span,
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, WRAPPED_SOL_MINT, newAccount.publicKey, from),
  );

  const aTokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    from,
    true,
  );

  const accountInfo = await connection.getAccountInfo(aTokenKey);

  if (accountInfo === null) {
    ixs.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        WRAPPED_SOL_MINT,
        aTokenKey,
        from,
        from,
      ),
    );
  }

  ixs.push(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      newAccount.publicKey,
      aTokenKey,
      from,
      [],
      amount * LAMPORTS_PER_SOL,
    ),
    Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID, newAccount.publicKey, from, from, []),
  );

  const transaction = await composeTxWithPrioritizationFees(connection, from, ixs, [newAccount]);

  return transaction;
};
