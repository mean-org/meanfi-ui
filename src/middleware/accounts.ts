import { Metaplex } from '@metaplex-foundation/js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  type AccountInfo,
  type Commitment,
  type Connection,
  type ParsedAccountData,
  PublicKey,
  type TokenAmount,
} from '@solana/web3.js';
import type { TokenInfo } from 'models/SolanaTokenInfo';
import type { TokenPrice } from 'models/TokenPrice';
import type {
  AccountTokenParsedInfo,
  AccountsDictionary,
  TokenAccountInfo,
  TokenSelectorListWithBalances,
  UserTokenAccount,
  UserTokensResponse,
} from 'models/accounts';
import { WRAPPED_SOL_MINT_ADDRESS } from '../constants';
import { MEAN_TOKEN_LIST, NATIVE_SOL } from '../constants/tokens';
import getPriceByAddressOrSymbol from './getPriceByAddressOrSymbol';
import { consoleOut, isLocal } from './ui';
import { findATokenAddress, getAmountFromLamports, shortenAddress } from './utils';

//** Account helpers

export async function getMultipleAccounts(
  connection: Connection,
  publicKeys: PublicKey[],
  commitment?: Commitment,
): Promise<Array<null | AccountsDictionary>> {
  const keys: PublicKey[][] = [];
  let tempKeys: PublicKey[] = [];

  publicKeys.forEach(k => {
    if (tempKeys.length >= 100) {
      keys.push(tempKeys);
      tempKeys = [];
    }
    tempKeys.push(k);
  });

  if (tempKeys.length > 0) {
    keys.push(tempKeys);
  }

  const accounts: Array<null | {
    executable: any;
    owner: PublicKey;
    lamports: any;
    data: Buffer;
  }> = [];

  const resArray: { [key: number]: any } = {};

  await Promise.all(
    keys.map(async (key, index) => {
      const res = await connection.getMultipleAccountsInfo(key, commitment);
      resArray[index] = res;
    }),
  );

  Object.keys(resArray)
    .sort((a, b) => Number.parseInt(a) - Number.parseInt(b))
    .forEach(itemIndex => {
      const res = resArray[Number.parseInt(itemIndex)];
      for (const account of res) {
        accounts.push(account);
      }
    });

  return accounts.map((account, idx) => {
    if (account === null) {
      return null;
    }
    return {
      publicKey: publicKeys[idx],
      account,
    };
  });
}

export async function readAccountInfo(connection: Connection, address?: string) {
  if (!connection || !address) {
    return null;
  }

  let accInfo: AccountInfo<Buffer | ParsedAccountData> | null = null;
  try {
    accInfo = (await connection.getParsedAccountInfo(new PublicKey(address))).value;
  } catch (error) {
    console.error(error);
    return null;
  }
  if (accInfo) {
    if (!(accInfo as any).data['parsed']) {
      return accInfo as AccountInfo<Buffer>;
    } else {
      return accInfo as AccountInfo<ParsedAccountData>;
    }
  } else {
    return null;
  }
}

export async function resolveParsedAccountInfo(connection: Connection, address?: string) {
  const accInfo = (await readAccountInfo(connection, address)) as AccountInfo<ParsedAccountData> | null;
  if (!accInfo?.data.parsed) {
    throw new Error('Could not get account info');
  }
  return accInfo;
}

export const getTokenAccountBalanceByAddress = async (
  connection: Connection,
  tokenAddress: PublicKey | undefined | null,
): Promise<TokenAmount | null> => {
  if (!connection || !tokenAddress) return null;
  try {
    const tokenAmount = (await connection.getTokenAccountBalance(tokenAddress)).value;
    return tokenAmount;
  } catch (error) {
    consoleOut('getTokenAccountBalance failed for:', tokenAddress.toBase58(), 'red');
    return null;
  }
};

