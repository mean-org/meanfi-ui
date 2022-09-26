import { TokenPrice } from "models/TokenPrice";
import { appConfig } from "..";
import { readFromCache, writeToCache } from "../cache/persistentCache";
import { meanFiHeaders } from "../constants";
import { SimpleTokenInfo } from "../models/accounts";
import { Allocation } from "../models/common-types";
import { WhitelistClaimType } from "../models/enums";
import { MeanFiStatsModel } from "../models/meanfi-stats";
import { PriceGraphModel } from "../models/price-graph";
import { getDefaultRpc, RpcConfig } from "../services/connections-hq";

declare interface RequestInit { }

export const getSolanaTokenListKeyNameByCluster = (chainId: number) => {
  return `solana-tokens-${chainId}`;
}

export const getSplTokens = async (chainId: number, honorCache = false): Promise<SimpleTokenInfo[]> => {

  const options: RequestInit = {
    method: "GET",
    headers: meanFiHeaders
  };

  const url = appConfig.getConfig().apiUrl + `/solana-tokens?networkId=${chainId}`;

  if (honorCache) {
    const cachedTokens = readFromCache(getSolanaTokenListKeyNameByCluster(chainId));
    if (cachedTokens) {
      console.log(`%ctokens from cache:`, `color: purple`, cachedTokens.data);
      return Promise.resolve(cachedTokens.data);
    }
  }

  return fetch(url, options)
    .then((response) => response.json())
    .then((response) => {
      // Filter out items with no decimals value
      const filtered = (response as SimpleTokenInfo[]).filter(t => t.decimals !== null);
      writeToCache(getSolanaTokenListKeyNameByCluster(chainId), filtered);
      console.log(`%ctokens from api:`, `color: purple`, filtered);
      return response;
    })
    .catch((err) => {
      console.error(err);
      const cachedTokens = readFromCache(getSolanaTokenListKeyNameByCluster(chainId));
      if (cachedTokens) {
        console.warn('Using cached data...');
        console.log(`%ctokens from cache:`, `color: purple`, cachedTokens.data);
        return cachedTokens.data;
      }
      return [];
    });
};

export const getPrices = async (): Promise<TokenPrice[]> => {

  const options: RequestInit = {
    method: "GET",
    headers: meanFiHeaders
  };
  const url = appConfig.getConfig().apiUrl + '/coin-prices';

  return fetch(url, options)
    .then((response) => response.json())
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.error(err);
    });
};

export const getSolFlareTokenList = async (): Promise<any> => {
  const path = 'https://cdn.jsdelivr.net/gh/solflare-wallet/token-list/solana-tokenlist.json';
  return fetch(path, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.error(err);
    });
};

export const getJupiterTokenList = async (path: string): Promise<any> => {
  return fetch(path, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.error(err);
    });
};

export const getRaydiumLiquidityPools = async (): Promise<any> => {
  const path = 'https://api.raydium.io/v2/sdk/liquidity/mainnet.json';
  return fetch(path, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.error(err);
    });
};

export const getRaydiumLpPairs = async (): Promise<any> => {
  const path = 'https://api.raydium.io/v2/main/pairs';
  return fetch(path, {
    method: "GET",
  })
    .then((response) => response.json())
    .then((response) => {
      return response;
    })
    .catch((err) => {
      console.error(err);
    });
};

export const getRpcApiEndpoint = async (url: string, options?: RequestInit): Promise<any> => {
  try {
    const response = await fetch(url, options)
    if (response && response.status === 200) {
      const data = (await response.json()) as RpcConfig;
      // data.httpProvider = 'https://meanfi.rpcpool.com/'; // Use this to manually test RPC endpoints
      return data;
    }
    return null;
  } catch (error) {
    return null;
  }
};

