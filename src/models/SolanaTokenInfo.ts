export interface TokenExtensions {
    website?: string;
    bridgeContract?: string;
    assetContract?: string;
    address?: string;
    explorer?: string;
    twitter?: string;
    github?: string;
    medium?: string;
    tgann?: string;
    tggroup?: string;
    discord?: string;
    serumV3Usdt?: string;
    serumV3Usdc?: string;
    coingeckoId?: string;
    imageUrl?: string;
    description?: string;
}

export interface TokenInfo {
    chainId: number;
    address: string;
    name: string;
    decimals: number;
    symbol: string;
    logoURI?: string;
    tags?: string[];
    extensions?: TokenExtensions;
}
