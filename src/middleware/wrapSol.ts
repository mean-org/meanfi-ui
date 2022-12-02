import { AccountLayout, ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { WRAPPED_SOL_MINT } from "./ids";

export const wrapSol = async (
  connection: Connection,
  from: PublicKey,
  amount: number
): Promise<Transaction> => {

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
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      newAccount.publicKey,
      from
    )
  );

  const aTokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    from,
    true
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
        from
      )
    );
  }

  ixs.push(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      newAccount.publicKey,
      aTokenKey,
      from,
      [],
      amount * LAMPORTS_PER_SOL
    ),
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      newAccount.publicKey,
      from,
      from,
      []
    )
  );

  const tx = new Transaction().add(...ixs);
  tx.feePayer = from;
  // Get the latest blockhash
  const blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);
  tx.recentBlockhash = blockhash;
  tx.partialSign(newAccount);

  return tx;
}

export const wrapSolV0 = async (
  connection: Connection,
  from: PublicKey,
  amount: number
): Promise<VersionedTransaction> => {

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
    Token.createInitAccountInstruction(
      TOKEN_PROGRAM_ID,
      WRAPPED_SOL_MINT,
      newAccount.publicKey,
      from
    )
  );

  const aTokenKey = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    WRAPPED_SOL_MINT,
    from,
    true
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
        from
      )
    );
  }

  ixs.push(
    Token.createTransferInstruction(
      TOKEN_PROGRAM_ID,
      newAccount.publicKey,
      aTokenKey,
      from,
      [],
      amount * LAMPORTS_PER_SOL
    ),
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      newAccount.publicKey,
      from,
      from,
      []
    )
  );

  // Get the latest blockhash
  const blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);

  // create v0 compatible message
  const messageV0 = new TransactionMessage({
    payerKey: from,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  // Create a VersionedTransaction passing the v0 compatible message
  const transaction = new VersionedTransaction(messageV0);

  transaction.addSignature(newAccount.publicKey, newAccount.secretKey);

  return transaction;
}
