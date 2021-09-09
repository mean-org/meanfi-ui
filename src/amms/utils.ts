import { AmmPoolInfo, ProtocolAddress } from "./types";
import { AMM_POOLS } from "./data";

export const getAmmPoolInfo = (
  address: string
): AmmPoolInfo | undefined => {

  const poolInfoExists = AMM_POOLS
    .map(i => i.address)
    .includes(address);
  
  if (!poolInfoExists) { return undefined; }

  let poolInfo = AMM_POOLS.filter(i => i.address === address)[0];

  switch (poolInfo.protocolAddress) {
    case ProtocolAddress.Raydium: {
      // get info from raydium
      break;
    }
    case ProtocolAddress.Orca: {
      // get info from orca
      break;
    }
    default: {
      return undefined;
    }
  }

  return poolInfo;
}