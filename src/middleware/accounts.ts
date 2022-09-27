import { ASSOCIATED_TOKEN_PROGRAM_ID, AuthorityType, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { TokenInfo } from "models/SolanaTokenInfo";
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
} from "@solana/web3.js";
import { WRAPPED_SOL_MINT_ADDRESS } from "../constants";
import { MEAN_TOKEN_LIST, NATIVE_SOL } from "../constants/tokens";
import { AccountsDictionary, AccountTokenParsedInfo, TokenAccountInfo, UserTokenAccount, UserTokensResponse } from "../models/accounts";
import { consoleOut } from "./ui";
import { findATokenAddress, getAmountFromLamports, shortenAddress } from "./utils";
import { TokenPrice } from "models/TokenPrice";

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
  let accountInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;

  try {
    accountInfo = (await connection.getParsedAccountInfo(tokenPubkey)).value;
  } catch (error) {
    console.error(error);
  }

  if (!accountInfo) { return null; }

  const info = (accountInfo as any).data["parsed"]["info"] as TokenAccountInfo;

  consoleOut('---- Parsed info ----', '', 'orange');
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

export async function fetchAccountTokens(
  connection: Connection,
  pubkey: PublicKey
) {
  let data;
  try {
    const { value } = await connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID });
    data = value.map((accountInfo: any) => {
      const parsedInfo = accountInfo.account.data.parsed.info as TokenAccountInfo;
      return { parsedInfo, pubkey: accountInfo.pubkey };
    });
    return data as AccountTokenParsedInfo[];
  } catch (error) {
    console.error(error);
  }
}

