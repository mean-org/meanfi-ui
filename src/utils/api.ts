import { appConfig } from "..";
import { meanFiHeaders } from "../constants";
import { Allocation } from "../models/common-types";
import { getDefaultRpc, RpcConfig } from "../models/connections-hq";
import { WhitelistClaimType } from "../models/enums";

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
  }
  let url = appConfig.getConfig().apiUrl + '/meanfi-connected-accounts';
  url += `?networkId=${getDefaultRpc().networkId}&a=${address}`;
  if (refBy) {
    url += `&refBy=${refBy}`;
  }
  try {
    const response = await fetch(url, options)
    if (response && response.status === 200) {
      return true;
    }
    return false;
  } catch (error) {
    throw(error);
  }
};

// GET /whitelists/{address} - Gets whitelist allocation - Allocation
export const getWhitelistAllocation = async (address: string, claimType: WhitelistClaimType): Promise<Allocation | null> => {
  const options: RequestInit = {
    method: "GET",
    headers: meanFiHeaders
  }
  let url = `${appConfig.getConfig().apiUrl}/whitelists/${address}?claimType=${claimType}`;
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

export const sendSignClaimTxRequest = async (whitelistedAddress: string, base64ClaimTx: string): Promise<string> => {
  const options: RequestInit = {
    method: "POST",
    headers: meanFiHeaders,
    body: JSON.stringify({
      claimType: 1,
      base64ClaimTransaction: base64ClaimTx,
    }),
  }

  let url = `${appConfig.getConfig().apiUrl}/whitelists/${whitelistedAddress}`;

  try {
    const response = await fetch(url, options)
    if (response.status !== 200) {
      throw new Error(`Error: request response status: ${response.status}`);
    }
    const signedClaimTxResponse = (await response.json()) as any;
    return signedClaimTxResponse.base64SignedClaimTransaction;
  } catch (error) {
    throw (error);
  }
}
