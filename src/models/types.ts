export interface ChainInfo {
  id: number;
  name: string;
}

export interface TokenInfo {
  chainId: number,
  address: string,
  name: string,
  symbol: string,
  decimals: number,
  logoURI: string
}

export interface ProtocolInfo {
  address: string,
  name: string,
  fee: number
}

export interface AmmPoolInfo {
  chainId: number,
  name: string,
  address: string,
  protocolAddress: string,
  ammAddress: string,
  tokenAddresses: string[]  
}
