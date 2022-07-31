export interface MeanFiStatsModel {
    address: string;
    circulatingSupply: number;
    holders: number;
    marketCap: number;
    marketCapFD: number;
    maxSupply: number;
    name: string
    symbol: string;
    totalSupply: number;
    totalMoneyStreams: number;
    tvl: {
        total: number;
        symbol: string;
        lastUpdateUtc: string;
    };
    version: string;
    lastUpdateUtc: string;
}