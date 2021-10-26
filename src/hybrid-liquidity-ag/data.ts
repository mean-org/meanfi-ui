import { AmmPoolInfo, ChainInfo, ProtocolInfo, TokenInfo } from "./types"
import { 
  CHAINS as Chains, 
  TOKENS as Tokens, 
  PROTOCOLS as Protocols, 
  AMM_POOLS as Amm_Pools

} from "./meanfi.data.json"

export const CHAINS: ChainInfo[] = [];
export const TOKENS: TokenInfo[] = [];
export const PROTOCOLS: ProtocolInfo[] = [];
export const AMM_POOLS: AmmPoolInfo[] = [];

const initialize = () => {

  // init chains
  for (const chain of Chains) {
    CHAINS.push({
      id: chain.id,
      name: chain.name,
    });
  }
  
  // init tokens
  for (const token of Tokens) {
    TOKENS.push({
      chainId: token.chainId,
      address: token.address,
      name: token.name,
      decimals: token.decimals,
      symbol: token.symbol,
      logoURI: token.logoURI
    });
  }

  // init protocols
  for (const protocol of Protocols) {
    PROTOCOLS.push({
      address: protocol.address,
      name: protocol.name
    });
  }

  // init amm pools
  for (const pool of Amm_Pools) {
    AMM_POOLS.push({
      chainId: pool.chainId,
      address: pool.address,
      name: pool.name,
      protocolAddress: pool.protocolAddress,
      ammAddress: pool.ammAddress,
      tokenAddresses: pool.tokenAddresses
    });
  }
};

initialize();
