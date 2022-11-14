import { FindNftsByOwnerOutput } from "@metaplex-foundation/js";
import { consoleOut } from "middleware/ui";
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
    let isNftMint = false;
    let isNftTokenAccount = false;
    let token: UserTokenAccount | undefined = undefined;

    if (isTokenAccount) {
        token = accountTokens.find(t => t.publicAddress === assetId);
        if (token && token.address) {
            const tAddr = token.address;
            isNftTokenAccount = accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === tAddr) : false;
        }
    } else {
        isNftMint = accountNfts ? accountNfts.some((n: any) => n.mintAddress.toBase58() === assetId) : false;
    }

    /*
    consoleOut('assetId:', assetId, 'blue');
    consoleOut('selectedAccount:', selectedAccount.address, 'blue');
    consoleOut('isNative:', isNative, 'blue');
    consoleOut('isTokenAccount:', isTokenAccount, 'blue');
    consoleOut('isNftTokenAccount:', isNftTokenAccount, 'blue');
    consoleOut('isNftMint:', isNftMint, 'blue');
    consoleOut('tokenAccount mints:', accountTokens.map(a => a.address), 'blue');
    consoleOut('accountNfts mints:', accountNfts?.map((n: any) => n.mintAddress.toBase58()), 'blue');
    */

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