// Fetch all the owned token accounts with balances, also build duplicated token groups for later merge
export const getUserAccountTokens = async (
  connection: Connection,
  accountAddress: string,
  coinPrices: TokenPrice[] | null,
  splTokenList: UserTokenAccount[],
): Promise<UserTokensResponse | null> => {

  if (!connection || !accountAddress || !splTokenList || !coinPrices) {
    return null;
  }

  const getTokenByMintAddress = (address: string): TokenInfo | undefined => {
    const tokenFromTokenList = splTokenList
      ? splTokenList.find(t => t.address === address)
      : MEAN_TOKEN_LIST.find(t => t.address === address);
    if (tokenFromTokenList) {
      return tokenFromTokenList;
    }
    return undefined;
  }

  const getPriceByAddressOrSymbol = (address: string, symbol = ''): number => {
    if (!address || !coinPrices || coinPrices.length === 0) { return 0; }

    let item: TokenPrice | undefined;
    item = coinPrices.find(i => i.address === address);
    if (!item && symbol) {
      item = coinPrices.find(i => i.symbol === symbol);
    }

    return item ? (item.price || 0) : 0;

  }

  const updateAtaFlag = async (token: UserTokenAccount): Promise<boolean> => {
    const ata = await findATokenAddress(new PublicKey(accountAddress), new PublicKey(token.address));
    return ata && token.publicAddress && ata.toBase58() === token.publicAddress ? true : false;
  }

  const response: UserTokensResponse = {
    nativeBalance: 0,
    wSolBalance: 0,
    accountTokens: [],
    selectedAsset: undefined,
    userTokenAccouns: undefined,
    tokenAccountGroups: undefined
  };

  const intersectedList = new Array<UserTokenAccount>();
  const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
  const pk = new PublicKey(accountAddress);

  consoleOut('Fetching user account tokens for:', accountAddress, 'blue');

  // Fetch SOL balance.
  const solBalance = await connection.getBalance(pk);
  response.nativeBalance = getAmountFromLamports(solBalance);
  const sol: UserTokenAccount = {
    address: NATIVE_SOL.address,
    balance: getAmountFromLamports(solBalance),
    chainId: 0,
    decimals: NATIVE_SOL.decimals,
    name: NATIVE_SOL.name,
    symbol: NATIVE_SOL.symbol,
    publicAddress: accountAddress,
    tags: NATIVE_SOL.tags,
    logoURI: NATIVE_SOL.logoURI,
    valueInUsd: getAmountFromLamports(solBalance) * getPriceByAddressOrSymbol(NATIVE_SOL.address, 'SOL')
  };

  try {
    const accTks = await fetchAccountTokens(connection, pk);
    if (accTks) {

      consoleOut('fetched accountTokens:', accTks.map(i => {
        return {
          decimals: i.parsedInfo.tokenAmount.decimals,
          balance: i.parsedInfo.tokenAmount.uiAmount || 0,
          pubAddress: i.pubkey.toBase58(),
          mintAddress: i.parsedInfo.mint,
        };
      }), 'blue');

      response.userTokenAccouns = accTks;

      // Group the token accounts by mint.
      const groupedTokenAccounts = new Map<string, AccountTokenParsedInfo[]>();
      const tokenGroups = new Map<string, AccountTokenParsedInfo[]>();
      for (const ta of accTks) {
        const key = ta.parsedInfo.mint;
        const info = getTokenByMintAddress(key);
        const updatedTa = Object.assign({}, ta, {
          description: info ? `${info.name} (${info.symbol})` : ''
        });
        if (groupedTokenAccounts.has(key)) {
          const current = groupedTokenAccounts.get(key) as AccountTokenParsedInfo[];
          current.push(updatedTa);
        } else {
          groupedTokenAccounts.set(key, [updatedTa]);
        }
      }

      // Keep only groups with more than 1 item
      groupedTokenAccounts.forEach((item, key) => {
        if (item.length > 1) {
          tokenGroups.set(key, item);
        }
      });

      // Save groups for possible further merging
      if (tokenGroups.size > 0) {
        consoleOut('This account owns duplicated tokens:', tokenGroups, 'blue');
        response.tokenAccountGroups = tokenGroups;
      } else {
        response.tokenAccountGroups = undefined;
      }

      intersectedList.push(sol);
      // Create a list containing tokens for the user owned token accounts
      accTks.forEach(item => {
        const isTokenAccountInTheList = intersectedList.some(t => t.address === item.parsedInfo.mint);
        const tokenFromSplTokensCopy = splTokensCopy.find(t => t.address === item.parsedInfo.mint);
        if (tokenFromSplTokensCopy && !isTokenAccountInTheList) {
          tokenFromSplTokensCopy.owner = item.parsedInfo.owner;
          intersectedList.push(tokenFromSplTokensCopy);
        }
      });

      // Update balances in the mean token list
      accTks.forEach(item => {
        // Locate the token in intersectedList
        const tokenIndex = intersectedList.findIndex(i => i.address === item.parsedInfo.mint);
        if (tokenIndex !== -1) {
          const price = getPriceByAddressOrSymbol(intersectedList[tokenIndex].address, intersectedList[tokenIndex].symbol);
          const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
          const valueInUSD = balance * price;
          // If we didn't already filled info for this associated token address
          if (!intersectedList[tokenIndex].publicAddress) {
            // Add it
            intersectedList[tokenIndex].publicAddress = item.pubkey.toBase58();
            intersectedList[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
            intersectedList[tokenIndex].valueInUsd = valueInUSD;
          } else if (intersectedList[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
            // If we did and the publicAddress is different/new then duplicate this item with the new info
            const newItem = Object.assign({}, intersectedList[tokenIndex]) as UserTokenAccount;
            newItem.publicAddress = item.pubkey.toBase58();
            newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
            newItem.valueInUsd = valueInUSD;
            intersectedList.splice(tokenIndex + 1, 0, newItem);
          }
        }
      });

      // Update displayIndex and isAta flag
      let listIndex = 0;
      for await (const item of intersectedList) {
        item.displayIndex = listIndex;
        item.isAta = await updateAtaFlag(item);
        listIndex++;
      }

      // Sort by valueInUsd and then by token balance and then by token name
      intersectedList.sort((a, b) => {
        if((a.valueInUsd || 0) > (b.valueInUsd || 0)){
           return -1;
        } else if((a.valueInUsd || 0) < (b.valueInUsd || 0)){
           return 1;
        } else {
          return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
        }
      });

      const custom: UserTokenAccount[] = [];
      // Build a list with all owned token accounts not already in intersectedList as custom tokens
      accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
        if (!intersectedList.some(t => t.address === item.parsedInfo.mint)) {
          const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
          const price = getPriceByAddressOrSymbol(item.parsedInfo.mint);
          const valueInUsd = balance * price;
          const customToken: UserTokenAccount = {
            address: item.parsedInfo.mint,
            balance,
            chainId: 0,
            displayIndex: intersectedList.length + 1 + index,
            decimals: item.parsedInfo.tokenAmount.decimals,
            name: 'Custom account',
            symbol: shortenAddress(item.parsedInfo.mint),
            publicAddress: item.pubkey.toBase58(),
            tags: undefined,
            logoURI: undefined,
            valueInUsd
          };
          custom.push(customToken);
        }
      });

      // Sort by valueInUsd and then by token balance
      custom.sort((a, b) => {
        if((a.valueInUsd || 0) > (b.valueInUsd || 0)){
           return -1;
        } else if((a.valueInUsd || 0) < (b.valueInUsd || 0)){
           return 1;
        } else {
          return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
        }
      });

      // Finally add all owned token accounts as custom tokens
      const finalList = intersectedList.concat(custom);

      // Find Wrapped sol token account and update state with its balance
      const wSol = finalList.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
      response.wSolBalance = wSol ? wSol.balance || 0 : 0;

      // Update the state
      response.accountTokens = finalList;

    } else {
      splTokensCopy.forEach((item, index) => {
        item.valueInUsd = 0;
      });
      response.wSolBalance = 0;
      response.accountTokens = splTokensCopy;
      response.selectedAsset = splTokensCopy[0];
      consoleOut('No tokens found in account!', '', 'red');
    }
  } catch (error) {
    console.error(error);
    response.wSolBalance = 0;
    response.accountTokens = splTokensCopy;
    response.selectedAsset = splTokensCopy[0];
  }

  return response;
}
