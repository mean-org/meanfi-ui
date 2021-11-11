import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AccountInfo, Commitment, Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js"
import { AccountTokenParsedInfo } from "../models/token";

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
  let ixs: TransactionInstruction[] = [];

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

  for (let token of mergeGroup.filter(a => !a.pubkey.equals(associatedAddress))) {
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

  let tx = new Transaction().add(...ixs);
  tx.feePayer = owner;
  let hash = await connection.getRecentBlockhash("recent");
  tx.recentBlockhash = hash.blockhash;

  return tx;
}
