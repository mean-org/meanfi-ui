import { DdcaAccount, DdcaDetails } from "@mean-dao/ddca";
import { useState } from "react";
import { appConfig } from "..";
import { meanFiHeaders } from "../constants";
import { getDefaultRpc } from "../models/connections-hq";

export function useCoinPrices() {
  const [coinPrices, setCoinPrices] = useState<any>(null);

  const getCoinPrices = async () => {
    try {
      const prices = await getPrices();
      setCoinPrices(prices);
    } catch (error) {
      setCoinPrices(null);
    }
  };

  return [getCoinPrices, coinPrices];
}

export const getPrices = async (path?: string): Promise<any> => {
  return fetch(path || "https://api.raydium.io/coin/price", {
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
    if (response.status === 200) {
      const data = (await response.json());
      return data;
    }
    return null;
  } catch (error) {
    throw(error);
  }
};

export const getRecurringBuys = async (): Promise<DdcaDetails[]> => {
  return new Promise((resolve, reject) => {
    const data: DdcaDetails[] = [
      {
        id: '4zKTVctw52NLD7zKtwHoYkePeYjNo8cPFyiokXrnBMbz',
        fromMint: 'So11111111111111111111111111111111111111112',
        totalDepositsAmount: 5,
        amountPerSwap: 1,
        startTs: 0,
        lastCompletedSwapTs: 0,
        intervalInSeconds: 2629750,
        startUtc: 'Tue, 12 Oct 2021 23:32:00 GMT',
        lastCompletedSwapUtc: 'Tue, 12 Oct 2021 23:32:00 GMT',
        toMint: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
        isPaused: false,
        fromBalance: 4,
        exchangedForAmount: 0.041289,
        exchangedRateAverage: 0.041289,
        fromBalanceWillRunOutByUtc: 'Sat, 12 Feb 2022 23:32:00 GMT',
        nextScheduledSwapUtc: 'Fri, 12 Nov 2021 23:32:00 GMT',
        toBalance: 0
      },
      {
        id: 'FyicoDDWUijAapwtShCp4S11GixiNDKjn9PJNinhRhjp',
        fromMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        totalDepositsAmount: 200,
        amountPerSwap: 50,
        startTs: 0,
        lastCompletedSwapTs: 0,
        intervalInSeconds: 604800,
        startUtc: 'Fri, 15 Oct 2021 13:40:00 GMT',
        lastCompletedSwapUtc: 'Fri, 15 Oct 2021 13:40:00 GMT',
        toMint: 'So11111111111111111111111111111111111111112',
        isPaused: false,
        fromBalance: 150,
        exchangedForAmount: 0.311774687,
        exchangedRateAverage: 0.06235496,
        fromBalanceWillRunOutByUtc: 'Fri, 5 Nov 2021 23:32:00 GMT',
        nextScheduledSwapUtc: 'Fri, 22 Oct 2021 23:32:00 GMT',
        toBalance: 0
      },
    ];
    resolve(data);
  });
};

// POST /meanfi-connected-accounts Creates a referral for a new address
export const reportConnectedAccount = async (address: string, refBy?: string): Promise<boolean> => {
  const options: RequestInit = {
    method: "POST",
    headers: meanFiHeaders
  }
  let url = appConfig.getConfig().apiUrl + '/meanfi-connected-accounts';
  url += `?networkId=${getDefaultRpc().networkId}&a=${address}`;
  if (refBy) {
    url += `&refBy=${refBy}`;
  }
  try {
    const response = await fetch(url, options)
    if (response.status === 200) {
      return true;
    }
    return false;
  } catch (error) {
    throw(error);
  }
};