export async function fetchAccountTokens(connection: Connection, pubkey: PublicKey) {
  let data;
  try {
    const { value } = await connection.getParsedTokenAccountsByOwner(pubkey, {
      programId: TOKEN_PROGRAM_ID,
    });
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
  const ata = findATokenAddress(new PublicKey(owner), new PublicKey(token.address));
  return !!(token.publicAddress && ata?.toBase58() === token.publicAddress);
};

const getTokenByMintAddress = (address: string, list: UserTokenAccount[]): TokenInfo | undefined => {
  const tokenFromTokenList = list
    ? list.find(t => t.address === address)
    : MEAN_TOKEN_LIST.find(t => t.address === address);
  if (tokenFromTokenList) {
    return tokenFromTokenList;
  }
  return undefined;
};

const sortTokenAccountsByUsdValue = (tokens: UserTokenAccount[]) => {
  const sortedList = [...tokens].sort((a, b) => {
    if ((a.valueInUsd || 0) > (b.valueInUsd || 0)) {
      return -1;
    } else if ((a.valueInUsd || 0) < (b.valueInUsd || 0)) {
      return 1;
    } else {
      return (b.balance || 0) < (a.balance || 0) ? -1 : 1;
    }
  });
  return sortedList;
};

const sortTokenAccountsByBalance = (tokens: UserTokenAccount[]) => {
  const sortedList = [...tokens].sort((a, b) => {
    if ((b.balance ?? 0) < (a.balance ?? 0)) {
      return -1;
    } else if ((b.balance ?? 0) > (a.balance ?? 0)) {
      return 1;
    } else {
      return 0;
    }
  });
  return sortedList;
};

const getWrappedSolBalance = (list: UserTokenAccount[]) => {
  const wSol = list.find(t => t.address === WRAPPED_SOL_MINT_ADDRESS);
  return wSol ? wSol.balance ?? 0 : 0;
};

const getGroupedTokenAccounts = (accTks: AccountTokenParsedInfo[], list: UserTokenAccount[]) => {
  const taGroups = new Map<string, AccountTokenParsedInfo[]>();
  for (const ta of accTks) {
    const key = ta.parsedInfo.mint;
    const info = getTokenByMintAddress(key, list);
    const updatedTa = { ...ta, description: info ? `${info.name} (${info.symbol})` : '' };
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
};

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
};

const updateTokenAccountBalancesInTokenList = (
  accTks: AccountTokenParsedInfo[],
  list: UserTokenAccount[],
  prices: TokenPrice[] | null,
) => {
  const listCopy = JSON.parse(JSON.stringify(list)) as UserTokenAccount[];
  for (const item of accTks) {
    // Locate the token in input list
    const tokenIndex = listCopy.findIndex(i => i.address === item.parsedInfo.mint);
    if (tokenIndex !== -1) {
      const price = getPriceByAddressOrSymbol(prices, listCopy[tokenIndex].address, listCopy[tokenIndex].symbol);
      const balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
      const valueInUSD = balance * price;
      // If we didn't already filled info for this associated token address
      if (!listCopy[tokenIndex].publicAddress) {
        // Add it
        listCopy[tokenIndex].publicAddress = item.pubkey.toBase58();
        listCopy[tokenIndex].balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
        listCopy[tokenIndex].valueInUsd = valueInUSD;
      } else if (listCopy[tokenIndex].publicAddress !== item.pubkey.toBase58()) {
        // If we did and the publicAddress is different/new then duplicate this item with the new info
        const newItem = { ...listCopy[tokenIndex] };
        newItem.publicAddress = item.pubkey.toBase58();
        newItem.balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
        newItem.valueInUsd = valueInUSD;
        listCopy.splice(tokenIndex + 1, 0, newItem);
      }
    }
  }
  return listCopy;
};

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
    tokenAccountGroups: undefined,
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
    valueInUsd: getAmountFromLamports(solBalance) * getPriceByAddressOrSymbol(coinPrices, NATIVE_SOL.address, 'SOL'),
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
        const balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
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
          valueInUsd,
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

    if (isLocal()) {
      consoleOut('fetched accountTokens:', finalList, 'blue');
      const mappedList = finalList.map(t => {
        return {
          symbol: t.symbol,
          address: shortenAddress(t.address),
          publicAddress: shortenAddress(t.publicAddress ?? '-'),
          balance: t.balance ?? 0,
          price: getPriceByAddressOrSymbol(coinPrices, t.address),
          valueInUsd: t.valueInUsd ?? 0,
        };
      });
      console.table(mappedList);
      const totalTokensValue = mappedList.reduce((accumulator, item) => {
        return accumulator + item.valueInUsd;
      }, 0);
      consoleOut('totalTokensValue:', totalTokensValue, 'blue');
    }
  } catch (error) {
    console.error(error);
    response.wSolBalance = 0;
    response.accountTokens = splTokensCopy;
    response.selectedAsset = splTokensCopy[0];
  }
  consoleOut('getUserAccountTokens response:', response, 'blue');

  return response;
};

// Get a list of tokens along with a balance map optionally including only the tokens that the user holds
export const getTokensWithBalances = async (
  connection: Connection,
  accountAddress: string,
  coinPrices: TokenPrice[] | null,
  splTokenList: UserTokenAccount[],
  onlyAccountAssets = true,
): Promise<TokenSelectorListWithBalances | null> => {
  const response: TokenSelectorListWithBalances = {
    balancesMap: {},
    tokenList: [],
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
    valueInUsd: nativeBalance * getPriceByAddressOrSymbol(coinPrices, NATIVE_SOL.address, 'SOL'),
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

    const intersectedList = onlyAccountAssets ? getTokenListForOwnedTokenAccounts(accTks, splTokenList) : splTokensCopy;

    const solItemIndex = intersectedList.findIndex(l => l.address === sol.address);
    if (solItemIndex !== -1) {
      intersectedList[solItemIndex] = sol;
    } else {
      intersectedList.push(sol);
    }

    // Update balances in the mean token list
    const balancesUpdated = updateTokenAccountBalancesInTokenList(accTks, intersectedList, coinPrices);

    const sortedList = sortTokenAccountsByUsdValue(balancesUpdated);

    const custom: UserTokenAccount[] = [];
    // Build a list with all token accounts holded by the user not already in sortedList as custom tokens
    accTks.forEach((item: AccountTokenParsedInfo, index: number) => {
      if (!sortedList.some(t => t.address === item.parsedInfo.mint)) {
        const balance = item.parsedInfo.tokenAmount.uiAmount ?? 0;
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
          valueInUsd,
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
      balancesMap[item.parsedInfo.mint] = item.parsedInfo.tokenAmount.uiAmount ?? 0;
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
};

export const getAccountNFTs = async (connection: Connection, accountAddress: string) => {
  const owner = new PublicKey(accountAddress);
  const metaplex = new Metaplex(connection);

  consoleOut('reading NFTs for:', accountAddress, 'blue');
  const myNfts = await metaplex.nfts().findAllByOwner({
    owner: owner,
  });
  return myNfts;
};
