import { FindNftsByOwnerOutput, Metadata } from "@metaplex-foundation/js";
import { UserTokenAccount } from "models/accounts";

/**
 * Given the assetId passed in the url, gets the NFT mint address from available data
 * @param {string} assetId The public address of an asset or NFT or a well known program ID
 * @param {UserTokenAccount[]} accountTokens The list of tokens that the account in context holds
 * @param {FindNftsByOwnerOutput} accountNfts The list of NFTs that the account in context holds 
 * @returns The NFT mint address
 */
function getNftMint(
    assetId: string,
    accountTokens: UserTokenAccount[],
    accountNfts: FindNftsByOwnerOutput | undefined,
): string | undefined {

    const nftMint = accountNfts ? accountNfts.find((n: any) => n.mintAddress.toBase58() === assetId) : undefined;

    if (nftMint) {
        return (nftMint as Metadata).mintAddress.toBase58();
    }

    const ata = accountTokens.find(ta => ta.publicAddress === assetId);
    if (ata) {
        const nftMintFromTokenAccount = accountNfts ? accountNfts.find((n: any) => n.mintAddress.toBase58() === ata.address) : undefined;
        if (nftMintFromTokenAccount) {
            return (nftMintFromTokenAccount as Metadata).mintAddress.toBase58();
        }
    }

    return undefined;
}

export default getNftMint;
