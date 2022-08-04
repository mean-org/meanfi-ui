import { ASSOCIATED_TOKEN_PROGRAM_ID, AuthorityType, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  AccountInfo,
  Commitment,
  Connection,
  Keypair,
  ParsedAccountData,
  PublicKey,
  sendAndConfirmTransaction,
  TokenAmount,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js"
import { AccountTokenParsedInfo, TokenAccountInfo } from "../models/token";
import { consoleOut } from "./ui";
import { SOLANA_ACCOUNT_INCINERATOR, WRAPPED_SOL_MINT_ADDRESS } from "../constants";
import { NATIVE_SOL } from "./tokens";

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
  const hash = await connection.getLatestBlockhash("recent");
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
  const hash = await connection.getLatestBlockhash("recent");
  tx.recentBlockhash = hash.blockhash;

  return tx;
}

export async function closeTokenAccount(
  connection: Connection,
  tokenPubkey: PublicKey,
  owner: PublicKey,
) {
  const ixs: TransactionInstruction[] = [];
  const incinerator = new PublicKey(SOLANA_ACCOUNT_INCINERATOR);
  let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;

  try {
    accountInfo = (await connection.getParsedAccountInfo(tokenPubkey)).value;
  } catch (error) {
    console.error(error);
  }

  if (!accountInfo) { return null; }

  const info = (accountInfo as any).data["parsed"]["info"] as TokenAccountInfo;

  consoleOut('---- Parsed info ----', '', 'purple');
  consoleOut('tokenPubkey:', tokenPubkey.toBase58(), 'orange');
  consoleOut('mint:', info.mint, 'orange');
  consoleOut('owner:', info.owner, 'orange');
  consoleOut('decimals:', info.tokenAmount.decimals, 'orange');
  consoleOut('balance:', info.tokenAmount.uiAmount || 0, 'orange');

  // If the account has balance, burn the tokens
  if (info.mint !== NATIVE_SOL.address &&
      info.mint !== WRAPPED_SOL_MINT_ADDRESS &&
     (info.tokenAmount.uiAmount || 0) > 0) {
    ixs.push(
      Token.createBurnInstruction(
        TOKEN_PROGRAM_ID,
        new PublicKey(info.mint),
        tokenPubkey,
        owner,
        [],
        (info.tokenAmount.uiAmount || 0) * 10 ** info.tokenAmount.decimals
      )
    );
  }

  // Close the account
  ixs.push(
    Token.createCloseAccountInstruction(
      TOKEN_PROGRAM_ID,
      tokenPubkey,
      owner,
      owner,
      []
    )
  );

  const tx = new Transaction().add(...ixs);
  tx.feePayer = owner;
  const hash = await connection.getLatestBlockhash("recent");
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

export async function readAccountInfo(
  connection: Connection,
  address?: string
) {
  if (!connection || !address) { return null; }

  let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
  try {
    accInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
  } catch (error) {
    console.error(error);
    return null;
  }
  if (accInfo) {
    if (!(accInfo as any).data["parsed"]) {
      return accInfo as AccountInfo<Buffer>;
    } else {
      return accInfo as AccountInfo<ParsedAccountData>;
    }
  } else {
    return null;
  }
}

export const getTokenAccountBalanceByAddress = async (connection: Connection, tokenAddress: PublicKey | undefined | null): Promise<TokenAmount | null> => {
  if (!connection || !tokenAddress) return null;
  try {
    const tokenAmount = (await connection.getTokenAccountBalance(tokenAddress)).value;
    return tokenAmount;
  } catch (error) {
    consoleOut('getTokenAccountBalance failed for:', tokenAddress.toBase58(), 'red');
    return null;
  }
}
