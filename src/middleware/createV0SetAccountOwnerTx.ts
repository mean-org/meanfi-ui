import { AuthorityType, Token } from "@solana/spl-token";
import { Connection, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";

/**
 * Assign a new owner to the account
 *
 * @param owner Owner of the token account
 * @param account Public key of the mint/token account
 * @param newOwner New owner of the mint/token account
 * @param programId Token program ID
 * @param authType Authority type
 */
export async function setAccountOwner(
  connection: Connection,
  owner: PublicKey,
  account: PublicKey,
  newOwner: PublicKey,
  programId: PublicKey,
  authType: AuthorityType,
) {

  const ixs: TransactionInstruction[] = [];

  ixs.push(
    Token.createSetAuthorityInstruction(
      programId,  // always TOKEN_PROGRAM_ID
      account,    // mint account || token account
      newOwner,   // new auth (you can pass `null` to close it)
      authType,   // authority type, there are 4 types => 'MintTokens' | 'FreezeAccount' | 'AccountOwner' | 'CloseAccount'
      owner,      // original auth
      [],         // for multisig
    ),
  );

  // Get the latest blockhash
  const blockhash = await connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);

  // create v0 compatible message
  const messageV0 = new TransactionMessage({
    payerKey: owner,
    recentBlockhash: blockhash,
    instructions: ixs,
  }).compileToV0Message();

  // Create a VersionedTransaction passing the v0 compatible message
  const transaction = new VersionedTransaction(messageV0);

  console.log('transaction:', transaction);

  return transaction;
}
