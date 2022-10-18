import { Metaplex } from "@metaplex-foundation/js";
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
} from "@solana/web3.js";
import {
  AccountsDictionary,
  AccountTokenParsedInfo,
  TokenAccountInfo,
  TokenSelectorListWithBalances,
  UserTokenAccount,
  UserTokensResponse
} from "models/accounts";
import { TokenInfo } from "models/SolanaTokenInfo";
import { TokenPrice } from "models/TokenPrice";
import { WRAPPED_SOL_MINT_ADDRESS } from "../constants";
import { MEAN_TOKEN_LIST, NATIVE_SOL } from "../constants/tokens";
import { consoleOut } from "./ui";
import { findATokenAddress, getAmountFromLamports, shortenAddress } from "./utils";

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
  return sendAndConfirmTransaction(
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

const updateAtaFlag = async (token: UserTokenAccount, owner: string): Promise<boolean> => {
  const ata = await findATokenAddress(new PublicKey(owner), new PublicKey(token.address));
  return ata && token.publicAddress && ata.toBase58() === token.publicAddress ? true : false;
}

const getTokenByMintAddress = (address: string, list: UserTokenAccount[]): TokenInfo | undefined => {
  const tokenFromTokenList = list
    ? list.find(t => t.address === address)
    : MEAN_TOKEN_LIST.find(t => t.address === address);
  if (tokenFromTokenList) {
    return tokenFromTokenList;
  }
  return undefined;
}

const getPriceByAddressOrSymbol = (prices: TokenPrice[] | null, address: string, symbol = ''): number => {
  if (!address || !prices || prices.length === 0) { return 0; }

  let item: TokenPrice | undefined;
  item = prices.find(i => i.address === address);
  if (!item && symbol) {
    item = prices.find(i => i.symbol === symbol);
  }

  return item ? (item.price || 0) : 0;
}

const sortTokenAccountsByUsdValue = (tokens: UserTokenAccount[]) => {
  const sortedList = [...tokens].sort((a, b) => {
    if((a.valueInUsd || 0) > (b.valueInUsd || 0)){
       return -1;
    } else if((a.valueInUsd || 0) < (b.valueInUsd || 0)){
       return 1;
    } else {
      return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
    }
  });
  return sortedList;
}

const sortTokenAccountsByBalance = (tokens: UserTokenAccount[]) => {
  const sortedList = [...tokens].sort((a, b) => {
    if ((b.balance || 0) < (a.balance || 0)) {
       return -1;
    } else if((b.balance || 0) > (a.balance || 0)){
       return 1;
    } else {
      return 0;
    }
  });
  return sortedList;
}

const getWrappedSolBalance = (list: UserTokenAccount[]) => {
  const wSol = list.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
  return wSol ? wSol.balance || 0 : 0;
}

const getGroupedTokenAccounts = (accTks: AccountTokenParsedInfo[], list: UserTokenAccount[]) => {
  const taGroups = new Map<string, AccountTokenParsedInfo[]>();
  for (const ta of accTks) {
    const key = ta.parsedInfo.mint;
    const info = getTokenByMintAddress(key, list);
    const updatedTa = Object.assign({}, ta, {
      description: info ? `${info.name} (${info.symbol})` : ''
    });
    if (taGroups.has(key)) {
      const current = taGroups.get(key) as AccountTokenParsedInfo[];
      current.push(updatedTa);
    } else {
      taGroups.set(key, [updatedTa]);
    }
  }
  const groupsWithDuplicates = new Map<string, AccountTokenParsedInfo[]>();
  // Keep only groups with more than 1 item
  taGroups.forEach((item, key) => {
    if (item.length > 1) {
      groupsWithDuplicates.set(key, item);
    }
  });

  if (groupsWithDuplicates.size > 0) {
    consoleOut('This account owns duplicated tokens:', groupsWithDuplicates, 'blue');
    return groupsWithDuplicates;
  } else {
    return undefined;
  }
}

const getTokenListForOwnedTokenAccounts = (accTks: AccountTokenParsedInfo[], list: UserTokenAccount[]) => {
  const newTokenAccountList = new Array<UserTokenAccount>();
  accTks.forEach(item => {
    const tokenFromMeanTokenList = list.find(t => t.address === item.parsedInfo.mint);
    const isTokenAccountInNewList = newTokenAccountList.some(t => t.address === item.parsedInfo.mint);
    if (tokenFromMeanTokenList && !isTokenAccountInNewList) {
      tokenFromMeanTokenList.owner = item.parsedInfo.owner;
      newTokenAccountList.push(tokenFromMeanTokenList);
    }
  });
  return newTokenAccountList;
}

const updateTokenAccountBalancesInTokenList = (accTks: AccountTokenParsedInfo[], list: UserTokenAccount[], prices: TokenPrice[] | null) => {
  const listCopy = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
  for (const item of accTks) {
    // Locate the token in input list
    const tokenIndex = listCopy.findIndex(i => i.address === item.parsedInfo.mint);
    if (tokenIndex !== -1) {
      const price = getPriceByAddressOrSymbol(prices, listCopy[tokenIndex].address, listCopy[tokenIndex].symbol);
      const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
      const valueInUSD = balance * price;
      // If we didn't already filled info for this associated token address
      if (!listCopy[tokenIndex].publicAddress) {
        // Add it
        listCopy[tokenIndex].publicAddress = item.pubkey.toBase58();
        listCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount || 0;
        listCopy[tokenIndex].valueInUsd = valueInUSD;
      } else if (listCopy[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
        // If we did and the publicAddress is different/new then duplicate this item with the new info
        const newItem = Object.assign({}, listCopy[tokenIndex]);
        newItem.publicAddress = item.pubkey.toBase58();
        newItem.balance = item.parsedInfo.tokenAmount.uiAmount || 0;
        newItem.valueInUsd = valueInUSD;
        listCopy.splice(tokenIndex + 1, 0, newItem);
      }
    }
  }
  return listCopy;
}

// Fetch all the token accounts that the user hold, also build duplicated token groups for later merge
export const getUserAccountTokens = async (
  connection: Connection,
  accountAddress: string,
  coinPrices: TokenPrice[] | null,
  splTokenList: UserTokenAccount[],
): Promise<UserTokensResponse | null> => {

  const response: UserTokensResponse = {
    nativeBalance: 0,
    wSolBalance: 0,
    accountTokens: [],
    selectedAsset: undefined,
    userTokenAccouns: undefined,
    tokenAccountGroups: undefined
  };

  const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
  const pk = new PublicKey(accountAddress);

  consoleOut('calling getUserAccountTokens() for:', accountAddress, 'blue');

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
    valueInUsd: getAmountFromLamports(solBalance) * getPriceByAddressOrSymbol(coinPrices, NATIVE_SOL.address, 'SOL')
  };

  try {
    const accTks = await fetchAccountTokens(connection, pk);
    if (!accTks) {
      splTokensCopy.forEach((item, index) => {
        item.valueInUsd = 0;
      });
      response.wSolBalance = 0;
      response.accountTokens = splTokensCopy;
      response.selectedAsset = splTokensCopy[0];
      consoleOut('No tokens found in account!', '', 'red');
      return response;
    }

    consoleOut('fetched accountTokens:', accTks.map(i => {
      return {
        decimals: i.parsedInfo.tokenAmount.decimals,
        balance: `${i.parsedInfo.tokenAmount.uiAmount}`,
        pubAddress: i.pubkey.toBase58(),
        mintAddress: i.parsedInfo.mint,
      };
    }), 'blue');

    response.userTokenAccouns = accTks;
    response.tokenAccountGroups = getGroupedTokenAccounts(accTks, splTokenList);

    const intersectedList = getTokenListForOwnedTokenAccounts(accTks, splTokenList);
    intersectedList.push(sol);

    // Update balances in the mean token list
    const balancesUpdated = updateTokenAccountBalancesInTokenList(accTks, intersectedList, coinPrices);

    // Update displayIndex and isAta flag
    let listIndex = 0;
    for await (const item of balancesUpdated) {
      item.displayIndex = listIndex;
      item.isAta = await updateAtaFlag(item, accountAddress);
      listIndex++;
    }

    const sortedList = sortTokenAccountsByUsdValue(balancesUpdated);

    const custom: UserTokenAccount[] = [];
    // Build a list with all token accounts holded by the user not already in sortedList as custom tokens
    accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
      if (!sortedList.some(t => t.address === item.parsedInfo.mint)) {
        const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
        const price = getPriceByAddressOrSymbol(coinPrices, item.parsedInfo.mint);
        const valueInUsd = balance * price;
        const customToken: UserTokenAccount = {
          address: item.parsedInfo.mint,
          balance,
          chainId: 0,
          displayIndex: sortedList.length + 1 + index,
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
    const sortedCustomTokenList = sortTokenAccountsByUsdValue(custom);

    // Finally add all token accounts holded by the user as custom tokens when they cannot be identified
    const finalList = sortedList.concat(sortedCustomTokenList);

    // Find Wrapped sol token account and update state with its balance
    response.wSolBalance = getWrappedSolBalance(finalList);

    // Update the state
    response.accountTokens = finalList;

  } catch (error) {
    console.error(error);
    response.wSolBalance = 0;
    response.accountTokens = splTokensCopy;
    response.selectedAsset = splTokensCopy[0];
  }

  return response;
}

// Get a list of tokens along with a balance map optionally including only the tokens that the user holds
export const getTokensWithBalances = async (
  connection: Connection,
  accountAddress: string,
  coinPrices: TokenPrice[] | null,
  splTokenList: UserTokenAccount[],
  onlyAccountAssets = true
): Promise<TokenSelectorListWithBalances | null> => {

  const response: TokenSelectorListWithBalances = {
    balancesMap: {},
    tokenList: []
  };

  const splTokensCopy = JSON.parse(JSON.stringify(splTokenList)) as UserTokenAccount[];
  const pk = new PublicKey(accountAddress);

  consoleOut('calling getTokensWithBalances() for:', accountAddress, 'blue');

  // Fetch SOL balance.
  const solBalance = await connection.getBalance(pk);
  const nativeBalance = getAmountFromLamports(solBalance);
  const sol: UserTokenAccount = {
    address: NATIVE_SOL.address,
    balance: nativeBalance,
    chainId: 0,
    decimals: NATIVE_SOL.decimals,
    name: NATIVE_SOL.name,
    symbol: NATIVE_SOL.symbol,
    publicAddress: accountAddress,
    tags: NATIVE_SOL.tags,
    logoURI: NATIVE_SOL.logoURI,
    valueInUsd: nativeBalance * getPriceByAddressOrSymbol(coinPrices, NATIVE_SOL.address, 'SOL')
  };

  try {
    const accTks = await fetchAccountTokens(connection, pk);
    if (!accTks) {
      const emptyMap: any = {};
      for (const t of splTokenList) {
        emptyMap[t.address] = 0;
      }
      emptyMap[NATIVE_SOL.address] = nativeBalance;
      response.balancesMap = emptyMap;
      response.tokenList = splTokensCopy;
      consoleOut('No tokens found in account!', '', 'red');
      return response;
    }

    const intersectedList = onlyAccountAssets
      ? getTokenListForOwnedTokenAccounts(accTks, splTokenList)
      : splTokensCopy;

    if (!intersectedList.some(l => l.address === sol.address)) {
      intersectedList.push(sol);
    }

    // Update balances in the mean token list
    const balancesUpdated = updateTokenAccountBalancesInTokenList(accTks, intersectedList, coinPrices);

    const sortedList = sortTokenAccountsByUsdValue(balancesUpdated);

    const custom: UserTokenAccount[] = [];
    // Build a list with all token accounts holded by the user not already in sortedList as custom tokens
    accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
      if (!sortedList.some(t => t.address === item.parsedInfo.mint)) {
        const balance = item.parsedInfo.tokenAmount.uiAmount || 0;
        const price = getPriceByAddressOrSymbol(coinPrices, item.parsedInfo.mint);
        const valueInUsd = balance * price;
        const customToken: UserTokenAccount = {
          address: item.parsedInfo.mint,
          balance,
          chainId: 0,
          displayIndex: sortedList.length + 1 + index,
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
    const sortedCustomTokenList = sortTokenAccountsByBalance(custom);

    // Finally add all token accounts holded by the user not already in sortedList as custom tokens
    const finalList = sortedList.concat(sortedCustomTokenList);

    // Sort by token balance
    response.tokenList = finalList;

    const balancesMap: any = {};
    accTks.forEach(item => {
      balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount || 0;
    });
    balancesMap[NATIVE_SOL.address] = nativeBalance;
    response.balancesMap = balancesMap;

  } catch (error) {
    console.error(error);
    const emptyMap: any = {};
    for (const t of splTokenList) {
      emptyMap[t.address] = 0;
    }
    emptyMap[NATIVE_SOL.address] = nativeBalance;
    response.balancesMap = emptyMap;
    response.tokenList = splTokensCopy;
  }

  return response;
}

export const getAccountNFTs = async (
  connection: Connection,
  accountAddress: string,
) => {
  const owner = new PublicKey(accountAddress);
  const metaplex = new Metaplex(connection);

  consoleOut('reading NFTs for:', accountAddress, 'blue');
  const myNfts = await metaplex.nfts().findAllByOwner({
    owner: owner
  });
  return myNfts;
}