// POST /meanfi-connected-accounts Creates a referral for a new address
export const reportConnectedAccount = async (address: string, refBy?: string): Promise<boolean> => {
  const options: RequestInit = {
    method: "POST",
    headers: meanFiHeaders
  };
  let url = appConfig.getConfig().apiUrl + '/meanfi-connected-accounts';
  url += `?networkId=${getDefaultRpc().networkId}&a=${address}`;
  if (refBy) {
    url += `&refBy=${refBy}`;
  }

  return fetch(url, options)
    .then(response => {
      if (response && response.status === 200) {
        return true;
      }
      return false;
    })
    .catch(error => {
      throw (error);
    });
}

// GET /whitelists/{address} - Gets whitelist allocation - Allocation
export const getWhitelistAllocation = async (address: string, claimType: WhitelistClaimType): Promise<Allocation | null> => {
  const options: RequestInit = {
    method: "GET",
    headers: meanFiHeaders
  }
  const url = `${appConfig.getConfig().apiUrl}/whitelists/${address}?claimType=${claimType}`;
  try {
    const response = await fetch(url, options)
    if (response && response.status === 200) {
      const data = (await response.json());
      return data.totalAllocation as Allocation;
    }
    return null;
  } catch (error) {
    return null;
  }
};

export const sendSignClaimTxRequest = async (address: string, base64ClaimTx: string): Promise<any> => {
  const options: RequestInit = {
    method: "POST",
    headers: meanFiHeaders,
    body: JSON.stringify({
      claimType: 1,
      base64ClaimTransaction: base64ClaimTx,
    }),
  }

  const url = `${appConfig.getConfig().apiUrl}/whitelists/${address}`;

  return fetch(url, options)
    .then(async response => {
      if (response.status !== 200) {
        throw new Error(`Error: request response status: ${response.status}`);
      }
      const signedClaimTxResponse = (await response.json()) as any;
      return signedClaimTxResponse;
    })
    .catch(error => {
      throw (error);
    });
}

export const sendRecordClaimTxRequest = async (address: string, claimTxId: string): Promise<any> => {
  const options: RequestInit = {
    method: "POST",
    headers: meanFiHeaders,
  }

  const url = `${appConfig.getConfig().apiUrl}/airdrop-claim-tx/${address}?txId=${claimTxId}`;

  fetch(url, options)
    .then(response => {
      if (response.status !== 200) {
        throw new Error(`Error: request response status: ${response.status}`);
      }
      return response;
    })
    .catch(error => {
      throw (error);
    });
}

export const getMeanStats = async (): Promise<MeanFiStatsModel | null> => {
  try {
    const path = `https://raw.githubusercontent.com/mean-dao/MEAN-stats/main/mean-stats.json`;
    const res = await fetch(path, { method: "GET" });
    // 400+ status codes are failed
    if (res.status >= 400) {
      throw new Error(`Error getMeanStats: ${res.status}: ${res.statusText}`)
    }
    return await res.json();
  } catch (error) {
    console.error(error);
    return null;
  }
}

export const getCoingeckoMarketChart = async (
  coinGeckoId = 'meanfi',
  decimals = 6,
  days = 30,
  interval: 'daily' | 'hourly' = 'daily'
): Promise<[PriceGraphModel[], PriceGraphModel[]] | []> => {
  try {
    const path = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
    const res = await fetch(path, { method: "GET" });
    // 400+ status codes are failed
    if (res.status >= 400) {
      throw new Error(`Error getCoingeckoMarketChart: ${res.status}: ${res.statusText}`);
    }
    const { prices, total_volumes } = await res.json();
    const formatedPriceData = prices.map((x: number[]) => {
      return {
        priceData: x[1].toFixed(decimals),
        dateData: new Date(x[0]).toISOString()
      }
    });
    const formatedVolumeData = total_volumes.map((x: number[]) => {
      return {
        priceData: x[1].toFixed(decimals),
        dateData: new Date(x[0]).toISOString()
      }
    });
    return [formatedPriceData, formatedVolumeData];
  } catch (error) {
    console.error(error);
    return [];
  }
}