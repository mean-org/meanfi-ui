import { FindNftsByOwnerOutput } from "@metaplex-foundation/js";
import { AccountContext, AssetGroups, KNOWN_APPS, UserTokenAccount } from "models/accounts";

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

    const isNative = assetId === selectedAccount.address ? true : false;
    const isTokenAccount = accountTokens.some(t => t.publicAddress !== selectedAccount.address && t.publicAddress === assetId);
    const isNftTokenAccount = isTokenAccount && accountTokens.some(
        t => accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === t.address) : false
    );
    const isNftMint = accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === assetId) : false;

    if (isNative || isTokenAccount || isNftTokenAccount || isNftMint) {
        if (isNftTokenAccount || isNftMint) {
            return AssetGroups.Nfts;
        }
        return AssetGroups.Tokens;
    } else {
        const isKnownApp = KNOWN_APPS.some(a => a.appId === assetId);
        if (isKnownApp) {
            return AssetGroups.Apps;
        }
    }

    return AssetGroups.OtherAssets;
}

export default getAssetCategory;
