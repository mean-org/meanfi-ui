import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Connection, ParsedAccountData, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { WRAPPED_SOL_MINT_ADDRESS } from "constants/common";
import { NATIVE_SOL } from "constants/tokens";
import { TokenAccountInfo } from "models/accounts";

export async function closeTokenAccountV0(
  connection: Connection,
  tokenPubkey: PublicKey,
  owner: PublicKey,
) {
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

  const info = (accountInfo as any).data['parsed']['info'] as TokenAccountInfo;

  // If the account has balance, burn the tokens
  if (
    info.mint !== NATIVE_SOL.address &&
    info.mint !== WRAPPED_SOL_MINT_ADDRESS &&
    (info.tokenAmount.uiAmount || 0) > 0
  ) {
    ixs.push(
      Token.createBurnInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(info.mint),
        tokenPubkey,
        owner,
        [],
        (info.tokenAmount.uiAmount || 0) * 10 ** info.tokenAmount.decimals,
      ),
    );
  }

  // Close the account
  ixs.push(
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      tokenPubkey,
      owner,
      owner,
      [],
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
