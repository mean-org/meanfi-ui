import { ASSOCIATED_TOKEN_PROGRAM_ID, AuthorityType, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Commitment, Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction, TransactionInstruction } from "@solana/web3.js"
import { AccountTokenParsedInfo } from "../models/token";

export type ProgramAccounts = {
  pubkey: PublicKey;
  owner: PublicKey;
  executable: PublicKey;
  upgradeAuthority: PublicKey;
  size: number;
}

export type AccountsDictionary = {
  publicKey: PublicKey;
  account: AccountInfo<Buffer>;
  owner?: PublicKey;
}

export async function getMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment
): Promise<Array<null | AccountsDictionary>> {

  const keys: PublicKey[][] = [];
  let tempKeys: PublicKey[] = [];

  publicKeys.forEach((k) => {
    if (tempKeys.length >= 100) {
      keys.push(tempKeys);
      tempKeys = [];
    }
    tempKeys.push(k)
  });

  if (tempKeys.length > 0) {
    keys.push(tempKeys);
  }

  const accounts: Array<null | {
    executable: any
    owner: PublicKey
    lamports: any
    data: Buffer
  }> = []

  const resArray: { [key: number]: any } = {};

  await Promise.all(
    keys.map(async (key, index) => {
      const res = await connection.getMultipleAccountsInfo(key, commitment);
      resArray[index] = res;
    })
  );

  Object.keys(resArray)
    .sort((a, b) => parseInt(a) - parseInt(b))
    .forEach((itemIndex) => {
      const res = resArray[parseInt(itemIndex)]
      for (const account of res) {
        accounts.push(account)
      }
    });

  return accounts.map((account, idx) => {
    if (account === null) {
      return null
    }
    return {
      publicKey: publicKeys[idx],
      account
    }
  });
}

export async function createTokenMergeTx(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
  mergeGroup: AccountTokenParsedInfo[]
) {
  const ixs: TransactionInstruction[] = [];

  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
    true
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
        owner
      )
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
        (token.parsedInfo.tokenAmount.uiAmount || 0) * 10 ** token.parsedInfo.tokenAmount.decimals
      ),
      Token.createCloseAccountInstruction(
        TOKEN_PROGRAM_ID,
        token.pubkey,
        owner,
        owner,
        []
      )
    );
  }

  const tx = new Transaction().add(...ixs);
  tx.feePayer = owner;
  const hash = await connection.getRecentBlockhash("recent");
  tx.recentBlockhash = hash.blockhash;

  return tx;
}

export async function createAtaAccount(
  connection: Connection,
  mint: PublicKey,
  owner: PublicKey,
) {
  const ixs: TransactionInstruction[] = [];

  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner,
    true
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
        owner
      )
    );
  }

  const tx = new Transaction().add(...ixs);
  tx.feePayer = owner;
  const hash = await connection.getRecentBlockhash("recent");
  tx.recentBlockhash = hash.blockhash;

  return tx;
}

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
  owner: Keypair,
  account: PublicKey,
  newOwner: PublicKey,
  programId: PublicKey,
  authType: AuthorityType,
): Promise<boolean> {
  return await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      Token.createSetAuthorityInstruction(
        programId,        // always TOKEN_PROGRAM_ID
        account,          // mint account || token account
        newOwner,         // new auth (you can pass `null` to close it)
        authType,         // authority type, there are 4 types => 'MintTokens' | 'FreezeAccount' | 'AccountOwner' | 'CloseAccount'
        owner.publicKey,  // original auth
        []                // for multisig
      )
    ),
    [owner]
  )
  .then(() => true)
  .catch(error => {
    console.error(error);
    return false;
  });
}
