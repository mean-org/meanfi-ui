import { appConfig } from 'main';
import type { TokenPrice } from 'models/TokenPrice';
import type { UserTokenAccount } from '../models/accounts';
import type { MeanFiStatsModel } from '../models/meanfi-stats';
import type { PriceGraphModel } from '../models/price-graph';
import { getDefaultRpc } from '../services/connections-hq';

// MeanFi requests
export const meanFiHeaders = new Headers();
meanFiHeaders.append('X-Api-Version', '1.0');
meanFiHeaders.append('content-type', 'application/json;charset=UTF-8');
export const meanfiRequestOptions: RequestInit = {
  headers: meanFiHeaders,
};

export const getPrices = async (addressOrSymbolCsv?: string): Promise<TokenPrice[]> => {
  const options: RequestInit = {
    method: 'GET',
    headers: meanFiHeaders,
  };

  let url = `${appConfig.getConfig().apiUrl}/token-prices?includeLPTokens=false`;
  if (addressOrSymbolCsv) {
    url += `&addressOrSymbolCsv=${addressOrSymbolCsv}`;
  }

  return fetch(url, options)
    .then(response => response.json())
    .then(response => response)
    .catch(err => {
      console.error(err);
      return [];
    });
};

export const getSolFlareTokenList = async (): Promise<UserTokenAccount[]> => {
  const path = 'https://cdn.jsdelivr.net/gh/solflare-wallet/token-list/solana-tokenlist.json';

  return fetch(path, {
    method: 'GET',
  })
    .then(response => response.json())
    .then(response => {
      return response.tokens as UserTokenAccount[];
    })
    .catch(err => {
      console.error(err);
      return [];
    });
};

// POST /meanfi-connected-accounts Creates a referral for a new address
export const reportConnectedAccount = async (address: string, refBy?: string): Promise<boolean> => {
  const options: RequestInit = {
    method: 'POST',
    headers: meanFiHeaders,
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
      throw error;
    });
};

export const getMeanStats = async (): Promise<MeanFiStatsModel | null> => {
  try {
    const path = 'https://raw.githubusercontent.com/mean-dao/MEAN-stats/main/mean-stats.json';
    const res = await fetch(path, { method: 'GET' });
    // 400+ status codes are failed
    if (res.status >= 400) {
      throw new Error(`Error getMeanStats: ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (error) {
    console.error(error);
    return null;
  }
};

export const getCoingeckoMarketChart = async (
  coinGeckoId = 'meanfi',
  decimals = 6,
  days = 30,
  interval: 'daily' | 'hourly' = 'daily',
): Promise<[PriceGraphModel[], PriceGraphModel[]] | []> => {
  try {
    const path = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
    const res = await fetch(path, { method: 'GET' });
    // 400+ status codes are failed
    if (res.status >= 400) {
      throw new Error(`Error getCoingeckoMarketChart: ${res.status}: ${res.statusText}`);
    }
    const { prices, total_volumes } = await res.json();
    const formatedPriceData = prices.map((x: number[]) => {
      return {
        priceData: x[1].toFixed(decimals),
        dateData: new Date(x[0]).toISOString(),
      };
    });
    const formatedVolumeData = total_volumes.map((x: number[]) => {
      return {
        priceData: x[1].toFixed(decimals),
        dateData: new Date(x[0]).toISOString(),
      };
    });
    return [formatedPriceData, formatedVolumeData];
  } catch (error) {
    console.error(error);
    return [];
  }
};
