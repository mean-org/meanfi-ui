import { appConfig } from "..";
import { meanFiHeaders } from "../constants";
import { Allocation } from "../models/common-types";
import { getDefaultRpc, RpcConfig } from "../models/connections-hq";
import { WhitelistClaimType } from "../models/enums";
import { TokenPrice } from "../models/token";

declare interface RequestInit { }

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
