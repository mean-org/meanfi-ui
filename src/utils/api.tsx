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
