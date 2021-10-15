import { useState } from "react";
import { DcaAccount } from "../models/ddca-models";

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

export const getRecurringBuys = async (): Promise<DcaAccount[]> => {
  return new Promise((resolve, reject) => {
    const data: DcaAccount[] = [
      {
        id: 'FyicoDDWUijAapwtShCp4S11GixiNDKjn9PJNinhRhjp',
        fromMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        totalDepositsAmount: 500,
        fromAmountPerSwap: 100,
        intervalInSeconds: 604800,
        startUtc: 'Tue, 12 Oct 2021 23:32:00 GMT',
        lastCompletedUtc: 'Thu, 14 Oct 2021 10:30:00 GMT',
        toMint: 'So11111111111111111111111111111111111111112',
        isPaused: false
      },
      {
        id: '4zKTVctw52NLD7zKtwHoYkePeYjNo8cPFyiokXrnBMbz',
        fromMint: 'So11111111111111111111111111111111111111112',
        totalDepositsAmount: 267,
        fromAmountPerSwap: 50,
        intervalInSeconds: 1209600,
        startUtc: 'Tue, 12 Oct 2021 23:32:00 GMT',
        lastCompletedUtc: 'Thu, 14 Oct 2021 10:30:00 GMT',
        toMint: '2FPyTwcZLUg1MDrwsyoP4D6s1tM7hAkHYRjkNb5w6Pxk',
        isPaused: true
      },
    ];
    resolve(data);
  });
};
