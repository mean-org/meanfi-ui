import { AmmPoolInfo, Client, ORCA, RAYDIUM } from "./types";
import { AMM_POOLS } from "./data";
import { NATIVE_SOL_MINT, WRAPPED_SOL_MINT } from "../utils/ids";
import { Connection } from "@solana/web3.js";
import { RaydiumClient } from "./raydium/client";
import { OrcaClient } from "./orca/client";

export const getClient = (
  connection: Connection,
  protocolAddress: string

): Client => {

  let client: any = undefined;

  switch (protocolAddress) {
    case RAYDIUM.toBase58(): {
      client = new RaydiumClient(connection);
      break;
    }
    case ORCA.toBase58(): {
      client = new OrcaClient(connection);
      break;
    }
    default: { break; }
  }

  return client;
}

export const getTokensPools = (
  from: string,
  to: string,
  protocolAddres?: string

): AmmPoolInfo[] => {

  return AMM_POOLS.filter((ammPool) => {

    let fromMint = from;
    let toMint = to;

    if (from === NATIVE_SOL_MINT.toBase58()) {
      fromMint = WRAPPED_SOL_MINT.toBase58();
    }

    if (to === NATIVE_SOL_MINT.toBase58()) {
      toMint = WRAPPED_SOL_MINT.toBase58();
    }

    return (
      ammPool.tokenAddresses.includes(fromMint) &&
      ammPool.tokenAddresses.includes(toMint) &&
      protocolAddres 
        ? ammPool.protocolAddress === protocolAddres 
        : true
    );
  });  
}

export const getOptimalPool = (
  pools: AmmPoolInfo[]

): AmmPoolInfo => {

  if (pools.length === 1) {
    return pools[0];
  }

  //TODO: implement get the best pool

  return pools[0];
}