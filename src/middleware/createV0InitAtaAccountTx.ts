import { ASSOCIATED_TOKEN_PROGRAM_ID, AccountLayout, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import {
  type Connection,
  Keypair,
  type PublicKey,
  type Signer,
  SystemProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import { composeV0TxWithPrioritizationFees, serializeTx } from './transactions';

export async function createV0InitAtaAccountTx(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  createAta = true,
) {
  const signers: Signer[] = [];
  const ixs: TransactionInstruction[] = [];

  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
    true,
  );

  const ataInfo = await connection.getAccountInfo(associatedAddress);

  if (!ataInfo && createAta) {
    ixs.push(
      Token.createAssociatedTokenAccountInstruction(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        mint,
        associatedAddress,
        owner,
        owner,
      ),
    );
  } else {
    const tokenKeypair = Keypair.generate();
    const tokenAccount = tokenKeypair.publicKey;

    ixs.push(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: tokenAccount,
        programId: TOKEN_PROGRAM_ID,
        lamports: await Token.getMinBalanceRentForExemptAccount(connection),
        space: AccountLayout.span,
      }),
      Token.createInitAccountInstruction(TOKEN_PROGRAM_ID, mint, tokenAccount, owner),
    );

    signers.push(tokenKeypair);
  }

  const transaction = await composeV0TxWithPrioritizationFees(connection, owner, ixs);

  if (signers) {
    transaction.sign(signers);
  }

  serializeTx(transaction);

  return transaction;
}
