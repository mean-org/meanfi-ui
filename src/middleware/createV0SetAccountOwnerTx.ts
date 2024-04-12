import { type AuthorityType, Token } from '@solana/spl-token';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { composeV0TxWithPrioritizationFees, serializeTx } from './transactions';

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
      programId, // always TOKEN_PROGRAM_ID
      account, // mint account || token account
      newOwner, // new auth (you can pass `null` to close it)
      authType, // authority type, there are 4 types => 'MintTokens' | 'FreezeAccount' | 'AccountOwner' | 'CloseAccount'
      owner, // original auth
      [], // for multisig
    ),
  );

  const transaction = await composeV0TxWithPrioritizationFees(connection, owner, ixs);

  serializeTx(transaction);

  return transaction;
}
