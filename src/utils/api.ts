import { DdcaAccount, DdcaDetails } from "@mean-dao/ddca";
import { useState } from "react";
import { appConfig } from "..";
import { meanFiHeaders } from "../constants";
import { getDefaultRpc, RpcConfig } from "../models/connections-hq";

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
      const data = (await response.json()) as RpcConfig;
      // data.httpProvider = 'https://meanfi.rpcpool.com/'; // Use this to manually test RPC endpoints
      return data;
    }
    return null;
  } catch (error) {
    throw(error);
  }
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
