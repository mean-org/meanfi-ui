import {
  Connection,
  Keypair,
  PublicKey,
  Signer,
  SystemProgram,
  Transaction,

} from "@solana/web3.js";

import { initializeAccount } from "@project-serum/serum/lib/token-instructions";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { cloneDeep } from "lodash-es";
import { ACCOUNT_LAYOUT } from "../../utils/layouts";
import { NATIVE_SOL, TOKENS } from "./tokens";
import { TokenInfo } from "./types";

export const getTokenByMintAddress = (address: string): TokenInfo | null => {

  if (address === NATIVE_SOL.address) {
    return cloneDeep(NATIVE_SOL);
  }

  let token = null;

  for (const symbol of Object.keys(TOKENS)) {
    const info = cloneDeep(TOKENS[symbol]);

    if (info.address === address) {
      token = info;
    }
  }

  return token;
}

export const createTokenAccountIfNotExist = async (
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  mintAddress: string,
  lamports: number | null,
  transaction: Transaction,
  signer: Array<Signer>

) => {

  let publicKey;

  if (account) {
    publicKey = new PublicKey(account);
  } else {
    publicKey = await createProgramAccountIfNotExist(
      connection,
      account,
      owner,
      TOKEN_PROGRAM_ID,
      lamports,
      ACCOUNT_LAYOUT,
      transaction,
      signer
    );

    transaction.add(
      initializeAccount({
        account: publicKey,
        mint: new PublicKey(mintAddress),
        owner,
      })
    );
  }

  return publicKey;
}

export const createProgramAccountIfNotExist = async (
  connection: Connection,
  account: string | undefined | null,
  owner: PublicKey,
  programId: PublicKey,
  lamports: number | null,
  layout: any,
  transaction: Transaction,
  signer: Signer[]

) => {

  let publicKey;

  if (account) {
    publicKey = new PublicKey(account);
  } else {
    const newAccount = Keypair.generate();
    publicKey = newAccount.publicKey;

    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: owner,
        newAccountPubkey: publicKey,
        lamports:
          lamports ??
          (await connection.getMinimumBalanceForRentExemption(layout.span)),
        space: layout.span,
        programId,
      })
    );

    signer.push(newAccount);
  }

  return publicKey;
}
