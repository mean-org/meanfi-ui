import type { FindNftsByOwnerOutput } from '@metaplex-foundation/js';
import { type AccountContext, AssetGroups, KNOWN_APPS, type UserTokenAccount } from 'models/accounts';

const isAssetNativeAccount = (assetId: string, selectedAccount: AccountContext) => {
  return assetId === selectedAccount.address ? true : false;
};

const isAssetTokenAccount = (assetId: string, selectedAccount: AccountContext, accountTokens: UserTokenAccount[]) => {
  return accountTokens.some(t => t.publicAddress !== selectedAccount.address && t.publicAddress === assetId);
};

const getIsNftTokenAccount = (token: UserTokenAccount | undefined, accountNfts: FindNftsByOwnerOutput | undefined) => {
  if (token && token.address) {
    const tAddr = token.address;
    return accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === tAddr) : false;
  }
  return false;
};

/**
 * Given the assetId passed in the url, gets the most appropriate category where it belongs
 * @param {string} assetId The public address of an asset or NFT or a well known program ID
 * @param {AccountContext} selectedAccount The account in context
 * @param {UserTokenAccount[]} accountTokens The list of tokens that the account in context holds
 * @param {FindNftsByOwnerOutput} accountNfts The list of NFTs that the account in context holds
 * @returns The category that the assetId belongs to
 */
function getAssetCategory(
  assetId: string,
  selectedAccount: AccountContext,
  accountTokens: UserTokenAccount[],
  accountNfts: FindNftsByOwnerOutput | undefined,
): AssetGroups {
  const isNative = isAssetNativeAccount(assetId, selectedAccount);
  const isTokenAccount = isAssetTokenAccount(assetId, selectedAccount, accountTokens);
  let isNftMint = false;
  let isNftTokenAccount = false;
  let token: UserTokenAccount | undefined = undefined;

  if (isTokenAccount) {
    token = accountTokens.find(t => t.publicAddress === assetId);
    isNftTokenAccount = getIsNftTokenAccount(token, accountNfts);
  } else {
    isNftMint = accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === assetId) : false;
  }

  if (isNative || isTokenAccount || isNftTokenAccount || isNftMint) {
    if (isNftTokenAccount || isNftMint) {
      return AssetGroups.Nfts;
    }
  } else {
    const isKnownApp = KNOWN_APPS.some(a => a.appId === assetId);
    if (isKnownApp) {
      return AssetGroups.Apps;
    }
  }

  return AssetGroups.Tokens;
}

export default getAssetCategory;
