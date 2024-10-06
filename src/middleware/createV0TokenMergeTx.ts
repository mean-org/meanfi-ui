import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, Token } from '@solana/spl-token';
import type { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import type { AccountTokenParsedInfo } from 'src/models/accounts';
import { composeV0TxWithPrioritizationFees, serializeTx } from './transactions';

export async function createV0TokenMergeTx(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  mergeGroup: AccountTokenParsedInfo[],
) {
  const ixs: TransactionInstruction[] = [];

  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
    true,
  );

  const ataInfo = await connection.getAccountInfo(associatedAddress);

  if (ataInfo === null) {
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
  }

  for (const token of mergeGroup.filter(a => !a.pubkey.equals(associatedAddress))) {
    ixs.push(
      Token.createTransferInstruction(
        TOKEN_PROGRAM_ID,
        token.pubkey,
        associatedAddress,
        owner,
        [],
        (token.parsedInfo.tokenAmount.uiAmount || 0) * 10 ** token.parsedInfo.tokenAmount.decimals,
      ),
      Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID, token.pubkey, owner, owner, []),
    );
  }

  const transaction = await composeV0TxWithPrioritizationFees(connection, owner, ixs);

  serializeTx(transaction);

  return transaction;
}
