import { useState } from "react";

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
    if (response.status >= 400) {
      throw new Error(response.statusText)
    } else if (response.status === 200) {
      const data = (await response.json());
      return data;
    } else {
      return null;
    }
  } catch (error) {
    throw(error);
  }
};
